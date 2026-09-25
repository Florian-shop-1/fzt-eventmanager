"use server";

/**
 * Die Knöpfe auf der Bewertungsseite: Schalter, Probemail, Versand von Hand.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, type AngemeldeterBenutzer } from "@/lib/auth/sitzung";
import { bewertungAktivSetzen, probeEmpfaenger } from "@/lib/db/bewertung";
import { buchungenFuerTag, type ShopBuchung } from "@/lib/db/shop-buchungen";
import { baueBewertungsmail } from "@/lib/mail/bewertung";
import { mailVerschicken } from "@/lib/mail/versand";
import { bewertungenVerschicken } from "@/lib/bewertung/lauf";

async function berechtigt(): Promise<AngemeldeterBenutzer> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Gästemails verschicken.");
  }
  return benutzer;
}

function zurueck(meldung: string, tag?: string, zeit?: string): never {
  revalidatePath("/bewertung");
  redirect(
    `/bewertung?meldung=${encodeURIComponent(meldung)}${tag ? `&tag=${tag}` : ""}` +
      // Die Wahl Abend/Nachmittag mitnehmen, sonst steht nach jeder Probemail
      // wieder "Abendshow" da und man wählt dreimal dasselbe (Florian, 23.09.2026).
      (zeit ? `&zeit=${zeit}` : ""),
  );
}

/** Einschalten darf nur der Inhaber: Ab dann gehen jeden Morgen Mails an Gäste. */
export async function schalterUmlegen(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  if (benutzer.rolle !== "chef") zurueck("Den Schalter legt nur Florian um.");
  const aktiv = formular.get("aktiv") === "an";
  await bewertungAktivSetzen(aktiv, benutzer.name);
  zurueck(
    aktiv
      ? "Eingeschaltet. Ab morgen 10 Uhr geht die Mail an die Gäste vom Vortag."
      : "Ausgeschaltet. Es geht nichts mehr automatisch hinaus.",
  );
}

/**
 * Probemail an die eigene Adresse.
 *
 * Mit einem erfundenen Gast und einem ungültigen Schlüssel: Die Sterne darin
 * führen auf die echte Seite im Shop, speichern dort aber nichts. Mit einer
 * echten Buchung würde ein Probeklick diese Buchung bewerten und womöglich
 * eine Meldung an das Büro auslösen.
 */
export async function probeSchicken(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  const tag = String(formular.get("tag") ?? "");
  // Empfänger nur aus dem Team, damit die Probe nie bei einem Gast landet.
  const gewuenscht = String(formular.get("an") ?? benutzer.email).toLowerCase();
  const empfaenger = (await probeEmpfaenger()).find((e) => e.email.toLowerCase() === gewuenscht);
  const zeit = formular.get("zeit") === "nachmittag" ? "nachmittag" : "abend";
  if (!empfaenger) zurueck("Probemails gehen nur an Leute aus dem Team.", tag, zeit);
  const uhrzeit = zeit === "nachmittag" ? "15:00" : "20:00";
  const erfunden: ShopBuchung = {
    id: "probe",
    zugangToken: "0".repeat(32),
    cartId: null,
    ditixEventId: "",
    datum: tag,
    uhrzeit,
    show: "ULMFASSBAR",
    name: empfaenger.name,
    email: empfaenger.email,
    telefon: "",
    plaetze: 2,
    gesamtCent: null,
    hinweis: "",
    bestaetigt: true,
    accessCode: null,
    mailGesendetAm: null,
    eingegangenAm: new Date(),
    posten: [],
  };
  let meldung: string;
  try {
    const mail = baueBewertungsmail(erfunden);
    await mailVerschicken({
      an: empfaenger.email,
      betreff: `[Probe] ${mail.betreff}`,
      text: mail.text,
      html: mail.html,
      ueberBrevo: true,
      schlagwort: "probe",
    });
    meldung = `Probemail an ${empfaenger.email} ist raus. Die Sterne darin führen auf die Seite, speichern aber nichts.`;
  } catch (f) {
    meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
  }
  zurueck(meldung, tag, zeit);
}

/** Versand für einen Tag von Hand, etwa zum Nachholen. Geht auch bei ausgeschaltetem Schalter. */
export async function tagVerschicken(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  if (benutzer.rolle !== "chef") zurueck("Den Versand von Hand löst nur Florian aus.");
  const tag = String(formular.get("tag") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) zurueck("Kein gültiger Tag.");
  if ((await buchungenFuerTag(tag)).length === 0) zurueck("An diesem Tag gibt es keine Shop-Buchungen.", tag);
  const e = await bewertungenVerschicken(tag);
  zurueck(`${e.verschickt.length} verschickt, ${e.uebersprungen.length} übersprungen, ${e.fehler.length} Fehler.`, tag);
}
