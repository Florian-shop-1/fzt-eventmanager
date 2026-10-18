/**
 * Der Waschtag für die Hemden.
 *
 * Sarah hat es bisher nebenher gemacht, "während Doppel-Shows oder
 * sonntags, 1 bis 2 mal im Monat" (18.10.2026). Niemand sonst wusste,
 * wann zuletzt gewaschen wurde, und gemerkt hat es erst der, dem vor der
 * Show das Hemd fehlte.
 *
 * Fester Termin ist der erste Sonntag im Monat, also der Tag mit
 * Flo-Zirkus: Dann ist jemand da, die Maschine läuft nebenher, und bis
 * zum Abend ist alles trocken.
 */

import { db } from "@/lib/db/client";

/** Die Größen, die es bei uns gibt. */
export const HEMDGROESSEN = ["XS", "S", "M", "L", "XL", "XXL"];

/** Sarahs zwei Bitten, die jedes Mal Zeit sparen. */
export const WASCHREGELN = [
  "Alle Hemden in die Körbe, nicht daneben. Nur so kommen sie wirklich alle in die Maschine.",
  "Ärmel runterkrempeln. Sonst werden sie weder richtig sauber noch trocken, und wer wäscht, macht es sonst von Hand.",
];

const alsDatum = (d: Date): string => d.toISOString().slice(0, 10);

/** Der erste Sonntag eines Monats. */
export function ersterSonntag(jahr: number, monat: number): Date {
  const d = new Date(Date.UTC(jahr, monat, 1, 12));
  d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
  return d;
}

/** Der Waschtag, der zu diesem Datum gehört, und der nächste danach. */
export function waschtage(heute: Date): { dieser: Date; naechster: Date } {
  const dieser = ersterSonntag(heute.getUTCFullYear(), heute.getUTCMonth());
  const naechster =
    heute <= dieser
      ? dieser
      : ersterSonntag(heute.getUTCFullYear(), heute.getUTCMonth() + 1);
  return { dieser, naechster };
}

export interface Waschstand {
  /** Wann zuletzt gewaschen wurde, sonst null. */
  letzteAm: string | null;
  letzteVon: string;
  /** Der nächste reguläre Termin. */
  naechsterAm: string;
  /** Tage seit dem letzten Waschen, null wenn noch nie. */
  tageHer: number | null;
  /** Der Waschtag dieses Monats ist vorbei und es wurde nicht gewaschen. */
  ueberfaellig: boolean;
  /** Heute ist Waschtag. */
  heuteDran: boolean;
}

export async function waschstand(): Promise<Waschstand> {
  const z = (await db()`
    select gewaschen_am::text as gewaschen_am, von
      from waschtag order by gewaschen_am desc limit 1
  `.catch(() => [])) as Array<{ gewaschen_am: string; von: string }>;

  const heuteText = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const heute = new Date(`${heuteText}T12:00:00Z`);
  const { dieser, naechster } = waschtage(heute);

  const letzteAm = z[0]?.gewaschen_am ?? null;
  const tageHer = letzteAm
    ? Math.round((heute.getTime() - Date.parse(`${letzteAm}T12:00:00Z`)) / 86400000)
    : null;

  /*
    Überfällig heißt: Der Termin dieses Monats ist vorbei, und seitdem
    hat niemand gewaschen. Vor dem Termin ist nichts überfällig, auch
    wenn der letzte Waschtag lange her ist.
  */
  const terminVorbei = heute > dieser;
  const seitTermin = letzteAm ? letzteAm >= alsDatum(dieser) : false;

  return {
    letzteAm,
    letzteVon: z[0]?.von ?? "",
    naechsterAm: alsDatum(naechster),
    tageHer,
    ueberfaellig: terminVorbei && !seitTermin,
    heuteDran: heuteText === alsDatum(dieser),
  };
}

/** Festhalten, dass gewaschen wurde. */
export async function waschenVermerken(von: string, notiz = ""): Promise<void> {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  await db()`
    insert into waschtag (gewaschen_am, von, notiz) values (${heute}::date, ${von}, ${notiz})
  `;
  // Offene Hemdenmeldungen sind damit erledigt.
  await db()`
    update hemd_meldung set erledigt_am = now() where erledigt_am is null
  `.catch(() => undefined);
}

export interface Hemdmeldung {
  id: string;
  groesse: string;
  wer: string;
  gemeldetAm: string;
}

/** Was gerade fehlt, noch nicht gewaschen oder nachgekauft. */
export async function offeneHemdmeldungen(): Promise<Hemdmeldung[]> {
  const z = (await db()`
    select id, groesse, wer, gemeldet_am
      from hemd_meldung where erledigt_am is null order by gemeldet_am desc
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    groesse: String(r.groesse),
    wer: String(r.wer ?? ""),
    gemeldetAm: new Date(r.gemeldet_am as string).toISOString(),
  }));
}

/**
 * Das Showteam meldet, dass eine Größe leer ist.
 *
 * Die Nachricht geht ans Foyer, damit dort gewaschen wird, und an
 * Florian: Ist die Größe gar nicht im Haus, kauft er sie nach (Florian,
 * 18.10.2026).
 */
export async function hemdMelden(o: {
  groesse: string;
  wer: string;
  nichtVorhanden: boolean;
}): Promise<{ an: string[] }> {
  await db()`
    insert into hemd_meldung (groesse, wer) values (${o.groesse}, ${o.wer})
  `;

  const stand = await waschstand();
  const an = ["sarah.herold@florianzimmer.com", "info@florianzimmer.com"];

  const { mailVerschicken } = await import("@/lib/mail/versand");
  const { postfachPersonal, antwortPersonal } = await import("@/lib/mail/postfaecher");

  const zeilen = [
    "Hallo,",
    "",
    o.nichtVorhanden
      ? `im Showteam fehlt Größe ${o.groesse} ganz: ${o.wer} findet kein einziges Hemd in dieser Größe, auch kein getragenes.`
      : `im Showteam sind die Hemden in Größe ${o.groesse} alle. ${o.wer} bittet darum, wieder zu waschen.`,
    "",
    stand.letzteAm
      ? `Zuletzt gewaschen: ${stand.letzteAm.split("-").reverse().join(".")}${stand.letzteVon ? ` von ${stand.letzteVon}` : ""}.`
      : "Ein Waschtag ist im Eventmanager noch nicht vermerkt.",
    `Nächster regulärer Waschtag: ${stand.naechsterAm.split("-").reverse().join(".")}, erster Sonntag im Monat.`,
    "",
    o.nichtVorhanden
      ? "Florian: Bitte diese Größe nachkaufen."
      : "Foyer: Bitte bei Gelegenheit die Maschine anwerfen.",
    "",
    "Zur Erinnerung, Sarahs zwei Bitten:",
    ...WASCHREGELN.map((r) => `- ${r}`),
  ];

  await mailVerschicken({
    an,
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff: o.nichtVorhanden
      ? `Hemden Größe ${o.groesse} fehlen ganz`
      : `Hemden Größe ${o.groesse} sind alle, bitte waschen`,
    text: zeilen.join(String.fromCharCode(10)),
  });

  return { an };
}
