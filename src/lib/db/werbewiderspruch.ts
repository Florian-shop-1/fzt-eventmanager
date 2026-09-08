/**
 * Wer keine Werbemail mehr möchte.
 *
 * Klein, aber die wichtigste Tabelle am ganzen Mailversand: Ohne einen
 * jederzeit erreichbaren Widerspruchsweg dürften wir die Vorfreude-Mail
 * überhaupt nicht schicken (§ 7 Abs. 3 UWG). Siehe
 * migrations/028_werbung_widerspruch.sql.
 *
 * Alle Funktionen hier arbeiten mit kleingeschriebenen Adressen. Wer sich als
 * "Max.Mustermann@..." abmeldet, soll auch als "max.mustermann@..." nichts
 * mehr bekommen.
 */

import { db } from "@/lib/db/client";

export interface Widerspruch {
  email: string;
  quelle: string;
  eingetragenAm: Date;
}

/** Vereinheitlicht eine Adresse für Vergleich und Speicherung. */
export function adresse(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Trägt einen Widerspruch ein.
 *
 * Mehrfaches Abmelden ist kein Fehler, sondern der Normalfall: Der Link in der
 * Mail bleibt anklickbar, und Menschen klicken zweimal. Deshalb wird ein
 * vorhandener Eintrag einfach bestätigt, statt zu scheitern.
 */
export async function widerspruchEintragen(email: string, quelle: string): Promise<void> {
  const a = adresse(email);
  if (!a || !a.includes("@")) return;
  await db()`
    insert into werbung_widerspruch (email, quelle)
    values (${a}, ${quelle})
    on conflict (email) do nothing
  `;
}

/** Nimmt einen Widerspruch zurück. Nur für den Fall, dass jemand darum bittet. */
export async function widerspruchLoeschen(email: string): Promise<void> {
  await db()`delete from werbung_widerspruch where email = ${adresse(email)}`;
}

/**
 * Die Adressen, die aus einer Empfängerliste herausfallen.
 *
 * Bewusst eine Mengenabfrage statt einer Prüfung je Adresse: Der tägliche Lauf
 * hat eine Liste in der Hand und soll nicht für jeden Gast einzeln fragen.
 */
export async function widersprochene(emails: string[]): Promise<Set<string>> {
  const liste = [...new Set(emails.map(adresse).filter(Boolean))];
  if (liste.length === 0) return new Set();
  const zeilen = (await db()`
    select email from werbung_widerspruch where email = any(${liste}::text[])
  `) as Record<string, unknown>[];
  return new Set(zeilen.map((z) => String(z.email)));
}

/** Die ganze Liste, für die Übersicht im Programm. */
export async function alleWidersprueche(): Promise<Widerspruch[]> {
  const zeilen = (await db()`
    select * from werbung_widerspruch order by eingetragen_am desc
  `) as Record<string, unknown>[];
  return zeilen.map((z) => ({
    email: String(z.email),
    quelle: String(z.quelle ?? ""),
    eingetragenAm: new Date(z.eingetragen_am as string),
  }));
}
