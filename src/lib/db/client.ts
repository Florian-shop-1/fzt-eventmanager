/**
 * Zugang zur Neon-Datenbank.
 *
 * Neon spricht über HTTP, das passt zu Vercel: keine offenen Verbindungen,
 * die zwischen Aufrufen gehalten werden müssen.
 *
 * Die Verbindungszeichenfolge steht in der Umgebungsvariable DATABASE_URL
 * und gehört niemals in den Quelltext.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Liefert den Datenbankzugang. Die Verbindung wird erst beim ersten
 * Aufruf aufgebaut, damit ein fehlender Eintrag nicht schon beim Bauen
 * der Anwendung stört, sondern erst dann, wenn wirklich Daten gebraucht
 * werden.
 *
 * Abfragen werden als Vorlage geschrieben, damit Werte immer sauber
 * eingesetzt werden und keine Lücke für eingeschleuste Befehle entsteht:
 *
 *   const zeilen = await db()`select * from kunde where id = ${id}`;
 */
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL ist nicht gesetzt. Trage die Verbindung aus Neon in die Datei " +
          ".env.local ein, siehe .env.example.",
      );
    }
    client = neon(url);
  }
  return client;
}

/** Prüft, ob die Datenbank erreichbar ist. Für die Statusanzeige gedacht. */
export async function istErreichbar(): Promise<{ ok: boolean; meldung: string }> {
  try {
    await db()`select 1`;
    return { ok: true, meldung: "Datenbank erreichbar" };
  } catch (e) {
    return { ok: false, meldung: fehlertext(e) };
  }
}

/**
 * Macht Verbindungsfehler lesbar. "fetch failed" allein sagt nichts,
 * die eigentliche Ursache steckt eine Ebene tiefer in `cause`.
 */
export function fehlertext(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const teile = [e.message];
  let ursache: unknown = e.cause;
  let tiefe = 0;
  while (ursache instanceof Error && tiefe < 4) {
    const code = (ursache as NodeJS.ErrnoException).code;
    teile.push(`${ursache.message}${code ? ` (${code})` : ""}`);
    ursache = ursache.cause;
    tiefe += 1;
  }
  return teile.join(" -> ");
}
