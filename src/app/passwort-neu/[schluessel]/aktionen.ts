"use server";

import { redirect } from "next/navigation";

import { passwortNeuSetzen } from "@/lib/auth/vergessen";

export async function neuesPasswortSetzen(f: FormData): Promise<void> {
  const schluessel = String(f.get("schluessel") ?? "").trim();
  const passwort = String(f.get("passwort") ?? "");
  const wiederholung = String(f.get("wiederholung") ?? "");

  const ziel = `/passwort-neu/${encodeURIComponent(schluessel)}`;

  if (passwort !== wiederholung) {
    redirect(`${ziel}?fehler=${encodeURIComponent("Die beiden Passwörter sind nicht gleich.")}`);
  }

  const fehler = await passwortNeuSetzen(schluessel, passwort);
  if (fehler) redirect(`${ziel}?fehler=${encodeURIComponent(fehler)}`);

  // Angemeldet wird nicht automatisch: Wer das neue Passwort einmal
  // eintippt, merkt es sich eher.
  redirect("/anmelden?meldung=" + encodeURIComponent("Dein Passwort ist gesetzt. Du kannst dich jetzt anmelden."));
}
