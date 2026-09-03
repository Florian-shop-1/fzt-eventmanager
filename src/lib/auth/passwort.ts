/**
 * Passwörter sicher speichern und prüfen.
 *
 * Verwendet scrypt aus der Node-Standardbibliothek. Kein zusätzliches Paket,
 * und scrypt ist bewusst langsam: Wer die Datenbank stiehlt, kann Passwörter
 * trotzdem nicht in vertretbarer Zeit durchprobieren.
 *
 * Gespeichert wird "zufallszusatz:pruefsumme". Der Zufallszusatz ist je
 * Passwort verschieden, damit zwei gleiche Passwörter unterschiedlich
 * aussehen.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCHLUESSELLAENGE = 64;

/** Erzeugt die Prüfsumme, die in der Datenbank landet. */
export async function passwortVerschluesseln(passwort: string): Promise<string> {
  const zusatz = randomBytes(16).toString("hex");
  const schluessel = (await scryptAsync(passwort, zusatz, SCHLUESSELLAENGE)) as Buffer;
  return `${zusatz}:${schluessel.toString("hex")}`;
}

/**
 * Prüft ein eingegebenes Passwort gegen die gespeicherte Prüfsumme.
 * Der Vergleich läuft zeitkonstant, damit sich aus der Antwortdauer nichts
 * über das Passwort ableiten lässt.
 */
export async function passwortStimmt(passwort: string, gespeichert: string): Promise<boolean> {
  const [zusatz, erwartet] = gespeichert.split(":");
  if (!zusatz || !erwartet) return false;

  const schluessel = (await scryptAsync(passwort, zusatz, SCHLUESSELLAENGE)) as Buffer;
  const erwartetBuffer = Buffer.from(erwartet, "hex");

  if (erwartetBuffer.length !== schluessel.length) return false;
  return timingSafeEqual(schluessel, erwartetBuffer);
}

/**
 * Erzeugt ein Startpasswort, das man vorlesen und abtippen kann.
 * Bewusst ohne Zeichen, die man verwechselt: kein l, I, 1, O, 0.
 */
export function startpasswortErzeugen(): string {
  const zeichen = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let wort = "";
  for (let i = 0; i < 12; i++) {
    wort += zeichen[bytes[i] % zeichen.length];
    if (i === 3 || i === 7) wort += "-";
  }
  return wort;
}

/** Mindestanforderungen an ein selbst gewähltes Passwort. */
export function passwortPruefen(passwort: string): string | null {
  if (passwort.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  if (/^\d+$/.test(passwort)) return "Nur Zahlen ist zu wenig. Bitte Buchstaben mischen.";
  return null;
}
