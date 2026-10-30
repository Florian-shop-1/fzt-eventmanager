"use server";

/**
 * Das Angebot per Mail an den Kunden.
 *
 * Bisher gab es zwei Umwege: den Link kopieren und selbst eine Mail
 * schreiben, oder Outlook mit vorbereitetem Text öffnen. Beides
 * funktioniert, aber beides bricht den Ablauf: Man verlässt das
 * Programm, und ob die Mail wirklich rausging, weiss es hinterher nicht.
 *
 * Jetzt geht sie direkt von hier aus, über Kevins Postfach. Das Angebot
 * wird im selben Zug als versendet vermerkt, ohne dass jemand daran
 * denken muss.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { holeAngebot } from "./lesen";
import { angebotVersendet } from "./speichern";
import { mailVerschicken } from "@/lib/mail/versand";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { alsHtml } from "@/lib/mail/html";
import { FUSSZEILE_TEXT, fusszeileHtml } from "@/lib/mail/fusszeile";

/** Aus welchem Postfach Angebote hinausgehen (Florian, 05.10.2026). */
const ANGEBOT_ABSENDER = "kevin.steele@florianzimmer.com";

/**
 * Verschickt das Angebot und vermerkt es als versendet.
 *
 * Der Fehler wird abgefangen und als Meldung weitergereicht statt
 * geworfen: Eine geworfene Ausnahme endet beim Benutzer als
 * nichtssagende Fehlerseite, und wer wissen will, warum ein Angebot
 * nicht rausging, hat davon nichts.
 */
export async function angebotPerMail(
  angebotId: string,
  vorgangId: string,
  formData: FormData,
): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Angebote verschicken.");
  }

  const angebot = await holeAngebot(angebotId);
  if (!angebot) throw new Error("Das Angebot wurde nicht gefunden.");

  const an = String(formData.get("an") ?? "").trim() || angebot.kunde.email;
  const betreff = String(formData.get("betreff") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  let ziel = `/vorgaenge/${vorgangId}?mail=weg&an=${encodeURIComponent(an)}`;

  try {
    if (!an) throw new Error("Für diesen Kunden ist keine Mailadresse hinterlegt.");
    if (!betreff) throw new Error("Der Betreff fehlt.");
    if (!text) throw new Error("Der Text fehlt.");

    /*
      Kein PDF mehr im Anhang, nur der Link.

      "ich würde auf die pdf anhänge verzichten bitte einfach nur noch
      die links" (Florian, 30.10.2026).

      Frueher ging das Angebot als Datei mit, damit der Einkauf es
      ausdrucken und weiterreichen kann (Florian, 25.09.2026). Das PDF
      gibt es weiterhin, auf der Angebotsseite als Knopf; in der Mail
      ist es nicht mehr noetig und macht sie nur schwer. Zusagen kann
      der Kunde ohnehin nur ueber den Link, und nur dort sehen wir, dass
      er das Angebot geoeffnet hat.
    */

    /*
      Angebote kommen von Kevin.

      "kevin möchte, dass die angebote lieber von seiner emailadresse aus
      versendet werden" (Florian, 05.10.2026). Er fuehrt die Gespraeche
      mit den Firmen, also soll die Antwort des Kunden auch bei ihm
      landen und nicht im Ticketpostfach.
    */
    const basis = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
    const link = `${basis}/ihr-angebot/${angebot.trackingToken}`;
    /*
      Die Fusszeile haengt der Eventmanager an, nicht Kevin.

      "bitte bei der mail einen schoenen footer" (Florian, 28.10.2026).
      Im Textfeld steht nur der Brief: So kann die Unterschrift nicht
      halb geloescht werden, und die beiden Bewertungslinks sind in
      jeder Mail dieselben.
    */
    await mailVerschicken({
      an,
      betreff,
      text: text + FUSSZEILE_TEXT,
      html: alsHtml(text, {
        link,
        fuss: fusszeileHtml(),
        nebenlink: {
          href: `${link}#aenderung`,
          text: "Passt etwas noch nicht? Änderungswunsch schicken",
        },
      }),
      absender: ANGEBOT_ABSENDER,
    });

    // Erst nach dem erfolgreichen Versand vermerken. Andersherum stünde
    // "versendet" auch dann da, wenn die Mail nie rausging.
    await angebotVersendet(angebotId, vorgangId);
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    ziel = `/vorgaenge/${vorgangId}?mail=fehler&meldung=${encodeURIComponent(meldung.slice(0, 400))}`;
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
  redirect(ziel);
}

/**
 * Mehrere Angebote in einer Mail.
 *
 * "es sollte auch möglich sein zwei angebote oder mehr zu erstellen und
 * diese mit einer mail zu versenden (zwei links in der mail dann)" und
 * "schreib klar drüber Angebot 1, Angebot 2 z.b. gerne aber auch was
 * das angebot näher beschreibt (sonntags show.. etc)"
 * (Florian, 30.10.2026).
 *
 * Bisher ging je Angebot eine eigene Mail hinaus. Bei zwei Fassungen
 * bekam der Kunde also zwei fast gleiche Briefe und musste selbst
 * herausfinden, worin sie sich unterscheiden. Jetzt steht beides
 * untereinander in einer Mail, jedes mit eigener Überschrift und eigenem
 * Knopf.
 *
 * Verschickt wird nur einmal, vermerkt wird bei jedem Angebot.
 */
export async function angebotePerMail(vorgangId: string, formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Angebote verschicken.");
  }

  const ids = formData.getAll("angebot").map((x) => String(x)).filter(Boolean);
  const an = String(formData.get("an") ?? "").trim();
  const betreff = String(formData.get("betreff") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  let ziel = `/vorgaenge/${vorgangId}?mail=weg&an=${encodeURIComponent(an)}`;

  try {
    if (ids.length === 0) throw new Error("Es ist kein Angebot ausgewählt.");
    if (!an) throw new Error("Für diesen Kunden ist keine Mailadresse hinterlegt.");
    if (!betreff) throw new Error("Der Betreff fehlt.");
    if (!text) throw new Error("Der Text fehlt.");

    const basis = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
    const geladen = [];
    for (const id of ids) {
      const a = await holeAngebot(id);
      if (!a) continue;
      geladen.push({
        id: a.id,
        titel: String(formData.get(`titel-${a.id}`) ?? "").trim() || `Angebot ${a.nummer}`,
        href: `${basis}/ihr-angebot/${a.trackingToken}`,
      });
    }
    if (geladen.length === 0) throw new Error("Diese Angebote gibt es nicht mehr.");

    /*
      Im reinen Text steht, was im HTML die Knöpfe sind. Wer die Mail in
      einem Programm ohne Formatierung liest, soll dieselben Wege haben.
    */
    const UMBRUCH = String.fromCharCode(10);
    const textteil =
      text +
      UMBRUCH +
      UMBRUCH +
      geladen.map((a) => `${a.titel}:${UMBRUCH}${a.href}`).join(UMBRUCH + UMBRUCH);

    await mailVerschicken({
      an,
      betreff,
      text: textteil + FUSSZEILE_TEXT,
      html: alsHtml(text, {
        angebote: geladen.map((a) => ({ titel: a.titel, href: a.href })),
        fuss: fusszeileHtml(),
        nebenlink: {
          href: `${geladen[0].href}#aenderung`,
          text: "Passt etwas noch nicht? Änderungswunsch schicken",
        },
      }),
      absender: ANGEBOT_ABSENDER,
    });

    for (const a of geladen) await angebotVersendet(a.id, vorgangId);
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    ziel = `/vorgaenge/${vorgangId}?mail=fehler&meldung=${encodeURIComponent(meldung.slice(0, 400))}`;
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
  redirect(ziel);
}
