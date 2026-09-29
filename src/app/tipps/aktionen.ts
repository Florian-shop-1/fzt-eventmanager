"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfTipps } from "@/lib/auth/sitzung";
import { reiheAnlegen, reiheLoeschen, tippAnlegen, tippLoeschen } from "@/lib/tipps/db";

const text = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").trim().slice(0, max);

function zurueck(meldung: string): never {
  revalidatePath("/tipps");
  redirect(`/tipps?meldung=${encodeURIComponent(meldung)}`);
}

/**
 * Legt den Datenbank-Eintrag an, nachdem das Video im Browser schon
 * direkt zu Vercel Blob hochgeladen wurde (siehe tipps/hochladen/route.ts
 * und components/TippsListe.tsx). Diese Aktion bekommt nur noch die
 * fertige URL, nicht die Videodatei selbst.
 */
export async function tippSpeichern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!darfTipps(b)) throw new Error("Nicht erlaubt.");

  const titel = text(f, "titel", 200);
  const videoUrl = text(f, "videoUrl", 2000);
  const videoTyp = text(f, "videoTyp", 100);
  if (!titel || !videoUrl) zurueck("Titel oder Video fehlt.");

  await tippAnlegen({
    titel,
    beschreibung: text(f, "beschreibung", 2000),
    schlagworte: text(f, "schlagworte", 500),
    videoUrl,
    videoTyp,
    von: b!.name,
  });
  zurueck(`"${titel}" ist gespeichert.`);
}

export async function tippLoeschenAktion(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || (b.rolle !== "chef" && b.rolle !== "team")) throw new Error("Nicht erlaubt.");
  await tippLoeschen(text(f, "id", 40));
  zurueck("Gelöscht.");
}

/**
 * Eine mehrteilige Anleitung speichern.
 *
 * Die Videos sind zu diesem Zeitpunkt schon bei Vercel Blob, hier
 * entstehen nur die Einträge. Die Reihenfolge steckt in der Liste:
 * Schritt eins ist das erste Element (Florian, 29.09.2026).
 */
export async function reiheSpeichern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!darfTipps(b)) throw new Error("Nicht erlaubt.");

  const titel = text(f, "titel", 200);
  if (!titel) zurueck("Die Anleitung braucht einen Titel.");

  let schritte: Array<{ titel: string; videoUrl: string; videoTyp: string }>;
  try {
    schritte = JSON.parse(text(f, "schritte", 200000)) as typeof schritte;
  } catch {
    zurueck("Die Schritte waren nicht lesbar. Bitte noch einmal versuchen.");
  }

  const sauber = (schritte ?? [])
    .filter((s) => s && typeof s.videoUrl === "string" && s.videoUrl.startsWith("https://"))
    .slice(0, 30)
    .map((s) => ({
      titel: String(s.titel ?? "").trim().slice(0, 200),
      videoUrl: s.videoUrl,
      videoTyp: String(s.videoTyp ?? "video/mp4").slice(0, 100),
    }));

  if (sauber.length === 0) zurueck("Es kam kein einziges Video an.");

  await reiheAnlegen({
    titel,
    beschreibung: text(f, "beschreibung", 2000),
    schlagworte: text(f, "schlagworte", 500),
    von: b!.name,
    schritte: sauber,
  });

  zurueck(`"${titel}" ist gespeichert, ${sauber.length} Schritte.`);
}

/** Eine ganze Anleitung wieder löschen, mit allen Schritten. */
export async function reiheWeg(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!darfTipps(b)) throw new Error("Nicht erlaubt.");
  await reiheLoeschen(text(f, "id", 40));
  zurueck("Die Anleitung ist gelöscht.");
}
