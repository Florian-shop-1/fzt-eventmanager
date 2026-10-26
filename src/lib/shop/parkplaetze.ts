/**
 * VIP-Parkplätze, gebucht über den Ticketshop.
 *
 * Quelle ist eine eigene Google-Tabelle, die der Shop befüllt: eine Zeile
 * je Parkplatzbuchung, mit Kunde, Vorstellung und Anzahl. Verknüpft wird
 * über die Spalte event_id, dieselbe Kennung wie im Spielplan.
 *
 * Zu jeder Buchung gehört ein Reservierungsschild, das bisher als eigene
 * Google-Präsentation erzeugt und einzeln geöffnet und gedruckt wurde.
 * Der Eventmanager druckt die Schilder stattdessen selbst, alle eines
 * Tages in einem Durchgang. Der Link auf die Präsentation bleibt trotzdem
 * erhalten, falls jemand die alte Fassung braucht.
 *
 * Gelesen wird nur. In die Tabelle schreibt ausschließlich der Shop.
 */

import { csvZerlegen, pruefeTabelle } from "./menueliste";
import { nameOrdentlich } from "@/lib/domain/namen";
import {
  flotixBestellungen,
  flotixQuelle,
  flotixZuordnung,
  kennungFuerPlan,
  planKennungen,
  zaehltMit,
  type FlotixBestellung,
} from "@/lib/flotix/tuer";

const TABELLE_ID =
  process.env.SHOP_PARKPLATZ_ID ?? "1bLoiE2NAJkYRT184pJL0lRGdHytEF_FmyEwBxup5Z7E";
/** Blatt mit den Rohdaten, eine Zeile je Buchung. */
const ROHDATEN_GID = process.env.SHOP_PARKPLATZ_GID ?? "0";

export interface Parkplatzbuchung {
  /**
   * Woher die Buchung kommt: aus einem der beiden Ticketings, oder von
   * Hand eingetragen (siehe shop/parkplatz-hand.ts).
   */
  quelle: "ditix" | "flotix" | "hand";
  orderId: string;
  name: string;
  email: string;
  ditixEventId: string;
  eventName: string;
  /** JJJJ-MM-TT */
  datum: string;
  /** HH:MM, aus der Startzeit der Vorstellung. */
  uhrzeit: string;
  /** Wie viele Plätze gebucht wurden. Meist einer. */
  anzahl: number;
  /**
   * Hat der Gast ein Menü dazu? Entscheidet, wie lange das Auto steht.
   *
   * Null heißt: wissen wir nicht. Die alte Parkplatztabelle führt das
   * Menü nicht, und bei einem Eintrag von Hand hat es niemand gesagt.
   */
  menue: boolean | null;
  /** Link auf das bisherige Reservierungsschild, falls vorhanden. */
  schildUrl: string | null;
}

/** Macht aus "19/03/2026 19:30:00" die Uhrzeit "19:30". */
function uhrzeitAus(startBerlin: string): string {
  const treffer = startBerlin.match(/(\d{2}):(\d{2})/);
  return treffer ? `${treffer[1]}:${treffer[2]}` : "";
}

/** Holt alle Parkplatzbuchungen aus der Tabelle. */
export async function holeParkplaetze(): Promise<Parkplatzbuchung[]> {
  if (!flotixQuelle()) return ausTabelle();

  // Beide Quellen. Der Grund steht in shop/rohdaten.ts.
  const [neu, alt, zuordnung, plan] = await Promise.all([
    flotixBestellungen().catch(() => []),
    ausTabelle().catch(() => [] as Parkplatzbuchung[]),
    flotixZuordnung().catch(() => new Map<string, string>()),
    planKennungen().catch(() => new Set<string>()),
  ]);

  return [
    ...ausFlotix(neu, plan),
    ...alt.map((p) => ({
      ...p,
      ditixEventId: kennungFuerPlan(plan, [
        p.ditixEventId,
        zuordnung.get(p.ditixEventId) ?? null,
      ]),
    })),
  ];
}

/** Die alte Quelle: die Parkplatztabelle. */
async function ausTabelle(): Promise<Parkplatzbuchung[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${ROHDATEN_GID}`;

  const antwort = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Parkplatzliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Parkplatzliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
  const sp = (name: string) => kopf.indexOf(name);

  const iOrder = sp("order_id");
  const iName = sp("customer_name");
  const iMail = sp("customer_email");
  const iEvent = sp("event_id");
  const iEventName = sp("event_name");
  const iDatum = sp("show_date_berlin");
  const iStart = sp("show_start_berlin");
  const iAnzahl = sp("parking_qty");
  const iSchild = sp("googleslides_url");

  if (iEvent < 0 || iName < 0) {
    throw new Error(
      "Der Parkplatzliste fehlen Spalten (event_id oder customer_name). " +
        "Wurde die Tabelle umgebaut?",
    );
  }

  const buchungen: Parkplatzbuchung[] = [];

  for (const z of zeilen.slice(1)) {
    if (!z.some((f) => f.trim())) continue;

    const eventId = (z[iEvent] ?? "").trim();
    const name = nameOrdentlich((z[iName] ?? "").trim());
    if (!eventId || !name) continue;

    const anzahl = parseInt((z[iAnzahl] ?? "1").trim(), 10);
    const schild = (z[iSchild] ?? "").trim();

    buchungen.push({
      quelle: "ditix",
      orderId: (z[iOrder] ?? "").trim(),
      name,
      email: (z[iMail] ?? "").trim(),
      ditixEventId: eventId,
      eventName: (z[iEventName] ?? "").trim(),
      datum: (z[iDatum] ?? "").trim(),
      uhrzeit: uhrzeitAus((z[iStart] ?? "").trim()),
      anzahl: Number.isFinite(anzahl) && anzahl > 0 ? anzahl : 1,
      // Die Tabelle des alten Shops kennt das Menü nicht.
      menue: null,
      schildUrl: schild || null,
    });
  }

  return buchungen;
}

/**
 * Dieselben Buchungen, nur aus FloTix.
 *
 * In der Tabelle hatte der Parkplatz eine eigene Spalte. In FloTix ist er
 * eine Position wie jede andere, erkannt an der Bezeichnung. Datum und
 * Uhrzeit rechnen wir aus dem Beginn der Vorstellung, und zwar in
 * Berliner Zeit: Auf dem Server läuft UTC, und ein Abend um 20 Uhr wäre
 * dort schon der falsche Tag.
 *
 * Das Reservierungsschild als Google-Präsentation gibt es in FloTix nicht
 * mehr. Der Eventmanager druckt die Schilder längst selbst, deshalb bleibt
 * das Feld leer, statt dass wir eine Adresse erfinden.
 */
function ausFlotix(bestellungen: FlotixBestellung[], plan: Set<string> = new Set()): Parkplatzbuchung[] {
  const buchungen: Parkplatzbuchung[] = [];

  for (const b of bestellungen) {
    if (!zaehltMit(b)) continue;

    const anzahl = b.positionen
      .filter((pos) => /park/i.test(pos.bezeichnung))
      .reduce((summe, pos) => summe + (Number(pos.menge) || 0), 0);
    if (anzahl <= 0) continue;

    // Ein Menü in derselben Bestellung heißt: Der Gast bleibt im Haus.
    const menue = b.positionen.some(
      (pos) => /men(ü|ue)/i.test(pos.bezeichnung) && (Number(pos.menge) || 0) > 0,
    );

    const name = nameOrdentlich(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim());
    if (!name) continue;

    const beginn = new Date(b.beginn);
    const datum = beginn.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const uhrzeit = beginn.toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    });

    buchungen.push({
      orderId: b.bestellnummer || b.id,
      name,
      email: (b.email ?? "").toLowerCase(),
      ditixEventId: kennungFuerPlan(plan, [b.vorstellungId, b.ditixEventId]),
      eventName: b.showTitel,
      datum,
      uhrzeit,
      anzahl,
      menue,
      quelle: "flotix",
      schildUrl: null,
    });
  }

  return buchungen;
}

/**
 * Alle Parkplätze eines Tages.
 *
 * Geholt wird nach Tag, denn gedruckt und aufgestellt wird einmal für den
 * ganzen Tag. Zu welcher Show ein Platz gehört, steht an der Buchung in
 * der Uhrzeit, und die Seite sortiert danach: An Tagen mit zwei Shows war
 * sonst nicht zu sehen, ob ein Name mittags oder abends gilt (Foyer über
 * Florian, 24.10.2026).
 */
export async function parkplaetzeDesTages(datum: string): Promise<Parkplatzbuchung[]> {
  const alle = await holeParkplaetze();
  return alle
    .filter((p) => p.datum === datum)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/* ---------------------------------------------------------------------
   Wie lange steht das Auto?

   "man kann nicht erkennen ob jemand einen vip parkplatz für die mittags
   oder abendshow hat" (Foyer über Florian, 24.10.2026). An einem Tag mit
   zwei Shows steht in der Liste nur ein Name, und niemand weiß, ob der
   Platz mittags oder abends gebraucht wird.

   Dabei ist die Regel einfach, man muss sie nur hinschreiben:

     Mittagsshow mit Menü   Der Gast bleibt zum Essen im Haus. Das Auto
                            steht den ganzen Tag, der Platz bleibt belegt.
     Mittagsshow ohne Menü  Selten, kommt aber vor. Der Platz wird gegen
                            halb sechs frei, oft erst um sechs.
     Abendshow              Das Auto kommt am späten Nachmittag und steht
                            bis Schluss.

   Deshalb gilt im Haus: Ein Platz wird pro Tag nur einmal vergeben. Ein
   Schild, ein Name, kein Umhängen zwischen den Shows. Nur wenn die Plätze
   wirklich nicht reichen, wird einer nachmittags weitergegeben, und dann
   steht in der Liste, auf welchen es zutrifft und ab wann.
   --------------------------------------------------------------------- */

/**
 * So viele VIP-Parkplätze hat das Haus an einem Tag.
 *
 * "wir haben nur diese 7 vip parkplätze an einem tag zur verfügung"
 * (Florian, 24.10.2026). Die Zahl steht hier und nicht in der Seite,
 * denn an ihr hängt die Warnung, wenn mehr verkauft ist als da ist.
 */
export const PLAETZE_IM_HAUS = 7;

export type Schicht = "mittag" | "abend";

/** Mittags- oder Abendshow, an der Anfangszeit erkannt. */
export function schichtVon(uhrzeit: string): Schicht {
  const stunde = Number(uhrzeit.slice(0, 2));
  return Number.isFinite(stunde) && stunde > 0 && stunde < 16 ? "mittag" : "abend";
}

export function schichtName(s: Schicht): string {
  return s === "mittag" ? "Mittagsshow" : "Abendshow";
}

export interface Belegung {
  schicht: Schicht;
  /** Kurz, für die Spalte in der Liste. */
  kurz: string;
  /** Der ganze Satz, für die Erklärung daneben. */
  satz: string;
  /**
   * Wird der Platz im Laufe des Tages wieder frei? Dann steht hier die
   * Uhrzeit, ab der man damit rechnen kann. Sonst leer.
   */
  freiAb: string;
}

/** Was mit dem Platz an diesem Tag passiert. */
export function belegung(b: Parkplatzbuchung): Belegung {
  const schicht = schichtVon(b.uhrzeit);

  if (schicht === "abend") {
    return {
      schicht,
      kurz: "ab ca. 17:30 bis Schluss",
      satz:
        "Abendshow. Das Auto kommt am späten Nachmittag und steht bis nach der Show. " +
        "Der Platz muss bis dahin frei sein.",
      freiAb: "",
    };
  }

  if (b.menue === true) {
    return {
      schicht,
      kurz: "ganzer Tag",
      satz:
        "Mittagsshow mit Menü. Der Gast bleibt nach der Show zum Essen im Haus, " +
        "das Auto steht den ganzen Tag. Der Platz ist nicht noch einmal zu vergeben.",
      freiAb: "",
    };
  }

  if (b.menue === false) {
    return {
      schicht,
      kurz: "frei ab ca. 17:30",
      satz:
        "Mittagsshow ohne Menü. Der Gast fährt nach der Show heim, der Platz wird " +
        "gegen 17:30 frei, manchmal erst um 18 Uhr.",
      freiAb: "17:30",
    };
  }

  return {
    schicht,
    kurz: "Menü unbekannt",
    satz:
      "Mittagsshow. Ob ein Menü dabei ist, steht nicht in der Buchung. Mit Menü " +
      "bleibt das Auto den ganzen Tag, ohne wird der Platz gegen 17:30 frei. " +
      "Im Zweifel den ganzen Tag belegt lassen.",
    freiAb: "",
  };
}

/**
 * Wie viele der sieben Plätze mittags und abends belegt sind.
 *
 * Zwei Zahlen, weil es zwei Zeitpunkte sind. Mittags zählen die
 * Mittagsplätze. Abends zählen die Abendplätze und dazu alle
 * Mittagsplätze, deren Auto stehen bleibt: mit Menü sicher, bei
 * unbekanntem Menü vorsichtshalber auch. Nur ein Mittagsplatz ohne Menü
 * wird am Nachmittag wieder frei und darf doppelt vergeben werden.
 */
export function tagesbelegung(buchungen: Parkplatzbuchung[]): {
  mittag: number;
  abend: number;
  /** Was abends noch frei ist. Nie unter null. */
  frei: number;
  /** Mehr vergeben als da ist. */
  zuViel: boolean;
  /** Plätze, die im Laufe des Nachmittags wieder frei werden. */
  wechsel: number;
} {
  let mittag = 0;
  let abend = 0;
  let wechsel = 0;

  for (const b of buchungen) {
    const z = belegung(b);
    if (z.schicht === "mittag") {
      mittag += b.anzahl;
      if (z.freiAb) wechsel += b.anzahl;
      else abend += b.anzahl;
    } else {
      abend += b.anzahl;
    }
  }

  return {
    mittag,
    abend,
    frei: Math.max(0, PLAETZE_IM_HAUS - abend),
    zuViel: mittag > PLAETZE_IM_HAUS || abend > PLAETZE_IM_HAUS,
    wechsel,
  };
}

/* ---------------------------------------------------------------------
   Wann wird bestueckt?

   "bei nur einer show bestuecken wir wie gewohnt den tag davor. und bei
   zwei shows bestuecken wir die der zweiten show waehrend der ersten
   haelfte der ersten show" (Florian, 24.10.2026).

   Der Grund ist kein organisatorischer, sondern ein freundlicher: Solange
   kein Schild draussen steht, darf jeder Gast dort parken. Wer die Schilder
   fuer den Abend schon am Vortag aufstellt, sperrt sieben Plaetze fuer
   einen ganzen Tag, auf denen mittags niemand steht.
   --------------------------------------------------------------------- */

export interface Bestueckung {
  /** Kurz, fuer die Ueberschrift: "am Tag davor" oder "ab 15:00 Uhr". */
  kurz: string;
  /** Der ganze Satz fuer den Mitarbeiter. */
  satz: string;
  /** Haengt das Schild schon am Vorabend draussen? */
  amVortag: boolean;
}

/**
 * Wann die Schilder dieser Show aufgestellt werden.
 *
 * `ersteShow` ist die Anfangszeit der Mittagsshow, HH:MM, oder leer an
 * einem Tag mit nur einer Vorstellung.
 */
export function bestueckung(uhrzeit: string, ersteShow: string): Bestueckung {
  const istAbend = schichtVon(uhrzeit) === "abend";

  if (!ersteShow || !istAbend) {
    return {
      kurz: "am Tag davor",
      satz:
        "Wie gewohnt am Tag vor der Show drucken und aufstellen. Am Showtag selbst ist dafür keine Zeit.",
      amVortag: true,
    };
  }

  return {
    kurz: `ab ${ersteShow} Uhr`,
    satz:
      `Erst während der ersten Hälfte der Mittagsshow aufstellen, also ab ${ersteShow} Uhr. ` +
      "Vorher bleiben die Plätze frei für Gäste ohne reservierten Platz: Ein Schild, das schon " +
      "mittags draußen steht, sperrt einen leeren Platz für einen halben Tag.",
    amVortag: false,
  };
}
