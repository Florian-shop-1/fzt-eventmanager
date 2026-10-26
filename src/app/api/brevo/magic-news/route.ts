import { NextResponse } from "next/server";

import { inMagicNews } from "@/lib/abbrecher/magic-news";
import { db } from "@/lib/db/client";

/**
 * Einen Kontakt in die Magic News eintragen, von außerhalb der Oberfläche.
 *
 * Gebraucht für die Fälle, in denen die Zustimmung nicht im Programm
 * entsteht, sondern in einer Antwortmail: "es haben schon einige
 * zurückgeschrieben ... trag die in meinen verteiler ein" (Florian,
 * 26.10.2026).
 *
 * Geschützt mit demselben Schlüssel wie der Mailversand. Wer eintragen
 * darf, darf auch im Namen des Hauses schreiben, das ist dieselbe
 * Vertrauensstufe.
 *
 * Jeder Eintrag wird mit Grund vermerkt. Wer später fragt, warum jemand
 * Post von uns bekommt, soll die Antwort im Programm finden und nicht in
 * einem Postfach suchen müssen.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const schluessel = (process.env.MAIL_SENDE_SCHLUESSEL ?? "").trim();
  if (!schluessel || request.headers.get("x-mail-schluessel") !== schluessel) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(b.email ?? "").trim().toLowerCase();
  const vorname = String(b.vorname ?? "").trim();
  const nachname = String(b.nachname ?? "").trim();
  const grund = String(b.grund ?? "").trim().slice(0, 300);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, fehler: "Keine brauchbare Adresse." }, { status: 400 });
  }
  if (!grund) {
    return NextResponse.json(
      { ok: false, fehler: "Ohne Grund wird niemand eingetragen." },
      { status: 400 },
    );
  }

  const angenommen = await inMagicNews(email, `${vorname} ${nachname}`.trim());

  await db()`
    insert into verteiler_geprueft (email, entscheidung, grund, von, am)
    values (${email}, ${angenommen ? "eingetragen" : "abgelehnt"}, ${grund}, 'Eventmanager', now())
    on conflict (email) do update
      set entscheidung = excluded.entscheidung, grund = excluded.grund, von = excluded.von, am = now()
  `.catch((f) => console.error("[brevo] Vermerk nicht gespeichert:", f));

  return NextResponse.json({ ok: angenommen, email, grund });
}
