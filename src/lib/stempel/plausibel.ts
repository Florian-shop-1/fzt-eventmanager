/**
 * Passt die nachgemeldete Uhrzeit zu dem Ort, an dem gestempelt wurde?
 *
 * Wer außerhalb des Geländes ausstempelt, wird gefragt, wann die
 * Arbeitszeit wirklich zu Ende war. Die Antwort lässt sich gegen den
 * gemessenen Abstand halten: "Vor fünf Minuten war ich fertig" passt
 * nicht zu zwanzig Kilometern Entfernung (Florian, 06.10.2026).
 *
 * Das ist kein Beweis und soll keiner sein. Ein Handy kann sich im
 * Standort irren, und wer als Beifahrer auf der Autobahn sitzt, legt
 * ehrlich viel Strecke zurück. Deshalb entscheidet hier nichts, es steht
 * nur dabei, wenn die Zahlen nicht zusammenpassen, damit das Büro
 * nachfragen kann statt zu raten.
 */

/** Darüber wird es für den Weg vom Theater nach Hause unrealistisch. */
const MAX_KMH = 120;

/**
 * Unter einem Kilometer wird nicht gerechnet.
 *
 * Der Parkplatz, die Bushaltestelle, die andere Straßenseite: Wer dort
 * steht und "gerade eben" angibt, sagt die Wahrheit, auch wenn die
 * Rechnung formal nicht aufgeht. Erst ab einem Kilometer wird es eine
 * Strecke, die Zeit braucht.
 */
const EGAL_UNTER_M = 1000;

export interface Pruefung {
  plausibel: boolean;
  /** Ein Satz für das Büro. Leer, wenn es nichts zu sagen gibt. */
  hinweis: string;
}

export function wegPruefen(o: {
  /** Abstand zum Theater beim Ausstempeln, in Metern. */
  entfernungM: number | null;
  /** Wann gestempelt wurde. */
  gestempeltAm: string | Date;
  /** Wann die Arbeitszeit laut eigener Angabe endete. */
  endeLaut: string | Date;
}): Pruefung {
  if (o.entfernungM === null || o.entfernungM < EGAL_UNTER_M) return { plausibel: true, hinweis: "" };

  const gestempelt = new Date(o.gestempeltAm).getTime();
  const ende = new Date(o.endeLaut).getTime();
  if (!Number.isFinite(gestempelt) || !Number.isFinite(ende)) return { plausibel: true, hinweis: "" };

  const km = o.entfernungM / 1000;
  const strecke = `${km.toFixed(1).replace(".", ",")} km`;

  /*
    Ende nach dem Stempel: Dann war die Arbeit noch nicht zu Ende, als
    gestempelt wurde. Das ist kein Rechenfehler, sondern ein Widerspruch.
  */
  if (ende > gestempelt) {
    return {
      plausibel: false,
      hinweis: `Angegebenes Ende liegt nach dem Stempel, dabei war das Handy schon ${strecke} vom Theater entfernt.`,
    };
  }

  const minuten = Math.round((gestempelt - ende) / 60000);
  if (minuten === 0) {
    return {
      plausibel: false,
      hinweis: `${strecke} vom Theater entfernt gestempelt, Arbeitsende aber zur selben Minute.`,
    };
  }

  const kmh = km / (minuten / 60);
  if (kmh <= MAX_KMH) return { plausibel: true, hinweis: "" };

  return {
    plausibel: false,
    hinweis: `${strecke} vom Theater entfernt gestempelt, Arbeitsende vor ${minuten} ${
      minuten === 1 ? "Minute" : "Minuten"
    }. Das wären rund ${Math.round(kmh)} km/h auf dem Heimweg.`,
  };
}
