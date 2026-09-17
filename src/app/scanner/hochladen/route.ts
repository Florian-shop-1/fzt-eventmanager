import { NextResponse } from "next/server";
import { scannerBenutzer } from "@/lib/scanner/zugang";
import { fotoVerarbeiten } from "@/lib/scanner/ablauf";

/**
 * Nimmt ein Kartenfoto vom Handy entgegen. Das Handy verkleinert vorher auf
 * höchstens 1800 Pixel, damit das Hochladen auch im Foyer-WLAN schnell geht.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOECHSTENS = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const benutzer = await scannerBenutzer();
  if (!benutzer) return NextResponse.json({ ok: false, fehler: "Nicht angemeldet." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const datei = form?.get("foto");
  if (!(datei instanceof File)) return NextResponse.json({ ok: false, fehler: "Kein Foto." }, { status: 400 });
  if (datei.size > HOECHSTENS) return NextResponse.json({ ok: false, fehler: "Das Foto ist zu groß." }, { status: 413 });
  if (datei.type !== "image/jpeg") return NextResponse.json({ ok: false, fehler: "Nur JPEG." }, { status: 415 });

  const b64 = Buffer.from(await datei.arrayBuffer()).toString("base64");
  try {
    const e = await fotoVerarbeiten(b64, { id: benutzer.id, name: benutzer.name });
    if (e.doppeltesFoto) return NextResponse.json({ ok: true, doppelt: true });
    const k = e.karte;
    return NextResponse.json({
      ok: true,
      doppelt: false,
      hinweis: e.hinweis ?? null,
      karte: k && { id: k.id, status: k.status, vorname: k.vorname, nachname: k.nachname, email: k.email, grund: k.grund },
    });
  } catch (f) {
    console.error("[scanner] Hochladen:", f);
    return NextResponse.json({ ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
