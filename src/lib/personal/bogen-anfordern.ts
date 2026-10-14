/**
 * Den Personalbogen per Mail anfordern.
 *
 * Der Knopf "neu anfordern" setzte bisher nur den Haken zurück, damit im
 * Programm wieder die Aufgabe erscheint. Wer sich selten anmeldet, sieht
 * sie nie: Noël arbeitet seit Wochen mit und hat keinen Bogen abgegeben
 * (Florian, 14.10.2026).
 *
 * Deshalb geht jetzt zusätzlich eine Mail hinaus, aus dem Personal-
 * postfach, mit dem Link direkt auf den Bogen.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const NL = String.fromCharCode(10);

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Schickt die Aufforderung und gibt zurück, an wen sie ging. */
export async function bogenAnfordern(benutzerId: string): Promise<{ name: string; email: string }> {
  const z = (await db()`
    select name, email from benutzer where id = ${benutzerId}::uuid
  `) as Array<{ name: string; email: string }>;
  if (!z[0]) throw new Error("Diese Person gibt es nicht.");
  const { name, email } = z[0];
  if (!email.includes("@")) throw new Error(`Für ${name} ist keine Mailadresse hinterlegt.`);

  const vorname = name.split(" ")[0];
  const link = `${APP}/personalbogen`;
  const absaetze = [
    "bei uns fehlt noch dein Personalbogen. Ohne ihn können wir dich beim Lohnbüro nicht anmelden, "
      + "und dein Arbeitsvertrag kann auch nicht fertig werden.",
    "Es dauert fünf Minuten. Du brauchst deine Anschrift, dein Geburtsdatum, deine Steuer-ID, "
      + "die Sozialversicherungsnummer und deine IBAN.",
    "Die Sozialversicherungsnummer hast du vielleicht noch nicht, wenn du zum ersten Mal arbeitest. "
      + "Dann kreuz das im Bogen an und schick ihn trotzdem ab, wir haken später nach.",
    /*
      Der Weg hinein gehoert dazu.

      Noel hat sich seit dem Anlegen seines Zugangs nie angemeldet und
      wusste nicht, was der Personalbogen ueberhaupt ist (Florian,
      14.10.2026). Ein Link allein hilft dann nicht.
    */
    `Du meldest dich im Eventmanager mit dieser Mailadresse an (${email}). Wenn du dein Passwort `
      + "nicht mehr weißt oder noch nie drin warst, antworte einfach kurz auf diese Mail, dann "
      + "richten wir dir den Zugang neu ein.",
  ];

  await mailVerschicken({
    an: email,
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff: "Dein Personalbogen fehlt uns noch",
    text: [`Hallo ${vorname},`, "", ...absaetze, "", `Hier ausfüllen: ${link}`, "",
           "Fragen beantworten wir gern.", "", "Herzliche Grüße", "Florian Zimmer Theater"].join(NL),
    html:
      `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">`
      + `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;font-size:15px;line-height:1.55">`
      + `<p style="margin:0 0 14px">Hallo ${h(vorname)},</p>`
      + absaetze.map((a) => `<p style="margin:0 0 14px">${h(a)}</p>`).join("")
      + `<p style="margin:22px 0 8px"><a href="${h(link)}" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Personalbogen ausfüllen</a></p>`
      + `<p style="margin:18px 0 0;font-size:12px;color:#7a746b">Florian Zimmer Theater, Eventmanager</p>`
      + `</div></body></html>`,
  });

  return { name, email };
}
