/**
 * Allergien und Unverträglichkeiten aus den FloTix-Bestellungen eines Tages (Florian, 27.10.2026): "wir wollen nicht, dass
 * jemand umkippt".
 *
 * Der Gast gibt sie im Menüschritt je Menü an. FloTix speichert sie an der Position und an der Bestellung. Bisher las der
 * Eventmanager sie nirgends: Funktionsheet und Küche zeigten nur, was der Shop beim Übergang zur Kasse als Freitext
 * gemeldet hat, und das ist bei FloTix leer. Hier werden sie für einen Showtag zusammengesucht.
 */

import { flotixBestellungen, flotixQuelle, type FlotixBestellung } from "@/lib/flotix/tuer";
import { isoDatum } from "@/lib/zeit";

export interface AllergieEintrag {
  bestellnummer: string;
  gast: string;
  telefon: string | null;
  /** Uhrzeit der Show, an der die Bestellung hängt. */
  uhrzeit: string;
  /** Für welches Menü, falls der Gast es angegeben hat. */
  menue: string | null;
  text: string;
}

export interface AllergienDesTages {
  /** false, wenn FloTix nicht gelesen werden konnte: Dann darf die Küche nicht glauben, es gäbe keine Angaben. */
  gelesen: boolean;
  eintraege: AllergieEintrag[];
}

const MENUE = /men(ü|ue)|gang/i;

/** Aus dem, was an der Position steht, die einzelnen Angaben: je Portion eine, oder ein Text. */
function angaben(roh: unknown): string[] {
  if (roh === null || roh === undefined) return [];
  if (typeof roh === "string") return roh.trim() ? [roh.trim()] : [];
  if (Array.isArray(roh)) return roh.flatMap(angaben);
  if (typeof roh === "object") return Object.values(roh as Record<string, unknown>).flatMap(angaben);
  return [];
}

function einBeleg(b: FlotixBestellung): AllergieEintrag[] {
  const gast = [b.vorname, b.nachname].filter(Boolean).join(" ") || b.firma || b.email || "ohne Namen";
  const uhrzeit = new Date(b.beginn).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const basis = { bestellnummer: b.bestellnummer, gast, telefon: b.telefon, uhrzeit };

  const eintraege: AllergieEintrag[] = [];
  const gesehen = new Set<string>();
  for (const p of b.positionen) {
    if (p.menge <= 0 || !MENUE.test(p.bezeichnung)) continue;
    for (const text of angaben(p.allergien)) {
      eintraege.push({ ...basis, menue: p.bezeichnung.replace(/\s+/g, " ").trim(), text });
      gesehen.add(text.toLowerCase());
    }
  }
  // Die Angabe zur ganzen Bestellung, wenn sie nicht schon je Menü dasteht.
  const ganze = (b.allergien ?? "").trim();
  if (ganze && !gesehen.has(ganze.toLowerCase())) eintraege.push({ ...basis, menue: null, text: ganze });
  return eintraege;
}

export async function allergienFuerTag(datum: string): Promise<AllergienDesTages> {
  if (!flotixQuelle()) return { gelesen: false, eintraege: [] };
  let alle: FlotixBestellung[];
  try {
    alle = await flotixBestellungen();
  } catch (e) {
    console.error("[allergien] FloTix nicht erreichbar:", e);
    return { gelesen: false, eintraege: [] };
  }
  const eintraege = alle
    .filter((b) => b.bezahltAm && !b.storniertAm && isoDatum(new Date(b.beginn)) === datum)
    .flatMap(einBeleg)
    .sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit) || a.gast.localeCompare(b.gast, "de"));
  return { gelesen: true, eintraege };
}
