import { NextResponse } from "next/server";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { belegLesen, leserEingerichtet, type BelegLesung } from "@/lib/bewirtung/lesen";
import { entwurfAnlegen } from "@/lib/bewirtung/db";

/**
 * Nimmt das Belegfoto vom Handy entgegen, lässt es von Claude lesen und legt
 * einen Entwurf an. Das Handy verkleinert vorher auf höchstens 2200 Pixel.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOECHSTENS = 6 * 1024 * 1024;

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const datei = form?.get("foto");
  if (!(datei instanceof File)) return NextResponse.json({ ok: false, fehler: "Kein Foto." }, { status: 400 });
  if (datei.size > HOECHSTENS) return NextResponse.json({ ok: false, fehler: "Das Foto ist zu groß." }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(datei.type)) {
    return NextResponse.json({ ok: false, fehler: "Bitte ein Foto (JPEG oder PNG)." }, { status: 415 });
  }

  const b64 = Buffer.from(await datei.arrayBuffer()).toString("base64");

  // Lesen darf scheitern: Dann gibt Florian die Zahlen eben selbst ein.
  let lesung: BelegLesung | null = null;
  let hinweis: string | null = null;
  if (!leserEingerichtet()) {
    hinweis = "Automatisches Lesen ist hier nicht eingerichtet. Bitte die Angaben selbst eintragen.";
  } else {
    try {
      lesung = await belegLesen(b64, datei.type);
    } catch (f) {
      console.error("[bewirtung] Lesen:", f);
      hinweis = "Der Beleg konnte nicht automatisch gelesen werden. Bitte die Angaben selbst eintragen.";
    }
  }

  try {
    const e = await entwurfAnlegen(b64, datei.type, lesung, b!.name);
    return NextResponse.json({ ok: true, id: e.id, doppelt: e.doppelt, hinweis });
  } catch (f) {
    console.error("[bewirtung] Speichern:", f);
    return NextResponse.json({ ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
