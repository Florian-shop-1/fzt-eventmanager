"use server";

/**
 * Was sich von der Personalakte aus auslösen lässt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { lohnbueroPaket } from "@/lib/personal/lohnbuero-paket";
import { unterlageAblegen, unterlageLoeschen } from "@/lib/db/unterlagen";
import { db } from "@/lib/db/client";

/**
 * Personalbogen und Arbeitsvertrag jetzt ans Lohnbüro schicken.
 *
 * Normalerweise geht das Paket von selbst hinaus, sobald beides vorliegt
 * (Florian, 15.10.2026). Dieser Knopf ist für die Fälle davor: Verträge,
 * die schon unterschrieben waren, als es die Automatik noch nicht gab,
 * und für den Fall, dass eine Mail einmal hängenbleibt.
 */
export async function paketSchicken(benutzerId: string): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");

  let meldung: string;
  try {
    const stand = await lohnbueroPaket(benutzerId);
    meldung = stand.verschickt
      ? `Personalbogen und Arbeitsvertrag sind an ${stand.an?.join(" und ")} hinausgegangen.`
      : `Es ging nichts hinaus: ${stand.grund}`;
  } catch (e) {
    meldung = `Die Mail ging nicht hinaus: ${e instanceof Error ? e.message : "unbekannter Fehler"}`;
  }

  revalidatePath(`/mitarbeiter/${benutzerId}`);
  redirect(`/mitarbeiter/${benutzerId}?meldung=${encodeURIComponent(meldung)}`);
}

/*
  Die Personalunterlagen liegen jetzt in der Akte.

  "füge Personalakte und Personalunterlagen zusammen, alles in der
  Personalakte reicht" (Florian, 15.10.2026). Vorher gab es eine zweite
  Seite mit allen Dateien aller Leute und einer Auswahlliste, für wen
  man gerade etwas ablegt. In der Akte steht ohnehin schon, um wen es
  geht.
*/

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

function zurueck(benutzerId: string, meldung: string): never {
  revalidatePath(`/mitarbeiter/${benutzerId}`);
  redirect(`/mitarbeiter/${benutzerId}?meldung=${encodeURIComponent(meldung)}`);
}

export async function unterlageHochladen(benutzerId: string, f: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");

  const art = String(f.get("art") ?? "vertrag") === "bogen" ? "bogen" : "vertrag";
  const titel = String(f.get("titel") ?? "").trim().slice(0, 120);
  const notiz = String(f.get("notiz") ?? "").trim().slice(0, 300);
  const datei = f.get("datei");

  if (!(datei instanceof File) || datei.size === 0) zurueck(benutzerId, "Bitte eine Datei auswählen.");
  if (datei.size > MAX) zurueck(benutzerId, "Die Datei ist größer als 20 MB. Bitte kleiner scannen.");
  if (!ERLAUBT.has(datei.type)) {
    zurueck(
      benutzerId,
      `Dieses Dateiformat können wir nicht ablegen (${datei.type || "unbekannt"}). PDF, Bild oder Word.`,
    );
  }

  await unterlageAblegen({
    benutzerId,
    art,
    titel: titel || datei.name,
    dateiname: datei.name,
    typ: datei.type,
    inhalt: Buffer.from(await datei.arrayBuffer()),
    notiz,
    von: ich!.name,
  });

  /*
    Ein nachgereichter Personalbogen kann das fehlende Stück sein: Liegt
    auch der unterschriebene Vertrag vor, geht das Paket jetzt hinaus.
  */
  if (art === "bogen") {
    const { lohnbueroPaketStill } = await import("@/lib/personal/lohnbuero-paket");
    await lohnbueroPaketStill(benutzerId);
  }

  zurueck(benutzerId, "Abgelegt.");
}

export async function unterlageWeg(benutzerId: string, f: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");
  await unterlageLoeschen(String(f.get("id") ?? ""));
  zurueck(benutzerId, "Die Unterlage ist entfernt.");
}

/**
 * Eine Mail an den Mitarbeiter, aus dem eigenen Postfach.
 *
 * "also direkt aus der Personalakte ein Button, Mail an Mitarbeiter"
 * (Florian, 15.10.2026). Absender ist die Adresse dessen, der gerade
 * angemeldet ist, damit die Antwort bei ihm ankommt und nicht im
 * Personalpostfach.
 */
export async function nachrichtAnMitarbeiter(benutzerId: string, f: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");

  const { nachrichtSchicken } = await import("@/lib/personal/schriftverkehr");
  const stand = await nachrichtSchicken({
    benutzerId,
    anEmail: String(f.get("an") ?? "").trim(),
    betreff: String(f.get("betreff") ?? ""),
    text: String(f.get("text") ?? ""),
    vonName: ich!.name,
    vonEmail: ich!.email,
  });

  zurueck(benutzerId, stand.meldung);
}

/**
 * Arbeitet diese Person auf Rechnung?
 *
 * "schaffe bei den Stunden eine eigene Rubrik Freelancer-Stunden auf
 * Rechnung, diese bedürfen keiner Meldung ans Lohnbüro" (Florian,
 * 15.10.2026). Der Haken steuert, in welcher Rubrik die Stunden
 * erscheinen und ob sie gemeldet werden.
 */
export async function aufRechnungSetzen(benutzerId: string, f: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");

  const an = String(f.get("aufRechnung") ?? "") === "ja";
  await db()`update benutzer set auf_rechnung = ${an} where id = ${benutzerId}`;
  revalidatePath("/lohn");
  zurueck(
    benutzerId,
    an
      ? "Gespeichert: Die Stunden stehen jetzt unter den Freelancer-Stunden und gehen nicht ans Lohnbüro."
      : "Gespeichert: Die Stunden gehen wieder in die Lohnmeldung.",
  );
}
