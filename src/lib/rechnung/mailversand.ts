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

/**
 * Der Vorschlagstext. Er lässt sich vor dem Abschicken ändern.
 *
 * Unterschrieben wird mit dem Namen dessen, der die Mail abschickt:
 * "unterschrieben von dem der es im eventmanager ausgefüllt hat, also
 * steht unten in der mail Werner Zimmer, wenn er diese versendet hat"
 * (Florian, 01.10.2026). Eine Rechnung, unter der ein Name steht, ist
 * eine Nachricht von einem Menschen; eine ohne ist Behördenpost.
 *
 * Eine Rechnung aus einem Angebot spricht vom reservierten Termin. Eine
 * Rechnung von Hand kann alles Mögliche sein, da bleibt der Text
 * freundlich und allgemein.
 */
export async function rechnungsMailtext(o: {
  ansprechpartner?: string | null;
  nummer: string;
  faelligAm: string;
  betragCent: number;
  show?: string | null;
  datum?: string | null;
  /** Worum es geht, bei einer Rechnung von Hand. */
  leistung?: string | null;
  /** "hand" für eine selbst geschriebene Rechnung. */
  quelle?: string | null;
  /** Wer sie verschickt. Steht unter der Mail. */
  absender?: string | null;
  zahlungszielTage?: number;
}): Promise<{ betreff: string; text: string }> {
  const betrag = (o.betragCent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const faellig = o.faelligAm.split("-").reverse().join(".");
  const ziel = o.zahlungszielTage ?? ZAHLUNGSZIEL_TAGE;
  /*
    Die Anrede gesiezt (Florian, 31.10.2026).

    "Hallo Herr Friedrich" geht, "Hallo Marc" nicht: Im Feld steht mal
    der volle Name, mal nur der Vorname. Deshalb "Guten Tag", das passt
    zu beidem und klingt in keiner Fassung zu vertraulich.
  */
  const anrede = o.ansprechpartner ? `Guten Tag ${o.ansprechpartner},` : "Guten Tag,";
  const unterschrift = [o.absender, "Florian Zimmer Theater"].filter(Boolean) as string[];

  if (o.quelle === "hand") {
    /*
      Der Betreff nennt, worum es geht.

      "bei betreff hast du Rechnung für abend im Fz Theater. das ist nicht
      gut - ausser es wäre für einen abend. bei dem test hatten wir akku
      angegeben" (Florian, 01.10.2026). Steht eine Leistung in der
      Rechnung, steht sie auch im Betreff.
    */
    /*
      Gesiezt, wie alles Geschaeftliche.

      "Bitte den Text Anschreiben von rechnungsversand auch auf 'Sie'
      korrigieren" und "die Mail die begleitend kommt mit der RG soll
      ebenfalls mit Sie sein" (Florian, 31.10.2026). Dieselbe Regel wie
      beim Angebot vom 28.10.2026: Im Haus und im Shop wird geduzt, was
      an eine Firma geht, nicht.
    */
    return {
      betreff: o.leistung
        ? `Ihre Rechnung ${o.nummer} für ${o.leistung}`
        : `Ihre Rechnung ${o.nummer} vom Florian Zimmer Theater`,
      text: [
        anrede,
        "",
        o.leistung
          ? `vielen Dank für die gute Zusammenarbeit. Im Anhang finden Sie unsere Rechnung ${o.nummer} für ${o.leistung}.`
          : `vielen Dank für die gute Zusammenarbeit. Im Anhang finden Sie unsere Rechnung ${o.nummer}.`,
        "",
        `Bitte überweisen Sie die ${betrag} Euro bis zum ${faellig}.`,
        "",
        "Wenn etwas unklar ist oder nicht stimmt, melden Sie sich einfach, wir klären das gern.",
        "",
        "Herzliche Grüße",
        ...unterschrift,
      ].join(UMBRUCH),
    };
  }

  return {
    betreff: `Ihre Rechnung ${o.nummer} für den Abend im Florian Zimmer Theater`,
    text: [
      anrede,
      "",
      "schön, dass wir uns einig sind. Im Anhang finden Sie die Rechnung.",
      "",
      o.datum && o.show
        ? `Ihr Termin am ${o.datum.split("-").reverse().join(".")} für ${o.show} ist reserviert.`
        : "Ihr Termin ist reserviert.",
      `Bitte überweisen Sie die ${betrag} Euro innerhalb von ${ziel} Tagen, also bis zum ${faellig}.`,
      "Sobald das Geld bei uns ist, ist Ihre Veranstaltung fest gebucht, und Sie bekommen von uns",
      "noch einmal eine Bestätigung.",
      "",
      "Bei Fragen sind wir gerne für Sie da.",
      "",
      "Herzliche Grüße",
      ...unterschrift,
    ].join(UMBRUCH),
  };
}

/**
 * Erzeugt die Rechnung zum Angebot und schlägt sie auf.
 *
 * "wenn man auf 'einig geworden/ rechnung erstellen' klickt, kommt nix.
 * es muss die Rechnung aufgehen" (Florian, 30.10.2026).
 *
 * Vorher landete man wieder auf dem Vorgang, mit der Rechnungsnummer in
 * der Adresse, die dort niemand gelesen hat. Die Rechnung entstand also
 * unsichtbar, und ob sie entstanden ist, sah man erst in der
 * Rechnungsliste. Jetzt geht sie auf: Dort steht alles, was danach zu
 * tun ist, Zeilen prüfen, PDF ansehen, Mail an den Kunden.
 *
 * Gibt es zum Angebot schon eine Rechnung, führt derselbe Weg zu ihr.
 * Eine zweite wird nie angelegt, dafür sorgt rechnungAusAngebot.
 */
export async function rechnungErzeugen(
  angebotId: string,
  vorgangId: string,
): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Geschäftsführung dürfen Rechnungen erstellen.");
  }

  let ziel: string;
  try {
    const rechnung = await rechnungAusAngebot(angebotId, benutzer.name ?? "Büro");
    ziel = `/rechnungen/${rechnung.id}?meldung=${encodeURIComponent(
      `Rechnung ${rechnung.nummer} steht. Bitte prüfen und dann verschicken.`,
    )}`;
  } catch (f) {
    /*
      Fehlt etwas, bleibt man beim Vorgang. Dort steht, was fehlt, und
      dort lässt es sich auch ergänzen: meist die Anschrift des Kunden.
    */
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

  /*
    Wohin es nach dem Versand zurueckgeht.

    Eine Rechnung von Hand haengt an keinem Vorgang; sie fuehrt zurueck
    auf ihre eigene Seite (Florian, 01.10.2026).
  */
  const seite = vorgangId ? `/vorgaenge/${vorgangId}` : `/rechnungen/${rechnungId}`;
  let ziel = `${seite}?mail=weg&an=${encodeURIComponent(an)}`;

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
    ziel = `${seite}?mail=fehler&meldung=${encodeURIComponent(meldung.slice(0, 400))}`;
  }

  if (vorgangId) revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/rechnungen");
  revalidatePath(`/rechnungen/${rechnungId}`);
  redirect(ziel);
}
