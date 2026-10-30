import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { alsHtml } from "@/lib/mail/html";
import { fusszeileHtml } from "@/lib/mail/fusszeile";

/**
 * Die Mail so zeigen, wie sie ankommt.
 *
 * "Zeig am besten auch die Vorschau der mail, bevor man abschickt!"
 * (Florian, 30.10.2026).
 *
 * Im Textfeld steht nur der Brief. Alles andere, Knöpfe, Fußzeile,
 * Unterschrift, Bewertungslinks, hängt der Eventmanager darunter, und
 * genau das sah man vorher nicht. Wer abschickt, soll vorher dasselbe
 * sehen wie der Kunde.
 *
 * Gebaut wird hier dasselbe HTML wie beim Versand, über dieselbe
 * Funktion. Zwei Fassungen, die auseinanderlaufen können, wären
 * schlimmer als keine Vorschau.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const d = (await request.json().catch(() => ({}))) as {
    text?: string;
    link?: string;
    angebote?: Array<{ titel?: string; href?: string }>;
  };

  const angebote = (d.angebote ?? [])
    .map((a) => ({ titel: String(a.titel ?? "").trim(), href: String(a.href ?? "").trim() }))
    .filter((a) => a.href);

  const erstes = angebote[0]?.href ?? String(d.link ?? "").trim();

  const html = alsHtml(String(d.text ?? ""), {
    ...(angebote.length > 0 ? { angebote } : erstes ? { link: erstes } : {}),
    fuss: fusszeileHtml(),
    ...(erstes
      ? {
          nebenlink: {
            href: `${erstes}#aenderung`,
            text: "Passt etwas noch nicht? Änderungswunsch schicken",
          },
        }
      : {}),
  });

  return new NextResponse(
    `<!doctype html><html lang="de"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{margin:0;padding:20px;background:#f4f2ee}</style></head>` +
      `<body>${html}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
