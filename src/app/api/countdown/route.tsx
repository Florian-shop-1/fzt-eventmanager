import { ImageResponse } from "next/og";

/**
 * Der Countdown als Bild.
 *
 * In einer E-Mail läuft kein Javascript, eine wirklich tickende Uhr gibt
 * es dort nicht. Was geht: ein Bild, das der Server in dem Moment malt, in
 * dem die Mail geöffnet wird. Der Gast sieht also beim Öffnen die echte
 * Restzeit (Florian, 23.09.2026).
 *
 * Ehrlich dazu: Manche Mailprogramme, allen voran Gmail, legen Bilder in
 * ihren eigenen Zwischenspeicher. Dort bleibt die Zeit stehen, die beim
 * ersten Öffnen galt. Deshalb steht die Uhrzeit des Ablaufs zusätzlich als
 * Text in der Mail, damit niemand im Unklaren ist.
 *
 * Aufruf: /api/countdown?bis=2026-09-24T18:42:00.000Z
 */

export const runtime = "edge";
export const dynamic = "force-dynamic";

const GOLD = "#c9a45c";
const DUNKEL = "#1d1b18";

export async function GET(request: Request) {
  const bis = new URL(request.url).searchParams.get("bis");
  const ziel = bis ? Date.parse(bis) : NaN;
  const uebrig = Number.isFinite(ziel) ? ziel - Date.now() : 0;

  const stunden = Math.max(0, Math.floor(uebrig / 3600000));
  const minuten = Math.max(0, Math.floor((uebrig % 3600000) / 60000));
  const abgelaufen = uebrig <= 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: DUNKEL,
          color: GOLD,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#8a8378" }}>
          {abgelaufen ? "Angebot abgelaufen" : "Dein Angebot endet in"}
        </div>
        {!abgelaufen && (
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 14 }}>
            <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1 }}>{stunden}</span>
            <span style={{ fontSize: 28, margin: "0 22px 12px 8px" }}>Std</span>
            <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1 }}>{minuten}</span>
            <span style={{ fontSize: 28, margin: "0 0 12px 8px" }}>Min</span>
          </div>
        )}
      </div>
    ),
    { width: 600, height: 200, headers: { "cache-control": "no-store, max-age=0" } },
  );
}
