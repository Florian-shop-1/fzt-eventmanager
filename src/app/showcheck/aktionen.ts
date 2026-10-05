"use server";

/**
 * Die Show-Checkliste abhaken.
 *
 * Abgehakt wird je Vorstellung. Wer abgehakt hat, steht daneben: Nicht
 * zur Kontrolle, sondern damit man am Abend weiß, wen man fragen kann
 * (Florian, 03.10.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  haken,
  hakenWeg,
  punktAendern,
  punktAnlegen,
  punktWeg,
  vorschlagErledigt,
  vorschlagSpeichern,
  type Bereich,
  type Liste,
} from "@/lib/showcheck/db";

const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  // Abhaken darf, wer am Abend arbeitet: Showteam, Büro, Chef.
  if (!["chef", "team", "showteam", "foyer"].includes(b.rolle)) {
    throw new Error("Die Checklisten sind für das Show- und Foyerteam.");
  }
  return b;
}

function zurueck(abend: string, liste: Liste = "show", meldung = ""): never {
  const pfad = liste === "foyer" ? "/foyer/check" : "/showcheck";
  revalidatePath(pfad);
  redirect(
    `${pfad}?abend=${encodeURIComponent(abend)}` +
      (meldung ? `&meldung=${encodeURIComponent(meldung)}` : ""),
  );
}

export async function punktHaken(f: FormData): Promise<void> {
  const b = await zugang();
  const abend = text(f, "abend", 60);
  const datum = text(f, "datum", 10);
  const punktId = text(f, "punkt", 40);
  const an = text(f, "an", 4) === "ja";

  if (an) await haken({ ditixEventId: abend, datum, punktId, wer: b.name });
  else await hakenWeg(abend, punktId);

  zurueck(abend);
}

/** Die Liste selbst pflegen: nur Florian. */
async function nurChef() {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Die Liste ändert nur Florian.");
  return b;
}

export async function punktDazu(f: FormData): Promise<void> {
  await nurChef();
  const bereich = text(f, "bereich", 20) as Bereich;
  const neu = text(f, "text", 300);
  if (neu) await punktAnlegen(bereich, neu, listeAus(f));
  zurueck(text(f, "abend", 60), listeAus(f));
}

/** "show" oder "foyer". Alles andere ist die Show. */
function listeAus(f: FormData): Liste {
  return text(f, "liste", 10) === "foyer" ? "foyer" : "show";
}

/**
 * Ein Vorschlag fuer die Liste.
 *
 * Einreichen darf jeder, der die Liste abhakt: Wer am Abend arbeitet,
 * merkt als Erster, wenn etwas fehlt (Florian, 05.10.2026). Uebernommen
 * wird nichts automatisch, Florian liest sie.
 */
export async function vorschlagEinreichen(f: FormData): Promise<void> {
  const b = await zugang();
  const liste = listeAus(f);
  const neu = text(f, "text", 300);
  if (neu.length >= 3) {
    await vorschlagSpeichern({ liste, text: neu, von: b.name, benutzerId: b.id });
  }
  zurueck(text(f, "abend", 60), liste, neu.length >= 3 ? "Danke, der Vorschlag ist notiert." : "");
}

export async function vorschlagAbhaken(f: FormData): Promise<void> {
  const b = await nurChef();
  await vorschlagErledigt(text(f, "id", 40), b.name);
  zurueck(text(f, "abend", 60), listeAus(f));
}

export async function punktUmbenennen(f: FormData): Promise<void> {
  await nurChef();
  const neu = text(f, "text", 300);
  if (neu) await punktAendern(text(f, "punkt", 40), neu);
  zurueck(text(f, "abend", 60), listeAus(f));
}

export async function punktEntfernen(f: FormData): Promise<void> {
  await nurChef();
  await punktWeg(text(f, "punkt", 40));
  zurueck(text(f, "abend", 60), listeAus(f));
}
