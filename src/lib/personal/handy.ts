/**
 * Die Handynummer eines Mitarbeiters und sein Ja dazu.
 * Siehe migrations/170_handy_einwilligung.sql.
 *
 * Gebraucht für die Dienstnachricht per WhatsApp, zum Beispiel nach der
 * Pause im Foyer. Zwei Dinge gehören dazu, und beide zählen einzeln:
 * die Nummer und die Einwilligung.
 *
 * Die Einwilligung muss freiwillig sein. Wer nein sagt, bekommt die
 * Nachricht weiter per Mail und hat sonst keinen Nachteil, und wer
 * später anders denkt, kann sie jederzeit zurücknehmen. Deshalb
 * blockiert nichts davon den Zugang zum Eventmanager.
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
  /** null heisst: noch nicht gefragt. */
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

/** Was der Mitarbeiter selbst entschieden hat. */
export async function einwilligungSetzen(benutzerId: string, ja: boolean): Promise<void> {
  await db()`
    update benutzer set whatsapp_ok = ${ja}, whatsapp_ok_am = now() where id = ${benutzerId}::uuid
  `;
}

/** Wer per WhatsApp erreichbar ist: Nummer da und Ja gegeben. */
export async function perWhatsAppErreichbar(benutzerId: string): Promise<string | null> {
  const z = (await db()`
    select handy from benutzer
     where id = ${benutzerId}::uuid and whatsapp_ok and handy <> ''
  `.catch(() => [])) as Array<{ handy: string }>;
  return z[0]?.handy ?? null;
}
