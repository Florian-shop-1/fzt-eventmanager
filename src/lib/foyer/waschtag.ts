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

/**
 * Wer im Foyer für die Wäsche zuständig ist.
 *
 * "Sarah ist nur noch Aushilfe. Olena ist unsere feste Kraft, die immer
 * im Foyer ist" (Florian, 18.10.2026).
 */
const FOYER_MAIL = process.env.WASCH_MAIL ?? "elenadanylovych77@gmail.com";

/** Die Größen, die es bei uns gibt. */
export const HEMDGROESSEN = ["XS", "S", "M", "L", "XL", "XXL"];

/** Die zwei Bitten aus dem Foyer, die jedes Mal Zeit sparen. */
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
  const an = [FOYER_MAIL, "info@florianzimmer.com"];

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
    "Zur Erinnerung die zwei Bitten aus dem Foyer:",
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

/**
 * Nachts erinnern, wenn der Waschtag vorbei ist und niemand gewaschen hat.
 *
 * Geht an Olena, nicht an Sarah: Olena ist die feste Kraft im Foyer
 * (Florian, 18.10.2026). Je Termin höchstens eine Mail.
 */
export async function waschErinnerung(): Promise<{ geschickt: boolean; grund: string }> {
  const stand = await waschstand();
  if (!stand.ueberfaellig) return { geschickt: false, grund: "nichts überfällig" };

  /*
    Solange noch kein einziger Waschtag vermerkt ist, geht keine Mail
    raus. Gewaschen wurde ja bisher auch, nur hat es niemand
    aufgeschrieben, und eine Mail "es wurde nicht gewaschen" wäre dann
    einfach falsch. Der Hase auf der Foyercheckliste fragt stattdessen
    danach; sobald dort einmal abgehakt wurde, zählt es.
  */
  if (!stand.letzteAm) return { geschickt: false, grund: "noch kein Waschtag vermerkt" };

  const heute = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}T12:00:00Z`);
  const termin = alsDatum(waschtage(heute).dieser);

  const schon = (await db()`
    select termin from wasch_erinnert where termin = ${termin}::date
  `.catch(() => [])) as Array<{ termin: string }>;
  if (schon.length > 0) return { geschickt: false, grund: "schon erinnert" };

  const offen = await offeneHemdmeldungen();
  const { mailVerschicken } = await import("@/lib/mail/versand");
  const { postfachPersonal, antwortPersonal } = await import("@/lib/mail/postfaecher");

  await mailVerschicken({
    an: FOYER_MAIL,
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff: "Waschtag: die Hemden warten",
    text: [
      "Hallo Olena,",
      "",
      `der Waschtag war am ${termin.split("-").reverse().join(".")}, dem ersten Sonntag im Monat, und gewaschen wurde seitdem nicht.`,
      stand.letzteAm
        ? `Zuletzt gewaschen: ${stand.letzteAm.split("-").reverse().join(".")}${stand.letzteVon ? ` von ${stand.letzteVon}` : ""}.`
        : "Ein Waschtag ist bisher nicht vermerkt.",
      offen.length > 0 ? `Das Showteam meldet leere Größen: ${offen.map((m) => m.groesse).join(", ")}.` : "",
      "",
      "Es ist schnell gemacht, wenn man dran denkt: Maschine an, und bis zum Abend ist alles trocken.",
      "",
      ...WASCHREGELN.map((r) => `- ${r}`),
      "",
      "Danach im Eventmanager auf dem Foyerblatt kurz auf \"Heute gewaschen\" drücken, dann weiß es jeder.",
    ]
      .filter((z) => z !== "")
      .join(String.fromCharCode(10)),
  });

  await db()`
    insert into wasch_erinnert (termin) values (${termin}::date) on conflict do nothing
  `.catch(() => undefined);

  return { geschickt: true, grund: "erinnert" };
}
