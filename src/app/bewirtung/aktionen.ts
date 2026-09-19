"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import {
  bewirtungLesen,
  entwurfSpeichern,
  entwurfVerwerfen,
  festschreiben,
  stornieren,
  type Angaben,
} from "@/lib/bewirtung/db";

const text = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

/** "12,50" oder "12.50" oder "1.234,50" in Cent. */
function cent(roh: string): number {
  const s = roh.replace(/[€\s]/g, "");
  if (!s) return 0;
  const zahl = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(zahl) ? Math.round(zahl * 100) : NaN;
}

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Nur für die Buchhaltung.");
  return b!;
}

function zurueck(id: string, meldung: string): never {
  revalidatePath("/bewirtung");
  redirect(`/bewirtung/${id}?meldung=${encodeURIComponent(meldung)}`);
}

function angabenAus(f: FormData): Angaben | string {
  const a: Angaben = {
    datum: text(f, "datum", 10),
    restaurant: text(f, "restaurant", 150),
    anschrift: text(f, "anschrift", 200),
    bruttoCent: cent(text(f, "brutto", 20)),
    mwst7Cent: cent(text(f, "mwst7", 20)),
    mwst19Cent: cent(text(f, "mwst19", 20)),
    trinkgeldCent: cent(text(f, "trinkgeld", 20)),
    zahlart: text(f, "zahlart", 50),
    art: text(f, "art") === "einkauf" ? "einkauf" : "bewirtung",
    kategorie: text(f, "kategorie", 60),
    zweck: text(f, "zweck", 300),
    zahlweg: (["karte", "bar"].includes(text(f, "zahlweg")) ? text(f, "zahlweg") : "") as Angaben["zahlweg"],
    privatAusgelegt: Boolean(f.get("privat")),
    anlass: text(f, "anlass", 500),
    teilnehmer: text(f, "teilnehmer", 1000),
    bewirtender: text(f, "bewirtender", 100) || "Florian Zimmer",
    ortDerBewirtung: text(f, "ort", 200),
    notiz: text(f, "notiz", 500),
  };
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === "number" && Number.isNaN(v)) return `Der Betrag bei „${k.replace("Cent", "")}“ ist keine Zahl.`;
  }
  return a;
}

/** Zwischenspeichern, oder mit "fertig=1" festschreiben. */
export async function belegSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  const id = text(f, "id", 40);
  const alt = await bewirtungLesen(id);
  if (!alt || alt.status !== "entwurf") zurueck(id, "Dieser Beleg ist schon festgeschrieben.");

  const a = angabenAus(f);
  if (typeof a === "string") zurueck(id, a);
  await entwurfSpeichern(id, a);

  if (!f.get("fertig")) zurueck(id, "Gespeichert. Noch nicht festgeschrieben.");

  // Pflichtangaben. Beim Bewirtungsbeleg verlangt sie das Finanzamt, sonst wird er nicht anerkannt.
  const fehlt: string[] = [];
  if (!a.datum) fehlt.push("Datum");
  if (!a.restaurant) fehlt.push(a.art === "bewirtung" ? "Restaurant" : "Geschäft");
  if (!(a.bruttoCent > 0)) fehlt.push("Betrag");
  if (!a.zahlweg) fehlt.push("Karte oder bar");
  if (a.art === "bewirtung") {
    if (!a.anlass) fehlt.push("Anlass");
    if (!a.teilnehmer) fehlt.push("Teilnehmer");
  } else {
    if (!a.zweck) fehlt.push("wofür");
  }
  if (fehlt.length) zurueck(id, `Zum Festschreiben fehlt noch: ${fehlt.join(", ")}.`);

  const nummer = await festschreiben(id, b.name);
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?meldung=${encodeURIComponent(`Beleg ${nummer} ist festgeschrieben.`)}`);
}

export async function belegVerwerfen(f: FormData): Promise<void> {
  await zugang();
  await entwurfVerwerfen(text(f, "id", 40));
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?meldung=${encodeURIComponent("Entwurf verworfen.")}`);
}

export async function belegStornieren(f: FormData): Promise<void> {
  const b = await zugang();
  const id = text(f, "id", 40);
  const grund = text(f, "grund", 300);
  if (!grund) zurueck(id, "Bitte einen Grund für das Storno angeben.");
  await stornieren(id, b.name, grund);
  zurueck(id, "Storniert. Der Beleg bleibt zur Nachvollziehbarkeit erhalten, zählt aber nicht mehr mit.");
}
