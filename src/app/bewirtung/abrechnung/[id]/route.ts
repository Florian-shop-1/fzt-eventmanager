import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { auszugDatei } from "@/lib/rechnung/auszuege";

/**
 * Eine eingelesene Kartenabrechnung oder ein Kontoauszug, wie hochgeladen.
 *
 * Nur für die Buchhaltung: Darin stehen alle Umsätze des Hauses.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_anfrage: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  const datei = await auszugDatei(id);
  if (!datei) return new Response("Zu dieser Abrechnung ist keine Datei gespeichert.", { status: 404 });

  return new Response(new Uint8Array(datei.bytes), {
    headers: {
      "Content-Type": datei.typ,
      "Content-Disposition": `inline; filename="${datei.dateiname.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
