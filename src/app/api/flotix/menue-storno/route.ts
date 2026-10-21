import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

/**
 * FloTix storniert ein Menü oder Extra aus der Ditix-Zeit.
 *
 * Diese Bestellungen leben in der Menüliste der Google-Tabelle, nicht in
 * FloTix. Wird eine davon im FloTix-Backend storniert, muss der
 * Eventmanager sie genauso streichen wie beim Storno in der Küche: Es
 * kommt derselbe Eintrag in menue_storno (Florian, 21.10.2026), und alle
 * Zählungen, Funktionsheets und Küchenlisten lassen die Bestellung weg.
 *
 * Geschützt wie die Meldungsroute (FLOTIX_KEY, Kopf x-eventmanager-key).
 *
 * Antworten:
 *   200  Eingetragen (oder zurückgenommen, bei zurueck: true).
 *   400  Keine Bestellung angegeben.
 *   401  Schlüssel fehlt oder stimmt nicht.
 *   503  Hier ist kein Schlüssel eingerichtet.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) {
    return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  }
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const b = (await request.json().catch(() => ({}))) as {
    bestellung?: string;
    ditixEventId?: string;
    kunde?: string;
    grund?: string;
    wer?: string;
    zurueck?: boolean;
  };
  const bestellung = String(b.bestellung ?? "").trim().slice(0, 60);
  if (!bestellung) return NextResponse.json({ ok: false, fehler: "keine Bestellung" }, { status: 400 });

  if (b.zurueck === true) {
    await db()`delete from menue_storno where bestellung = ${bestellung}`;
    return NextResponse.json({ ok: true, zurueck: true });
  }

  await db()`
    insert into menue_storno (bestellung, ditix_event_id, kunde, grund, wer)
    values (${bestellung}, ${String(b.ditixEventId ?? "").slice(0, 60)}, ${String(b.kunde ?? "").slice(0, 200)},
            ${String(b.grund ?? "Im FloTix-Backend storniert").slice(0, 300)}, ${String(b.wer ?? "FloTix").slice(0, 100)})
    on conflict (bestellung) do update
      set art = 'storno', classic = null, sea = null, veggy = null, kids = null,
          grund = excluded.grund, wer = excluded.wer, wann = now()
  `;
  return NextResponse.json({ ok: true });
}
