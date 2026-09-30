import { NextResponse } from "next/server";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { belegLesen, leserEingerichtet, type BelegLesung } from "@/lib/bewirtung/lesen";
import { bewirtungLesen, entwurfAnlegen, moeglicheDubletten } from "@/lib/bewirtung/db";
import { darfGesellschaftWaehlen, istGesellschaft } from "@/lib/bewirtung/gesellschaft";

/**
 * Nimmt den Beleg entgegen, lässt ihn von Claude lesen und legt einen
 * Entwurf an. Vom Handy kommt ein Foto, auf höchstens 2200 Pixel
 * verkleinert; vom Rechner oft ein PDF, das unverändert hereinkommt.
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
  /*
    Foto oder PDF.

    Das Handy schickt ein verkleinertes JPEG, der Rechner oft ein PDF:
    Rechnungen von Lieferanten, Meta oder Google kommen so per Mail.
    Beides liest dasselbe Modell, beides wird unveraendert gespeichert
    (Florian, 30.09.2026).
  */
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(datei.type)) {
    return NextResponse.json(
      { ok: false, fehler: "Bitte ein Foto (JPEG oder PNG) oder ein PDF." },
      { status: 415 },
    );
  }

  /*
    Die Firma nimmt nur an, wer sie auch waehlen darf. Sonst gilt das
    Theater, egal was im Formular steht (Florian, 28.09.2026).
  */
  const gewaehlt = form?.get("gesellschaft");
  const gesellschaft =
    darfGesellschaftWaehlen(b) && istGesellschaft(gewaehlt) ? gewaehlt : "fzt";

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
    const e = await entwurfAnlegen(b64, datei.type, lesung, b!.name, gesellschaft);
    if (!e.doppelt) {
      const neu = await bewirtungLesen(e.id);
      const gleich = neu ? await moeglicheDubletten(neu) : [];
      if (gleich.length) {
        const g = gleich[0];
        hinweis = `Achtung: Dieser Beleg ist vermutlich schon erfasst (${g.nummer ?? "Entwurf"}, ${g.restaurant}, gleiches Datum und gleicher Betrag).`;
      }
    }
    return NextResponse.json({ ok: true, id: e.id, doppelt: e.doppelt, hinweis });
  } catch (f) {
    console.error("[bewirtung] Speichern:", f);
    return NextResponse.json({ ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
