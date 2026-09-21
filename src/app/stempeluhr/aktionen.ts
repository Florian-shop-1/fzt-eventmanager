"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";

/** Mittelpunkt, Umkreis und Meldegrenze der Stempeluhr. Nur für den Inhaber. */
export async function standortSpeichern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Nur die Geschäftsführung darf das ändern.");

  const zahl = (k: string) => Number(String(f.get(k) ?? "").replace(",", ".").trim());
  const lat = zahl("lat");
  const lon = zahl("lon");
  const radius = Math.max(30, Math.min(2000, Math.round(zahl("radius")) || 150));
  const maxStunden = Math.max(1, Math.min(24, Math.round(zahl("maxStunden")) || 10));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    redirect(`/stempeluhr?meldung=${encodeURIComponent("Die Koordinaten sehen nicht richtig aus.")}`);
  }

  await db()`
    update stempel_einstellung set lat = ${lat}, lon = ${lon}, radius_m = ${radius},
           max_stunden = ${maxStunden}, aktiv = ${Boolean(f.get("aktiv"))}
     where id = 1
  `;
  revalidatePath("/stempeluhr");
  redirect(`/stempeluhr?meldung=${encodeURIComponent("Gespeichert.")}`);
}
