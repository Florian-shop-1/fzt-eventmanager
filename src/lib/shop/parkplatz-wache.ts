/**
 * Hängen die Parkplatzschilder für den nächsten Showtag?
 *
 * Gedruckt und bestückt wird am Abend davor: Freitag für Samstag,
 * Samstag für Sonntag. Wird es vergessen, merkt es am Showtag der Gast,
 * der seinen reservierten Platz nicht findet.
 *
 * Deshalb zwei Erinnerungen an verschiedenen Stellen (Florian,
 * 06.10.2026):
 *
 *   1. Beim Ausstempeln sagt es der Hase der Person, die als letzte aus
 *      dem Foyer geht. Sie kann es gleich machen oder sagen, warum
 *      nicht. Das ist der Moment, in dem es noch jemand erledigen kann.
 *   2. Nachts geht eine Meldung an Florian und Kevin, wenn trotzdem
 *      nichts hängt. Das ist der Moment, in dem es noch jemand retten
 *      kann.
 */

import { db } from "@/lib/db/client";
import { parkplaetzeDesTages } from "@/lib/shop/parkplaetze";
import { gedruckteSchilder } from "@/lib/shop/parkplatz-gedruckt";
import { showtageAbHeute } from "@/lib/ditix/spielplan";

export interface Parkplatzstand {
  /** JJJJ-MM-TT des Showtags. */
  datum: string;
  gesamt: number;
  /** Wie viele Schilder noch nicht draußen hängen. */
  offen: number;
}

function heuteBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/**
 * Der nächste Showtag, für den noch Schilder fehlen.
 *
 * Geschaut wird bis zwei Tage voraus. Weiter zu schauen hieße, am
 * Mittwoch an den Samstag zu erinnern, und bis dahin kommen ohnehin noch
 * Buchungen dazu: Ein Schild, das dreimal gedruckt wird, ist schlimmer
 * als eines, das am Abend davor gedruckt wird.
 */
export async function offeneSchilder(tageVoraus = 2): Promise<Parkplatzstand | null> {
  const heute = heuteBerlin();
  const grenze = new Date(`${heute}T00:00:00`);
  grenze.setDate(grenze.getDate() + tageVoraus);
  const bis = grenze.toLocaleDateString("sv-SE");

  const tage = [...new Set((await showtageAbHeute()).map((t) => t.datum))]
    .filter((d) => d > heute && d <= bis)
    .sort();

  for (const datum of tage) {
    const buchungen = await parkplaetzeDesTages(datum);
    if (buchungen.length === 0) continue;
    const gedruckt = await gedruckteSchilder(datum);
    const offen = buchungen.filter((b) => !gedruckt.has(b.orderId)).length;
    if (offen > 0) return { datum, gesamt: buchungen.length, offen };
  }

  return null;
}

/**
 * Dasselbe für den heutigen Showtag.
 *
 * Für den nächtlichen Lauf um 1:30 Uhr: Da ist der Showtag schon
 * angebrochen, und "morgen" wäre der falsche Tag.
 */
export async function offeneSchilderHeute(): Promise<Parkplatzstand | null> {
  const heute = heuteBerlin();
  const buchungen = await parkplaetzeDesTages(heute);
  if (buchungen.length === 0) return null;
  const gedruckt = await gedruckteSchilder(heute);
  const offen = buchungen.filter((b) => !gedruckt.has(b.orderId)).length;
  return offen > 0 ? { datum: heute, gesamt: buchungen.length, offen } : null;
}

/* ------------------------------------------------------------------ *
 * Einmal je Tag und Anlass melden.
 * ------------------------------------------------------------------ */

export async function schonGemahnt(datum: string, anlass: string): Promise<boolean> {
  const z = (await db()`
    select 1 from parkplatz_mahnung where datum = ${datum}::date and anlass = ${anlass} limit 1
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export async function mahnungMerken(datum: string, anlass: string): Promise<void> {
  await db()`
    insert into parkplatz_mahnung (datum, anlass) values (${datum}::date, ${anlass})
    on conflict do nothing
  `.catch(() => undefined);
}

/**
 * Was der Mitarbeiter beim Ausstempeln geantwortet hat.
 *
 * "erledigt" heißt, er macht es noch. "grund" heißt, es bleibt liegen,
 * und warum. Beides geht an Florian und Kevin, denn beides ist eine
 * Auskunft, die sonst niemand hat.
 */
export async function antwortMerken(o: {
  datum: string;
  name: string;
  antwort: string;
}): Promise<void> {
  await db()`
    insert into parkplatz_mahnung (datum, anlass, name, antwort)
    values (${o.datum}::date, 'antwort', ${o.name}, ${o.antwort})
  `.catch(() => undefined);
}

/**
 * Ab wann gemeldet wird, in unserer Zeit.
 *
 * Die Schilder werden am Abend davor bestückt, und zwar bis spät: "die
 * mitarbeiter haben bis 8.10. spät abends zeit die parkplätze zu
 * bestücken. diese Reminder mail sollte also erst am 9.10. bei uns
 * morgens eingehen" (Florian, 08.10.2026). Eine Meldung um halb zwei in
 * der Nacht zum Vortag war schlicht zu früh.
 */
const MELDEN_AB_STUNDE = 8;

function stundeBerlin(): number {
  return Number(
    new Date().toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false,
    }).slice(0, 2),
  );
}

/**
 * Der Blick am Showtag: Hängen die Schilder für heute?
 *
 * Nur für heute, nicht für morgen: Wer morgen dran ist, hat heute Abend
 * noch Zeit. Gemeldet wird an Florian und Kevin, einmal am Tag, und nur
 * wenn wirklich Plätze gebucht sind: "Parkplätze vorhanden, wurden aber
 * nicht gedruckt" (Florian, 06.10.2026).
 */
export async function parkplatzMahnung(): Promise<{
  gemeldet: boolean;
  datum?: string;
  offen?: number;
  grund?: string;
}> {
  const { melden } = await import("@/lib/stempel/wache");

  if (stundeBerlin() < MELDEN_AB_STUNDE) {
    return { gemeldet: false, grund: `vor ${MELDEN_AB_STUNDE} Uhr, noch zu früh` };
  }

  const stand = await offeneSchilderHeute();
  if (!stand) return { gemeldet: false, grund: "nichts offen" };
  if (await schonGemahnt(stand.datum, "buero")) return { gemeldet: false };

  const tag = stand.datum.split("-").reverse().join(".");
  const antworten = await antwortenZu(stand.datum);

  await mahnungMerken(stand.datum, "buero");
  await melden(`Parkplätze ${tag}: nicht bestückt`, [
    `Für den ${tag} sind ${stand.gesamt} ${stand.gesamt === 1 ? "Platz" : "Plätze"} gebucht, ` +
      `${stand.offen} ${stand.offen === 1 ? "Schild hängt" : "Schilder hängen"} noch nicht draußen.`,
    antworten.length > 0
      ? `Beim Ausstempeln gesagt: ${antworten.join(" · ")}`
      : "Beim Ausstempeln hat dazu niemand etwas gesagt.",
    "",
    "Die Liste zum Drucken steht im Eventmanager unter „Parkplätze“.",
  ]);

  return { gemeldet: true, datum: stand.datum, offen: stand.offen };
}

/** Was die Mitarbeiter zu diesem Tag beim Ausstempeln geantwortet haben. */
async function antwortenZu(datum: string): Promise<string[]> {
  const z = (await db()`
    select name, antwort from parkplatz_mahnung
     where datum = ${datum}::date and anlass = 'antwort'
     order by gemeldet_am
  `.catch(() => [])) as Array<{ name: string; antwort: string }>;
  return z.map((r) => `${r.name}: ${r.antwort}`);
}
