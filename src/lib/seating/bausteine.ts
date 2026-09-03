/**
* Bausteine des Sitzplaners: Logenbloecke, Kandidatenpruefung, Tischverteilung.
 *
 * Bewusst KEINE KI, sondern ein festes Regelwerk mit Punktebewertung:
 * bei gleicher Ausgangslage muss immer dasselbe herauskommen, und jede
 * Entscheidung muss erklaerbar sein. Der Planer liefert mehrere Varianten,
 * die Auswahl trifft ein Mensch.
 *
 * Die Regeln stammen direkt von Florian:
 *  - Gruppen kommen in die Logen, Shop-Buchungen (2 bis 4) in die Eventgalerie.
 *  - In einer Loge sitzt immer nur EINE Gruppe. Niemals vier fremde Paare
 *    in eine Loge legen, das wollen die Gaeste nicht.
 *  - Logen sind durch Vorhaenge getrennt und lassen sich zusammenlegen,
 *    aber nur zusammenhaengend (3+4 geht, 2+5 nicht).
 *  - Zwischen Loge 1 und 2 ist ein baulicher Abstand: erlaubt, aber unschoen.
 *  - Bleiben Plaetze in einer belegten Loge leer, koennen sie nicht mehr
 *    verkauft werden. Der Kunde zahlt die Differenz, ausser es wird
 *    bewusst eine Ausnahme mit Begruendung gesetzt.
 */

import {
  LOGEN_LUECKE_ZWISCHEN,
  logeMaxPlaetze,
  type Loge,
  type Tisch,
} from "@/lib/domain/venue";
import type { Buchungsgruppe } from "@/lib/domain/types";
import {
  type GalerieZuteilung,
  type NichtPlatziert,
  type PlanerOptionen,
} from "./types";

/** Strafpunkte. Nur relativ zueinander sinnvoll, nicht als Geldwert lesen. */
export const KOSTEN = {
  /** Leerer Platz in einer belegten Loge: entgangener Umsatz, wiegt am schwersten. */
  freierLogenplatz: 10,
  /** Jede zusaetzlich geoeffnete Loge bedeutet Vorhang auf und weniger Restkapazitaet. */
  zusaetzlicheLoge: 3,
  /** Gruppe sitzt ueber den Abstand zwischen Loge 1 und 2 hinweg. */
  logenLuecke: 30,
  /** Gruppe unter der Mindestgroesse belegt eine ganze Loge. */
  kleineGruppeInLoge: 8,
  /** Notstuhl an der Stirnseite: geht, ist aber eng. */
  notstuhl: 12,
  /** Grosse Gruppe landet in der Galerie statt in einer Loge, pro Person. */
  grosseGruppeInGalerie: 4,
  /** Gast bekommt gar keinen Platz. Praktisch ein Ausschlusskriterium. */
  nichtPlatziertePerson: 500,
  /** Leerer Platz an einem Galerietisch. Weniger schlimm, Tische sind flexibel. */
  freierGalerieplatz: 1,
} as const;

/** Ein zusammenhaengender Abschnitt aus einer oder mehreren Logen. */
export interface LogenBlock {
  /** Logennummern, aufsteigend, z.B. [3, 4]. */
  nummern: number[];
  /** Bitmaske ueber die Logenindizes, fuer schnelle Ueberschneidungspruefung. */
  maske: number;
  /** Summe der regulaeren Gedecke. */
  plaetze: number;
  /** Summe inklusive Notstuehle an den Stirnseiten. */
  maxPlaetze: number;
  /** true, wenn der Block ueber einen baulichen Abstand hinweggeht. */
  hatLuecke: boolean;
}

/** Erzeugt alle zusammenhaengenden Logenkombinationen, z.B. [2], [2,3], [2,3,4]. */
export function alleBloecke(logen: Loge[]): LogenBlock[] {
  const bloecke: LogenBlock[] = [];
  for (let von = 0; von < logen.length; von++) {
    for (let bis = von; bis < logen.length; bis++) {
      const teil = logen.slice(von, bis + 1);
      bloecke.push({
        nummern: teil.map((l) => l.nummer),
        maske: teil.reduce((m, _, i) => m | (1 << (von + i)), 0),
        plaetze: teil.reduce((s, l) => s + l.plaetze, 0),
        maxPlaetze: teil.reduce((s, l) => s + logeMaxPlaetze(l), 0),
        hatLuecke: LOGEN_LUECKE_ZWISCHEN.some(([a, b]) =>
          teil.some((l) => l.nummer === a) && teil.some((l) => l.nummer === b),
        ),
      });
    }
  }
  return bloecke;
}

/**
 * Entscheidet, ob eine Gruppe grundsaetzlich fuer eine Loge in Frage kommt.
 * Shop-Buchungen sind fast immer Paare oder Vierergruppen und gehoeren
 * in die Eventgalerie.
 */
export function istLogenKandidat(g: Buchungsgruppe, opt: PlanerOptionen): boolean {
  if (g.bereichFixiert === "logen") return true;
  if (g.bereichFixiert === "eventgalerie") return false;
  if (g.herkunft === "shop") return g.personen >= 8;
  return g.personen >= opt.logeAbPersonen - 2;
}

/** Beste Tischkombination der Eventgalerie fuer eine Gruppengroesse. */
function findeTischKombination(
  personen: number,
  bestand: Tisch[],
): { tische: Tisch[]; plaetze: number } | null {
  const zweier = bestand.filter((t) => t.plaetze === 2);
  const vierer = bestand.filter((t) => t.plaetze === 4);
  let beste: { tische: Tisch[]; plaetze: number } | null = null;

  for (let v = 0; v <= vierer.length; v++) {
    for (let z = 0; z <= zweier.length; z++) {
      const plaetze = v * 4 + z * 2;
      if (plaetze < personen) continue;
      const tische = [...vierer.slice(0, v), ...zweier.slice(0, z)];
      if (
        beste === null ||
        plaetze - personen < beste.plaetze - personen ||
        (plaetze === beste.plaetze && tische.length < beste.tische.length)
      ) {
        beste = { tische, plaetze };
      }
    }
  }
  return beste;
}

/** Verteilt die uebrigen Gruppen auf die Tische der Eventgalerie. */
export function planeGalerie(
  gruppen: Buchungsgruppe[],
  tische: Tisch[],
): { zuteilungen: GalerieZuteilung[]; nichtPlatziert: NichtPlatziert[] } {
  let bestand = [...tische];
  const zuteilungen: GalerieZuteilung[] = [];
  const nichtPlatziert: NichtPlatziert[] = [];

  // Groesste Gruppen zuerst: sie sind am schwersten unterzubringen.
  const sortiert = [...gruppen].sort((a, b) => b.personen - a.personen);

  for (const g of sortiert) {
    const kombi = findeTischKombination(g.personen, bestand);
    if (!kombi) {
      nichtPlatziert.push({
        gruppeId: g.id,
        gruppeName: g.name,
        personen: g.personen,
        grund: "Es ist kein ausreichender Platz mehr frei (Logen und Eventgalerie belegt).",
      });
      continue;
    }
    const belegteIds = new Set(kombi.tische.map((t) => t.id));
    bestand = bestand.filter((t) => !belegteIds.has(t.id));

    zuteilungen.push({
      gruppeId: g.id,
      gruppeName: g.name,
      sicherheit: g.sicherheit,
      show: g.show,
      vorgangId: g.vorgangId,
      vorgangNummer: g.vorgangNummer,
      tischIds: kombi.tische.map((t) => t.id),
      tischBeschreibung: kombi.tische.map((t) => t.name).join(" + "),
      personen: g.personen,
      plaetzeGesamt: kombi.plaetze,
      freiePlaetze: kombi.plaetze - g.personen,
    });
  }
  return { zuteilungen, nichtPlatziert };
}
