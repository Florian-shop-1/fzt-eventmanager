/**
 * Schickt WhatsApp-Nachrichten direkt über die Schnittstelle von Meta.
 *
 * Kein Anbieter dazwischen, siehe migrations/031_whatsapp_direkt.sql.
 *
 * Vier Einträge bei Vercel:
 *
 *   WHATSAPP_TELEFON_ID      Kennung der Nummer bei Meta. Kein Geheimnis.
 *   WHATSAPP_ZUGANGSTOKEN    Dauerhafter Schlüssel eines Systembenutzers im
 *                            Meta Business Manager. Geheim.
 *   WHATSAPP_APP_GEHEIMNIS   App-Geheimnis der Meta-App. Damit wird geprüft,
 *                            dass eingehende Nachrichten wirklich von Meta
 *                            kommen. Geheim.
 *   WHATSAPP_PRUEFWORT       Selbst ausgedacht. Meta fragt es einmal ab, wenn
 *                            der Webhook eingetragen wird.
 *   WHATSAPP_KONTO_ID        Kennung des WhatsApp-Geschäftskontos bei Meta.
 *                            Kein Geheimnis. Braucht es nur zum Anschliessen,
 *                            siehe kontoAnschliessen.
 *
 * Die beiden geheimen trägt Florian selbst ein. Sie gehen durch keine Mail
 * und keinen Chat.
 */

import { istNummer } from "./kennung";

/**
 * Die Version der Schnittstelle. Meta hält eine Version rund zwei Jahre am
 * Leben und kündigt das Ende vorher an. Beim Wechsel genügt es, die Zahl
 * hochzusetzen und einmal zu senden.
 */
const GRAPH = "https://graph.facebook.com/v25.0";

export class WhatsAppFehler extends Error {}

export function istEingerichtet() {
  return {
    telefonId: Boolean(process.env.WHATSAPP_TELEFON_ID),
    zugangstoken: Boolean(process.env.WHATSAPP_ZUGANGSTOKEN),
    appGeheimnis: Boolean(process.env.WHATSAPP_APP_GEHEIMNIS),
    pruefwort: Boolean(process.env.WHATSAPP_PRUEFWORT),
  };
}

function zugang(): { telefonId: string; token: string } {
  const telefonId = process.env.WHATSAPP_TELEFON_ID;
  const token = process.env.WHATSAPP_ZUGANGSTOKEN;
  if (!telefonId || !token) {
    throw new WhatsAppFehler(
      "WhatsApp ist noch nicht verbunden: Bei Vercel fehlt " +
        (!telefonId ? "WHATSAPP_TELEFON_ID" : "WHATSAPP_ZUGANGSTOKEN") +
        ".",
    );
  }
  return { telefonId, token };
}

async function graph(
  methode: "GET" | "POST",
  pfad: string,
  inhalt?: unknown,
): Promise<Record<string, unknown>> {
  const { token } = zugang();
  let antwort: Response;
  try {
    antwort = await fetch(GRAPH + pfad, {
      method: methode,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: inhalt === undefined ? undefined : JSON.stringify(inhalt),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new WhatsAppFehler("Meta ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.");
  }

  const daten = (await antwort.json().catch(() => ({}))) as Record<string, unknown>;
  if (antwort.ok) return daten;
  throw new WhatsAppFehler(fehlerErklaeren(daten));
}

/**
 * Macht aus der Antwort von Meta einen Satz, mit dem das Büro etwas
 * anfangen kann. Die häufigsten Fälle beim Namen, der Rest mit Code, damit
 * man ihn nachschlagen kann.
 */
function fehlerErklaeren(daten: Record<string, unknown>): string {
  const fehler = (daten.error ?? {}) as Record<string, unknown>;
  const code = Number(fehler.code);
  const details = String(((fehler.error_data ?? {}) as Record<string, unknown>).details ?? "");
  const meldung = details || (typeof fehler.message === "string" ? fehler.message : "");

  switch (code) {
    case 190:
      return "Meta lehnt den Zugangsschlüssel ab. Ist WHATSAPP_ZUGANGSTOKEN abgelaufen oder falsch eingetragen?";
    case 131047:
      return (
        "Die letzte Nachricht des Kunden ist älter als 24 Stunden. Danach erlaubt WhatsApp " +
        "nur noch genehmigte Vorlagen."
      );
    case 131026:
      return "Die Nachricht kam nicht an. Die Nummer hat vermutlich kein WhatsApp.";
    case 131056:
      return "Zu viele Nachrichten an diese Nummer in kurzer Zeit. Kurz warten.";
    case 131030:
      return "Meta lässt an diese Nummer noch nicht schreiben. Die App steht vermutlich noch im Testmodus.";
    case 133010:
      return "Die Nummer ist bei Meta noch nicht fertig angemeldet.";
    default:
      return `WhatsApp hat abgelehnt${Number.isFinite(code) ? ` (Code ${code})` : ""}${meldung ? ": " + meldung : "."}`;
  }
}

/** Schickt eine Textnachricht und liefert die Kennung, die WhatsApp vergibt. */
export async function textSchicken(an: string, inhalt: string): Promise<string> {
  const { telefonId } = zugang();
  const daten = await graph("POST", `/${telefonId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    // Eine Nummer geht in "to", eine Nutzerkennung bei verborgener Nummer
    // in "recipient". Siehe kennung.ts.
    ...(istNummer(an) ? { to: an } : { recipient: an }),
    type: "text",
    text: { body: inhalt, preview_url: true },
  });

  const id = ((daten.messages as Array<{ id?: string }> | undefined) ?? [])[0]?.id;
  if (!id) throw new WhatsAppFehler("WhatsApp hat die Nachricht angenommen, aber keine Kennung geliefert.");
  return id;
}

function kontoId(): string {
  const id = process.env.WHATSAPP_KONTO_ID;
  if (!id) throw new WhatsAppFehler("Bei Vercel fehlt WHATSAPP_KONTO_ID, die Kennung des WhatsApp-Kontos.");
  return id;
}

/**
 * Ist das WhatsApp-Konto an unsere App angeschlossen?
 *
 * Ohne diesen Anschluss liefert Meta echte Nachrichten nicht an den Webhook,
 * obwohl der Webhook eingetragen, geprüft und "messages" abonniert ist. Nur
 * die Probe aus dem App-Dashboard kommt dann an. Genau so war es am
 * 14.09.2026: Die Probe lief durch, die Antwort vom Handy nicht.
 */
export async function kontoAngeschlossen(): Promise<boolean> {
  const daten = await graph("GET", `/${kontoId()}/subscribed_apps`);
  const apps = (daten.data as unknown[] | undefined) ?? [];
  return apps.length > 0;
}

/** Schliesst das WhatsApp-Konto an unsere App an. Doppelt schadet nicht. */
export async function kontoAnschliessen(): Promise<void> {
  const daten = await graph("POST", `/${kontoId()}/subscribed_apps`, {});
  if (daten.success !== true) {
    throw new WhatsAppFehler("Meta hat den Anschluss nicht bestätigt.");
  }
}

/**
 * Fragt bei Meta nach, ob Schlüssel und Nummer zusammenpassen.
 * Für den Prüfknopf in den Einstellungen.
 */
export async function verbindungPruefen(): Promise<{ nummer: string; name: string; qualitaet: string }> {
  const { telefonId } = zugang();
  const daten = await graph(
    "GET",
    `/${telefonId}?fields=display_phone_number,verified_name,quality_rating`,
  );
  return {
    nummer: String(daten.display_phone_number ?? "?"),
    name: String(daten.verified_name ?? "?"),
    qualitaet: String(daten.quality_rating ?? "?"),
  };
}
