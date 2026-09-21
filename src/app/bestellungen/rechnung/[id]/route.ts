import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { zugang } from "@/lib/wein/db";
import { rechnungsPdf } from "@/lib/wein/rechnung";

/** Das PDF einer Weinrechnung, so wie es verschickt wurde. Nur für Florian. */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const z = await zugang(await angemeldeterBenutzer());
  if (!z.verwalten) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Unbekannt", { status: 404 });
  const pdf = await rechnungsPdf(id);
  if (!pdf) return new Response("Für diese Rechnung liegt kein PDF vor.", { status: 404 });
  const r = (await db()`select nummer from wein_rechnung where id = ${id}`) as Array<{ nummer: string | null }>;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r[0]?.nummer ?? "Rechnung"}.pdf"`,
    },
  });
}
