/**
 * Belegung der Essplätze je Vorstellung. Zweck: nicht überbuchen.
 *
 * Die Magicuisine hat 98 Plätze, 58 in den Logen und 40 auf der
 * Eventgalerie. Ditix kennt diese Grenze nicht: dort sind Menüs freie
 * Zusatzartikel ohne Platzbezug und ohne Kontingent. Der Shop könnte also
 * beliebig viele Menüs verkaufen, ohne dass irgendwo etwas blinkt.
 *
 * Genau diese Lücke schließt diese Datei. Sie zählt zusammen, was an einem
 * Abend an Menüs im Umlauf ist, und vergleicht es mit der Platzzahl.
 *
 * Ditix gilt als führende Quelle. Menüs, die im Eventmanager erfasst, aber
 * noch nicht in Ditix eingebucht sind, werden getrennt ausgewiesen und
 * ebenfalls mitgezählt: solange sie fehlen, wäre die Ditix-Zahl zu niedrig
 * und die Warnung käme zu spät.
 */

import { db } from "@/lib/db/client";
import { kapazitaet } from "@/lib/domain/venue";
import type { MenueVariante, Sicherheit } from "@/lib/domain/types";
import { sicherheitAusStatus, type VorgangStatus } from "@/lib/domain/vorgang";
import { holeShopBestellungen } from "@/lib/shop/menueliste";
import { findeTermin, kommendeTermine } from "@/lib/ditix/spielplan";

export const ESSPLAETZE_GESAMT = kapazitaet("logen") + kapazitaet("eventgalerie");

/*
  Gezaehlt wird je TAG, nicht je Vorstellung. Laufen an einem Tag zwei
  Shows, essen trotzdem alle gemeinsam um 18 Uhr: Die Nachmittagsgaeste
  danach, die Abendgaeste davor. Es sitzen also alle gleichzeitig im Raum,
  und nur die Tagessumme darf gegen die 98 Plaetze geprueft werden.
*/

export type Ampel = "frei" | "fuellt_sich" | "eng" | "voll" | "ueberbucht";

export interface AbendBelegung {
  /** Kennung der ersten Vorstellung des Tages, sie adressiert den Tag. */
  ditixEventId: string;
  datum: string;
  /** Alle Anfangszeiten des Tages. */
  uhrzeit: string;
  uhrzeiten: string[];
  name: string;
  /** Menüs, die in Ditix eingebucht sind. Das ist die führende Zahl. */
  ausDitix: number;
  /** Menüs aus Firmenvorgängen, die in Ditix noch fehlen könnten. */
  ausVorgaengen: number;
  /**
   * Anteil davon, der nur reserviert und noch nicht bezahlt ist. Diese
   * Plätze sind belegt, können aber wieder frei werden.
   */
  reserviert: number;
  /** Beide zusammen. Danach richtet sich die Ampel. */
  belegt: number;
  frei: number;
  prozent: number;
  ampel: Ampel;
  /** Firmenvorgänge dieses Abends, für den Sprung in die Bearbeitung. */
  vorgaenge: Array<{
    id: string;
    nummer: string;
    kunde: string;
    personen: number;
    menues: number;
    /** true, wenn die Gruppe schon in Ditix steht und dort mitgezählt wird. */
    inDitix: boolean;
    /** Fest gebucht oder nur reserviert. */
    sicherheit: Sicherheit;
  }>;
}

function ampelFuer(belegt: number): Ampel {
  const anteil = belegt / ESSPLAETZE_GESAMT;
  if (belegt > ESSPLAETZE_GESAMT) return "ueberbucht";
  if (belegt === ESSPLAETZE_GESAMT) return "voll";
  if (anteil >= 0.85) return "eng";
  if (anteil >= 0.5) return "fuellt_sich";
  return "frei";
}

export const AMPEL_TEXT: Record<Ampel, { text: string; farbe: string; flaeche: string }> = {
  frei: { text: "reichlich Platz", farbe: "var(--gut)", flaeche: "var(--gut-hell)" },
  fuellt_sich: { text: "füllt sich", farbe: "var(--gut)", flaeche: "var(--gut-hell)" },
  eng: { text: "wird eng", farbe: "var(--warnung)", flaeche: "var(--warnung-hell)" },
  voll: { text: "ausgebucht", farbe: "var(--warnung)", flaeche: "var(--warnung-hell)" },
  ueberbucht: { text: "ÜBERBUCHT", farbe: "var(--blocker)", flaeche: "var(--blocker-hell)" },
};

/**
 * Zählt die Menüs je Vorstellung, aus beiden Quellen.
 *
 * Standardmäßig über den gesamten Spielplan, also die ganze Saison. Die
 * Frage "wo wird es eng" stellt sich nicht nur für die nächsten Wochen:
 * Firmenanfragen kommen oft ein halbes Jahr im Voraus.
 */
export async function belegungKommenderAbende(maxAnzahl = 400): Promise<AbendBelegung[]> {
  const termine = await kommendeTermine(maxAnzahl);

  // Menüs aus Ditix, einmal geholt und nach Vorstellung gruppiert.
  const ditixJeEvent = new Map<string, number>();
  try {
    for (const b of await holeShopBestellungen()) {
      const anzahl = Object.values(b.menues).reduce((s, n) => s + (n ?? 0), 0);
      if (anzahl > 0) {
        ditixJeEvent.set(b.ditixEventId, (ditixJeEvent.get(b.ditixEventId) ?? 0) + anzahl);
      }
    }
  } catch {
    // Ohne Menüliste zeigen wir nur die Vorgänge. Besser eine unvollständige
    // Warnung als gar keine.
  }

  // Firmenvorgänge aus der eigenen Datenbank.
  const zeilen = (await db()`
    select s.ditix_event_id, v.id, v.nummer, k.name as kunde,
           g.personen, g.menues, v.ditix_eingebucht, v.status
      from gruppe g
      join vorgang v     on v.id = g.vorgang_id
      join kunde k       on k.id = v.kunde_id
      join vorstellung s on s.id = v.vorstellung_id
     where v.status <> 'abgesagt'
       and s.ditix_event_id is not null
  `) as Record<string, unknown>[];

  const vorgaengeJeEvent = new Map<string, AbendBelegung["vorgaenge"]>();
  const menuesJeEvent = new Map<string, number>();
  const reserviertJeEvent = new Map<string, number>();

  for (const z of zeilen) {
    const eventId = String(z.ditix_event_id);
    const menues = z.menues as Partial<Record<MenueVariante, number>>;
    const anzahl = Object.values(menues ?? {}).reduce((s, n) => s + (n ?? 0), 0);

    const inDitix = z.ditix_eingebucht === true;
    const sicherheit = sicherheitAusStatus(z.status as VorgangStatus);

    if (!vorgaengeJeEvent.has(eventId)) vorgaengeJeEvent.set(eventId, []);
    vorgaengeJeEvent.get(eventId)!.push({
      id: String(z.id),
      nummer: String(z.nummer),
      kunde: String(z.kunde),
      personen: Number(z.personen),
      menues: anzahl,
      inDitix,
      sicherheit,
    });

    // Steht die Gruppe schon in Ditix, ist sie in der Menüliste enthalten.
    // Sie hier noch einmal zu zählen, würde dieselben Gäste doppelt buchen.
    if (inDitix) continue;

    // Zählt die Personenzahl, wenn noch keine Menüwahl erfasst ist: für die
    // Platzfrage zählt der Gast, nicht seine Menüwahl.
    const zaehlt = anzahl || Number(z.personen);
    menuesJeEvent.set(eventId, (menuesJeEvent.get(eventId) ?? 0) + zaehlt);
    if (sicherheit === "reserviert") {
      reserviertJeEvent.set(eventId, (reserviertJeEvent.get(eventId) ?? 0) + zaehlt);
    }
  }

  // Nach Tagen zusammenfassen. Das ist der Kern dieser Datei: Es gibt
  // einen Essensservice pro Tag, nicht pro Vorstellung. Wer pro
  // Vorstellung zaehlt, haelt zweimal 60 Gaeste fuer unbedenklich,
  // obwohl 120 Menschen gleichzeitig auf 98 Plaetzen saessen.
  const nachTag = new Map<string, typeof termine>();
  for (const t of termine) {
    if (!nachTag.has(t.datum)) nachTag.set(t.datum, []);
    nachTag.get(t.datum)!.push(t);
  }

  return [...nachTag.entries()].map(([datum, shows]) => {
    const sortiert = [...shows].sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));

    let ausDitix = 0;
    let ausVorgaengen = 0;
    let reserviert = 0;
    const vorgaenge: AbendBelegung["vorgaenge"] = [];

    for (const t of sortiert) {
      ausDitix += ditixJeEvent.get(t.ditixEventId) ?? 0;
      ausVorgaengen += menuesJeEvent.get(t.ditixEventId) ?? 0;
      reserviert += reserviertJeEvent.get(t.ditixEventId) ?? 0;
      vorgaenge.push(...(vorgaengeJeEvent.get(t.ditixEventId) ?? []));
    }

    const belegt = ausDitix + ausVorgaengen;

    return {
      ditixEventId: sortiert[0].ditixEventId,
      datum,
      uhrzeit: sortiert[0].uhrzeit,
      uhrzeiten: sortiert.map((t) => t.uhrzeit),
      name: sortiert.map((t) => t.name).join(" · "),
      ausDitix,
      ausVorgaengen,
      reserviert,
      belegt,
      frei: Math.max(0, ESSPLAETZE_GESAMT - belegt),
      prozent: Math.round((belegt / ESSPLAETZE_GESAMT) * 100),
      ampel: ampelFuer(belegt),
      vorgaenge,
    };
  });
}

/**
 * Prüft für einen Abend, ob eine zusätzliche Gruppe noch passt.
 * Gedacht für den Moment, in dem ein Angebot geschrieben wird.
 */
export async function passtNoch(
  ditixEventId: string,
  zusaetzlichePersonen: number,
): Promise<{ passt: boolean; frei: number; nachher: number; ampel: Ampel }> {
  const alle = await belegungKommenderAbende(400);
  // Die Zeilen sind Tage, ihre Kennung ist die erste Vorstellung des Tages.
  // Gefragt wird aber oft nach der zweiten. Deshalb ueber das Datum suchen.
  const termin = await findeTermin(ditixEventId);
  const abend = termin
    ? alle.find((a) => a.datum === termin.datum)
    : alle.find((a) => a.ditixEventId === ditixEventId);
  const belegt = abend?.belegt ?? 0;
  const nachher = belegt + zusaetzlichePersonen;

  return {
    passt: nachher <= ESSPLAETZE_GESAMT,
    frei: Math.max(0, ESSPLAETZE_GESAMT - belegt),
    nachher,
    ampel: ampelFuer(nachher),
  };
}
