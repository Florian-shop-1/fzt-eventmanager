"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfTipps } from "@/lib/auth/sitzung";
import {
  alleReihen,
  alleTipps,
  darfLoeschen,
  reiheAnlegen,
  reiheLoeschen,
  tippAnlegen,
  tippLoeschen,
} from "@/lib/tipps/db";

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
  const notiz = text(f, "notiz", 20000);
  const roheArt = text(f, "art", 20);
  /*
    Video, Datei oder Notiz.

    Was fuer eine Sorte es ist, entscheidet nicht der Knopf allein, sondern
    was wirklich ankam: Wer eine Notiz schreibt und dabei keine Datei
    waehlt, bekommt eine Notiz (Florian, 30.09.2026).
  */
  const art: "video" | "datei" | "notiz" = !videoUrl
    ? "notiz"
    : roheArt === "datei" || !videoTyp.startsWith("video/")
      ? "datei"
      : "video";

  if (!titel) zurueck("Der Eintrag braucht einen Titel.");
  if (art === "notiz" && !notiz) zurueck("Ohne Datei braucht es wenigstens einen Text.");

  await tippAnlegen({
    titel,
    beschreibung: text(f, "beschreibung", 2000),
    schlagworte: text(f, "schlagworte", 500),
    videoUrl,
    videoTyp,
    von: b!.name,
    art,
    notiz,
    dateiName: text(f, "dateiName", 200),
  });
  zurueck(`"${titel}" ist gespeichert.`);
}

export async function tippLoeschenAktion(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  const id = text(f, "id", 40);

  /*
    Geprueft wird hier, nicht nur im Browser.

    Der Knopf steht nur dort, wo jemand loeschen darf. Wer die Adresse
    kennt, koennte sie aber auch von Hand aufrufen, und dann entscheidet
    diese Stelle (Florian, 05.10.2026).
  */
  const eintrag = (await alleTipps()).find((t) => t.id === id);
  if (!eintrag) zurueck("Diesen Eintrag gibt es nicht mehr.");
  if (!darfLoeschen(b, eintrag)) {
    zurueck("Löschen geht nur bei den eigenen Anleitungen und nur am Tag des Hochladens.");
  }

  await tippLoeschen(id);
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

  let schritte: Array<{
    titel: string;
    videoUrl: string;
    videoTyp: string;
    notiz?: string;
    dateiName?: string;
  }>;
  try {
    schritte = JSON.parse(text(f, "schritte", 200000)) as typeof schritte;
  } catch {
    zurueck("Die Schritte waren nicht lesbar. Bitte noch einmal versuchen.");
  }

  const sauber = (schritte ?? [])
    // Ein Schritt braucht entweder eine Datei oder einen Text.
    .filter((s) => s && (String(s.videoUrl ?? "").startsWith("https://") || String(s.notiz ?? "").trim()))
    .slice(0, 30)
    .map((s) => {
      const url = String(s.videoUrl ?? "");
      const typ = String(s.videoTyp ?? "").slice(0, 100);
      return {
        titel: String(s.titel ?? "").trim().slice(0, 200),
        videoUrl: url,
        videoTyp: typ,
        art: (!url ? "notiz" : typ.startsWith("video/") ? "video" : "datei") as
          | "video"
          | "datei"
          | "notiz",
        notiz: String(s.notiz ?? "").slice(0, 20000),
        dateiName: String(s.dateiName ?? "").slice(0, 200),
      };
    });

  if (sauber.length === 0) zurueck("Es kam kein einziger Schritt an.");

  await reiheAnlegen({
    titel,
    beschreibung: text(f, "beschreibung", 2000),
    schlagworte: text(f, "schlagworte", 500),
    von: b!.name,
    schritte: sauber,
  });

  zurueck(`"${titel}" ist gespeichert, ${sauber.length} Schritte.`);
}

/**
 * Eine ganze Anleitung wieder löschen, mit allen Schritten.
 *
 * Dieselbe Regel wie beim einzelnen Video: nur die eigene, nur am Tag des
 * Hochladens, und Florian immer (Florian, 05.10.2026).
 */
export async function reiheWeg(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  const id = text(f, "id", 40);

  const reihe = (await alleReihen()).find((r) => r.id === id);
  if (!reihe) zurueck("Diese Anleitung gibt es nicht mehr.");
  if (!darfLoeschen(b, reihe)) {
    zurueck("Löschen geht nur bei den eigenen Anleitungen und nur am Tag des Hochladens.");
  }

  await reiheLoeschen(id);
  zurueck("Die Anleitung ist gelöscht.");
}
