import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { sitzAuschecken, sitzEinchecken } from "@/lib/db/sitzeinchecken";

/**
 * Ein Platz wird von Hand durch-x-t oder das X wieder zurückgenommen.
 *
 * Genauso schlank wie /upgrades/setzen: getippt wird auf dem Tablet,
 * nicht abgeschickt, gespeichert wird trotzdem sofort auf dem Server,
 * damit ein zweites Tablet denselben Stand sieht.
 */

export const dynamic = "force-dynamic";

interface Anfrage {
  eventId?: string;
  sitzId?: number;
}

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d?.eventId || !Number.isFinite(d.sitzId)) {
    return NextResponse.json({ ok: false, fehler: "Unvollständige Angaben." }, { status: 400 });
  }

  await sitzEinchecken(d.eventId, Number(d.sitzId), b.name);

  revalidatePath("/upgrades");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d?.eventId || !Number.isFinite(d.sitzId)) {
    return NextResponse.json({ ok: false, fehler: "Unvollständige Angaben." }, { status: 400 });
  }

  await sitzAuschecken(d.eventId, Number(d.sitzId));

  revalidatePath("/upgrades");
  return NextResponse.json({ ok: true });
}
