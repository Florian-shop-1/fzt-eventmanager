"use server";

/**
 * Der Mitarbeiter unterschreibt seinen Arbeitsvertrag.
 *
 * Gespeichert wird nicht nur der Namenszug, sondern auch der Wortlaut,
 * den er dabei vor sich hatte, samt Fingerabdruck. Ändert sich später die
 * Vorlage, bleibt sein Vertrag unberührt: Ein Vertrag, dessen Text sich
 * nachträglich ändern kann, ist keiner.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { downloadMerken, vertragUnterschreiben, vertragVon } from "@/lib/db/arbeitsvertrag";
import { luecken } from "@/lib/personal/vertragsdaten";

function zurueck(meldung: string): never {
  revalidatePath("/vertrag");
  revalidatePath("/vertraege");
  revalidatePath("/", "layout");
  redirect(`/vertrag?meldung=${encodeURIComponent(meldung)}`);
}

export async function vertragSignieren(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Nicht angemeldet.");

  const v = await vertragVon(b.id);
  if (!v) zurueck("Für dich liegt kein Vertrag bereit.");
  if (!v.freigegebenAm) zurueck("Dieser Vertrag ist noch nicht freigegeben.");
  if (v.unterschriebenAm) zurueck("Dieser Vertrag ist schon unterschrieben.");

  const bild = String(f.get("unterschrift") ?? "");
  if (!bild.startsWith("data:image/png;base64,")) {
    zurueck("Es wurde nichts unterschrieben. Zeichne deinen Namenszug in das Feld.");
  }
  // Ein leeres Feld ergibt ein winziges Bild. Alles unter etwa einem
  // Kilobyte ist kein Namenszug, sondern ein Versehen.
  if (bild.length < 1200) zurueck("Das Feld ist noch leer. Zeichne deinen Namenszug hinein.");

  const kopf = await headers();
  const ok = await vertragUnterschreiben({
    id: v.id,
    benutzerId: b.id,
    bild,
    art: v.art,
    luecken: luecken(v),
    ip: (kopf.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt",
    geraet: (kopf.get("user-agent") ?? "unbekannt").slice(0, 300),
  });

  zurueck(
    ok
      ? "Danke, dein Arbeitsvertrag ist unterschrieben. Du kannst ihn jederzeit hier nachlesen und ausdrucken."
      : "Das hat nicht geklappt. Bitte lade die Seite neu.",
  );
}

/**
 * Die eigene Ausfertigung abrufen.
 *
 * Der Vertrag sagt zu, dass der Arbeitnehmer eine unterzeichnete
 * Ausfertigung bekommt; am Bildschirm ist der Abruf genau das, deshalb
 * wird er festgehalten (Florian, 30.09.2026).
 */
export async function ausfertigungGeholt(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Nicht angemeldet.");
  const v = await vertragVon(b.id);
  if (!v) zurueck("Für dich liegt kein Vertrag bereit.");

  const kopf = await headers();
  await downloadMerken({
    vertragId: v.id,
    wer: b.name,
    eigener: true,
    ip: (kopf.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt",
    geraet: (kopf.get("user-agent") ?? "unbekannt").slice(0, 300),
  });
  void f;
  redirect("/vertrag?drucken=1");
}
