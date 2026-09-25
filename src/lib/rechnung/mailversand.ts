"use server";

/**
 * Die Rechnung per Mail an den Kunden, mit dem PDF im Anhang.
 *
 * Wie beim Angebot: Der Versand läuft aus dem Programm heraus über das
 * Postfach tickets@florianzimmer.com, und erst wenn die Mail wirklich
 * draußen ist, gilt die Rechnung als versendet. Andersherum stünde
 * "versendet" auch dann da, wenn nie etwas ankam (Florian, 25.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { mailVerschicken } from "@/lib/mail/versand";
import { rechnungLesen, versandMerken } from "./db";
import { rechnungsPdfEvent } from "./pdf-event";
import { rechnungsDateiname, rechnungsPdfDaten } from "./pdfdaten";
import { rechnungAusAngebot, ZAHLUNGSZIEL_TAGE } from "./aus-angebot";

const UMBRUCH = String.fromCharCode(10);

/** Der Vorschlagstext. Er lässt sich vor dem Abschicken ändern. */
export async function rechnungsMailtext(o: {
  ansprechpartner?: string | null;
  nummer: string;
  faelligAm: string;
  betragCent: number;
  show?: string | null;
  datum?: string | null;
}): Promise<{ betreff: string; text: string }> {
  const betrag = (o.betragCent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const faellig = o.faelligAm.split("-").reverse().join(".");

  return {
    betreff: `Eure Rechnung ${o.nummer} für den Abend im Florian Zimmer Theater`,
    text: [
      o.ansprechpartner ? `Hallo ${o.ansprechpartner},` : "Hallo,",
      "",
      "schön, dass wir uns einig sind. Im Anhang findet ihr die Rechnung.",
      "",
      o.datum && o.show
        ? `Euer Termin am ${o.datum.split("-").reverse().join(".")} für ${o.show} ist reserviert.`
        : "Euer Termin ist reserviert.",
      `Bitte überweist die ${betrag} Euro innerhalb von ${ZAHLUNGSZIEL_TAGE} Tagen, also bis zum ${faellig}.`,
      "Sobald das Geld bei uns ist, ist eure Veranstaltung fest gebucht, und ihr bekommt von uns",
      "noch einmal eine Bestätigung.",
      "",
      "Bei Fragen sind wir gerne für euch da.",
      "",
      "Herzliche Grüße",
      "Florian Zimmer Theater",
    ].join(UMBRUCH),
  };
}

/**
 * Erzeugt die Rechnung zum Angebot, falls es noch keine gibt.
 * Danach steht sie im Vorgang und lässt sich verschicken.
 */
export async function rechnungErzeugen(
  angebotId: string,
  vorgangId: string,
): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Geschäftsführung dürfen Rechnungen erstellen.");
  }

  let ziel = `/vorgaenge/${vorgangId}`;
  try {
    const rechnung = await rechnungAusAngebot(angebotId, benutzer.name ?? "Büro");
    ziel = `/vorgaenge/${vorgangId}?rechnung=${rechnung.nummer}`;
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    ziel = `/vorgaenge/${vorgangId}?rechnungFehler=${encodeURIComponent(meldung.slice(0, 300))}`;
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/rechnungen");
  redirect(ziel);
}

/** Verschickt die Rechnung und vermerkt den Versand. */
export async function rechnungPerMail(
  rechnungId: string,
  vorgangId: string,
  formData: FormData,
): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Geschäftsführung dürfen Rechnungen verschicken.");
  }
  const wer = benutzer.name ?? "Büro";

  const rechnung = await rechnungLesen(rechnungId);
  if (!rechnung) throw new Error("Die Rechnung wurde nicht gefunden.");

  const an = String(formData.get("an") ?? "").trim() || rechnung.kundeEmail;
  const betreff = String(formData.get("betreff") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  let ziel = `/vorgaenge/${vorgangId}?mail=weg&an=${encodeURIComponent(an)}`;

  try {
    if (!an) throw new Error("Für diesen Kunden ist keine Mailadresse hinterlegt.");
    if (!betreff) throw new Error("Der Betreff fehlt.");
    if (!text) throw new Error("Der Text fehlt.");

    const daten = await rechnungsPdfDaten(rechnungId);
    if (!daten) throw new Error("Zu dieser Rechnung fehlen die Positionen.");

    const pdf = await rechnungsPdfEvent(daten);

    await mailVerschicken({
      an,
      betreff,
      text,
      anhaenge: [
        {
          name: rechnungsDateiname(daten.nummer),
          typ: "application/pdf",
          base64: pdf.toString("base64"),
        },
      ],
    });

    await versandMerken({ rechnungId, an, wer });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    await versandMerken({ rechnungId, an, fehler: meldung, wer }).catch(() => {});
    ziel = `/vorgaenge/${vorgangId}?mail=fehler&meldung=${encodeURIComponent(meldung.slice(0, 400))}`;
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/rechnungen");
  redirect(ziel);
}
