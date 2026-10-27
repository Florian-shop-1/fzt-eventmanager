/**
 * Den Magic-News-Verteiler aufräumen.
 *
 * "dann guckst du auch mal welche email adressen bei uns schrott sind.
 * schau mal, welche der magic-news eine meldung zurückbekommen hatte,
 * z.B. 'ryanair, kümmern uns um ihr anliegen' oder was von 1&1, einfach
 * wo klar ist, dass wir die magic news nicht an einen potentiellen käufer
 * von tickets gesendet haben. diese gehen wir einzeln durch zusammen und
 * löschen sie aus unserem verteiler raus" (Florian, 25.10.2026).
 *
 * Woran man so eine Adresse erkennt, sind zwei verschiedene Dinge:
 *
 *   1. Brevo weiß es selbst. Wer hart abprallt oder sich beschwert hat,
 *      steht dort auf der schwarzen Liste. Das ist keine Vermutung.
 *   2. Der Name verrät es. no-reply@, support@, buchhaltung@: Dahinter
 *      sitzt ein Postfach, kein Gast. Das ist eine Vermutung, und
 *      deshalb entscheidet ein Mensch.
 *
 * Gelöscht wird nichts von allein. Die Seite schlägt vor, Florian
 * entscheidet, und was er behalten will, kommt nicht wieder.
 */

import { db } from "@/lib/db/client";
import { LISTE_MAGIC_NEWS } from "@/lib/abbrecher/magic-news";

const BREVO = "https://api.brevo.com/v3";

function schluessel(): string {
  const k = process.env.BREVO_API_KEY?.trim();
  if (!k) throw new Error("Für Brevo fehlt der Schlüssel (BREVO_API_KEY).");
  return k;
}

export function brevoBereit(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

/*
  Postfächer, hinter denen kein Gast sitzt.

  Bewusst als Liste von Anfängen und nicht als Regel: Jede Zeile ist eine
  Entscheidung, die man nachlesen und streichen kann. "info@" steht
  absichtlich NICHT hier: Bei kleinen Betrieben ist das die Adresse des
  Inhabers, und der geht durchaus ins Theater.
*/
const POSTFACH_STATT_MENSCH = [
  "no-reply", "noreply", "no_reply", "donotreply", "do-not-reply",
  "mailer-daemon", "postmaster", "bounce", "bounces",
  "support", "service", "kundenservice", "kundendienst", "helpdesk", "hilfe",
  "buchhaltung", "rechnung", "rechnungen", "billing", "invoice", "zahlung",
  "bestellung", "bestellungen", "auftrag", "order", "orders", "shop",
  "newsletter", "abo", "mailing", "marketing@mailchimp",
  "notification", "notifications", "benachrichtigung", "transaction",
  "ticket", "tickets", "anfrage", "antwort", "reply", "autoreply",
  "webmaster", "admin", "administrator", "hostmaster", "abuse",
  "datenschutz", "impressum", "presse", "karriere", "jobs", "bewerbung",
  "empfang", "zentrale", "sekretariat", "verwaltung",
];

/*
  Ganze Häuser, von denen nie ein Gast schreibt.

  Automaten, Portale, Ticketsysteme. Wer hier eine Mail bekommt, bekommt
  sie von einer Maschine, und unsere Magic News landen im Nichts.
*/
const MASCHINEN_DOMAINS = [
  "facebookmail.com", "zendesk.com", "freshdesk.com", "salesforce.com",
  "onmicrosoft.com", "mailchimp.com", "sendgrid.net", "amazonses.com",
  "notice.aliexpress.com", "ebay.com", "paypal.de", "paypal.com",
  "bahn.de", "deutschebahn.com", "ryanair.com", "1und1.de", "ionos.de",
  "wish.com", "aboutyou.de", "baur.de",
];

export interface Verdacht {
  email: string;
  vorname: string;
  nachname: string;
  /** Warum die Adresse auffällt, in einem Satz für den Menschen. */
  grund: string;
  /**
   * "gesperrt": Brevo schickt nichts mehr dorthin, aus welchem Grund auch
   * immer. Diese Adressen kosten uns nichts und sind keine Aufgabe.
   * "vermutung": sieht nach einem Postfach oder einem Automaten aus.
   */
  art: "gesperrt" | "vermutung";
  /** Hat Brevo sie schon gesperrt? */
  gesperrt: boolean;
}

interface BrevoKontakt {
  email: string;
  emailBlacklisted?: boolean;
  attributes?: Record<string, unknown>;
}

/** Alle Kontakte der Magic News, seitenweise. */
async function magicNewsKontakte(hoechstens = 30000): Promise<BrevoKontakt[]> {
  const k = schluessel();
  const alle: BrevoKontakt[] = [];

  for (let offset = 0; offset < hoechstens; offset += 500) {
    const antwort = await fetch(
      `${BREVO}/contacts/lists/${LISTE_MAGIC_NEWS}/contacts?limit=500&offset=${offset}`,
      { headers: { "api-key": k, accept: "application/json" }, signal: AbortSignal.timeout(30000) },
    );
    if (!antwort.ok) {
      throw new Error(`Brevo gibt die Magic-News-Liste nicht heraus (${antwort.status}).`);
    }
    const d = (await antwort.json()) as { contacts?: BrevoKontakt[] };
    const teil = d.contacts ?? [];
    alle.push(...teil);
    if (teil.length < 500) break;
  }

  return alle;
}

/** Warum diese Adresse auffällt. Null heißt: sieht nach einem Gast aus. */
export function verdachtVon(k: BrevoKontakt): Omit<Verdacht, "vorname" | "nachname"> | null {
  const email = String(k.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;

  const [vorne, hinten] = email.split("@");

  /*
    Gesperrt heisst NICHT kaputt.

    Brevo setzt dieselbe Sperre in drei verschiedenen Faellen: Die Mail
    ist hart abgeprallt (Adresse gibt es nicht), jemand hat sie als
    Werbung gemeldet, oder jemand hat sich schlicht abgemeldet. Das
    Letzte ist der haeufigste Fall und bedeutet nur, dass ein Mensch
    keine Post mehr will.

    Welcher Fall vorliegt, steht nicht in der Liste, sondern nur am
    einzelnen Kontakt. Deshalb behauptet der Grund hier nichts, und
    nachsehen kann man mit grundNachsehen (Florian, 27.10.2026:
    "bist du dir wirklich sicher, dass knapp 10.000 adressen schrott
    sind?").
  */
  if (k.emailBlacklisted) {
    return {
      email,
      grund:
        "Brevo stellt an diese Adresse nichts mehr zu. Ob abgeprallt, beschwert oder " +
        "abgemeldet, sagt die Liste nicht.",
      art: "gesperrt",
      gesperrt: true,
    };
  }

  const domain = MASCHINEN_DOMAINS.find((d) => hinten === d || hinten.endsWith(`.${d}`));
  if (domain) {
    return {
      email,
      grund: `${domain} ist ein Automat, dort liest kein Gast mit.`,
      art: "vermutung",
      gesperrt: false,
    };
  }

  const postfach = POSTFACH_STATT_MENSCH.find((p) => vorne === p || vorne.startsWith(`${p}.`) || vorne.startsWith(`${p}-`) || vorne.startsWith(`${p}+`));
  if (postfach) {
    return {
      email,
      grund: `"${postfach}@" ist ein Sammelpostfach, kein Mensch.`,
      art: "vermutung",
      gesperrt: false,
    };
  }

  return null;
}

/** Wer schon entschieden wurde, taucht nicht wieder auf. */
async function schonEntschieden(): Promise<Set<string>> {
  const z = (await db()`select email from verteiler_geprueft`.catch(() => [])) as Array<{ email: string }>;
  return new Set(z.map((r) => r.email.toLowerCase()));
}

/** Die Vorschlagsliste: was wir uns zusammen ansehen sollten. */
export async function verdaechtige(): Promise<{ gesamt: number; treffer: Verdacht[] }> {
  const [kontakte, erledigt] = await Promise.all([magicNewsKontakte(), schonEntschieden()]);
  const treffer: Verdacht[] = [];

  for (const k of kontakte) {
    const v = verdachtVon(k);
    if (!v || erledigt.has(v.email)) continue;
    const a = k.attributes ?? {};
    treffer.push({
      ...v,
      vorname: String(a.VORNAME ?? "").trim(),
      nachname: String(a.NACHNAME ?? "").trim(),
    });
  }

  /*
    Die Vermutungen nach vorne.

    Dort ist wirklich etwas zu entscheiden. Die gesperrten Adressen
    stehen hinten: Sie bekommen ohnehin keine Post mehr, sie aus der
    Liste zu nehmen ist Kosmetik.
  */
  treffer.sort((a, b) => (a.art === b.art ? a.email.localeCompare(b.email) : a.art === "vermutung" ? -1 : 1));
  return { gesamt: kontakte.length, treffer };
}

/** Aus den Magic News nehmen. Der Kontakt bleibt in Brevo, nur die Liste geht weg. */
export async function ausVerteiler(email: string, grund: string, von: string): Promise<void> {
  const adresse = email.trim().toLowerCase();
  const antwort = await fetch(`${BREVO}/contacts/${encodeURIComponent(adresse)}?identifierType=email_id`, {
    method: "PUT",
    headers: { "api-key": schluessel(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ unlinkListIds: [LISTE_MAGIC_NEWS] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok && antwort.status !== 404) {
    throw new Error(`Brevo nimmt sie nicht von der Liste (${antwort.status}).`);
  }
  await entscheidungMerken(adresse, "entfernt", grund, von);
}

export async function entscheidungMerken(
  email: string,
  entscheidung: "behalten" | "entfernt",
  grund: string,
  von: string,
): Promise<void> {
  await db()`
    insert into verteiler_geprueft (email, entscheidung, grund, von, am)
    values (${email.trim().toLowerCase()}, ${entscheidung}, ${grund.slice(0, 300)}, ${von}, now())
    on conflict (email) do update
      set entscheidung = excluded.entscheidung, grund = excluded.grund,
          von = excluded.von, am = now()
  `;
}

export async function entschiedene(grenze = 50): Promise<
  Array<{ email: string; entscheidung: string; grund: string; von: string; am: string }>
> {
  const z = (await db()`
    select email, entscheidung, grund, von, am from verteiler_geprueft
     order by am desc limit ${grenze}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    email: String(r.email),
    entscheidung: String(r.entscheidung),
    grund: String(r.grund ?? ""),
    von: String(r.von ?? ""),
    am: new Date(r.am as string).toISOString(),
  }));
}

/**
 * Bei einer gesperrten Adresse nachsehen, woran es wirklich liegt.
 *
 * Ein Aufruf je Adresse, deshalb nicht für die ganze Liste: Bei
 * zehntausend Kontakten wären das zehntausend Anfragen. Für die eine
 * Adresse, über die man gerade nachdenkt, reicht es.
 *
 * Der Unterschied ist der wichtigste auf dieser Seite:
 *
 *   abgeprallt  Die Adresse gibt es nicht. Weg damit.
 *   beschwert   Jemand hat uns als Werbung gemeldet. Weg damit.
 *   abgemeldet  Ein Mensch will keine Post mehr. Nichts tun. Brevo
 *               schickt ohnehin nichts, und die Abmeldung muss
 *               nachweisbar bleiben.
 */
export async function grundNachsehen(email: string): Promise<string> {
  const adresse = email.trim().toLowerCase();
  const antwort = await fetch(`${BREVO}/contacts/${encodeURIComponent(adresse)}`, {
    headers: { "api-key": schluessel(), accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) {
    return `Brevo sagt zu ${adresse} nichts (${antwort.status}).`;
  }

  const c = (await antwort.json()) as {
    emailBlacklisted?: boolean;
    statistics?: {
      hardBounces?: unknown[];
      complaints?: unknown[];
      unsubscriptions?: { userUnsubscription?: unknown[]; adminUnsubscription?: unknown[] };
    };
  };
  const s = c.statistics ?? {};
  const hart = (s.hardBounces ?? []).length;
  const beschwerde = (s.complaints ?? []).length;
  const abgemeldet =
    (s.unsubscriptions?.userUnsubscription ?? []).length +
    (s.unsubscriptions?.adminUnsubscription ?? []).length;

  if (hart > 0) return `${adresse}: Die Mail ist ${hart}-mal hart abgeprallt. Die Adresse gibt es nicht.`;
  if (beschwerde > 0) return `${adresse}: ${beschwerde}-mal als Werbung gemeldet. Besser aus dem Verteiler nehmen.`;
  if (abgemeldet > 0) {
    return (
      `${adresse}: Hat sich selbst abgemeldet. Das ist keine kaputte Adresse, sondern eine ` +
      `Entscheidung. Brevo schickt nichts mehr dorthin, und die Abmeldung soll nachweisbar bleiben. ` +
      `Am besten behalten.`
    );
  }
  if (c.emailBlacklisted) {
    return `${adresse}: In Brevo gesperrt, aber ohne Spur im Verlauf. Grund unbekannt.`;
  }
  return `${adresse}: Brevo kennt keine Sperre. Sieht nach einem ganz normalen Kontakt aus.`;
}
