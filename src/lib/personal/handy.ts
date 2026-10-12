/**
 * Die Handynummer eines Mitarbeiters und sein Ja dazu.
 * Siehe migrations/170_handy_einwilligung.sql.
 *
 * Gebraucht für die Dienstnachricht per WhatsApp, zum Beispiel nach der
 * Pause im Foyer.
 *
 * Die Grundlage steht seit dem 12.10.2026 im Arbeitsvertrag: Dienstliche
 * Abstimmung läuft über Mail, den Eventmanager und WhatsApp, und wer
 * bei uns anfängt, nennt dafür eine Mobilfunknummer. Gefragt wird
 * deshalb nicht mehr im Programm (Florian, 12.10.2026).
 *
 * Das Feld whatsapp_ok bleibt als Ausnahme: Steht es auf false, geht an
 * diese Person nichts über WhatsApp hinaus, etwa bei einem alten
 * Vertrag oder einem begründeten Widerspruch. Ohne Eintrag gilt der
 * Vertrag.
 */

import { db } from "@/lib/db/client";
import { alsWaNummer, kennungLesbar } from "@/lib/whatsapp/kennung";

export interface Erreichbarkeit {
  benutzerId: string;
  name: string;
  rolle: string;
  /** Ziffern mit Vorwahl, oder leer. */
  handy: string;
  /** Lesbar, für die Anzeige: "+491761234567". */
  handyLesbar: string;
  /** false heisst: ausgenommen. null heisst: es gilt der Vertrag. */
  whatsappOk: boolean | null;
  gefragtAm: string | null;
}

export function handyPruefen(roh: string): string | null {
  return alsWaNummer(roh);
}

export async function erreichbarkeiten(): Promise<Erreichbarkeit[]> {
  const z = (await db()`
    select id, name, rolle, handy, whatsapp_ok, whatsapp_ok_am
      from benutzer
     where aktiv and not geteilt
     order by rolle, name
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    benutzerId: String(r.id),
    name: String(r.name),
    rolle: String(r.rolle),
    handy: String(r.handy ?? ""),
    handyLesbar: r.handy ? kennungLesbar(String(r.handy)) : "",
    whatsappOk: r.whatsapp_ok === null || r.whatsapp_ok === undefined ? null : Boolean(r.whatsapp_ok),
    gefragtAm: r.whatsapp_ok_am ? new Date(r.whatsapp_ok_am as string).toISOString() : null,
  }));
}

/** Die Nummer setzen oder löschen. Leer heisst löschen. */
export async function handySetzen(benutzerId: string, roh: string): Promise<string> {
  const leer = roh.trim() === "";
  const nummer = leer ? "" : handyPruefen(roh);
  if (nummer === null) {
    throw new Error("Das sieht nicht nach einer Handynummer aus. Zum Beispiel: 0176 1234567.");
  }
  await db()`update benutzer set handy = ${nummer} where id = ${benutzerId}::uuid`;
  return nummer;
}

/** Eine Person von WhatsApp ausnehmen oder sie wieder aufnehmen. */
export async function einwilligungSetzen(benutzerId: string, ja: boolean): Promise<void> {
  await db()`
    update benutzer set whatsapp_ok = ${ja}, whatsapp_ok_am = now() where id = ${benutzerId}::uuid
  `;
}

/**
 * Wer per WhatsApp erreichbar ist: Nummer da und nicht ausgenommen.
 *
 * Fehlt die Nummer, bleibt es bei der Mail. Das ist kein Sonderweg,
 * sondern der Normalfall, solange die Nummern noch nachgetragen werden.
 */
export async function perWhatsAppErreichbar(benutzerId: string): Promise<string | null> {
  const z = (await db()`
    select handy from benutzer
     where id = ${benutzerId}::uuid and coalesce(whatsapp_ok, true) and handy <> ''
  `.catch(() => [])) as Array<{ handy: string }>;
  return z[0]?.handy ?? null;
}
