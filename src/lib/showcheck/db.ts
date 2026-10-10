/**
 * Die Show-Checkliste. Siehe migrations/133_showcheck.sql.
 *
 * Drei Listen je Vorstellung: vor der Show, in der Pause, nach der Show.
 * Abgehakt wird je Vorstellung, nicht je Tag: Laufen zwei Shows, hat jede
 * ihre eigene Liste, denn die Kerze muss zweimal brennen.
 *
 * Die Punkte stehen in der Datenbank, nicht im Programmtext. Eine
 * Checkliste ändert sich mit jeder neuen Nummer, und dafür soll niemand
 * den Eventmanager neu bauen müssen (Florian, 03.10.2026).
 */

import { db } from "@/lib/db/client";

/**
 * Zwei Listen, dieselbe Mechanik: die Show und das Foyer.
 *
 * Das Foyer hakt seit dem 05.10.2026 genauso ab wie das Showteam, "wir
 * machen das nun so wie in der show" (Florian). Deshalb dieselben
 * Tabellen und dasselbe Abhaken, nur ein anderer Satz Punkte.
 */
/*
  Drei Listen, dieselbe Mechanik.

  "show" ist die Liste hinter der Buehne, "foyer" die des Service, und
  "foh" gehoert ans Pult: Licht, Ton, Nebel, Funkstrecken (Florian,
  10.10.2026). FOH und Show teilen sich die Abschnitte, denn beide
  arbeiten denselben Abend ab: vor der Show, in der Pause, danach.
*/
export type Liste = "show" | "foyer" | "foh";

export type Bereich =
  | "vor_show"
  | "pause"
  | "nach_show"
  | "foyer_vor"
  | "foyer_einlass"
  | "foyer_akt1"
  | "foyer_pause"
  | "foyer_akt2"
  | "foyer_ende";

export const BEREICHE: Bereich[] = ["vor_show", "pause", "nach_show"];

export const FOYER_BEREICHE: Bereich[] = [
  "foyer_vor",
  "foyer_einlass",
  "foyer_akt1",
  "foyer_pause",
  "foyer_akt2",
  "foyer_ende",
];

export function bereicheVon(liste: Liste): Bereich[] {
  return liste === "foyer" ? FOYER_BEREICHE : BEREICHE;
}

/** Wie die Liste im Text heisst. */
export const LISTE_TITEL: Record<Liste, string> = {
  show: "Show",
  foh: "FOH",
  foyer: "Foyer",
};

export const BEREICH_TITEL: Record<Bereich, string> = {
  vor_show: "Vor der Show",
  pause: "In der Pause",
  nach_show: "Nach der Show",
  // Die Zeiten stehen so in Florians Aufstellung und meinen einen Abend
  // mit Show um 20:00 Uhr.
  foyer_vor: "Alles vor 19:00 Uhr",
  foyer_einlass: "19:00 bis 20:00 Uhr, Einlass",
  foyer_akt1: "20:00 bis 21:00 Uhr, erste Hälfte",
  foyer_pause: "21:00 bis 21:20 Uhr, Pause",
  foyer_akt2: "21:20 bis 22:30 Uhr, zweite Hälfte",
  foyer_ende: "22:30 bis 23:00 Uhr, Show-Ende",
};

export interface Punkt {
  id: string;
  bereich: Bereich;
  text: string;
  reihenfolge: number;
  /** Gesetzt, wenn er für diese Vorstellung schon abgehakt ist. */
  erledigtVon: string | null;
  erledigtAm: string | null;
}

/** Alle Punkte einer Liste, mit dem Stand des Abends. */
export async function checkliste(ditixEventId: string, liste: Liste = "show"): Promise<Punkt[]> {
  const z = (await db()`
    select p.id, p.bereich, p.text, p.reihenfolge, h.erledigt_von, h.erledigt_am
      from showcheck_punkt p
      left join showcheck_haken h
        on h.punkt_id = p.id and h.ditix_event_id = ${ditixEventId}
     where p.aktiv and p.liste = ${liste}
     order by p.bereich, p.reihenfolge, p.angelegt_am
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    bereich: r.bereich as Bereich,
    text: String(r.text),
    reihenfolge: Number(r.reihenfolge ?? 0),
    erledigtVon: r.erledigt_von ? String(r.erledigt_von) : null,
    erledigtAm: r.erledigt_am ? new Date(r.erledigt_am as string).toISOString() : null,
  }));
}

export async function haken(o: {
  ditixEventId: string;
  datum: string;
  punktId: string;
  wer: string;
}): Promise<void> {
  await db()`
    insert into showcheck_haken (ditix_event_id, punkt_id, datum, erledigt_von)
    values (${o.ditixEventId}, ${o.punktId}::uuid, ${o.datum}::date, ${o.wer})
    on conflict (ditix_event_id, punkt_id) do update
      set erledigt_von = excluded.erledigt_von, erledigt_am = now()
  `;
}

export async function hakenWeg(ditixEventId: string, punktId: string): Promise<void> {
  await db()`
    delete from showcheck_haken
     where ditix_event_id = ${ditixEventId} and punkt_id = ${punktId}::uuid
  `;
}

/**
 * Wie weit die Listen eines Abends sind.
 *
 * Für die Erinnerung und für den Blick von außen: Das Büro soll sehen
 * können, ob vor der Show alles abgehakt war, ohne jede Zeile zu lesen.
 */
export async function stand(
  ditixEventId: string,
  liste: Liste = "show",
): Promise<Partial<Record<Bereich, { offen: number; gesamt: number }>>> {
  const punkte = await checkliste(ditixEventId, liste);
  const ergebnis: Partial<Record<Bereich, { offen: number; gesamt: number }>> = {};
  for (const b of bereicheVon(liste)) ergebnis[b] = { offen: 0, gesamt: 0 };
  for (const p of punkte) {
    const e = (ergebnis[p.bereich] ??= { offen: 0, gesamt: 0 });
    e.gesamt += 1;
    if (!p.erledigtAm) e.offen += 1;
  }
  return ergebnis;
}

/** Einen Punkt ergänzen, ändern oder herausnehmen: nur für Florian. */
export async function punktAnlegen(
  bereich: Bereich,
  text: string,
  liste: Liste = "show",
): Promise<void> {
  const z = (await db()`
    select coalesce(max(reihenfolge), 0) + 10 as naechste from showcheck_punkt where bereich = ${bereich}
  `) as Array<{ naechste: number }>;
  await db()`
    insert into showcheck_punkt (bereich, text, reihenfolge, liste)
    values (${bereich}, ${text}, ${Number(z[0]?.naechste ?? 10)}, ${liste})
  `;
}

/**
 * Was jemandem auf der Liste fehlt.
 *
 * Wer am Abend merkt, dass ein Handgriff fehlt, soll ihn sofort loswerden
 * koennen (Florian, 05.10.2026). Uebernommen wird er nicht automatisch:
 * Eine Checkliste, die jeder erweitert, ist nach einem Monat keine
 * Checkliste mehr. Florian liest die Vorschlaege und entscheidet.
 */
export interface Vorschlag {
  id: string;
  liste: Liste;
  text: string;
  von: string;
  angelegtAm: string;
}

/**
 * Derselbe Vorschlag zweimal ist keiner.
 *
 * Veronica hat ihren Vorschlag am 05.10.2026 im Abstand von drei
 * Sekunden zweimal abgeschickt, weil nach dem ersten Tippen nichts
 * sichtbar passierte. Auf dem Handy ist das der Normalfall, nicht die
 * Ausnahme. Wortgleiches von derselben Person innerhalb einer
 * Viertelstunde zählt deshalb als ein Vorschlag.
 */
const DOPPELT_MINUTEN = 15;

export async function vorschlagSpeichern(o: {
  liste: Liste;
  text: string;
  von: string;
  benutzerId: string | null;
}): Promise<void> {
  await db()`
    insert into checkliste_vorschlag (liste, text, von, benutzer_id)
    select ${o.liste}, ${o.text}, ${o.von}, ${o.benutzerId}
     where not exists (
       select 1 from checkliste_vorschlag v
        where v.liste = ${o.liste}
          and v.text = ${o.text}
          and coalesce(v.von, '') = ${o.von}
          and v.angelegt_am > now() - make_interval(mins => ${DOPPELT_MINUTEN})
     )
  `;
}

export async function offeneVorschlaege(liste: Liste): Promise<Vorschlag[]> {
  const z = (await db()`
    select id, liste, text, von, angelegt_am
      from checkliste_vorschlag
     where liste = ${liste} and erledigt_am is null
     order by angelegt_am
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    liste: r.liste as Liste,
    text: String(r.text),
    von: String(r.von ?? ""),
    angelegtAm: new Date(r.angelegt_am as string).toISOString(),
  }));
}

export async function vorschlagErledigt(id: string, wer: string): Promise<void> {
  await db()`
    update checkliste_vorschlag set erledigt_am = now(), erledigt_von = ${wer}
     where id = ${id}::uuid and erledigt_am is null
  `;
}

export async function punktAendern(id: string, text: string): Promise<void> {
  await db()`update showcheck_punkt set text = ${text} where id = ${id}::uuid`;
}

export async function punktWeg(id: string): Promise<void> {
  // Nicht löschen: Was abgehakt wurde, soll nachvollziehbar bleiben.
  await db()`update showcheck_punkt set aktiv = false where id = ${id}::uuid`;
}

/**
 * Die Abschnitte der Foyer-Liste, auf die Uhrzeit der Show gerechnet.
 *
 * Die Aufstellung ist fuer einen Abend mit Show um 20:00 Uhr
 * geschrieben. Faengt es um 15:00 an oder beim Flo-Zirkus noch frueher,
 * stimmt keine der Zeiten mehr, und niemand liest eine Liste, deren
 * Uhrzeiten nicht zum Abend passen (Florian, 05.10.2026).
 *
 * Gerechnet wird deshalb vom Showbeginn aus, mit denselben Abstaenden
 * wie in der Aufstellung: eine Stunde vorher Einlass, die erste Haelfte
 * eine Stunde, zwanzig Minuten Pause, danach siebzig Minuten, und eine
 * halbe Stunde nach der Show.
 */
const FOYER_ABSTAENDE: Partial<Record<Bereich, { von: number; bis: number; was: string }>> = {
  foyer_vor: { von: -240, bis: -60, was: "Vorbereiten" },
  foyer_einlass: { von: -60, bis: 0, was: "Einlass" },
  foyer_akt1: { von: 0, bis: 60, was: "erste Hälfte" },
  foyer_pause: { von: 60, bis: 80, was: "Pause" },
  foyer_akt2: { von: 80, bis: 150, was: "zweite Hälfte" },
  foyer_ende: { von: 150, bis: 180, was: "Show-Ende" },
};

function verschoben(uhrzeit: string, minuten: number): string {
  const [h, m] = uhrzeit.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return uhrzeit;
  const gesamt = (((h * 60 + m + minuten) % 1440) + 1440) % 1440;
  return `${String(Math.floor(gesamt / 60)).padStart(2, "0")}:${String(gesamt % 60).padStart(2, "0")}`;
}

/**
 * Die Ueberschrift eines Abschnitts, passend zur Vorstellung.
 *
 * Ohne Uhrzeit bleibt es bei der Beschriftung aus BEREICH_TITEL.
 */
export function abschnittTitel(
  bereich: Bereich,
  showUhrzeit?: string | null,
  /*
    Die Show mit der Pause, falls das eine andere ist.

    Am Flo-Zirkus-Tag sperrt das Foyer fuer den Zirkus um 13 Uhr auf,
    aber der hat keine Pause: Erste Haelfte, Pause, zweite Haelfte und
    Show-Ende gehoeren zur ULMFASSBAR danach (Florian, 07.10.2026).
    Rechnete alles vom Zirkus aus, stand ueber der Pause eine Uhrzeit,
    zu der gar keine ist.

    Vorbereiten und Einlass bleiben an der ersten Vorstellung haengen,
    denn aufgesperrt und eingelassen wird fuer die.
  */
  pausenShowUhrzeit?: string | null,
): string {
  const a = FOYER_ABSTAENDE[bereich];
  if (!a || !showUhrzeit) return BEREICH_TITEL[bereich];
  if (bereich === "foyer_vor") return `Alles vor ${verschoben(showUhrzeit, a.bis)} Uhr`;
  const anker =
    bereich === "foyer_einlass" ? showUhrzeit : (pausenShowUhrzeit || showUhrzeit);
  return `${verschoben(anker, a.von)} bis ${verschoben(anker, a.bis)} Uhr, ${a.was}`;
}
