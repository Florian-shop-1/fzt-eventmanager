/**
 * Sitzplaner fuer die Magicuisine.
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
 *  - Logen lassen sich zusammenlegen, aber nur zusammenhaengend
 *    (3+4 geht, 2+5 nicht).
 *  - Zwischen Loge 1 und 2 ist ein baulicher Abstand: erlaubt, aber unschoen.
 *  - Bleiben Plaetze in einer belegten Loge leer, koennen sie nicht mehr
 *    verkauft werden. Der Kunde zahlt die Differenz, ausser es wird
 *    bewusst eine Ausnahme mit Begruendung gesetzt.
 */

import {
  LOGEN,
  EVENTGALERIE_TISCHE,
  kapazitaet,
  type Loge,
  type Tisch,
} from "@/lib/domain/venue";
import { ENTGANGENER_UMSATZ_PRO_LOGENPLATZ, eur } from "@/lib/domain/pricing";
import type { Buchungsgruppe } from "@/lib/domain/types";
import {
  STANDARD_OPTIONEN,
  type Hinweis,
  type LogenZuteilung,
  type Plan,
  type PlanerOptionen,
} from "./types";
import {
  KOSTEN,
  alleBloecke,
  istLogenKandidat,
  planeGalerie,
  type LogenBlock,
} from "./bausteine";

/** Einzahl oder Mehrzahl, damit die Hinweistexte sauber lesbar bleiben. */
function plural(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}

/** Ein Suchergebnis vor der Bewertung: welche Gruppe bekommt welchen Logenblock. */
interface Rohvariante {
  logen: Array<{ gruppe: Buchungsgruppe; block: LogenBlock }>;
  galerieGruppen: Buchungsgruppe[];
}

/**
 * Durchsucht alle sinnvollen Logenbelegungen.
 * Bei fuenf Logen ist der Suchraum so klein, dass wir ihn vollstaendig
 * abgehen koennen und garantiert die beste Loesung finden.
 */
function sucheVarianten(
  logenKandidaten: Buchungsgruppe[],
  galerieGruppen: Buchungsgruppe[],
  bloecke: LogenBlock[],
  opt: PlanerOptionen,
): Rohvariante[] {
  const ergebnisse: Rohvariante[] = [];
  const MAX_ERGEBNISSE = 20000;

  // Groesste Gruppe zuerst platzieren: sie hat die wenigsten Optionen.
  const sortiert = [...logenKandidaten].sort((a, b) => b.personen - a.personen);

  function rekursion(
    index: number,
    belegteMaske: number,
    zuteilungen: Array<{ gruppe: Buchungsgruppe; block: LogenBlock }>,
    inGalerie: Buchungsgruppe[],
  ): void {
    if (ergebnisse.length >= MAX_ERGEBNISSE) return;
    if (index === sortiert.length) {
      ergebnisse.push({
        logen: [...zuteilungen],
        galerieGruppen: [...galerieGruppen, ...inGalerie],
      });
      return;
    }

    const gruppe = sortiert[index];

    for (const block of bloecke) {
      if (block.maske & belegteMaske) continue; // Loge bereits vergeben
      const kapa = opt.erlaubeNotstuhl ? block.maxPlaetze : block.plaetze;
      if (kapa < gruppe.personen) continue;
      zuteilungen.push({ gruppe, block });
      rekursion(index + 1, belegteMaske | block.maske, zuteilungen, inGalerie);
      zuteilungen.pop();
    }

    // Alternative: Gruppe kommt doch in die Eventgalerie.
    if (gruppe.bereichFixiert !== "logen") {
      inGalerie.push(gruppe);
      rekursion(index + 1, belegteMaske, zuteilungen, inGalerie);
      inGalerie.pop();
    }
  }

  rekursion(0, 0, [], []);
  return ergebnisse;
}

/** Baut aus einer Rohvariante den fertigen, bewerteten Plan. */
function bewerte(roh: Rohvariante, tische: Tisch[], opt: PlanerOptionen): Plan {
  const hinweise: Hinweis[] = [];
  const begruendung: string[] = [];
  let kosten = 0;
  let differenzGesamtCent = 0;

  const logenZuteilungen: LogenZuteilung[] = roh.logen.map(({ gruppe, block }) => {
    const notstuehle = Math.max(0, gruppe.personen - block.plaetze);
    const freiePlaetze = Math.max(0, block.plaetze - gruppe.personen);

    kosten += freiePlaetze * KOSTEN.freierLogenplatz;
    kosten += (block.nummern.length - 1) * KOSTEN.zusaetzlicheLoge;
    kosten += notstuehle * KOSTEN.notstuhl;
    if (block.hatLuecke) kosten += KOSTEN.logenLuecke;
    if (gruppe.personen < opt.logeAbPersonen) kosten += KOSTEN.kleineGruppeInLoge;

    const logenText =
      block.nummern.length === 1
        ? `Loge ${block.nummern[0]}`
        : `Loge ${block.nummern.join(" und ")} zusammengelegt`;

    begruendung.push(
      `${gruppe.name} (${plural(gruppe.personen, "Person", "Personen")}): ${logenText}, ` +
        `${block.plaetze} Gedecke` +
        (notstuehle > 0
          ? `, ${plural(notstuehle, "Zusatzstuhl", "Zusatzstühle")} an der Stirnseite`
          : "") +
        (freiePlaetze > 0
          ? `, ${plural(freiePlaetze, "Platz bleibt", "Plätze bleiben")} frei`
          : ", passgenau belegt") +
        ".",
    );

    const ausnahmeAktiv = gruppe.ausnahme?.aktiv === true;

    if (freiePlaetze > 0) {
      const differenz = freiePlaetze * ENTGANGENER_UMSATZ_PRO_LOGENPLATZ;
      if (!ausnahmeAktiv) differenzGesamtCent += differenz;
      hinweise.push({
        art: "unterbelegung",
        schwere: ausnahmeAktiv ? "info" : "warnung",
        gruppeId: gruppe.id,
        text: ausnahmeAktiv
          ? `${gruppe.name}: ${plural(freiePlaetze, "Platz bleibt", "Plätze bleiben")} frei. ` +
            `Ausnahme hinterlegt, keine Differenz berechnet. ` +
            `Grund: ${gruppe.ausnahme?.grund ?? "nicht angegeben"}`
          : `${gruppe.name}: ${freiePlaetze} von ${block.plaetze} Plätzen in ${logenText} ` +
            `${freiePlaetze === 1 ? "bleibt" : "bleiben"} unbelegt und ` +
            `${freiePlaetze === 1 ? "ist" : "sind"} nicht mehr verkaufbar. ` +
            `Differenz ${eur(differenz)} in Rechnung stellen.`,
        differenzCent: ausnahmeAktiv ? 0 : differenz,
        ausnahmeMoeglich: true,
        ausnahmeAktiv,
      });
    }

    if (gruppe.personen < opt.logeAbPersonen) {
      hinweise.push({
        art: "kleine_gruppe_in_loge",
        schwere: "warnung",
        gruppeId: gruppe.id,
        text:
          `${gruppe.name} hat nur ${gruppe.personen} Personen. Für so kleine Gruppen ist ` +
          `die Eventgalerie in der Regel die bessere Wahl.`,
        ausnahmeMoeglich: true,
        ausnahmeAktiv,
      });
    }

    if (block.hatLuecke) {
      hinweise.push({
        art: "logen_luecke",
        schwere: "info",
        gruppeId: gruppe.id,
        text:
          `${gruppe.name} sitzt in Loge 1 und 2. Dazwischen liegt ein baulicher Abstand, ` +
          `die Gruppe sitzt weniger geschlossen als in Loge 2 und 3.`,
        ausnahmeMoeglich: false,
      });
    }

    if (notstuehle > 0) {
      hinweise.push({
        art: "notstuhl",
        schwere: "info",
        gruppeId: gruppe.id,
        text:
          `${gruppe.name}: ${plural(notstuehle, "Zusatzstuhl", "Zusatzstühle")} an der ` +
          `Stirnseite einplanen. Das ist eine Notlösung, die Gruppe sitzt dadurch enger.`,
        ausnahmeMoeglich: false,
      });
    }

    return {
      gruppeId: gruppe.id,
      gruppeName: gruppe.name,
      sicherheit: gruppe.sicherheit,
      show: gruppe.show,
      vorgangId: gruppe.vorgangId,
      vorgangNummer: gruppe.vorgangNummer,
      logenNummern: block.nummern,
      personen: gruppe.personen,
      plaetzeGesamt: block.plaetze,
      freiePlaetze,
      notstuehle,
      vorhaengeOeffnen: block.nummern.length > 1,
    };
  });

  const { zuteilungen: galerie, nichtPlatziert } = planeGalerie(roh.galerieGruppen, tische);

  for (const z of galerie) {
    kosten += z.freiePlaetze * KOSTEN.freierGalerieplatz;
    const gruppe = roh.galerieGruppen.find((g) => g.id === z.gruppeId);
    if (gruppe && gruppe.personen >= 8 && gruppe.herkunft !== "shop") {
      kosten += gruppe.personen * KOSTEN.grosseGruppeInGalerie;
      hinweise.push({
        art: "grosse_gruppe_in_galerie",
        schwere: "info",
        gruppeId: gruppe.id,
        text:
          `${gruppe.name} (${plural(gruppe.personen, "Person", "Personen")}) sitzt in der ` +
          `Eventgalerie statt in ` +
          `einer Loge. Bitte prüfen, ob das so gewünscht ist.`,
        ausnahmeMoeglich: false,
      });
    }
    begruendung.push(
      `${z.gruppeName} (${plural(z.personen, "Person", "Personen")}): Eventgalerie, ` +
        `${z.tischBeschreibung}` +
        (z.freiePlaetze > 0 ? `, ${plural(z.freiePlaetze, "Platz", "Plätze")} frei` : "") +
        ".",
    );
  }

  for (const np of nichtPlatziert) {
    kosten += np.personen * KOSTEN.nichtPlatziertePerson;
    hinweise.push({
      art: "kein_platz",
      schwere: "blocker",
      gruppeId: np.gruppeId,
      text:
        `${np.gruppeName} (${plural(np.personen, "Person", "Personen")}) konnte nicht ` +
        `platziert werden. ${np.grund}`,
      ausnahmeMoeglich: false,
    });
  }

  const belegtLogen = logenZuteilungen.reduce((s, z) => s + z.personen, 0);
  const belegtGalerie = galerie.reduce((s, z) => s + z.personen, 0);

  // Getrennt zaehlen, was fest ist und was noch wackeln kann.
  const platziert = [...logenZuteilungen, ...galerie];
  const gebucht = platziert
    .filter((z) => z.sicherheit === "gebucht")
    .reduce((s, z) => s + z.personen, 0);
  const reserviert = platziert
    .filter((z) => z.sicherheit === "reserviert")
    .reduce((s, z) => s + z.personen, 0);

  if (reserviert > 0) {
    hinweise.push({
      art: "reservierung",
      schwere: "info",
      text:
        `${plural(reserviert, "Platz ist", "Plätze sind")} nur reserviert und noch nicht ` +
        `bezahlt. Sagt der Kunde ab, ` +
        `${reserviert === 1 ? "wird dieser Platz" : "werden diese Plätze"} wieder frei.`,
      ausnahmeMoeglich: false,
    });
  }

  return {
    logen: logenZuteilungen,
    galerie,
    nichtPlatziert,
    hinweise,
    kosten,
    begruendung,
    differenzGesamtCent,
    sicherheit: { gebucht, reserviert },
    auslastung: {
      logen: { belegt: belegtLogen, kapazitaet: kapazitaet("logen") },
      eventgalerie: { belegt: belegtGalerie, kapazitaet: kapazitaet("eventgalerie") },
      foyer: { belegt: 0, kapazitaet: kapazitaet("foyer") },
    },
  };
}

/** Kennung einer Belegung, um doppelte Varianten auszusortieren. */
function signatur(p: Plan): string {
  return p.logen
    .map((z) => `${z.gruppeId}:${z.logenNummern.join("-")}`)
    .sort()
    .join("|");
}

/**
 * Hauptfunktion: erstellt Platzierungsvorschlaege fuer eine Vorstellung.
 * Gibt mehrere Varianten zurueck, die beste zuerst.
 */
export function planeSitzplaetze(
  gruppen: Buchungsgruppe[],
  optionen: Partial<PlanerOptionen> = {},
  logen: Loge[] = LOGEN,
  tische: Tisch[] = EVENTGALERIE_TISCHE,
): Plan[] {
  const opt = { ...STANDARD_OPTIONEN, ...optionen };
  const bloecke = alleBloecke(logen);

  const logenKandidaten = gruppen.filter((g) => istLogenKandidat(g, opt));
  const galerieGruppen = gruppen.filter((g) => !istLogenKandidat(g, opt));

  const rohvarianten = sucheVarianten(logenKandidaten, galerieGruppen, bloecke, opt);
  const plaene = rohvarianten.map((r) => bewerte(r, tische, opt));

  plaene.sort((a, b) => a.kosten - b.kosten);

  // Nur echt verschiedene Belegungen anzeigen.
  const gesehen = new Set<string>();
  const varianten: Plan[] = [];
  for (const p of plaene) {
    const s = signatur(p);
    if (gesehen.has(s)) continue;
    gesehen.add(s);
    varianten.push(p);
    if (varianten.length >= opt.anzahlVarianten) break;
  }

  // Kapazitaetswarnung fuer die gesamte Vorstellung.
  const gesamtPersonen = gruppen.reduce((s, g) => s + g.personen, 0);
  const gesamtKapazitaet = kapazitaet("logen") + kapazitaet("eventgalerie");
  if (gesamtPersonen > gesamtKapazitaet && varianten.length > 0) {
    varianten[0].hinweise.unshift({
      art: "kapazitaet",
      schwere: "blocker",
      text:
        `${gesamtPersonen} Menügäste angefragt, es gibt aber nur ${gesamtKapazitaet} ` +
        `Essplätze (Logen ${kapazitaet("logen")} plus Eventgalerie ${kapazitaet("eventgalerie")}).`,
      ausnahmeMoeglich: false,
    });
  }

  return varianten;
}
