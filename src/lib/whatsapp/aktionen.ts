"use server";

/**
 * Was man im WhatsApp-Posteingang tun kann: antworten, und für den Inhaber
 * die Freigaben, die automatische Antwort und der Verbindungstest.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { alsErledigtMarkieren, ausgangSpeichern, FENSTER_STUNDEN, verlangeWhatsApp } from "@/lib/db/whatsapp";
import { textSchicken, verbindungPruefen, WhatsAppFehler } from "@/lib/whatsapp/senden";
import { meldungSchicken } from "@/lib/whatsapp/nachlauf";
import { istKennung } from "@/lib/whatsapp/kennung";

const ziel = (waId: string, fehler?: string) =>
  `/whatsapp?mit=${encodeURIComponent(waId)}${fehler ? `&fehler=${encodeURIComponent(fehler.slice(0, 300))}` : ""}`;

export async function antworten(waId: string, formData: FormData): Promise<void> {
  const benutzer = await verlangeWhatsApp();
  const inhalt = String(formData.get("text") ?? "").trim();

  if (!istKennung(waId)) redirect("/whatsapp");
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
          "noch genehmigte Vorlagen. Ruf ihn an, schreib ihm eine Mail oder warte, bis er sich meldet.",
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

/**
 * Anderweitig erledigt, etwa angerufen oder per Mail geklärt.
 * Jeder mit Freigabe darf das, nicht nur der Inhaber: Wer anruft, hakt ab.
 */
export async function anderweitigErledigt(waId: string): Promise<void> {
  const benutzer = await verlangeWhatsApp();
  if (!istKennung(waId)) redirect("/whatsapp");
  await alsErledigtMarkieren(waId, benutzer.name);
  revalidatePath("/whatsapp");
  redirect(`/whatsapp?mit=${waId}`);
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
 * Speichert die automatische Antwort.
 *
 * Leer ausschalten geht nicht: Wer sie nicht will, nimmt den Haken raus.
 * Ein leerer Text würde sonst als leere Nachricht beim Kunden landen.
 */
export async function autoantwortSpeichern(formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) {
    throw new Error("Nur der Inhaber ändert die automatische Antwort.");
  }

  const aktiv = formData.get("aktiv") === "an";
  const text = String(formData.get("text") ?? "").trim().slice(0, 1000);

  if (aktiv && !text) {
    redirect(`/einstellungen/whatsapp?fehler=${encodeURIComponent("Ohne Text lässt sich die automatische Antwort nicht einschalten.")}`);
  }

  await db()`
    update wa_einstellung
       set autoantwort_aktiv = ${aktiv},
           autoantwort_text = case when ${text}::text = '' then autoantwort_text else ${text}::text end,
           geaendert_am = now(), geaendert_von = ${benutzer.name}
     where id = 1
  `;
  revalidatePath("/einstellungen/whatsapp");
  redirect("/einstellungen/whatsapp?gespeichert=1");
}

/**
 * Schickt eine Beispielmeldung an alle mit Freigabe, genau so, wie sie bei
 * einer echten WhatsApp aussähe. Damit lässt sich der Weg prüfen, bevor der erste
 * Kunde schreibt. Der Link führt ins Leere, die Nummer gibt es nicht.
 */
export async function meldungTesten(): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) {
    throw new Error("Nur der Inhaber schickt Testmeldungen.");
  }

  let ziel: string;
  try {
    const an = (await meldungSchicken("4900000000", "Testkunde (nur ein Test)", [
      `Das ist eine Testmeldung, ausgelöst von ${benutzer.name} unter Einstellungen, WhatsApp.`,
    ])).join(", ");
    // Ins Protokoll, damit sich bei Vercel nachsehen lässt, ob Microsoft die
    // Mail angenommen hat, wenn sie im Postfach nicht auftaucht.
    console.info(`WhatsApp-Testmeldung von Microsoft angenommen, an ${an}, ausgelöst von ${benutzer.name}`);
    ziel = `/einstellungen/whatsapp?getestet=${encodeURIComponent(an)}`;
  } catch (e) {
    const meldung = e instanceof Error ? e.message : "Die Testmeldung ging nicht hinaus.";
    console.error("WhatsApp-Testmeldung fehlgeschlagen:", meldung);
    ziel = `/einstellungen/whatsapp?fehler=${encodeURIComponent(meldung.slice(0, 300))}`;
  }
  redirect(ziel);
}

/** Fragt bei Meta nach, ob Schlüssel und Nummer zusammenpassen. */
export async function verbindungTesten(): Promise<void> {
  await verlangeInhaber();

  let ziel: string;
  try {
    const v = await verbindungPruefen();
    ziel = `/einstellungen/whatsapp?verbunden=${encodeURIComponent(`${v.name} · ${v.nummer} · Qualität ${v.qualitaet}`)}`;
  } catch (e) {
    const meldung = e instanceof WhatsAppFehler ? e.message : "Der Test ist fehlgeschlagen.";
    ziel = `/einstellungen/whatsapp?fehler=${encodeURIComponent(meldung.slice(0, 300))}`;
  }
  redirect(ziel);
}
