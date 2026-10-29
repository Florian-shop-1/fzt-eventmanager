/**
 * Abonnierbarer Kalender (Florian, 29.10.2026): "bitte aktualisiere meinen kalender in outlook immer automatisch, wenn neue
 * shows eingestellt werden oder abgesagt werden".
 *
 * Outlook holt sich diese Adresse selbst in regelmäßigen Abständen und ersetzt den Inhalt. Dadurch kommt jede neue Vorstellung
 * von allein hinein, und eine abgesagte verschwindet. Eingetragen wird nichts: Die Quelle ist immer der Spielplan des Shops und die
 * Tabelle der Auswärtstermine, also genau das, woraus auch die Kollisionsmail kommt.
 *
 * Die Adresse ist geheim (Schlüssel aus CRON_SECRET), der Kalender enthält nur Termine, keine Gäste.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { showtageAbHeute } from "@/lib/ditix/spielplan";
import { fremdtermine, kollisionen } from "@/lib/personal/fremdtermin";

export function kalenderSchluessel(): string | null {
  const geheim = process.env.CRON_SECRET;
  if (!geheim) return null;
  return createHmac("sha256", geheim).update("kalender-florian").digest("hex").slice(0, 32);
}

export function schluesselPasst(gegeben: string): boolean {
  const richtig = kalenderSchluessel();
  if (!richtig || gegeben.length !== richtig.length) return false;
  return timingSafeEqual(Buffer.from(gegeben), Buffer.from(richtig));
}

/** Berliner Wandzeit als UTC-Zeitpunkt. */
function berlinZuUtc(datum: string, uhr: string): Date {
  const [j, m, t] = datum.split("-").map(Number);
  const [h, min] = uhr.split(":").map(Number);
  const roh = Date.UTC(j, m - 1, t, h, min);
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(roh));
  const w = (n: string) => Number(teile.find((p) => p.type === n)?.value);
  const alsBerlin = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute"));
  return new Date(roh - (alsBerlin - roh));
}

const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** Zeilen länger als 75 Zeichen werden laut Norm umbrochen. */
const falten = (zeile: string): string => {
  const teile: string[] = [];
  let rest = zeile;
  while (rest.length > 74) { teile.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  teile.push(rest);
  return teile.join("\r\n");
};

export async function kalenderText(): Promise<string> {
  const [shows, ulm, konflikte] = await Promise.all([
    showtageAbHeute(400).catch(() => []),
    fremdtermine(),
    kollisionen().catch(() => []),
  ]);
  const showKonflikt = new Set(konflikte.map((k) => `${k.datum}|${k.showzeit}`));
  const ulmKonflikt = new Set(konflikte.map((k) => k.termin.id));
  const stempel = z(new Date());

  const zeilen = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Florian Zimmer Theater//Eventmanager//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Florian Zimmer Theater und Theater Ulm", "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];

  for (const s of shows) {
    const von = s.beginn;
    const bis = new Date(von.getTime() + 150 * 60000);
    const kollidiert = showKonflikt.has(`${s.datum}|${s.uhrzeit}`);
    zeilen.push(
      "BEGIN:VEVENT", `UID:show-${s.ditixEventId}@florianzimmertheater.de`, `DTSTAMP:${stempel}`,
      `DTSTART:${z(von)}`, `DTEND:${z(bis)}`,
      `SUMMARY:${esc((kollidiert ? "⚠ KOLLISION: " : "") + s.name)}`,
      "LOCATION:Florian Zimmer Theater\\, Neu-Ulm",
      ...(kollidiert ? ["DESCRIPTION:Diese Vorstellung kollidiert mit einem Termin im Theater Ulm."] : []),
      "END:VEVENT",
    );
  }

  for (const t of ulm) {
    if (!t.von || !t.bis) continue;
    const kollidiert = ulmKonflikt.has(t.id);
    zeilen.push(
      "BEGIN:VEVENT", `UID:ulm-${t.id}@florianzimmertheater.de`, `DTSTAMP:${stempel}`,
      `DTSTART:${z(berlinZuUtc(t.datum, t.von))}`, `DTEND:${z(berlinZuUtc(t.datum, t.bis))}`,
      `SUMMARY:${esc((kollidiert ? "⚠ KOLLISION: " : "") + `Theater Ulm: ${t.art || "Termin"}`)}`,
      `LOCATION:${esc(["Theater Ulm", t.raum].filter(Boolean).join(", "))}`,
      "END:VEVENT",
    );
  }

  zeilen.push("END:VCALENDAR");
  return zeilen.map(falten).join("\r\n") + "\r\n";
}
