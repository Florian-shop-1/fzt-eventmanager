"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfTipps } from "@/lib/auth/sitzung";
import { tippAnlegen, tippLoeschen } from "@/lib/tipps/db";

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
