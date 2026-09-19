import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { zugang } from "@/lib/wein/db";
import { rechnungsPdf } from "@/lib/wein/rechnung";

/** Das PDF einer Weinrechnung, frisch aus lexoffice. Nur für Florian. */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const z = await zugang(await angemeldeterBenutzer());
  if (!z.verwalten) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Unbekannt", { status: 404 });
  const r = (await db()`select lexoffice_id, nummer from wein_rechnung where id = ${id}`) as Array<{ lexoffice_id: string; nummer: string }>;
  if (!r[0]?.lexoffice_id) return new Response("Unbekannt", { status: 404 });
  const pdf = await rechnungsPdf(r[0].lexoffice_id);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Rechnung-${r[0].nummer}.pdf"` },
  });
}
