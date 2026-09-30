"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { zauberstabAbhaken, zauberstabEintragen, zauberstabZurueck } from "@/lib/shop/zauberstab";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Nicht angemeldet.");
  return b;
}

/*
  Zurueck dorthin, wo geklickt wurde.

  Die Zauberstaebe stehen seit dem 30.09.2026 auch in der Versandliste,
  und wer dort abhakt, will dort weiterarbeiten und nicht auf einer
  anderen Seite landen (Florian). Angenommen wird nur einer der beiden
  bekannten Wege, nichts aus dem Formular blind weitergereicht.
*/
function zurueck(meldung: string, ziel = "/zauberstab"): never {
  const weg = ziel === "/versand" ? "/versand" : "/zauberstab";
  revalidatePath("/zauberstab");
  revalidatePath("/versand");
  redirect(`${weg}?meldung=${encodeURIComponent(meldung)}`);
}

/** Päckchen ist raus. */
export async function abhaken(f: FormData): Promise<void> {
  const b = await zugang();
  await zauberstabAbhaken(text(f, "id"), b.name);
  zurueck("Abgehakt, das Päckchen ist raus.", text(f, "ziel"));
}

export async function dochNicht(f: FormData): Promise<void> {
  await zugang();
  await zauberstabZurueck(text(f, "id"));
  zurueck("Wieder offen.", text(f, "ziel"));
}

/**
 * Eine Anschrift von Hand nachtragen.
 *
 * Für den Fall, dass jemand am Telefon nachfragt oder die Anschrift auf
 * einem Zettel steht (Florian, 30.09.2026).
 */
export async function vonHand(f: FormData): Promise<void> {
  await zugang();
  const name = text(f, "name");
  const teile = name.split(/\s+/).filter(Boolean);

  if (!text(f, "strasse") || !text(f, "plz") || !text(f, "ort")) {
    zurueck("Ohne vollständige Anschrift geht das Päckchen nicht raus.");
  }

  await zauberstabEintragen({
    vorname: teile[0] ?? "",
    nachname: teile.slice(1).join(" "),
    email: text(f, "email"),
    strasse: text(f, "strasse"),
    plz: text(f, "plz"),
    ort: text(f, "ort"),
    quelle: text(f, "quelle") || "von Hand",
    notiz: text(f, "notiz"),
  });
  zurueck(`${name} steht jetzt auf der Liste.`);
}
