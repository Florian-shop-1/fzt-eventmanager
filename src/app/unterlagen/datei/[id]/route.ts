import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { unterlageLesen } from "@/lib/db/unterlagen";

/**
 * Eine Personalunterlage, unverändert wie abgelegt.
 *
 * Nur für die, die auch die Arbeitsverträge sehen: Werner, Kevin,
 * Florian. Nichts wird zwischengespeichert, was ein anderer Browser
 * später noch zu sehen bekäme.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_anfrage: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!darfVertraege(await angemeldeterBenutzer())) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  const datei = await unterlageLesen(id);
  if (!datei) return new Response("Unbekannt", { status: 404 });

  return new Response(new Uint8Array(datei.bytes), {
    headers: {
      "Content-Type": datei.typ,
      "Content-Disposition": `inline; filename="${datei.dateiname.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
