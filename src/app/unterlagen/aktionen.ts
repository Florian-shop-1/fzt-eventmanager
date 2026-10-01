"use server";

/**
 * Personalunterlagen ablegen und wieder entfernen.
 *
 * Sichtbar und änderbar nur für die, die auch die Arbeitsverträge sehen.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { unterlageAblegen, unterlageLoeschen } from "@/lib/db/unterlagen";

const ERLAUBT = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** 20 MB. Ein eingescannter Vertrag ist weit darunter. */
const MAX = 20 * 1024 * 1024;

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) throw new Error("Personalunterlagen sehen nur Werner, Kevin und Florian.");
  return b!;
}

function zurueck(meldung: string): never {
  revalidatePath("/unterlagen");
  redirect(`/unterlagen?meldung=${encodeURIComponent(meldung)}`);
}

export async function unterlageHochladen(f: FormData): Promise<void> {
  const b = await zugang();
  const benutzerId = String(f.get("benutzerId") ?? "");
  const art = String(f.get("art") ?? "vertrag") === "bogen" ? "bogen" : "vertrag";
  const titel = String(f.get("titel") ?? "").trim().slice(0, 120);
  const notiz = String(f.get("notiz") ?? "").trim().slice(0, 300);
  const datei = f.get("datei");

  if (!benutzerId) zurueck("Bitte eine Person wählen.");
  if (!(datei instanceof File) || datei.size === 0) zurueck("Bitte eine Datei auswählen.");
  if (datei.size > MAX) zurueck("Die Datei ist größer als 20 MB. Bitte kleiner scannen.");
  if (!ERLAUBT.has(datei.type)) {
    zurueck(`Dieses Dateiformat können wir nicht ablegen (${datei.type || "unbekannt"}). PDF, Bild oder Word.`);
  }

  await unterlageAblegen({
    benutzerId,
    art,
    titel: titel || datei.name,
    dateiname: datei.name,
    typ: datei.type,
    inhalt: Buffer.from(await datei.arrayBuffer()),
    notiz,
    von: b.name,
  });

  zurueck("Abgelegt.");
}

export async function unterlageWeg(f: FormData): Promise<void> {
  await zugang();
  await unterlageLoeschen(String(f.get("id") ?? ""));
  zurueck("Die Unterlage ist entfernt.");
}
