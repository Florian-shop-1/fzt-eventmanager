/**
 * Allergien und Unverträglichkeiten aus den FloTix-Bestellungen eines Tages (Florian, 27.10.2026): "wir wollen nicht, dass
 * jemand umkippt".
 *
 * Der Gast gibt sie im Menüschritt je Menü an. FloTix speichert sie an der Position und an der Bestellung. Bisher las der
 * Eventmanager sie nirgends: Funktionsheet und Küche zeigten nur, was der Shop beim Übergang zur Kasse als Freitext
 * gemeldet hat, und das ist bei FloTix leer. Hier werden sie für einen Showtag zusammengesucht.
 *
 * Zwei Dinge hängen an jedem Eintrag, und ohne sie nützt er wenig (Florian, 27.10.2026):
 *
 * 1. Die Menüvariante. "eine nussallergie zu wissen bringt ja nix, wenn man nicht weis ob man beim sea, kids, veeggy
 *    oder classic menü drauf rücksicht nehmen soll."
 * 2. Die Gruppe, in der der Gast sitzt. Über `gruppeId` findet das Funktionsheet den Tisch, an dem die Angabe hängt,
 *    und schreibt sie dort hin, wo der Service hinsieht.
 */

import { flotixBestellungen, flotixQuelle, zaehltMit, type FlotixBestellung } from "@/lib/flotix/tuer";
import { menueVarianteAus } from "@/lib/shop/artikel";
import type { MenueVariante } from "@/lib/domain/types";
import { isoDatum } from "@/lib/zeit";

export interface AllergieEintrag {
  bestellnummer: string;
  /**
   * Kennung der Gruppe im Sitzplan, also `shop-<Bestellnummer>`.
   *
   * Wird im Sitzplan genauso gebildet (lib/seating/abend.ts). Dadurch landet die Angabe am richtigen Tisch, ohne über
   * Namen zu raten: "Müller" gibt es an einem Abend durchaus zweimal.
   */
  gruppeId: string;
  gast: string;
  telefon: string | null;
  /** Uhrzeit der Show, an der die Bestellung hängt. */
  uhrzeit: string;
  /** Für welches Menü, so wie es bestellt wurde. */
  menue: string | null;
  /** Dasselbe eingeordnet: Classic, Sea, Veggy oder Kids. Null, wenn die Angabe an keinem Menü hängt. */
  variante: MenueVariante | null;
  text: string;
}

export interface AllergienDesTages {
  /** false, wenn FloTix nicht gelesen werden konnte: Dann darf die Küche nicht glauben, es gäbe keine Angaben. */
  gelesen: boolean;
  eintraege: AllergieEintrag[];
}

export const VARIANTE_LABEL: Record<MenueVariante, string> = {
  classic: "Classic",
  sea: "Sea",
  veggy: "Veggy",
  kids: "Kids",
};

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
  const basis = {
    bestellnummer: b.bestellnummer,
    gruppeId: `shop-${b.bestellnummer || b.id}`,
    gast,
    telefon: b.telefon,
    uhrzeit,
  };

  const eintraege: AllergieEintrag[] = [];
  const gesehen = new Set<string>();
  for (const p of b.positionen) {
    if (p.menge <= 0) continue;
    /*
      Jede Position wird gelesen, nicht nur die mit "Menü" im Namen.

      Eine Angabe, die an einem Upgrade oder einer Begleitung hängt, ist
      genauso wichtig; sie bekommt dann nur keine Variante und steht als
      Angabe zur Bestellung da. Lieber eine Zeile zu viel als eine
      Allergie, die niemand sieht.
    */
    for (const text of angaben(p.allergien)) {
      eintraege.push({
        ...basis,
        menue: p.bezeichnung.replace(/\s+/g, " ").trim(),
        variante: menueVarianteAus(p.bezeichnung),
        text,
      });
      gesehen.add(text.toLowerCase());
    }
  }
  // Die Angabe zur ganzen Bestellung, wenn sie nicht schon je Menü dasteht.
  const ganze = (b.allergien ?? "").trim();
  if (ganze && !gesehen.has(ganze.toLowerCase()))
    eintraege.push({ ...basis, menue: null, variante: null, text: ganze });
  return eintraege;
}

/**
 * Aus den Bestellungen eines Tages die Einträge machen.
 *
 * Ohne Netz, damit sich das Zusammensuchen prüfen lässt (scripts/test-allergien.ts). Eine falsch zugeordnete Variante
 * fiele sonst erst in der Küche auf, und dort ist es zu spät.
 */
export function eintraegeAus(bestellungen: FlotixBestellung[], datum: string): AllergieEintrag[] {
  return bestellungen
    .filter((b) => zaehltMit(b) && isoDatum(new Date(b.beginn)) === datum)
    .flatMap(einBeleg)
    .sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit) || a.gast.localeCompare(b.gast, "de"));
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
  /*
    Dieselbe Regel wie überall im Haus (zaehltMit): storniert, aus der
    Probezeit oder ein Testkauf zählt nicht, eine noch nicht bezahlte
    Bestellung dagegen schon. Vorher hing die Liste an `bezahltAm`, und
    damit fehlte die Allergie eines Gastes, der reserviert hat und erst
    am Abend zahlt.
  */
  return { gelesen: true, eintraege: eintraegeAus(alle, datum) };
}

/**
 * Die Einträge auf die Gruppen des Sitzplans legen.
 *
 * Zusammengelegte Bestellungen heißen im Plan `zusammen-<id>` und tragen die einzelnen Bestellungen nur noch in der
 * Zusammenlegung. Ohne diesen Schritt verschwände die Allergie genau dann, wenn zwei Bestellungen an einen Tisch
 * gelegt wurden, also gerade bei den größeren Runden.
 */
export function nachGruppe(
  eintraege: AllergieEintrag[],
  zusammenlegungen: Array<{ id: string; gruppenIds: string[] }> = [],
): Map<string, AllergieEintrag[]> {
  const ziel = new Map<string, string>();
  for (const z of zusammenlegungen) for (const g of z.gruppenIds) ziel.set(g, `zusammen-${z.id}`);

  const karte = new Map<string, AllergieEintrag[]>();
  for (const e of eintraege) {
    const schluessel = ziel.get(e.gruppeId) ?? e.gruppeId;
    const liste = karte.get(schluessel);
    if (liste) liste.push(e);
    else karte.set(schluessel, [e]);
  }
  return karte;
}
