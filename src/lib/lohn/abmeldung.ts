/**
 * Die Abmeldung eines Mitarbeiters beim Lohnbüro.
 *
 * "maile ans lohnbüro, dass er abgemeldet werden soll" (Florian,
 * 12.10.2026). Bisher ging das nur von Hand, und dann steht später
 * nirgends, ob es wirklich jemand gemacht hat.
 *
 * Verschickt wird aus dem Personalpostfach, mit Kopie an denselben
 * Empfänger wie die Stundenmeldung. Der Grund des Ausscheidens steht
 * nicht in der Mail: Das Lohnbüro braucht ihn nicht, und was
 * gesundheitliche Gründe angeht, gehört er ohnehin nicht nach außen.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { einstellungLesen } from "./meldung";

const NL = String.fromCharCode(10);

export async function abmeldungSchicken(o: {
  benutzerId: string;
  /** Wer die Mail auslöst, für die Grußzeile. */
  von: string;
}): Promise<{ an: string; name: string }> {
  const p = (await db()`
    select name, abgemeldet_am from benutzer where id = ${o.benutzerId}::uuid
  `) as Array<{ name: string; abgemeldet_am: string | null }>;
  if (!p[0]) throw new Error("Diese Person gibt es nicht.");
  if (p[0].abgemeldet_am) throw new Error(`${p[0].name} ist schon abgemeldet.`);

  const e = await einstellungLesen();
  if (!e.steuerbuero) throw new Error("Im Lohnbereich ist noch keine Adresse des Lohnbüros hinterlegt.");

  /*
    "Hallo Sabine" statt "Hallo Steuerbüro": Steht im Lohnbereich ein
    Personenname, nehmen wir den Vornamen, sonst grüßen wir alle
    zusammen (Florian, 12.10.2026).
  */
  const ersterTeil = e.steuerbueroName.trim().split(/\s+/)[0] ?? "";
  const vorname = ersterTeil && !/büro|buero|kanzlei|steuer/i.test(ersterTeil) ? ersterTeil : "zusammen";
  const absaetze = [
    `bitte meldet ${p[0].name} ab. Er oder sie arbeitet nicht mehr bei uns, Stunden sind nicht zu melden.`,
    "Wenn ihr für die Abmeldung noch etwas von uns braucht, sagt gern Bescheid.",
  ];

  await mailVerschicken({
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    an: e.steuerbuero,
    blindkopie: e.kopieAn || undefined,
    betreff: `Abmeldung ${p[0].name} - Florian Zimmer Theater`,
    text: [`Hallo ${vorname},`, "", ...absaetze, "", "Herzliche Grüße", o.von, "Florian Zimmer Theater"].join(NL),
  });

  await db()`update benutzer set abgemeldet_am = now() where id = ${o.benutzerId}::uuid`;
  return { an: e.steuerbuero, name: p[0].name };
}
