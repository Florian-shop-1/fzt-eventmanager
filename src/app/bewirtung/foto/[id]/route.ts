import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { fotoLesen } from "@/lib/bewirtung/db";

/** Das Belegfoto, unverändert wie gespeichert. Nur für die Buchhaltung. */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  const foto = await fotoLesen(id);
  if (!foto) return new Response("Unbekannt", { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: { "Content-Type": foto.typ, "Cache-Control": "private, max-age=86400" },
  });
}
