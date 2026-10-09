/**
 * Was der Telefonassistent nachschlagen und tun darf.
 *
 * Bewusst wenige Werkzeuge, und jedes eines, das er nicht falsch
 * benutzen kann: Nachschlagen im Spielplan, Nachsehen, ob noch Plätze
 * frei sind, einen Rückruf notieren. Buchen und Bezahlen kann er nicht,
 * das bleibt beim Gast im Shop (Florian, 09.10.2026).
 *
 * Alles, was er sagt, kommt aus diesen Funktionen. Preise und Termine
 * stehen nicht in seinem Text, sonst erzählt er in drei Wochen von
 * Shows, die es nicht mehr gibt.
 */

import { db } from "@/lib/db/client";
import { holeAuslastung } from "@/lib/ditix/auslastung";
import { kommendeTermine } from "@/lib/ditix/spielplan";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

/*
  Wie knapp es wirklich ist, erfaehrt der Anrufer nicht.

  "Da ist noch gut was frei" klingt nach leerem Haus und nimmt jedem den
  Grund, sich zu beeilen. Der Assistent bekommt deshalb nur drei
  Zustaende zu hoeren: frei, wenige, ausverkauft. Zahlen bekommt er gar
  nicht erst (Florian, 09.10.2026).

  Erfunden wird dabei nichts: "wenige" steht nur da, wo es wirklich
  wenige sind. Ein Haus, das knappe Plaetze behauptet, die es nicht
  gibt, macht sich angreifbar und verliert den Gast beim ersten Blick
  in den Saalplan.
*/
const KNAPP = 10;

export interface TerminFuerAnrufer {
  datum: string;
  wochentag: string;
  uhrzeit: string;
  show: string;
  /**
   * "frei", "wenige", "ausverkauft" oder "unbekannt".
   *
   * Bewusst ohne Abstufung nach oben: Ob zwanzig oder zweihundert
   * Plaetze frei sind, geht den Anrufer nichts an.
   */
  verfuegbarkeit: string;
  hinweis: string;
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function deutsch(datum: string): { tag: string; wochentag: string } {
  const d = new Date(`${datum}T12:00:00`);
  return {
    tag: d.toLocaleDateString("de-DE", { day: "numeric", month: "long" }),
    wochentag: WOCHENTAGE[d.getDay()],
  };
}

/**
 * Die nächsten Termine, auf Wunsch nur zu einer Show.
 *
 * Die Verfügbarkeit kommt als Wort, nicht als Zahl. Am Telefon hilft
 * "da ist noch gut was frei" mehr als "noch 43 Plätze", und eine Zahl,
 * die sich zwischen Anruf und Ankunft ändert, wäre ein Versprechen, das
 * wir nicht halten.
 */
export async function naechsteTermine(o: { show?: string; anzahl?: number } = {}): Promise<TerminFuerAnrufer[]> {
  const alle = await kommendeTermine(60);
  const gesucht = (o.show ?? "").trim().toLowerCase();
  const passend = gesucht
    ? alle.filter((t) => t.name.toLowerCase().includes(gesucht))
    : alle;

  const liste = passend.slice(0, Math.min(o.anzahl ?? 5, 10));

  return Promise.all(
    liste.map(async (t) => {
      const { tag, wochentag } = deutsch(t.datum);
      let verfuegbarkeit = "unbekannt";
      let hinweis = "";

      if (t.ausverkauft) {
        verfuegbarkeit = "ausverkauft";
        hinweis = "Für diesen Termin gibt es eine Warteliste im Shop.";
      } else if (t.seatmapEventId) {
        const a = await holeAuslastung(t.seatmapEventId).catch(() => null);
        if (a) {
          const frei = a.frei ?? 0;
          verfuegbarkeit = frei <= 0 ? "ausverkauft" : frei < KNAPP ? "wenige" : "frei";
          if (verfuegbarkeit === "wenige") hinweis = "Wirklich nur noch einzelne Plätze, das darfst du sagen.";
        }
      } else {
        // Ohne Saalplan zaehlen wir nicht mit: freie Bestuhlung.
        verfuegbarkeit = "frei";
      }

      return { datum: tag, wochentag, uhrzeit: t.uhrzeit, show: t.name, verfuegbarkeit, hinweis };
    }),
  );
}

/** Der Buchungslink, den der Assistent per SMS schicken lässt. */
export function buchungsLink(): string {
  return `${SHOP}/spielplan`;
}

export interface NotizEingabe {
  gespraechId: string | null;
  art: "firma" | "gruppe" | "rueckruf";
  name: string;
  nummer: string;
  email?: string;
  anliegen: string;
  wunschtermin?: string;
  personen?: number | null;
}

/**
 * Einen Rückruf notieren.
 *
 * Firmenfeiern, Events und Gruppen beantwortet der Assistent nicht. Dort
 * geht es um Termine, Räume, Menüs und Preise, die verhandelt werden,
 * und das gehört an einen Menschen (Florian, 09.10.2026). Er hört zu,
 * schreibt mit und sagt zu, dass zurückgerufen wird.
 */
export async function notizAnlegen(o: NotizEingabe): Promise<string> {
  const z = (await db()`
    insert into telefon_notiz (gespraech_id, art, name, nummer, email, anliegen, wunschtermin, personen)
    values (${o.gespraechId}::uuid, ${o.art}, ${o.name}, ${o.nummer}, ${o.email ?? ""},
            ${o.anliegen}, ${o.wunschtermin ?? ""}, ${o.personen ?? null})
    returning id
  `) as Array<{ id: string }>;
  return String(z[0].id);
}

export interface Telefonnotiz {
  id: string;
  art: string;
  name: string;
  nummer: string;
  email: string;
  anliegen: string;
  wunschtermin: string;
  personen: number | null;
  erstelltAm: string;
  erledigtAm: string | null;
  erledigtVon: string;
}

export async function offeneNotizen(auchErledigte = false): Promise<Telefonnotiz[]> {
  const z = (await db()`
    select id, art, name, nummer, email, anliegen, wunschtermin, personen,
           erstellt_am, erledigt_am, erledigt_von
      from telefon_notiz
     where ${auchErledigte} or erledigt_am is null
     order by erstellt_am desc
     limit 100
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    art: String(r.art ?? "rueckruf"),
    name: String(r.name ?? ""),
    nummer: String(r.nummer ?? ""),
    email: String(r.email ?? ""),
    anliegen: String(r.anliegen ?? ""),
    wunschtermin: String(r.wunschtermin ?? ""),
    personen: r.personen === null || r.personen === undefined ? null : Number(r.personen),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    erledigtAm: r.erledigt_am ? new Date(r.erledigt_am as string).toISOString() : null,
    erledigtVon: String(r.erledigt_von ?? ""),
  }));
}

export async function notizErledigen(id: string, von: string): Promise<void> {
  await db()`
    update telefon_notiz set erledigt_am = now(), erledigt_von = ${von}
     where id = ${id}::uuid and erledigt_am is null
  `;
}

/* ------------------------------------------------------------------ *
 * Das Gespräch selbst
 * ------------------------------------------------------------------ */

export async function gespraechBeginnen(o: { nummer: string; kanal: string }): Promise<string> {
  const z = (await db()`
    insert into telefon_gespraech (nummer, kanal) values (${o.nummer}, ${o.kanal}) returning id
  `) as Array<{ id: string }>;
  return String(z[0].id);
}

export async function verlaufMerken(id: string, verlauf: unknown): Promise<void> {
  await db()`
    update telefon_gespraech set verlauf = ${JSON.stringify(verlauf)}::jsonb where id = ${id}::uuid
  `.catch((f) => console.warn("[telefon] Verlauf nicht gespeichert:", f));
}
