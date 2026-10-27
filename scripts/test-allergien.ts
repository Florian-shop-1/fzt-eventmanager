/**
 * Prüft, ob Unverträglichkeiten beim richtigen Gast, beim richtigen Menü und am richtigen Tisch landen.
 * Ohne Datenbank und ohne Netz.
 *
 * Aufruf: npm run test:allergien
 *
 * Der Anlass (Florian, 27.10.2026): "eine nussallergie zu wissen bringt ja nix, wenn man nicht weis ob man beim sea,
 * kids, veeggy oder classic menü drauf rücksicht nehmen soll." Genau das wird hier geprüft, dazu die Zuordnung zur
 * Gruppe, über die das Funktionsheet den Tisch findet.
 */

import assert from "node:assert/strict";
import { eintraegeAus, nachGruppe } from "../src/lib/flotix/allergien";
import { sitzplaetzeAusPlan } from "../src/lib/seating/plaetze";
import type { FlotixBestellung, FlotixPosition } from "../src/lib/flotix/tuer";

const TAG = "2026-11-14";
const BEGINN = "2026-11-14T19:00:00.000Z";

function position(bezeichnung: string, allergien: unknown, menge = 1): FlotixPosition {
  return { bezeichnung, menge, einzelpreisCent: 8900, mitPlatz: false, art: "addon", geschenk: false, allergien };
}

function bestellung(teil: Partial<FlotixBestellung>): FlotixBestellung {
  return {
    id: "id-1",
    bestellnummer: "B-1000",
    status: "bezahlt",
    eingegangen: "2026-11-01T10:00:00.000Z",
    bezahltAm: "2026-11-01T10:01:00.000Z",
    storniertAm: null,
    herkunft: "shop",
    freikarte: false,
    freikarteGrund: null,
    allergien: null,
    vorname: "Maria",
    nachname: "Müller",
    email: "maria.mueller@web.de",
    telefon: "0170 1234567",
    firma: null,
    vorstellungId: "v-1",
    ditixEventId: null,
    beginn: BEGINN,
    vorstellungStatus: "geplant",
    showTitel: "ULMFASSBAR",
    positionen: [],
    ...teil,
  };
}

let faelle = 0;
function fall(name: string, pruefung: () => void) {
  pruefung();
  faelle += 1;
  console.log(`  ok  ${name}`);
}

fall("die Angabe hängt am Menü, nicht nur an der Bestellung", () => {
  const e = eintraegeAus(
    [bestellung({ positionen: [position("4-Gang-Menü Sea", ["Nussallergie"])] })],
    TAG,
  );
  assert.equal(e.length, 1);
  assert.equal(e[0].text, "Nussallergie");
  assert.equal(e[0].variante, "sea");
  assert.equal(e[0].gast, "Maria Müller");
});

fall("jedes Menü einer Bestellung wird einzeln zugeordnet", () => {
  const e = eintraegeAus(
    [
      bestellung({
        positionen: [
          position("4-Gang-Menü Classic", ["Laktose"], 2),
          position("Kids-Menü", ["keine Erdnüsse"]),
          position("4-Gang-Menü Veggy", null),
        ],
      }),
    ],
    TAG,
  );
  assert.deepEqual(
    e.map((x) => [x.text, x.variante]),
    [
      ["Laktose", "classic"],
      ["keine Erdnüsse", "kids"],
    ],
  );
});

fall("eine Angabe zur ganzen Bestellung bekommt keine erfundene Variante", () => {
  const e = eintraegeAus([bestellung({ allergien: "Glutenunverträglichkeit" })], TAG);
  assert.equal(e.length, 1);
  assert.equal(e[0].variante, null);
  assert.equal(e[0].menue, null);
});

fall("dieselbe Angabe steht nicht doppelt da", () => {
  const e = eintraegeAus(
    [bestellung({ allergien: "Nussallergie", positionen: [position("4-Gang-Menü Sea", "Nussallergie")] })],
    TAG,
  );
  assert.equal(e.length, 1);
  assert.equal(e[0].variante, "sea");
});

fall("eine Angabe an einem Upgrade geht nicht verloren", () => {
  const e = eintraegeAus([bestellung({ positionen: [position("Upgrade Sektempfang", ["Histamin"])] })], TAG);
  assert.equal(e.length, 1);
  assert.equal(e[0].variante, null);
});

fall("Storniertes zählt nicht mehr", () => {
  const e = eintraegeAus(
    [
      bestellung({
        storniertAm: "2026-11-02T08:00:00.000Z",
        positionen: [position("4-Gang-Menü Classic", ["Nussallergie"])],
      }),
    ],
    TAG,
  );
  assert.equal(e.length, 0);
});

fall("eine reservierte, noch nicht bezahlte Bestellung zählt sehr wohl", () => {
  const e = eintraegeAus(
    [bestellung({ bezahltAm: null, positionen: [position("4-Gang-Menü Classic", ["Nussallergie"])] })],
    TAG,
  );
  assert.equal(e.length, 1);
});

fall("ein anderer Tag bleibt draußen", () => {
  const e = eintraegeAus([bestellung({ positionen: [position("4-Gang-Menü Sea", ["Nuss"])] })], "2026-11-15");
  assert.equal(e.length, 0);
});

fall("die Gruppenkennung passt zu der im Sitzplan", () => {
  const e = eintraegeAus(
    [bestellung({ bestellnummer: "B-2042", positionen: [position("4-Gang-Menü Kids", ["Zöliakie"])] })],
    TAG,
  );
  assert.equal(e[0].gruppeId, "shop-B-2042");
});

fall("zusammengelegte Bestellungen landen an einem Tisch", () => {
  const e = eintraegeAus(
    [
      bestellung({ id: "a", bestellnummer: "B-1", positionen: [position("4-Gang-Menü Sea", ["Nuss"])] }),
      bestellung({
        id: "b",
        bestellnummer: "B-2",
        vorname: "Jonas",
        nachname: "Weber",
        positionen: [position("4-Gang-Menü Veggy", ["Soja"])],
      }),
    ],
    TAG,
  );
  const karte = nachGruppe(e, [{ id: "z1", gruppenIds: ["shop-B-1", "shop-B-2"] }]);
  assert.deepEqual([...karte.keys()], ["zusammen-z1"]);
  assert.equal(karte.get("zusammen-z1")!.length, 2);
});

fall("der Tisch steht auch bei den einzelnen Bestellungen einer Zusammenlegung", () => {
  const plaetze = sitzplaetzeAusPlan(
    {
      logen: [
        {
          gruppeId: "zusammen-z1",
          gruppeName: "Müller + Weber",
          sicherheit: "gebucht",
          logenNummern: [3, 4],
          personen: 8,
          plaetzeGesamt: 8,
          freiePlaetze: 0,
          notstuehle: 0,
          vorhaengeOeffnen: true,
        },
      ],
      galerie: [],
      hinweise: [],
      nichtPlatziert: [],
    } as never,
    [{ id: "z1", gruppenIds: ["shop-B-1", "shop-B-2"] }],
  );
  assert.equal(plaetze["zusammen-z1"], "Loge 3 + Loge 4");
  assert.equal(plaetze["shop-B-1"], "Loge 3 + Loge 4");
  assert.equal(plaetze["shop-B-2"], "Loge 3 + Loge 4");
});

console.log(`\n${faelle} Fälle geprüft, alle in Ordnung.`);
