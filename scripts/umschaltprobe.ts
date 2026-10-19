/**
 * Probelauf fuer den Umschalttag: Was kommt zusammen, wenn QUELLE=flotix gilt?
 * Aufruf: npx tsx scripts/umschaltprobe.ts
 *
 * Aendert nichts. Liest beide Quellen und vergleicht mit dem Zustand davor.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { holeShopGruppenRoh } = await import("../src/lib/shop/rohdaten");
  const { showtageAbHeute } = await import("../src/lib/ditix/spielplan");

  const plan = await showtageAbHeute(400);
  const kennungen = new Set(plan.map((t) => t.ditixEventId));
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  delete process.env.QUELLE;
  const vorher = await holeShopGruppenRoh();

  process.env.QUELLE = "flotix";
  const nachher = await holeShopGruppenRoh();

  const zaehl = (liste: typeof vorher) => {
    const imPlan = liste.filter((g) => kennungen.has(g.ditixEventId));
    return {
      gruppen: liste.length,
      tickets: liste.reduce((s, g) => s + g.tickets, 0),
      imPlan: imPlan.length,
      ticketsImPlan: imPlan.reduce((s, g) => s + g.tickets, 0),
      ohneAbend: liste.length - imPlan.length,
    };
  };

  console.log("vorher  (nur Tabelle):", zaehl(vorher));
  console.log("nachher (beide Quellen):", zaehl(nachher));
  console.log(
    "davon aus FloTix:",
    zaehl(nachher.filter((g) => g.quelle === "flotix")),
    "\naus Ditix:",
    zaehl(nachher.filter((g) => g.quelle === "ditix")),
  );

  // Die naechsten Abende im Vergleich
  const jeAbend = (liste: typeof vorher) => {
    const m = new Map<string, number>();
    for (const g of liste) {
      const t = plan.find((x) => x.ditixEventId === g.ditixEventId);
      if (!t || t.datum < heute) continue;
      m.set(`${t.datum} ${t.uhrzeit}`, (m.get(`${t.datum} ${t.uhrzeit}`) ?? 0) + g.tickets);
    }
    return m;
  };
  const a = jeAbend(vorher);
  const b = jeAbend(nachher);
  console.log("\nAbend             vorher  nachher");
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort().slice(0, 12)) {
    const v = a.get(k) ?? 0;
    const n = b.get(k) ?? 0;
    console.log(`${k}   ${String(v).padStart(4)}   ${String(n).padStart(4)}${n < v ? "   <-- WENIGER!" : ""}`);
  }
}
void main();
