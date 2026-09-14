"use server";

/**
 * Was man im WhatsApp-Posteingang tun kann: antworten, und für den Inhaber
 * die Freigaben und die Verbindung zu 360dialog.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { ausgangSpeichern, FENSTER_STUNDEN, verlangeWhatsApp } from "@/lib/db/whatsapp";
import { textSchicken, webhookEintragen, WhatsAppFehler } from "@/lib/whatsapp/senden";

const ziel = (waId: string, fehler?: string) =>
  `/whatsapp?mit=${encodeURIComponent(waId)}${fehler ? `&fehler=${encodeURIComponent(fehler.slice(0, 300))}` : ""}`;

export async function antworten(waId: string, formData: FormData): Promise<void> {
  const benutzer = await verlangeWhatsApp();
  const inhalt = String(formData.get("text") ?? "").trim();

  if (!/^\d{6,20}$/.test(waId)) redirect("/whatsapp");
  if (!inhalt) redirect(ziel(waId));

  /*
    Das 24-Stunden-Fenster hier schon prüfen und nicht erst WhatsApp fragen.
    Die Ablehnung käme zwar auch von dort, aber erst nach dem Absenden, und
    die Nachricht stünde dann als fehlgeschlagen im Verlauf.
  */
  const [u] = (await db()`
    select letzte_eingang_am > now() - make_interval(hours => ${FENSTER_STUNDEN}) as offen
      from wa_unterhaltung where wa_id = ${waId}
  `) as Array<{ offen: boolean | null }>;

  if (!u?.offen) {
    redirect(
      ziel(
        waId,
        "Die letzte Nachricht des Kunden ist älter als 24 Stunden. WhatsApp erlaubt dann nur " +
          "noch genehmigte Vorlagen. Schreib ihm aus der App oder warte, bis er sich meldet.",
      ),
    );
  }

  let fehler: string | undefined;
  try {
    const metaId = await textSchicken(waId, inhalt.slice(0, 4096));
    await ausgangSpeichern(waId, metaId, inhalt, benutzer.name);
  } catch (e) {
    fehler = e instanceof WhatsAppFehler ? e.message : "Die Nachricht ging nicht hinaus.";
  }

  revalidatePath("/whatsapp");
  redirect(ziel(waId, fehler));
}

/** Nur der Inhaber vergibt die Freigabe, wie alle Zugänge. */
async function verlangeInhaber(): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) {
    throw new Error("Nur der Inhaber vergibt Freigaben.");
  }
}

export async function whatsappFreigabeUmschalten(benutzerId: string): Promise<void> {
  await verlangeInhaber();
  await db()`update benutzer set whatsapp = not whatsapp where id = ${benutzerId}`;
  revalidatePath("/einstellungen/benutzer");
}

/**
 * Sagt 360dialog, wohin eingehende Nachrichten sollen.
 *
 * Ein Knopf statt einer Anleitung: Der Schlüssel von 360dialog liegt nur
 * bei Vercel. Wer den Webhook von Hand eintragen wollte, müsste ihn
 * herauskopieren, und genau das soll nicht passieren.
 */
export async function webhookEinrichten(): Promise<void> {
  await verlangeInhaber();

  const kopf = await headers();
  const host = kopf.get("x-forwarded-host") ?? kopf.get("host");
  const adresse = `https://${host}/api/whatsapp/eingang`;

  let ergebnis = "gut";
  try {
    if (!host || host.startsWith("localhost")) {
      throw new WhatsAppFehler("Der Webhook lässt sich nur vom echten Eventmanager aus einrichten.");
    }
    await webhookEintragen(adresse);
  } catch (e) {
    ergebnis = e instanceof WhatsAppFehler ? e.message : "Das Einrichten ist fehlgeschlagen.";
  }

  revalidatePath("/einstellungen/whatsapp");
  redirect(
    ergebnis === "gut"
      ? "/einstellungen/whatsapp?eingerichtet=1"
      : `/einstellungen/whatsapp?fehler=${encodeURIComponent(ergebnis.slice(0, 300))}`,
  );
}
