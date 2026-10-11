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
}): Promise<void> {
  await db()`
    insert into pausenende (datum, ditix_event_id, von, nach_beginn_min)
    values (${o.datum}::date, ${o.ditixEventId}, ${o.von}, ${o.nachBeginnMin})
  `;
}

/** Wann heute die Pause zu Ende war, oder null. */
export async function pausenendeHeute(datum = heuteBerlin()): Promise<string | null> {
  const z = (await db()`
    select zeitpunkt from pausenende where datum = ${datum}::date
     order by zeitpunkt desc limit 1
  `.catch(() => [])) as Array<{ zeitpunkt: string }>;
  return z[0] ? new Date(z[0].zeitpunkt).toISOString() : null;
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
  leute: Array<{ benutzerId: string; name: string; minuten: number }>;
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
    select b.id, b.name,
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
  `.catch(() => [])) as Array<{ id: string; name: string; minuten: number }>;

  const leute = z.map((r) => ({
    benutzerId: String(r.id),
    name: String(r.name),
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
