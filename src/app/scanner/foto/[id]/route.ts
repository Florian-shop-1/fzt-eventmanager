import { scannerBenutzer } from "@/lib/scanner/zugang";
import { fotoBytes } from "@/lib/db/scanner";

/** Das Kartenfoto für die Prüfansicht. Nur für angemeldete Scanner-Benutzer. */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await scannerBenutzer())) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Unbekannt", { status: 404 });
  const bild = await fotoBytes(id);
  if (!bild) return new Response("Foto gelöscht", { status: 404 });
  return new Response(new Uint8Array(bild), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
