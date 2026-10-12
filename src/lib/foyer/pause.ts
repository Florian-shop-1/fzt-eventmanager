/**
 * Das Ende der Pause. Siehe migrations/161_pausenende.sql.
 *
 * Florian drückt am Ende der Pause einen Knopf. Daraus wird zweierlei:
 *
 *  - Das Programm lernt, wann die Pause bei der ULMFASSBAR wirklich
 *    endet. Bisher stand in der Foyer-Liste eine geschätzte Zeit.
 *  - Nach der Pause bleibt im Foyer nur eine Kraft. Wer dann noch
 *    eingestempelt ist, wird nach dem Grund gefragt: "das problem ist,
 *    dass die einfach da bleiben und nichts zu tun haben" (Florian,
 *    11.10.2026).
 */

import { db } from "@/lib/db/client";

/** So lange nach dem Knopf bleibt es ruhig. Umziehen, Abrechnen, Tschüss sagen. */
export const KARENZ_MINUTEN = 5;

/** Wer bleibt, wenn sie da ist: Olena (Florian, 11.10.2026). */
const BLEIBT_WENN_DA = "Olena";

export function heuteBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export async function pausenendeMerken(o: {
  datum: string;
  ditixEventId: string;
  von: string;
  nachBeginnMin: number | null;
  /** Ohne Angabe jetzt. Gesetzt wird er, wenn die Zeit errechnet wurde. */
  zeitpunkt?: string;
}): Promise<void> {
  await db()`
    insert into pausenende (datum, ditix_event_id, von, nach_beginn_min, zeitpunkt)
    values (${o.datum}::date, ${o.ditixEventId}, ${o.von}, ${o.nachBeginnMin},
            coalesce(${o.zeitpunkt ?? null}::timestamptz, now()))
  `;
}

/** So lange dauert die Pause, von Florian: 20 bis 25 Minuten. */
export const PAUSE_MINUTEN = 20;
/** Mehr als das ist keine Pause mehr, sondern ein vergessener Haken. */
const SPAETESTENS_MINUTEN = 35;

/**
 * Das Ende der Pause aus den Checklisten lesen.
 *
 * "die mitarbeiter der show bearbeiten ja im idealfall die
 * checklisten, da guckst du einfach, wann das bearbeitet wird, die
 * pause geht 20 bis 25 minuten insgesamt" (Florian, 12.10.2026).
 *
 * Die Abschnitte "In der Pause" von Bühne und Pult werden genau dann
 * abgehakt, wenn die Pause läuft. Zwei Arbeitsweisen gibt es dabei:
 * Wer am Ende abhakt, hinterlässt mit dem letzten Haken fast die
 * richtige Zeit. Wer gleich zu Beginn alles wegtippt, hinterlässt den
 * Beginn, und dann zählen die zwanzig Minuten.
 *
 * Deshalb der spätere der beiden Werte, gedeckelt bei 35 Minuten nach
 * dem ersten Haken: Was danach kommt, ist ein nachgetragener Haken und
 * keine Pause.
 */
export async function pausenendeAusHaken(datum = heuteBerlin()): Promise<string | null> {
  const z = (await db()`
    select min(h.erledigt_am) as erster, max(h.erledigt_am) as letzter
      from showcheck_haken h
      join showcheck_punkt p on p.id = h.punkt_id
     where h.datum = ${datum}::date and p.bereich = 'pause' and p.liste in ('show', 'foh')
  `.catch(() => [])) as Array<{ erster: string | null; letzter: string | null }>;

  const erster = z[0]?.erster ? Date.parse(z[0].erster) : null;
  const letzter = z[0]?.letzter ? Date.parse(z[0].letzter) : null;
  if (!erster || !letzter) return null;

  const ende = Math.min(
    Math.max(letzter, erster + PAUSE_MINUTEN * 60000),
    erster + SPAETESTENS_MINUTEN * 60000,
  );
  // Erst wenn die Zeit wirklich um ist. Vorher läuft die Pause noch.
  if (Date.now() < ende) return null;
  return new Date(ende).toISOString();
}

/**
 * Wann heute die Pause zu Ende war, oder null.
 *
 * Erst der Knopf, den Florian drückt. Fehlt er, rechnen wir es aus den
 * Checklisten aus und schreiben es einmal fest: So lernt das Programm
 * auch an den Abenden weiter, an denen niemand gedrückt hat, und das
 * Foyer wird trotzdem erinnert.
 */
export async function pausenendeHeute(datum = heuteBerlin()): Promise<string | null> {
  const z = (await db()`
    select zeitpunkt from pausenende where datum = ${datum}::date
     order by zeitpunkt desc limit 1
  `.catch(() => [])) as Array<{ zeitpunkt: string }>;
  if (z[0]) return new Date(z[0].zeitpunkt).toISOString();

  const errechnet = await pausenendeAusHaken(datum).catch(() => null);
  if (!errechnet) return null;
  await merkeErrechnetes(datum, errechnet).catch(() => undefined);
  return errechnet;
}

/** Das errechnete Ende festhalten, damit es nicht jeden Aufruf wandert. */
async function merkeErrechnetes(datum: string, zeitpunkt: string): Promise<void> {
  const { termineDesTages } = await import("@/lib/ditix/spielplan");
  const termine = await termineDesTages(datum).catch(() => []);
  const laufend = [...termine]
    .filter((t) => t.beginn.getTime() <= Date.parse(zeitpunkt))
    .sort((a, b) => b.beginn.getTime() - a.beginn.getTime())[0];

  const nachBeginn = laufend
    ? Math.round((Date.parse(zeitpunkt) - laufend.beginn.getTime()) / 60000)
    : null;

  /*
    Nur, wenn für den Tag noch nichts dasteht.

    Zwei Seitenaufrufe im selben Moment wuerden sonst zwei Zeilen
    schreiben, und der gelernte Schnitt zaehlte den Abend doppelt.
  */
  await db()`
    insert into pausenende (datum, ditix_event_id, von, nach_beginn_min, zeitpunkt)
    select ${datum}::date, ${laufend?.ditixEventId ?? ""}, 'aus den Checklisten',
           ${nachBeginn}, ${zeitpunkt}::timestamptz
     where not exists (select 1 from pausenende where datum = ${datum}::date)
  `;
}

/**
 * Was das Programm bisher gelernt hat: der Schnitt über die gedrückten
 * Abende, in Minuten nach Showbeginn.
 */
export async function gelerntesPausenende(): Promise<{ minuten: number; abende: number } | null> {
  const z = (await db()`
    select round(avg(nach_beginn_min))::int as m, count(*)::int as n
      from pausenende where nach_beginn_min is not null
  `.catch(() => [])) as Array<{ m: number | null; n: number }>;
  const r = z[0];
  if (!r || !r.m || r.n === 0) return null;
  return { minuten: Number(r.m), abende: Number(r.n) };
}

export interface NachDerPause {
  /** Wann die Pause zu Ende war. */
  seit: string;
  /** Wer vom Foyer gerade noch eingestempelt ist. */
  leute: Array<{ benutzerId: string; name: string; email: string; fest: boolean; minuten: number }>;
  /** Wer nach unserer Regel bleiben sollte. */
  bleibt: string | null;
  /** Wer gehen könnte, mit der längsten Zeit auf der Uhr. */
  gehtVorschlag: string | null;
}

/**
 * Wie es nach der Pause im Foyer aussieht.
 *
 * Die Regel ist einfach: Eine Kraft bleibt. Ist Olena da, bleibt sie.
 * Sonst entscheiden die Leute selbst, und das Programm schlägt vor, dass
 * der geht, der schon länger auf der Uhr steht.
 */
export async function nachDerPause(datum = heuteBerlin()): Promise<NachDerPause | null> {
  const seit = await pausenendeHeute(datum);
  if (!seit) return null;

  const z = (await db()`
    select b.id, b.name, b.email, b.fest,
           extract(epoch from now() - k.zeitpunkt) / 60 as minuten
      from benutzer b
      join lateral (
        select art, zeitpunkt from stempel s
         where s.benutzer_id = b.id order by s.zeitpunkt desc limit 1
      ) letzter on true
      join lateral (
        select zeitpunkt from stempel s
         where s.benutzer_id = b.id and s.art = 'kommen' order by s.zeitpunkt desc limit 1
      ) k on true
     where b.rolle = 'foyer' and b.aktiv and not b.geteilt and letzter.art <> 'gehen'
  `.catch(() => [])) as Array<{ id: string; name: string; email: string; fest: boolean; minuten: number }>;

  const leute = z.map((r) => ({
    benutzerId: String(r.id),
    name: String(r.name),
    email: String(r.email ?? ""),
    fest: Boolean(r.fest),
    minuten: Math.max(0, Math.round(Number(r.minuten))),
  }));

  const olena = leute.find((p) => p.name.startsWith(BLEIBT_WENN_DA));
  const laengste = [...leute].sort((a, b) => b.minuten - a.minuten)[0] ?? null;

  return {
    seit,
    leute,
    bleibt: olena?.name ?? null,
    // Ist Olena da, geht ohnehin jemand anderes. Sonst der mit den meisten Stunden.
    gehtVorschlag: olena
      ? ([...leute].filter((p) => p.benutzerId !== olena.benutzerId).sort((a, b) => b.minuten - a.minuten)[0]
          ?.name ?? null)
      : (laengste?.name ?? null),
  };
}

/** Hat diese Person heute schon gesagt, warum sie bleibt? */
export async function schonBegruendet(benutzerId: string, datum = heuteBerlin()): Promise<boolean> {
  const z = (await db()`
    select 1 from nach_pause_grund
     where benutzer_id = ${benutzerId}::uuid and datum = ${datum}::date limit 1
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export async function grundMerken(o: {
  benutzerId: string;
  name: string;
  grund: string;
  datum?: string;
}): Promise<void> {
  await db()`
    insert into nach_pause_grund (datum, benutzer_id, name, grund)
    values (${o.datum ?? heuteBerlin()}::date, ${o.benutzerId}::uuid, ${o.name}, ${o.grund})
  `;
}

/**
 * Soll diese Person gefragt werden, warum sie noch da ist?
 *
 * Nur das Foyer, nur nach der Pause samt Karenz, nur wenn sie noch
 * eingestempelt ist und heute noch nichts gesagt hat. Und nur, wenn sie
 * nicht ohnehin die eine Kraft ist, die bleiben soll.
 */
export async function fragenNachDerPause(o: {
  benutzerId: string;
  rolle: string;
  name: string;
}): Promise<{ fragen: boolean; stand?: NachDerPause }> {
  if (o.rolle !== "foyer") return { fragen: false };

  const stand = await nachDerPause();
  if (!stand) return { fragen: false };

  const minutenSeit = (Date.now() - Date.parse(stand.seit)) / 60000;
  if (minutenSeit < KARENZ_MINUTEN) return { fragen: false };

  // Allein im Foyer? Dann ist alles so, wie es sein soll.
  if (stand.leute.length <= 1) return { fragen: false };
  if (!stand.leute.some((p) => p.benutzerId === o.benutzerId)) return { fragen: false };
  if (await schonBegruendet(o.benutzerId)) return { fragen: false };

  return { fragen: true, stand };
}

export interface Nachgefragt {
  id: string;
  datum: string;
  name: string;
  grund: string;
  gemeldetAm: string;
  genehmigt: boolean | null;
  entschiedenVon: string | null;
}

/**
 * Wer nach der Pause geblieben ist, für das Büro.
 *
 * Die Zeit nach der Pause ist nicht budgetiert: "Anderes muss angefragt
 * und freigegeben werden" (Florian, 12.10.2026). Deshalb steht hier
 * jede Angabe mit zwei Knöpfen, und was entschieden wurde, bleibt
 * sichtbar.
 */
export async function nachPauseGruende(anzahl = 12): Promise<Nachgefragt[]> {
  const z = (await db()`
    select id, datum::text as datum, name, grund, gemeldet_am, genehmigt, entschieden_von
      from nach_pause_grund order by gemeldet_am desc limit ${anzahl}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    datum: String(r.datum),
    name: String(r.name ?? ""),
    grund: String(r.grund ?? ""),
    gemeldetAm: new Date(r.gemeldet_am as string).toISOString(),
    genehmigt: r.genehmigt === null ? null : Boolean(r.genehmigt),
    entschiedenVon: r.entschieden_von ? String(r.entschieden_von) : null,
  }));
}

export async function nachPauseEntscheiden(o: {
  id: string;
  genehmigt: boolean;
  von: string;
}): Promise<void> {
  await db()`
    update nach_pause_grund
       set genehmigt = ${o.genehmigt}, entschieden_von = ${o.von}, entschieden_am = now()
     where id = ${o.id}::uuid
  `;
}
