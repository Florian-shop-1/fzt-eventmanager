/**
 * Sind an einem Abend überhaupt Menüs buchbar?
 *
 * Der Anlass (Florian, 21.09.2026): Eine Gästin hatte Karten für den
 * 11.12.2026 und wollte das Menü nachbuchen. Auf ihrer Upgrade-Seite stand
 * keines, weil die Menü-Ticketarten in Ditix für diesen Abend auf "nicht
 * aktiv" standen. Aufgefallen ist das erst durch ihre Nachricht.
 *
 * Deshalb prüft das Programm das jetzt selbst: im Funktionsheet für den
 * angezeigten Abend, auf der Vorfreude-Seite als Liste, und einmal täglich
 * mit einer Mail, sobald ein Abend neu auffällt.
 *
 * Bewusst nur ein Hinweis, keine Änderung: Geschrieben wird in Ditix
 * nichts (siehe lib/ditix/spielplan.ts). Das Freischalten bleibt Handarbeit.
 */

import { db } from "@/lib/db/client";
import { kommendeTermine, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { istEigenerTermin } from "@/lib/db/eigenertermin";
import { mailVerschicken } from "@/lib/mail/versand";
import { datumMitWochentag } from "@/lib/zeit";

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";
const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

/**
 * Shows, bei denen es normal ist, dass nichts gekocht wird. Sie sollen
 * nicht jeden Tag als Fehler gemeldet werden.
 */
const OHNE_KUECHE = /regio\s*tv|schnupper/i;

export function kochtNormalerweise(showname: string): boolean {
  return !OHNE_KUECHE.test(showname);
}

/**
 * Ist an diesem Abend mindestens ein Menü im Shop buchbar?
 *
 * Gefragt wird derselbe öffentliche Weg wie bei den Zusatzleistungen, das
 * Ergebnis bleibt eine Viertelstunde gültig: Das Funktionsheet wird oft
 * geöffnet, und die Antwort ändert sich höchstens einmal am Tag.
 *
 * Antwortet der Shop nicht, lautet die Antwort "buchbar". Ein Hinweis, der
 * bei jeder Störung aufblinkt, wird nach einer Woche nicht mehr gelesen.
 */
export async function menueBuchbar(ditixEventId: string): Promise<boolean> {
  if (istEigenerTermin(ditixEventId)) return true;
  try {
    const antwort = await fetch(`${SHOP_BASIS}/api/ditix/ticket-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: ditixEventId }),
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(10000),
    });
    if (!antwort.ok) return true;
    const arten = (await antwort.json()) as Array<{
      name?: string;
      isActive?: boolean;
      isHiddenInShop?: boolean;
    }>;
    if (!Array.isArray(arten)) return true;
    return arten.some(
      (a) =>
        a?.name &&
        /menü|menu/i.test(a.name) &&
        // "Getränkearrangement zum Menü" ist kein Menü, sondern das Getränk dazu.
        !/getränk/i.test(a.name) &&
        a.isActive !== false &&
        a.isHiddenInShop !== true,
    );
  } catch (e) {
    console.warn("[menuepruefung] Shop nicht erreichbar:", e);
    return true;
  }
}

/** Buchbar an diesem TAG: Es reicht, wenn eine Vorstellung des Tages Menüs hat. */
export async function menueBuchbarAmTag(eventIds: string[]): Promise<boolean> {
  for (const id of eventIds) {
    if (await menueBuchbar(id)) return true;
  }
  return eventIds.length === 0;
}

export interface AbendOhneMenue {
  ditixEventId: string;
  datum: string;
  uhrzeit: string;
  name: string;
}

/**
 * Alle kommenden Abende, an denen normalerweise gekocht wird, im Shop aber
 * kein Menü buchbar ist. Geprüft wird ein begrenzter Zeitraum, sonst wären
 * es zweihundert Anfragen an den Shop.
 */
export async function abendeOhneMenue(tage = 120): Promise<AbendOhneMenue[]> {
  const bis = Date.now() + tage * 86400000;
  const termine = (await kommendeTermine(400)).filter(
    (t) => t.beginn.getTime() <= bis && kochtNormalerweise(t.name) && !istEigenerTermin(t.ditixEventId),
  );

  const treffer: AbendOhneMenue[] = [];
  for (const t of termine) {
    if (await menueBuchbar(t.ditixEventId)) continue;
    treffer.push({ ditixEventId: t.ditixEventId, datum: t.datum, uhrzeit: t.uhrzeit, name: t.name });
  }
  return treffer;
}

/**
 * Was beim letzten Lauf aufgefallen ist, aus der eigenen Tabelle.
 *
 * Fuer die Anzeige: Die Liste frisch zu pruefen hiesse vierzig Anfragen an
 * den Shop bei jedem Seitenaufruf. Der taegliche Lauf haelt sie aktuell,
 * und wer es genau wissen will, drueckt auf "Jetzt pruefen".
 */
export async function gemeldeteAbendeOhneMenue(): Promise<AbendOhneMenue[]> {
  const z = (await db()`
    select ditix_event_id, datum::text as datum from shop_menue_meldung order by datum
  `) as Array<{ ditix_event_id: string; datum: string }>;
  if (z.length === 0) return [];
  const termine = await kommendeTermine(400).catch(() => [] as Vorstellungstermin[]);
  return z.map((r) => {
    const t = termine.find((x) => x.ditixEventId === r.ditix_event_id);
    return {
      ditixEventId: r.ditix_event_id,
      datum: t?.datum ?? r.datum,
      uhrzeit: t?.uhrzeit ?? "",
      name: t?.name ?? "",
    };
  });
}

/** Welche Abende schon gemeldet wurden, damit niemand täglich dieselbe Mail bekommt. */
async function schonGemeldet(): Promise<Set<string>> {
  const z = (await db()`select ditix_event_id from shop_menue_meldung`) as Array<{ ditix_event_id: string }>;
  return new Set(z.map((r) => r.ditix_event_id));
}

/**
 * Der tägliche Blick: Was ist neu aufgefallen?
 *
 * Gemeldet wird einmal je Abend. Ist ein Abend wieder in Ordnung, wird der
 * Vermerk gelöscht; fällt er später erneut aus, meldet das Programm ihn
 * wieder.
 */
export async function taeglicheMenuepruefung(): Promise<{ offen: number; gemeldet: number }> {
  const offen = await abendeOhneMenue();
  const ids = offen.map((a) => a.ditixEventId);

  // Wieder freigeschaltete Abende vergessen.
  if (ids.length > 0) {
    await db()`delete from shop_menue_meldung where ditix_event_id <> all(${ids}::text[])`;
  } else {
    await db()`delete from shop_menue_meldung`;
  }

  const bekannt = await schonGemeldet();
  const neu = offen.filter((a) => !bekannt.has(a.ditixEventId));
  if (neu.length === 0) return { offen: offen.length, gemeldet: 0 };

  const empfaenger = (await db()`
    select name, email from benutzer
     where aktiv and (rolle = 'chef' or lower(email) = 'kevin.steele@florianzimmer.com')
  `) as Array<{ name: string; email: string }>;

  const zeilen = neu.map((a) => `- ${datumMitWochentag(a.datum)}, ${a.uhrzeit} Uhr, ${a.name}`);
  const text = [
    "an diesen Abenden kann im Ticketshop gerade kein Menü gebucht werden:",
    "",
    ...zeilen,
    "",
    "In Ditix stehen die Menü-Ticketarten für diese Termine auf „nicht aktiv“.",
    "Wer Karten hat und das Menü nachbuchen möchte, findet dort nichts.",
    "",
    "Wenn das so gewollt ist (Haus exklusiv gebucht, Küche voll), einfach ignorieren.",
    "Sonst in Ditix die Menüs für diese Termine wieder freischalten.",
    "",
    `Übersicht im Eventmanager: ${APP}/vorfreude`,
  ].join("\n");

  for (const p of empfaenger) {
    try {
      await mailVerschicken({
        an: p.email,
        betreff: neu.length === 1 ? "Ein Abend ohne buchbares Menü im Shop" : `${neu.length} Abende ohne buchbares Menü im Shop`,
        text: `Hallo ${p.name.split(" ")[0]},\n\n${text}`,
      });
    } catch (f) {
      console.error("[menuepruefung] Meldung an", p.email, "fehlgeschlagen:", f);
    }
  }

  for (const a of neu) {
    await db()`
      insert into shop_menue_meldung (ditix_event_id, datum) values (${a.ditixEventId}, ${a.datum}::date)
      on conflict (ditix_event_id) do nothing
    `;
  }
  return { offen: offen.length, gemeldet: neu.length };
}
