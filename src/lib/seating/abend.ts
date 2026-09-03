/**
 * Sammelt alle Gäste eines Tages und lässt den Sitzplaner darüber laufen.
 *
 * Die Einheit ist der TAG, nicht die Vorstellung. Das ist keine Feinheit,
 * sondern der Kern: Das Restaurant serviert einmal am Tag, um 18 Uhr, und
 * dann sitzen alle gleichzeitig im Raum. Wer eine Nachmittagsvorstellung
 * hat, kommt danach zum Essen, wer eine Abendvorstellung hat, davor.
 *
 * Würde pro Vorstellung geplant, hielte das Programm zweimal 60 Gäste für
 * unbedenklich, obwohl 120 Menschen in einem Raum mit 98 Plätzen säßen.
 *
 * Gäste kommen aus zwei Quellen:
 *  - Firmenevents aus der eigenen Datenbank, mit Loge, Menüwahl und Ausnahmen
 *  - Buchungen aus dem Webshop, wo eine Bestellung eine Gruppe ist
 *
 * Für den Webshop gilt: Wer zusammen bestellt, kennt sich und will zusammen
 * sitzen. Deshalb wird jede Bestellung zu genau einer Gruppe, und zwei
 * Bestellungen werden nie zusammengelegt, außer jemand sagt es ausdrücklich.
 */

import { db } from "@/lib/db/client";
import type { Buchungsgruppe, Herkunft, MenueVariante } from "@/lib/domain/types";
import { shopGruppenMitMenue } from "@/lib/shop/rohdaten";
import {
  findeTermin,
  isstVorDerShow,
  termineDesTages,
  type Vorstellungstermin,
} from "@/lib/ditix/spielplan";
import { sicherheitAusStatus, type VorgangStatus } from "@/lib/domain/vorgang";
import { planeSitzplaetze } from "./planner";
import type { Plan } from "./types";

export interface AbendGruppen {
  gruppen: Buchungsgruppe[];
  ausVorgaengen: number;
  ausShop: number;
  /** Alle Vorstellungen dieses Tages, nach Uhrzeit. */
  shows: Vorstellungstermin[];
  /** Fehlermeldung, falls die Shop-Liste nicht erreichbar war. */
  shopFehler: string | null;
  /** Bereits zusammengelegte Gruppen, zum Wiederauflösen. */
  zusammenlegungen: Array<{ id: string; name: string; gruppenIds: string[]; personen: number }>;
  /**
   * Vorschläge: gleiche Namen am selben Abend, die noch nicht zusammengelegt
   * sind. Das Programm entscheidet nicht selbst, Namensgleichheit ist kein
   * Beweis für dieselbe Gruppe.
   */
  vorschlaege: Array<{ name: string; gruppenIds: string[]; personen: number }>;
}

/** Vergleichsform eines Namens: ohne Groß und Klein, ohne doppelte Leerzeichen. */
function namensform(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Holt alle Gruppen eines Abends aus beiden Quellen.
 *
 * Der Abend wird über seine Ditix-Kennung angesprochen, nicht über die
 * eigene Vorstellung: Ein Abend kann Gäste haben, ohne dass jemals ein
 * Vorgang dafür angelegt wurde. Die eigene Vorstellung ist dann schlicht
 * noch nicht vorhanden.
 */
export async function gruppenDesAbends(
  ditixEventId: string,
  _unbenutzt?: string | null,
): Promise<AbendGruppen> {
  void _unbenutzt;

  // Erst den Tag bestimmen, dann alle Vorstellungen dieses Tages holen.
  const anker = await findeTermin(ditixEventId);
  const shows = anker ? await termineDesTages(anker.datum) : [];
  const eventIds = shows.map((s) => s.ditixEventId);
  const showZuId = new Map(shows.map((s) => [s.ditixEventId, s]));

  // Unsere eigenen Vorstellungen zu diesen Kennungen, falls angelegt.
  const eigene =
    eventIds.length > 0
      ? ((await db()`
          select id, ditix_event_id from vorstellung
           where ditix_event_id = any(${eventIds})
        `) as Array<{ id: string; ditix_event_id: string }>)
      : [];
  const vorstellungIds = eigene.map((e) => e.id);

  const zeilen =
    vorstellungIds.length > 0
      ? ((await db()`
    select g.id, g.name, g.personen, g.herkunft, g.menues, g.unvertraeglichkeiten,
           g.bereich_fixiert, g.ausnahme_aktiv, g.ausnahme_grund, g.ausnahme_benutzer,
           g.ausnahme_gesetzt_am, g.notiz, g.getraenkepauschalen, g.sondervereinbarung,
           v.id as vorgang_id, v.nummer as vorgang_nummer, v.status,
           k.name as kunde, s.ditix_event_id
      from gruppe g
      join vorgang v     on v.id = g.vorgang_id
      join kunde k       on k.id = v.kunde_id
      join vorstellung s on s.id = v.vorstellung_id
     where v.vorstellung_id = any(${vorstellungIds})
       and v.status <> 'abgesagt'
     order by g.personen desc
  `) as Record<string, unknown>[])
      : [];

  const gruppen: Buchungsgruppe[] = zeilen.map((z) => ({
    id: String(z.id),
    name: String(z.name),
    personen: Number(z.personen),
    herkunft: z.herkunft as Herkunft,
    // Reserviert oder gebucht ergibt sich aus dem Stand des Vorgangs.
    sicherheit: sicherheitAusStatus(z.status as VorgangStatus),
    vorgangId: String(z.vorgang_id),
    vorgangNummer: String(z.vorgang_nummer),
    menues: (z.menues ?? {}) as Partial<Record<MenueVariante, number>>,
    unvertraeglichkeiten: (z.unvertraeglichkeiten as string) ?? undefined,
    getraenkepauschalen: (z.getraenkepauschalen as string[]) ?? [],
    sondervereinbarung: (z.sondervereinbarung as string) ?? undefined,
    // Bei einer Pauschale bekommt jeder Gast der Gruppe ein Armband.
    // Auch bei zwei Pauschalen bleibt es ein Armband je Gast: Es weist
    // die Person aus, nicht das einzelne Getraenk.
    armbaender: ((z.getraenkepauschalen as string[]) ?? []).length > 0 ? Number(z.personen) : 0,
    bereichFixiert: (z.bereich_fixiert as Buchungsgruppe["bereichFixiert"]) ?? undefined,
    ausnahme: z.ausnahme_aktiv
      ? {
          aktiv: true,
          grund: String(z.ausnahme_grund ?? ""),
          benutzer: (z.ausnahme_benutzer as string) ?? undefined,
          gesetztAm: z.ausnahme_gesetzt_am
            ? new Date(z.ausnahme_gesetzt_am as string).toISOString()
            : undefined,
        }
      : undefined,
    notiz: (z.notiz as string) ?? undefined,
    show: zurShow(showZuId.get(String(z.ditix_event_id))),
  }));

  const ausVorgaengen = gruppen.length;

  let shopFehler: string | null = null;
  const shopGruppen: Buchungsgruppe[] = [];

  try {
    // Über alle Vorstellungen des Tages, denn alle essen zusammen.
    for (const eventId of eventIds) {
      for (const s of await shopGruppenMitMenue(eventId)) {
        shopGruppen.push({
          // Die Bestellnummer als Kennung, damit dieselbe Bestellung bei
          // jedem Aufruf dieselbe Gruppe bleibt.
          id: `shop-${s.orderId}`,
          name: s.firma ?? s.name,
          personen: s.menuesGesamt,
          herkunft: "shop",
          // Im Webshop wird sofort bezahlt, diese Plätze sind fest.
          sicherheit: "gebucht",
          armbaender: s.getraenkeArmbaender,
          menues: s.menues,
          show: zurShow(showZuId.get(eventId)),
        });
      }
    }
  } catch (e) {
    shopFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  // Festgelegte Zusammenlegungen des ganzen Tages anwenden.
  const gelegt =
    vorstellungIds.length > 0
      ? ((await db()`
          select id, name, gruppen_ids from zusammenlegung
           where vorstellung_id = any(${vorstellungIds})
        `) as Array<{ id: string; name: string; gruppen_ids: string[] }>)
      : [];

  const verbraucht = new Set<string>();
  const zusammenlegungen: AbendGruppen["zusammenlegungen"] = [];

  for (const z of gelegt) {
    const teile = shopGruppen.filter((g) => z.gruppen_ids.includes(g.id));
    if (teile.length < 2) continue; // eine Bestellung ist verschwunden

    const menues: Partial<Record<MenueVariante, number>> = {};
    let personen = 0;
    let armbaender = 0;
    for (const t of teile) {
      personen += t.personen;
      armbaender += t.armbaender ?? 0;
      for (const [v, n] of Object.entries(t.menues)) {
        menues[v as MenueVariante] = (menues[v as MenueVariante] ?? 0) + (n ?? 0);
      }
      verbraucht.add(t.id);
    }

    shopGruppen.push({
      id: `zusammen-${z.id}`,
      name: z.name,
      personen,
      herkunft: "shop",
      sicherheit: "gebucht",
      armbaender,
      menues,
      // Alle Teile gehören zur selben Bestellergruppe, die Show des ersten
      // steht stellvertretend für die zusammengelegte Gruppe.
      show: teile[0].show,
    });
    zusammenlegungen.push({
      id: z.id,
      name: z.name,
      gruppenIds: z.gruppen_ids,
      personen,
    });
  }

  const uebrig = shopGruppen.filter((g) => !verbraucht.has(g.id));
  gruppen.push(...uebrig);

  // Vorschläge: gleicher Name, mehrfach am selben Abend, noch nicht gelegt.
  const nachName = new Map<string, Buchungsgruppe[]>();
  for (const g of uebrig) {
    if (!g.id.startsWith("shop-")) continue;
    const schluessel = namensform(g.name);
    if (!nachName.has(schluessel)) nachName.set(schluessel, []);
    nachName.get(schluessel)!.push(g);
  }

  const vorschlaege: AbendGruppen["vorschlaege"] = [];
  for (const teile of nachName.values()) {
    if (teile.length < 2) continue;
    vorschlaege.push({
      name: teile[0].name,
      gruppenIds: teile.map((t) => t.id),
      personen: teile.reduce((s, t) => s + t.personen, 0),
    });
  }

  return {
    gruppen,
    ausVorgaengen,
    ausShop: uebrig.length,
    shows,
    shopFehler,
    zusammenlegungen,
    vorschlaege,
  };
}

/** Macht aus einem Spielplantermin die Showangabe an der Gruppe. */
function zurShow(t: Vorstellungstermin | undefined): Buchungsgruppe["show"] {
  if (!t) return undefined;
  return {
    ditixEventId: t.ditixEventId,
    uhrzeit: t.uhrzeit,
    name: t.name,
    vorDerShow: isstVorDerShow(t.uhrzeit),
  };
}

/** Vorstellung mit ihren Eckdaten, für die Kopfzeile des Sitzplans. */
export interface AbendKopf {
  /** Kennung in der eigenen Datenbank. null, solange nichts gespeichert ist. */
  id: string | null;
  datum: string;
  uhrzeit: string;
  show: string;
  ditixEventId: string;
  /** Bereits festgelegter Plan, falls vorhanden. */
  festgelegt: { plan: Plan; von: string | null; am: string } | null;
}

/**
 * Eckdaten eines Abends. Der Abend kommt aus dem Spielplan, die eigene
 * Vorstellung gibt es möglicherweise noch gar nicht.
 */
export async function holeAbend(ditixEventId: string): Promise<AbendKopf | null> {
  const termin = await findeTermin(ditixEventId);
  if (!termin) return null;

  const zeilen = (await db()`
    select s.id, p.plan, p.festgelegt_von, p.festgelegt_am
      from vorstellung s
      left join sitzplan p on p.vorstellung_id = s.id
     where s.ditix_event_id = ${ditixEventId}
     limit 1
  `) as Record<string, unknown>[];

  const z = zeilen[0];

  return {
    id: z ? String(z.id) : null,
    datum: termin.datum,
    show: termin.name,
    uhrzeit: termin.uhrzeit,
    ditixEventId,
    festgelegt: z?.plan
      ? {
          plan: z.plan as Plan,
          von: (z.festgelegt_von as string) ?? null,
          am: new Date(z.festgelegt_am as string).toISOString(),
        }
      : null,
  };
}

/** Rechnet die Platzierungsvorschläge für einen Abend. */
export async function planeAbend(ditixEventId: string): Promise<{
  kopf: AbendKopf | null;
  gruppen: AbendGruppen;
  varianten: Plan[];
}> {
  const kopf = await holeAbend(ditixEventId);
  if (!kopf) {
    return {
      kopf: null,
      gruppen: {
        gruppen: [],
        ausVorgaengen: 0,
        ausShop: 0,
        shows: [],
        shopFehler: null,
        zusammenlegungen: [],
        vorschlaege: [],
      },
      varianten: [],
    };
  }
  const gruppen = await gruppenDesAbends(ditixEventId, kopf.id);
  const varianten = gruppen.gruppen.length > 0 ? planeSitzplaetze(gruppen.gruppen) : [];
  return { kopf, gruppen, varianten };
}
