import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { sperreAufheben } from "@/lib/db/essplatz";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { empfaenger } from "@/lib/flotix/option-erinnerung";

/**
 * FloTix meldet, dass jemand im Backend Plätze einer Firmenanfrage von Hand freigegeben hat (Florian, 29.10.2026).
 *
 * Am Angebot steht, wie viele Plätze gehalten sind und bis wann, und die Kundenseite liest es von dort. Ohne diese Meldung
 * verspricht das Angebot Plätze, die längst jemandem anderes gehören können. Hier wird es richtiggestellt, und Kevin und
 * das Büro bekommen eine Mail, damit sie dem Kunden nichts Falsches sagen.
 *
 * Geschützt wie die anderen Meldungen von FloTix (Schlüssel im Kopf x-eventmanager-key).
 */

export const dynamic = "force-dynamic";

const APP = process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de";

interface Meldung {
  vorgang?: string;
  firma?: string;
  freigegeben?: number;
  verbleibend?: number;
  plaetze?: string[];
  wer?: string;
  abend?: string;
}

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const m = (await request.json().catch(() => ({}))) as Meldung;
  const nummer = String(m.vorgang ?? "").trim().slice(0, 40);
  if (!nummer) return NextResponse.json({ ok: false, fehler: "vorgang_fehlt" }, { status: 400 });

  const freigegeben = Math.max(0, Math.round(Number(m.freigegeben ?? 0)));
  const verbleibend = Math.max(0, Math.round(Number(m.verbleibend ?? 0)));

  const [v] = (await db()`
    select v.id::text as id, coalesce(k.name, '') as firma
      from vorgang v left join kunde k on k.id = v.kunde_id
     where v.nummer = ${nummer}
  `.catch(() => [])) as Array<{ id: string; firma: string }>;

  // Das Angebot richtigstellen: gehalten ist nur noch, was in FloTix tatsächlich blockiert bleibt.
  if (v) {
    await db()`
      update angebot
         set plaetze_gehalten = ${verbleibend},
             plaetze_bis = case when ${verbleibend}::int > 0 then plaetze_bis else null end
       where id = (
         select a.id from angebot a
          where a.vorgang_id = ${v.id}::uuid and a.abgelehnt_am is null and a.angenommen_am is null
          order by a.erstellt_am desc limit 1
       )
    `.catch((f) => console.warn("[option-frei] Angebot nicht angepasst:", f));
    // Bleibt von den Showplätzen nichts mehr blockiert, gibt es auch den Platz am Tisch nicht mehr (wie beim Freigeben hier).
    if (verbleibend === 0) await sperreAufheben(v.id).catch(() => undefined);
    revalidatePath(`/vorgaenge/${v.id}`);
  }

  const firma = (m.firma ?? "").trim() || v?.firma || "eine Firmenanfrage";
  const text = [
    `Im FloTix-Backend wurde die Blockierung für ${firma} aufgehoben${m.wer ? ` (von ${m.wer})` : ""}.`,
    "",
    m.abend ? `Abend: ${m.abend}` : "",
    `Freigegeben: ${freigegeben} ${freigegeben === 1 ? "Platz" : "Plätze"}`,
    ...(m.plaetze ?? []).slice(0, 40).map((p) => `  ${p}`),
    verbleibend > 0 ? `Weiterhin blockiert: ${verbleibend} ${verbleibend === 1 ? "Platz" : "Plätze"}` : "Es ist nichts mehr für diesen Vorgang blockiert.",
    "",
    v
      ? verbleibend > 0
          ? "Am Angebot steht jetzt die kleinere Zahl der gehaltenen Plätze."
          : "Am Angebot steht jetzt: keine Plätze gehalten. Wer die Plätze weiter möchte, muss sie hier im Vorgang neu blockieren."
      : `Zu ${nummer} gibt es hier keinen Vorgang. Bitte nachsehen.`,
    v ? `Vorgang öffnen: ${APP}/vorgaenge/${v.id}` : "",
    "",
    "Die Plätze können ab jetzt von anderen gekauft werden.",
  ]
    .filter((z, i, a) => z !== "" || (a[i - 1] ?? "x") !== "")
    .join("\n");

  for (const an of empfaenger()) {
    await mailVerschicken({
      an,
      absender: postfachPersonal(),
      antwortAn: antwortPersonal(),
      betreff: `Blockierung aufgehoben: ${firma} (${freigegeben} ${freigegeben === 1 ? "Platz" : "Plätze"})`,
      text,
    }).catch((f) => console.error("[option-frei] Mail an", an, "fehlgeschlagen:", f));
  }

  console.log("[flotix] Option freigegeben:", nummer, freigegeben, "übrig", verbleibend);
  return NextResponse.json({ ok: true });
}
