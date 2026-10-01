"use server";

/**
 * Anfragen als Kontakte nach Brevo übertragen.
 *
 * Zwei Schritte mit Absicht: erst der Probelauf, der nur rechnet, dann
 * das Übertragen. Was einmal in einer Brevo-Liste steht, bekommt dort
 * Mails, sobald jemand eine Kampagne startet. Das soll niemand
 * versehentlich auslösen (Florian, 29.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { holeLeads, istStoerung } from "@/lib/shop/leads";
import {
  bekannteAdressen,
  dateiUebertragen,
  kundenListeSetzen,
  leadsUebertragen,
  listen,
} from "@/lib/marketing/brevo-kontakte";
import { leadsAusCsv } from "@/lib/marketing/lead-csv";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    throw new Error("Das dürfen nur Büro und Geschäftsführung.");
  }
  return b;
}

function zurueck(meldung: string, listeId: string): never {
  revalidatePath("/leads/brevo");
  redirect(`/leads/brevo?liste=${encodeURIComponent(listeId)}&meldung=${encodeURIComponent(meldung)}`);
}

/**
 * Welche Anfragen übertragen werden.
 *
 * Störungsmeldungen nie: Wer einen kaputten Saalplan meldet, hat sich
 * nicht für Werbung gemeldet. Sonst entscheidet die Auswahl.
 */
async function auswahl(nur: string) {
  const alle = (await holeLeads()).filter((l) => !istStoerung(l));
  if (nur === "gewonnen") return alle.filter((l) => /gewonnen/i.test(l.status));
  if (nur === "offen") return alle.filter((l) => /eingegangen|kontakt|erreichbar|angebot/i.test(l.status));
  return alle;
}

export async function probelauf(f: FormData): Promise<void> {
  await zugang();
  const listeId = text(f, "liste");
  const leads = await auswahl(text(f, "nur"));

  const e = await leadsUebertragen({ leads, listeId: Number(listeId) || 0, trocken: true });
  zurueck(
    `Probelauf: ${e.gesendet} Kontakte würden übertragen. ` +
      `${e.ohneMail} ohne brauchbare Mailadresse, ${e.doppelt} doppelte Adressen werden ausgelassen. ` +
      "Es wurde nichts gesendet.",
    listeId,
  );
}

export async function uebertragen(f: FormData): Promise<void> {
  await zugang();
  const listeId = text(f, "liste");
  if (!Number(listeId)) zurueck("Bitte zuerst eine Liste auswählen.", listeId);

  const leads = await auswahl(text(f, "nur"));

  try {
    const e = await leadsUebertragen({ leads, listeId: Number(listeId), trocken: false });
    const teile = [
      `${e.gesendet} Kontakte übertragen`,
      e.ohneMail > 0 ? `${e.ohneMail} ohne Mailadresse ausgelassen` : "",
      e.doppelt > 0 ? `${e.doppelt} doppelte Adressen ausgelassen` : "",
      e.fehler.length > 0 ? `Fehler: ${e.fehler.join(" | ")}` : "",
    ].filter(Boolean);
    zurueck(teile.join(", ") + ".", listeId);
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    zurueck(fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.", listeId);
  }
}

/**
 * Eine Lead-Liste aus einer Datei übertragen.
 *
 * Erst wird verglichen: Wie viele Adressen kennt Brevo schon? Erst wenn
 * "wirklich übertragen" angekreuzt ist, geht etwas hinaus. So lässt sich
 * eine alte Liste ansehen, ohne sie anzufassen (Florian, 29.09.2026).
 */
export async function dateiZuBrevo(f: FormData): Promise<void> {
  await zugang();
  const listeId = text(f, "liste");
  const datei = f.get("datei");

  if (!(datei instanceof File) || datei.size === 0) {
    zurueck("Bitte eine Datei auswählen.", listeId);
  }
  if (datei.size > 5 * 1024 * 1024) zurueck("Die Datei ist zu groß.", listeId);

  const inhalt = Buffer.from(await datei.arrayBuffer()).toString("utf8");

  let gelesen;
  try {
    gelesen = leadsAusCsv(inhalt);
  } catch (fehler) {
    zurueck(fehler instanceof Error ? fehler.message : "Die Datei war nicht lesbar.", listeId);
  }

  if (gelesen.leads.length === 0) {
    zurueck("In der Datei stand keine einzige brauchbare Mailadresse.", listeId);
  }

  // Erst vergleichen, dann entscheiden.
  let schonDa = 0;
  let neu = gelesen.leads.length;
  try {
    const bekannt = await bekannteAdressen();
    schonDa = gelesen.leads.filter((l) => bekannt.has(l.email)).length;
    neu = gelesen.leads.length - schonDa;
  } catch {
    // Kennt Brevo die Kontakte gerade nicht heraus, wird trotzdem
    // übertragen: Doppelte legt Brevo ohnehin nicht doppelt an.
  }

  const bestand =
    `${gelesen.leads.length} Adressen in der Datei, davon ${schonDa} schon in Brevo und ${neu} neu. ` +
    `${gelesen.ohneMail} Zeilen ohne Mailadresse, ${gelesen.doppelt} doppelte in der Datei.`;

  if (text(f, "wirklich") !== "ja") {
    zurueck(`Nur nachgesehen: ${bestand} Es wurde nichts übertragen.`, listeId);
  }
  if (!Number(listeId)) zurueck(`${bestand} Zum Übertragen fehlt die Liste.`, listeId);

  try {
    const e = await dateiUebertragen({
      leads: gelesen.leads,
      listeId: Number(listeId),
      herkunft: text(f, "herkunft") || datei.name.replace(/\.csv$/i, ""),
      trocken: false,
    });
    zurueck(
      `${e.gesendet} Kontakte übertragen (${schonDa} davon waren schon da und wurden aktualisiert).` +
        (e.fehler.length > 0 ? ` Fehler: ${e.fehler.join(" | ")}` : ""),
      listeId,
    );
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    zurueck(fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.", listeId);
  }
}

/**
 * Welche Liste die Kundenliste ist.
 *
 * In sie wandert jeder, fuer den wir eine Rechnung schreiben
 * (Florian, 01.10.2026).
 */
export async function kundenlisteSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  const roh = text(f, "liste");
  const id = Number(roh) || null;
  const name = id ? ((await listen().catch(() => [])).find((l) => l.id === id)?.name ?? "") : "";
  await kundenListeSetzen(id, name, b.name ?? "Büro");
  zurueck(
    id ? `Kunden landen jetzt in der Liste ${name || id}.` : "Es wird kein Kunde mehr nach Brevo übertragen.",
    roh,
  );
}
