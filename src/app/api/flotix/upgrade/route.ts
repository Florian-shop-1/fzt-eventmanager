import { NextResponse } from "next/server";
import { findeTermin } from "@/lib/ditix/spielplan";
import { holeSaalplanFlotix } from "@/lib/ditix/saalplan";
import { flotixSitzgruppen, sitzSchluessel } from "@/lib/flotix/tuer";
import { empfehlung } from "@/lib/seating/upgrade";

/**
 * Soll diese Bestellung beim Einlass nach vorn gesetzt werden? (Florian, 29.10.2026)
 *
 * FloTix fragt beim Scannen am Einlass: Steht diese Bestellung auf dem Upgrade-Plan, und wohin kommt sie? Die Antwort ist genau
 * der Plan der Seite "Upgrades" (dieselbe Rechnung, kein zweiter Algorithmus). Der Mitarbeiter bekommt den Hinweis auf dem iPad
 * und setzt den Gast an der Upgrade-Seite von Hand um.
 *
 * Nur lesend, geschuetzt ueber denselben Schluessel wie /api/flotix/meldung (FLOTIX_KEY, Kopf x-eventmanager-key).
 *
 *   GET ?vorstellung=<FloTix-Kennung>&bestellung=<Bestellnummer>
 *   200 { ok: true, treffer: [{ buchstabe, gaeste, von, nach }] }   (leer: Bestellung steht nicht auf dem Plan)
 */

export const dynamic = "force-dynamic";

const buchstabe = (i: number) => String.fromCharCode(65 + i);
const plaetzeText = (b: { reihe: { nummer: string }; von: string; bis: string }) =>
  `Reihe ${b.reihe.nummer}, ${b.von === b.bis ? `Platz ${b.von}` : `Platz ${b.von} bis ${b.bis}`}`;

export async function GET(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const url = new URL(request.url);
  const vorstellung = url.searchParams.get("vorstellung") ?? "";
  const bestellung = (url.searchParams.get("bestellung") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(vorstellung) || !bestellung) {
    return NextResponse.json({ ok: false, fehler: "angaben_fehlen" }, { status: 400 });
  }

  try {
    const termin = await findeTermin(vorstellung);
    if (!termin?.seatmapEventId) return NextResponse.json({ ok: true, treffer: [], hinweis: "kein Saalplan" });

    const [plan, buchungen] = await Promise.all([
      holeSaalplanFlotix(termin.seatmapEventId),
      flotixSitzgruppen(vorstellung),
    ]);
    const rat = empfehlung(plan, buchungen);

    const treffer = rat.umzuege.flatMap((u, i) => {
      const gruppen = new Set(
        u.gruppe.sitze.map((s) => buchungen.get(sitzSchluessel({ sektor: s.sektor, reihe: s.reihe, name: s.name }))).filter(Boolean),
      );
      if (!gruppen.has(bestellung)) return [];
      return [{
        buchstabe: buchstabe(i),
        gaeste: u.gruppe.sitze.length,
        von: plaetzeText(u.gruppe),
        nach: [plaetzeText(u.ziel), ...(u.ziel2 ? [plaetzeText(u.ziel2)] : [])].join(" und "),
      }];
    });

    return NextResponse.json({ ok: true, treffer });
  } catch (fehler) {
    console.error("[flotix/upgrade]", fehler);
    return NextResponse.json({ ok: false, fehler: "nicht_lesbar" }, { status: 502 });
  }
}
