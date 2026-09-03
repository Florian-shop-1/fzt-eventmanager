/**
 * Durchspielen der Sitzplaner-Regeln an echten Fallbeispielen.
 * Aufruf: npx tsx scripts/test-sitzplaner.ts
 */

import { planeSitzplaetze } from "@/lib/seating/planner";
import { eur } from "@/lib/domain/pricing";
import type { Buchungsgruppe, Herkunft } from "@/lib/domain/types";

let fehler = 0;

function gruppe(
  name: string,
  personen: number,
  herkunft: Herkunft = "firma",
  extra: Partial<Buchungsgruppe> = {},
): Buchungsgruppe {
  return {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    personen,
    herkunft,
    sicherheit: "gebucht",
    menues: { classic: personen },
    ...extra,
  };
}

function fall(titel: string, gruppen: Buchungsgruppe[], pruefung: (p: ReturnType<typeof planeSitzplaetze>) => void) {
  console.log("\n=== " + titel + " ===");
  const varianten = planeSitzplaetze(gruppen);
  const beste = varianten[0];
  if (!beste) {
    console.log("  KEIN PLAN GEFUNDEN");
    fehler++;
    return;
  }
  for (const zeile of beste.begruendung) console.log("  " + zeile);
  for (const h of beste.hinweise) {
    console.log(`  [${h.schwere.toUpperCase()}] ${h.text}`);
  }
  if (beste.differenzGesamtCent > 0) {
    console.log("  Differenz gesamt: " + eur(beste.differenzGesamtCent));
  }
  console.log(`  (Punkte: ${beste.kosten}, ${varianten.length} Varianten gefunden)`);
  try {
    pruefung(varianten);
  } catch (e) {
    console.log("  ERWARTUNG NICHT ERFUELLT: " + (e as Error).message);
    fehler++;
  }
}

function erwarte(bedingung: boolean, text: string) {
  if (!bedingung) throw new Error(text);
}

// 1. Grosse Firma: soll zusammenhaengend sitzen, moeglichst ohne Verschnitt.
fall("Firma mit 20 Personen", [gruppe("Mueller GmbH", 20)], (v) => {
  const z = v[0].logen[0];
  erwarte(z !== undefined, "keine Logenzuteilung");
  erwarte(z.logenNummern.length === 2, "sollte zwei Logen belegen");
  erwarte(!z.logenNummern.includes(1), "Loge 1 sollte wegen des Abstands gemieden werden");
  erwarte(z.freiePlaetze === 4, "24 Gedecke minus 20 Personen = 4 frei");
});

// 2. Unterbelegung: Differenz muss berechnet und gemeldet werden.
//    Erwartung: der Planer waehlt die kleinere Loge 1, damit moeglichst
//    wenig Verschnitt entsteht und der Kunde weniger Differenz zahlt.
fall("Firma mit 8 Personen", [gruppe("Kleinbetrieb AG", 8)], (v) => {
  const p = v[0];
  erwarte(p.logen[0].logenNummern.join() === "1", "8 Personen gehoeren in die kleinere Loge 1");
  erwarte(p.logen[0].freiePlaetze === 2, "10 Gedecke minus 8 Personen = 2 frei");
  erwarte(p.differenzGesamtCent > 0, "Differenz muss berechnet werden");
  erwarte(
    p.hinweise.some((h) => h.art === "unterbelegung" && h.ausnahmeMoeglich),
    "Unterbelegungs-Hinweis mit Ausnahmemoeglichkeit fehlt",
  );
});

// 3. Ausnahme: private Feier, Differenz wird erlassen.
fall(
  "Gleiche Gruppe mit hinterlegter Ausnahme",
  [
    gruppe("Familie Schneider", 8, "privatgruppe", {
      ausnahme: {
        aktiv: true,
        grund: "Private Feier, waere sonst aus Budgetgruenden nicht zustande gekommen.",
        benutzer: "Florian",
      },
    }),
  ],
  (v) => {
    erwarte(v[0].differenzGesamtCent === 0, "bei aktiver Ausnahme darf keine Differenz entstehen");
    erwarte(
      v[0].hinweise.some((h) => h.art === "unterbelegung" && h.schwere === "info"),
      "Hinweis sollte auf Info heruntergestuft sein",
    );
  },
);

// 4. Der Kernfall: vier fremde Paare duerfen NICHT in eine Loge.
fall(
  "Vier Shop-Buchungen mit je 2 Personen",
  [
    gruppe("Paar Weber", 2, "shop"),
    gruppe("Paar Hofmann", 2, "shop"),
    gruppe("Paar Bauer", 2, "shop"),
    gruppe("Paar Krause", 2, "shop"),
  ],
  (v) => {
    erwarte(v[0].logen.length === 0, "Paare gehoeren in die Eventgalerie, nicht in eine Loge");
    erwarte(v[0].galerie.length === 4, "alle vier Paare sollten eigene Tische bekommen");
  },
);

// 5. Sehr grosse Gruppe. Zwei sinnvolle Loesungen sind moeglich:
//    Loge 2 bis 5 mit Zusatzstuehlen (Loge 1 bleibt verkaufbar) oder
//    der komplette Logenbereich mit acht unbelegten Plaetzen.
//    Beide muessen als Varianten angeboten werden.
fall("Firmenfeier mit 50 Personen", [gruppe("Grosskonzern SE", 50)], (v) => {
  const z = v[0].logen[0];
  erwarte(z !== undefined, "Gruppe muss in den Logen sitzen");
  erwarte(z.personen === 50, "alle 50 Personen in einem Logenblock");
  erwarte(z.vorhaengeOeffnen, "Vorhaenge muessen geoeffnet werden");
  const alleFuenf = v.some((p) => p.logen[0]?.logenNummern.length === 5);
  erwarte(alleFuenf, "die Variante mit dem gesamten Logenbereich muss zur Auswahl stehen");
});

// 6. Notstuhl an der Stirnseite.
fall("Gruppe mit 13 Personen", [gruppe("Praxis Dr. Lang", 13)], (v) => {
  const z = v[0].logen[0];
  erwarte(z.logenNummern.length === 1, "13 Personen passen mit Zusatzstuhl in eine Loge");
  erwarte(z.notstuehle === 1, "ein Zusatzstuhl an der Stirnseite");
});

// 7. Zu kleine Gruppe fuer eine Loge.
fall("Firma mit nur 3 Personen", [gruppe("Startup UG", 3)], (v) => {
  erwarte(
    v[0].galerie.length === 1 || v[0].hinweise.some((h) => h.art === "kleine_gruppe_in_loge"),
    "unter fuenf Personen sollte die Eventgalerie empfohlen werden",
  );
});

// 8. Realistischer Abend: Firma plus Shop-Buchungen nebeneinander.
fall(
  "Gemischter Abend",
  [
    gruppe("Sparkasse Neu-Ulm", 24),
    gruppe("Autohaus Berger", 11),
    gruppe("Paar Vogel", 2, "shop"),
    gruppe("Paar Simon", 2, "shop"),
    gruppe("Fam. Roth", 4, "shop"),
    gruppe("Jubilaeum Keller", 6, "privatgruppe"),
  ],
  (v) => {
    const p = v[0];
    const alleGruppenIds = new Set([
      ...p.logen.map((z) => z.gruppeId),
      ...p.galerie.map((z) => z.gruppeId),
    ]);
    erwarte(alleGruppenIds.size === 6, "alle sechs Gruppen muessen platziert sein");
    erwarte(p.nichtPlatziert.length === 0, "niemand darf ohne Platz bleiben");
    // Keine Loge darf zwei Gruppen enthalten.
    const belegteLogen = p.logen.flatMap((z) => z.logenNummern);
    erwarte(
      belegteLogen.length === new Set(belegteLogen).size,
      "eine Loge darf nur einer Gruppe gehoeren",
    );
  },
);

// 9. Ueberbuchung muss als Blocker auffallen.
fall(
  "Mehr Gaeste als Plaetze",
  [gruppe("Grosskonzern SE", 58), gruppe("Zweite Firma", 45), gruppe("Dritte Firma", 20)],
  (v) => {
    erwarte(
      v[0].hinweise.some((h) => h.schwere === "blocker"),
      "Ueberbuchung muss als Blocker gemeldet werden",
    );
  },
);

// 10. Reserviert und gebucht muessen im Plan unterscheidbar bleiben.
fall(
  "Reserviert neben gebucht",
  [
    gruppe("Angefragt GmbH", 12, "firma", { sicherheit: "reserviert" }),
    gruppe("Bezahlt AG", 10, "firma", { sicherheit: "gebucht" }),
    gruppe("Paar Weber", 2, "shop"),
  ],
  (v) => {
    const p = v[0];
    const alle = [...p.logen, ...p.galerie];

    const angefragt = alle.find((z) => z.gruppeName === "Angefragt GmbH");
    const bezahlt = alle.find((z) => z.gruppeName === "Bezahlt AG");
    erwarte(angefragt?.sicherheit === "reserviert", "die Anfrage muss reserviert bleiben");
    erwarte(bezahlt?.sicherheit === "gebucht", "der bezahlte Vorgang muss gebucht bleiben");

    erwarte(p.sicherheit.reserviert === 12, "12 Plaetze muessen als reserviert gezaehlt werden");
    erwarte(p.sicherheit.gebucht === 12, "12 Plaetze muessen als gebucht gezaehlt werden");
    erwarte(
      p.sicherheit.gebucht + p.sicherheit.reserviert ===
        p.auslastung.logen.belegt + p.auslastung.eventgalerie.belegt,
      "beide Zahlen zusammen muessen die Belegung ergeben",
    );
    erwarte(
      p.hinweise.some((h) => h.art === "reservierung"),
      "auf die offene Reservierung muss hingewiesen werden",
    );
  },
);

// 11. Ein Tag mit zwei Shows: alle essen zusammen, bleiben aber
//     unterscheidbar. Das ist die Grundlage des Funktionsheets.
fall(
  "Zwei Shows an einem Tag",
  [
    gruppe("Nachmittag AG", 5, "firma", {
      show: { ditixEventId: "e1", uhrzeit: "15:00", name: "ULMFASSBAR", vorDerShow: false },
    }),
    gruppe("Abend GmbH", 25, "firma", {
      show: { ditixEventId: "e2", uhrzeit: "20:00", name: "ULMFASSBAR", vorDerShow: true },
    }),
  ],
  (v) => {
    const p = v[0];
    const alle = [...p.logen, ...p.galerie];

    erwarte(
      p.auslastung.logen.belegt + p.auslastung.eventgalerie.belegt === 30,
      "beide Shows zusammen muessen 30 Plaetze belegen",
    );

    const nachmittag = alle.find((z) => z.gruppeName === "Nachmittag AG");
    const abend = alle.find((z) => z.gruppeName === "Abend GmbH");
    erwarte(
      nachmittag?.show?.vorDerShow === false,
      "die Nachmittagsgruppe isst nach ihrer Show",
    );
    erwarte(abend?.show?.vorDerShow === true, "die Abendgruppe isst vor ihrer Show");
    erwarte(
      nachmittag?.show?.uhrzeit === "15:00" && abend?.show?.uhrzeit === "20:00",
      "die Uhrzeit der eigenen Show muss an der Gruppe haengenbleiben",
    );
  },
);

console.log("\n" + (fehler === 0 ? "Alle Faelle bestanden." : `${fehler} Fall/Faelle fehlgeschlagen.`));
process.exit(fehler === 0 ? 0 : 1);
