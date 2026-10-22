import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { verlangeWhatsApp } from "@/lib/db/whatsapp";

/**
 * Ein Bild, eine Sprachnachricht oder eine Datei aus WhatsApp ausliefern.
 *
 * Meta schickt uns im Webhook nicht die Datei, sondern nur ihre Kennung.
 * Die steht seit jeher in der Rohmeldung, nur hat sie niemand abgeholt:
 * Im Posteingang stand "[Bild]" und sonst nichts (Florian, 22.10.2026).
 *
 * Beim ersten Ansehen holen wir die Datei einmal bei Meta und legen eine
 * eigene Kopie an. Zwei Gründe, warum nicht jedes Mal frisch geholt wird:
 * Meta löscht seine Dateien nach 30 Tagen, und jeder Blick würde sonst
 * zwei Anfragen nach draussen kosten. Danach kommt sie aus der eigenen
 * Ablage, auch in einem Jahr noch.
 *
 * Angemeldet sein muss man dafür, und zwar mit dem WhatsApp-Recht: Es
 * sind Gästefotos, nicht selten Zahlungsbelege.
 */

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v25.0";

/** Die Kennung der Datei aus der Rohmeldung herausziehen. */
function medienKennung(roh: unknown): { id: string; art: string } | null {
  if (!roh || typeof roh !== "object") return null;
  const n = roh as Record<string, unknown>;
  const typ = typeof n.type === "string" ? n.type : "";
  const teil = n[typ];
  if (!teil || typeof teil !== "object") return null;
  const t = teil as Record<string, unknown>;
  const id = typeof t.id === "string" ? t.id : "";
  if (!id) return null;
  return { id, art: typeof t.mime_type === "string" ? t.mime_type : "application/octet-stream" };
}

/** Eine Endung, damit die Datei beim Herunterladen einen brauchbaren Namen hat. */
function endung(art: string): string {
  const k = art.split(";")[0].trim();
  const bekannt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "application/pdf": "pdf",
  };
  return bekannt[k] ?? "bin";
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await verlangeWhatsApp();
  const { id } = await ctx.params;

  const [zeile] = (await db()`
    select id, typ, medien_url, medien_art, roh
      from wa_nachricht where id = ${id}::uuid
  `) as Array<Record<string, unknown>>;

  if (!zeile) return NextResponse.json({ fehler: "Diese Nachricht gibt es nicht." }, { status: 404 });

  // Schon einmal geholt: direkt auf die eigene Kopie.
  if (zeile.medien_url) return NextResponse.redirect(String(zeile.medien_url));

  const kennung = medienKennung(zeile.roh);
  if (!kennung) {
    return NextResponse.json({ fehler: "Zu dieser Nachricht gehört keine Datei." }, { status: 404 });
  }

  const token = process.env.WHATSAPP_ZUGANGSTOKEN;
  if (!token) {
    return NextResponse.json(
      { fehler: "WHATSAPP_ZUGANGSTOKEN fehlt, ohne ihn gibt Meta die Datei nicht heraus." },
      { status: 503 },
    );
  }

  try {
    /*
      Zwei Schritte, so will es Meta: erst die Adresse erfragen, dann die
      Datei holen. Die Adresse gilt nur wenige Minuten und nur mit
      demselben Schlüssel im Kopf, ein Weiterreichen an den Browser
      brächte also nichts.
    */
    const auskunft = await fetch(`${GRAPH}/${encodeURIComponent(kennung.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!auskunft.ok) {
      const text = await auskunft.text().catch(() => "");
      const alt = auskunft.status === 404 || /not exist|deleted/i.test(text);
      return NextResponse.json(
        {
          fehler: alt
            ? "Meta hat diese Datei nicht mehr. Dateien werden dort nach 30 Tagen gelöscht."
            : `Meta antwortet mit ${auskunft.status}.`,
        },
        { status: alt ? 410 : 502 },
      );
    }
    const d = (await auskunft.json()) as { url?: string; mime_type?: string };
    if (!d.url) return NextResponse.json({ fehler: "Meta nennt keine Adresse." }, { status: 502 });

    const datei = await fetch(d.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!datei.ok) {
      return NextResponse.json({ fehler: `Die Datei kam nicht an (${datei.status}).` }, { status: 502 });
    }
    const inhalt = Buffer.from(await datei.arrayBuffer());
    const art = d.mime_type ?? kennung.art;

    /*
      Die eigene Kopie. Scheitert sie, wird die Datei trotzdem angezeigt:
      Lieber einmal mehr bei Meta fragen als dem Gast gar nicht antworten
      können.
    */
    let eigene: string | null = null;
    try {
      const abgelegt = await put(`whatsapp/${id}.${endung(art)}`, inhalt, {
        access: "public",
        contentType: art,
        addRandomSuffix: true,
      });
      eigene = abgelegt.url;
      await db()`
        update wa_nachricht set medien_url = ${eigene}, medien_art = ${art} where id = ${id}::uuid
      `;
    } catch (f) {
      console.warn("[whatsapp] Kopie nicht abgelegt:", id, f);
    }

    return new NextResponse(new Uint8Array(inhalt), {
      headers: {
        "content-type": art,
        "cache-control": eigene ? "private, max-age=86400" : "private, max-age=300",
      },
    });
  } catch (f) {
    console.error("[whatsapp] Datei nicht geholt:", id, f);
    return NextResponse.json({ fehler: (f as Error).message }, { status: 502 });
  }
}
