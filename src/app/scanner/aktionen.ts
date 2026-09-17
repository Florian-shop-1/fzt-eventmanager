"use server";

/**
 * Knöpfe der Scanner-Seite: Karte bestätigen, verwerfen, erneut an Brevo,
 * Listen wählen, Nachtlauf von Hand.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scannerBenutzer } from "@/lib/scanner/zugang";
import { abschliessen, nachtlauf } from "@/lib/scanner/ablauf";
import { emailPruefen, nameSchoen, telefonSchoen } from "@/lib/scanner/pruefen";
import { einstellungSpeichern, ergebnisSpeichern, geprueft, karte } from "@/lib/db/scanner";

function zurueck(meldung: string, anker = ""): never {
  revalidatePath("/scanner");
  redirect(`/scanner?meldung=${encodeURIComponent(meldung)}${anker ? `#${anker}` : ""}`);
}

async function berechtigt() {
  const b = await scannerBenutzer();
  if (!b) throw new Error("Nicht erlaubt.");
  return b;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function karteBestaetigen(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  const id = text(formular, "id");
  const k = await karte(id);
  if (!k) zurueck("Diese Karte gibt es nicht mehr.");

  const befund = await emailPruefen(text(formular, "email"));
  const trotzdem = formular.get("trotzdem") === "ja";
  if (!befund.email) zurueck("Ohne E-Mail kann die Karte nicht zu Brevo. Bitte eintragen oder verwerfen.", `karte-${id}`);
  if (!befund.ok && !trotzdem) {
    const vorschlag = befund.vorschlag ? ` Vorschlag: ${befund.vorschlag}` : "";
    zurueck(`${befund.email}: ${befund.maengel.join(", ")}.${vorschlag} Wenn die Adresse wirklich so auf der Karte steht, „Trotzdem übernehmen“ anhaken.`, `karte-${id}`);
  }
  const tel = telefonSchoen(text(formular, "telefon"));
  await geprueft(id, { id: benutzer.id, name: benutzer.name });
  await abschliessen(id, {
    vorname: nameSchoen(text(formular, "vorname")),
    nachname: nameSchoen(text(formular, "nachname")),
    email: befund.email,
    telefon: tel.ok ? tel.telefon : "",
  });
  const neu = await karte(id);
  zurueck(
    neu?.status === "uebertragen" ? `${befund.email} ist bei Brevo eingetragen.`
      : neu?.status === "doppelt" ? `${befund.email} war schon eingetragen.`
      : `Brevo: ${neu?.brevoFehler ?? "unbekannter Fehler"}`,
  );
}

export async function karteVerwerfen(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  const id = text(formular, "id");
  await geprueft(id, { id: benutzer.id, name: benutzer.name });
  await ergebnisSpeichern(id, { status: "verworfen", grund: `Verworfen von ${benutzer.name}` });
  zurueck("Karte verworfen.");
}

export async function erneutUebertragen(formular: FormData): Promise<void> {
  await berechtigt();
  const k = await karte(text(formular, "id"));
  if (!k) zurueck("Diese Karte gibt es nicht mehr.");
  await abschliessen(k.id, { vorname: k.vorname, nachname: k.nachname, email: k.email, telefon: k.telefon });
  const neu = await karte(k.id);
  zurueck(neu?.status === "uebertragen" ? `${k.email} ist jetzt bei Brevo.` : `Brevo: ${neu?.brevoFehler ?? "unbekannter Fehler"}`);
}

export async function listenSpeichern(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  if (benutzer.rolle !== "chef") zurueck("Die Listen wählt nur Florian.");
  const zahl = (k: string) => (text(formular, k) ? Number(text(formular, k)) : null);
  await einstellungSpeichern(zahl("newsletter"), zahl("emoji"), benutzer.name);
  zurueck("Listen gespeichert.");
}

export async function nachtlaufStarten(): Promise<void> {
  const benutzer = await berechtigt();
  if (benutzer.rolle !== "chef" && benutzer.rolle !== "team") zurueck("Nur Büro und Florian.");
  const e = await nachtlauf();
  zurueck(
    `${e.abgeholt} Ergebnisse von Claude abgeholt, ${e.abgeschickt} Karten an Claude geschickt.` +
      (e.fehler.length ? ` Fehler: ${e.fehler.join("; ")}` : ""),
  );
}
