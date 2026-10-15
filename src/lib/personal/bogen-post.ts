/**
 * Alte Personalbögen aus dem Postfach zurückholen.
 *
 * "konntest du die Mails mit den Personalbögen finden und zuordnen?"
 * (Florian, 15.10.2026). Vor dem 1. Oktober 2026 ging der Bogen nur als
 * Mail ans Lohnbüro und wurde im Haus nicht aufbewahrt. Die Mails gibt
 * es aber noch, und sie haben immer denselben Aufbau, weil der
 * Eventmanager sie selbst geschrieben hat: erst die Gruppenüberschrift,
 * dann "Feld: Wert" je Zeile.
 *
 * Deshalb liest das Programm sie zurück, statt die Leute ein zweites Mal
 * zu fragen. Zugeordnet wird über die Mailadresse im Bogen, nicht über
 * den Namen: Adressen sind eindeutig, Namen nicht.
 *
 * Vorhandene Angaben werden nicht überschrieben. Was das Büro später
 * korrigiert hat, gilt.
 */

import { db } from "@/lib/db/client";
import { GRAPH_BASIS, graphToken } from "@/lib/mail/versand";
import { bogenSpeichern } from "@/lib/db/personalbogen";
import { LEER, type Personalbogen } from "./personalbogen";

/** In welchen Postfächern die alten Mails liegen können. */
const POSTFAECHER = (
  process.env.BOGEN_POSTFAECHER
  ?? process.env.ANWALT_POSTFAECHER
  ?? "info@florianzimmer.com,w.zimmer@florianzimmer.com"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/** Die Beschriftungen aus der Mail, zurück auf die Felder des Bogens. */
const ZURUECK: Record<string, keyof Personalbogen> = {
  "Name": "nachname",
  "Geburtsname": "geburtsname",
  "Vorname": "vorname",
  "Straße": "strasse",
  "Strasse": "strasse",
  "Postleitzahl": "plz",
  "Ort": "ort",
  "Geburtsdatum": "geburtsdatum",
  "Geburtsort": "geburtsort",
  "Familienstand": "familienstand",
  "Staatsangehörigkeit": "staatsangehoerigkeit",
  "Schwerbehindert": "schwerbehindert",
  "E-Mail": "email",
  "Telefon": "telefon",
  "Versicherungsnummer": "svNummer",
  "IBAN": "iban",
  "BIC": "bic",
  "Kontoinhaber": "kontoinhaber",
  "Eintrittsdatum": "eintrittsdatum",
  "Berufsbezeichnung": "berufsbezeichnung",
  "Art der Beschäftigung": "beschaeftigung",
  "Höchster Schulabschluss": "schulabschluss",
  "Höchste Berufsausbildung": "ausbildung",
  "Status bei Beginn der Beschäftigung": "statusMinijob",
  "Rentenbefreiung": "rentenbefreiung",
  "Steuer-Identifikationsnummer": "steuerId",
  "Steuerklasse": "steuerklasse",
  "Konfession": "konfession",
  "Krankenversicherung": "krankenversicherung",
  "Name der Krankenkasse": "krankenkasse",
};

/** Aus "08.12.1991" wird "1991-12-08", alles andere bleibt. */
function alsDatum(wert: string): string {
  const t = wert.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return t ? `${t[3]}-${t[2]}-${t[1]}` : wert.trim();
}

/**
 * Den Bogen aus dem Mailtext lesen.
 *
 * Erkannt wird jede Zeile mit einem Doppelpunkt, deren Beschriftung in
 * der Tabelle oben steht. Ein Strich heißt: war leer.
 */
export function bogenAusText(text: string): Personalbogen | null {
  const b: Personalbogen = { ...LEER };
  let treffer = 0;

  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    const punkt = zeile.indexOf(":");
    if (punkt < 2) continue;

    const schlüssel = ZURUECK[zeile.slice(0, punkt).trim()];
    if (!schlüssel) continue;

    const wert = zeile.slice(punkt + 1).trim();
    if (!wert || wert === "-") continue;

    b[schlüssel] =
      schlüssel === "geburtsdatum" || schlüssel === "eintrittsdatum"
        ? alsDatum(wert)
        : schlüssel === "iban"
          ? wert.replace(/\s/g, "")
          : wert;
    treffer += 1;
  }

  // Unter zehn erkannten Feldern ist das keine Bogenmail.
  return treffer >= 10 && b.email ? b : null;
}

interface GraphNachricht {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
}

async function graph<T>(pfad: string): Promise<T> {
  const zugang = await graphToken();
  const antwort = await fetch(`${GRAPH_BASIS}${pfad}`, {
    headers: { Authorization: `Bearer ${zugang}`, Prefer: 'outlook.body-content-type="text"' },
    signal: AbortSignal.timeout(30000),
  });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    if (antwort.status === 403) {
      throw new Error(
        "Der Eventmanager darf dieses Postfach nicht lesen. In Azure fehlt die Berechtigung Mail.Read.",
      );
    }
    throw new Error(`Microsoft hat abgelehnt (${antwort.status}): ${text.slice(0, 200)}`);
  }
  return (await antwort.json()) as T;
}

export interface Bogenlauf {
  gesehen: number;
  uebernommen: number;
  schonDa: number;
  ohneZuordnung: number;
  meldungen: string[];
}

/**
 * Die alten Bogenmails durchsehen und ablegen.
 *
 * Gelesen wird nur. Es wird nichts beantwortet, verschoben oder
 * gelöscht.
 */
export async function boegenAusPostfach(): Promise<Bogenlauf> {
  const lauf: Bogenlauf = {
    gesehen: 0,
    uebernommen: 0,
    schonDa: 0,
    ohneZuordnung: 0,
    meldungen: [],
  };

  // Wer hat schon Angaben im Haus? Die bleiben unangetastet.
  const vorhanden = new Set(
    ((await db()`select benutzer_id from personalbogen`.catch(() => [])) as Array<{
      benutzer_id: string;
    }>).map((r) => String(r.benutzer_id)),
  );

  const leute = ((await db()`select id, name, lower(email) as email from benutzer`.catch(
    () => [],
  )) as Array<{ id: string; name: string; email: string }>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email ?? ""),
  }));

  const gesehen = new Set<string>();

  for (const postfach of POSTFAECHER) {
    let nachrichten: GraphNachricht[] = [];
    try {
      const antwort = await graph<{ value: GraphNachricht[] }>(
        `/users/${encodeURIComponent(postfach)}/messages`
          + `?$search=${encodeURIComponent('"subject:Personalbogen"')}`
          + "&$select=id,internetMessageId,subject,receivedDateTime,body&$top=50",
      );
      nachrichten = antwort.value ?? [];
    } catch (e) {
      lauf.meldungen.push(`${postfach}: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
      continue;
    }

    for (const n of nachrichten) {
      const schluessel = n.internetMessageId ?? n.id;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      lauf.gesehen += 1;

      const roh = n.body?.content ?? "";
      // Kam der Text doch als HTML, werden die Tags entfernt.
      const text = roh.includes("<")
        ? roh
            .replace(/<\s*br\s*\/?>/gi, "\n")
            .replace(/<\s*\/\s*(tr|p|div|h\d|table)\s*>/gi, "\n")
            .replace(/<\s*\/\s*td\s*>\s*<\s*td[^>]*>/gi, ": ")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&nbsp;/g, " ")
        : roh;

      const bogen = bogenAusText(text);
      if (!bogen) continue;

      const person =
        leute.find((p) => p.email && p.email === bogen.email.toLowerCase())
        ?? leute.find(
          (p) =>
            p.name.toLowerCase()
            === `${bogen.vorname} ${bogen.nachname}`.toLowerCase().trim(),
        );

      if (!person) {
        lauf.ohneZuordnung += 1;
        lauf.meldungen.push(`Niemand gefunden zu ${bogen.vorname} ${bogen.nachname}.`);
        continue;
      }

      if (vorhanden.has(person.id)) {
        lauf.schonDa += 1;
        continue;
      }

      const wann = n.receivedDateTime
        ? n.receivedDateTime.slice(0, 10).split("-").reverse().join(".")
        : "unbekannt";

      await bogenSpeichern({
        benutzerId: person.id,
        daten: bogen,
        quelle: `aus der Mail ans Lohnbüro vom ${wann}`,
        von: "Posteingang",
      });
      await db()`
        update benutzer set personalbogen_am = coalesce(personalbogen_am, now())
         where id = ${person.id}
      `.catch(() => undefined);

      vorhanden.add(person.id);
      lauf.uebernommen += 1;
      lauf.meldungen.push(`${person.name} übernommen.`);

      // Liegt auch der Vertrag vor, geht jetzt das Paket ans Lohnbüro.
      const { lohnbueroPaketStill } = await import("./lohnbuero-paket");
      await lohnbueroPaketStill(person.id);
    }
  }

  return lauf;
}
