import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { umsetzungEntfernen, umsetzungSpeichern } from "@/lib/db/upgradeumsetzung";
import { platzEintragen } from "@/lib/db/gaesteliste";

/**
 * Der Einlass setzt am Tablet eine Gruppe um.
 *
 * Absichtlich eine schlanke Adresse statt eines Formulars: Auf dem Tablet
 * wird angetippt, nicht abgeschickt, und die Zeichnung soll ohne Neuladen
 * weitergehen. Gespeichert wird trotzdem auf dem Server, damit alle
 * dasselbe sehen, auch das zweite Tablet am anderen Eingang.
 */

export const dynamic = "force-dynamic";

interface Anfrage {
  eventId?: string;
  schluessel?: string;
  art?: "gruppe" | "gast";
  quelleText?: string;
  zielText?: string;
  zielIds?: number[];
  personen?: number;
  gastId?: string;
  gastName?: string;
}

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d?.eventId || !d.schluessel || !d.zielText) {
    return NextResponse.json({ ok: false, fehler: "Unvollständige Angaben." }, { status: 400 });
  }

  await umsetzungSpeichern({
    ditixEventId: d.eventId,
    schluessel: d.schluessel,
    art: d.art === "gast" ? "gast" : "gruppe",
    quelleText: (d.quelleText ?? "").slice(0, 200),
    zielText: d.zielText.slice(0, 200),
    zielIds: (d.zielIds ?? []).map(Number).filter(Number.isFinite),
    personen: Number(d.personen ?? 0),
    gastName: (d.gastName ?? "").slice(0, 80),
    von: b.name,
  });

  // Gäste von der Gästeliste haben ihr eigenes Platzfeld. Es wird
  // mitgeführt, damit Foyer und Einlassliste denselben Platz zeigen.
  if (d.art === "gast" && d.gastId) {
    await platzEintragen(d.gastId, d.zielText.slice(0, 60), b.name).catch(() => undefined);
  }

  revalidatePath("/upgrades");
  revalidatePath("/gaesteliste");
  revalidatePath("/einlassliste");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d?.eventId || !d.schluessel) {
    return NextResponse.json({ ok: false, fehler: "Unvollständige Angaben." }, { status: 400 });
  }
  await umsetzungEntfernen(d.eventId, d.schluessel);
  if (d.art === "gast" && d.gastId) await platzEintragen(d.gastId, "", b.name).catch(() => undefined);

  revalidatePath("/upgrades");
  revalidatePath("/gaesteliste");
  revalidatePath("/einlassliste");
  return NextResponse.json({ ok: true });
}
