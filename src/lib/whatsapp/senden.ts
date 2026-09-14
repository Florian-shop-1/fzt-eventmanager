/**
 * Schickt WhatsApp-Nachrichten über 360dialog hinaus.
 *
 * 360dialog ist der Anbieter zwischen uns und Meta. Er hat die Nummer aus
 * der Business App an die Schnittstelle angebunden, was Meta nur offiziellen
 * Partnern erlaubt. Die Nachrichten selbst haben das Format von Meta.
 *
 * Der Schlüssel steht in WHATSAPP_360_SCHLUESSEL und gehört nirgends sonst
 * hin. Florian trägt ihn selbst bei Vercel ein, er geht durch keine Mail und
 * keinen Chat.
 */

const BASIS = "https://waba-v2.360dialog.io";

export class WhatsAppFehler extends Error {}

function schluessel(): string {
  const s = process.env.WHATSAPP_360_SCHLUESSEL;
  if (!s) {
    throw new WhatsAppFehler(
      "WhatsApp ist noch nicht verbunden: Der Schlüssel von 360dialog fehlt bei Vercel " +
        "(WHATSAPP_360_SCHLUESSEL).",
    );
  }
  return s;
}

export function istEingerichtet(): { schluessel: boolean; webhookSchluessel: boolean } {
  return {
    schluessel: Boolean(process.env.WHATSAPP_360_SCHLUESSEL),
    webhookSchluessel: Boolean(process.env.WHATSAPP_WEBHOOK_SCHLUESSEL),
  };
}

async function anfrage(pfad: string, inhalt: unknown): Promise<Record<string, unknown>> {
  let antwort: Response;
  try {
    antwort = await fetch(BASIS + pfad, {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": schluessel() },
      body: JSON.stringify(inhalt),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof WhatsAppFehler) throw e;
    throw new WhatsAppFehler("360dialog ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.");
  }

  const daten = (await antwort.json().catch(() => ({}))) as Record<string, unknown>;
  if (antwort.ok) return daten;

  throw new WhatsAppFehler(fehlerErklaeren(antwort.status, daten));
}

/**
 * Macht aus der Antwort von Meta einen Satz, mit dem das Büro etwas
 * anfangen kann. Die häufigsten Fälle beim Namen, der Rest mit Code, damit
 * man ihn nachschlagen kann.
 */
function fehlerErklaeren(http: number, daten: Record<string, unknown>): string {
  const fehler = (daten.error ?? {}) as Record<string, unknown>;
  const code = Number(fehler.code);
  const meldung = typeof fehler.message === "string" ? fehler.message : "";

  if (http === 401 || http === 403) {
    return "360dialog lehnt den Schlüssel ab. Ist er bei Vercel richtig eingetragen?";
  }
  if (code === 131047) {
    return (
      "Die letzte Nachricht des Kunden ist älter als 24 Stunden. Danach erlaubt WhatsApp " +
      "nur noch genehmigte Vorlagen."
    );
  }
  if (code === 131026) {
    return "Die Nachricht kam nicht an. Die Nummer hat vermutlich kein WhatsApp.";
  }
  if (code === 131056) {
    return "Zu viele Nachrichten an diese Nummer in kurzer Zeit. Kurz warten.";
  }
  return `WhatsApp hat die Nachricht abgelehnt${code ? ` (Code ${code})` : ""}${meldung ? ": " + meldung : "."}`;
}

/** Schickt eine Textnachricht und liefert die Kennung, die WhatsApp vergibt. */
export async function textSchicken(an: string, inhalt: string): Promise<string> {
  const daten = await anfrage("/messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: an,
    type: "text",
    text: { body: inhalt, preview_url: true },
  });

  const id = ((daten.messages as Array<{ id?: string }> | undefined) ?? [])[0]?.id;
  if (!id) throw new WhatsAppFehler("WhatsApp hat die Nachricht angenommen, aber keine Kennung geliefert.");
  return id;
}

/**
 * Trägt bei 360dialog ein, wohin eingehende Nachrichten geschickt werden.
 *
 * Der eigene Schlüssel geht als Kopfzeile mit. Ohne ihn nimmt die Route
 * nichts an, sonst könnte jeder, der die Adresse kennt, Nachrichten in den
 * Posteingang schreiben.
 */
export async function webhookEintragen(adresse: string): Promise<void> {
  const eigener = process.env.WHATSAPP_WEBHOOK_SCHLUESSEL;
  if (!eigener) {
    throw new WhatsAppFehler("WHATSAPP_WEBHOOK_SCHLUESSEL fehlt bei Vercel.");
  }
  await anfrage("/v1/configs/webhook", {
    url: adresse,
    headers: { "x-fzt-schluessel": eigener },
  });
}
