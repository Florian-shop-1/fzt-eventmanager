"use server";

/**
 * Den Namen am geteilten Zugang merken oder wieder vergessen.
 * Siehe lib/personal/wer.ts.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { WER_KEKS } from "@/lib/personal/wer";

export async function nameMerken(formData: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b?.geteilt) return;

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const laden = await cookies();
  if (name.length < 2) laden.delete(WER_KEKS);
  else laden.set(WER_KEKS, name, { maxAge: 60 * 60 * 16, httpOnly: true, sameSite: "lax", path: "/" });

  revalidatePath(String(formData.get("zurueck") ?? "/"));
}
