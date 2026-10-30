/**
 * Der Ablauf eines Eventtages, je nach Fassung und Tageszeit.
 *
 * "1. Schritt: für welchen Wochentag ist das Event, vormittag,
 * nachmittag oder abend. 2.: Ablauf passt sich entsprechend an, was wann
 * passiert, dass rauskommt: so sieht Ihr Abend aus" (Florian,
 * 15.10.2026).
 *
 * Vorher stand der Ablauf als Fließtext in der Angebotserstellung und
 * galt immer für den Abend mit Menü. Wer nachmittags anbot oder
 * Fingerfood, musste den Text von Hand umschreiben, und genau dort
 * entstanden die Fehler.
 *
 * Die Zeiten kommen von Florian (15.10.2026):
 *   Abend:      17:30 Empfang, 18:00 Menü, 20:00 Show, 22:30 Ausklang.
 *   15-Uhr-Show: Einlass ins Foyer um 14:00, dann die Show, danach
 *               17:30 Empfang und 18:00 Menü (Florian, 30.10.2026).
 *               Nachmittags werden diese Zeiten aus der Showzeit
 *               gerechnet, nicht fest eingetragen: Wer die Show auf
 *               14:00 legt, bekommt den ganzen Tag entsprechend
 *               verschoben.
 *   Fingerfood: ab 19:00 an den Stehtischen im Foyer, vor der Show
 *               oder in der Pause.
 */

export type Variante =
  | "menue"
  | "fingerfood"
  | "nurshow"
  | "exklusiv_show"
  | "exklusiv_ohne_show";

export type Tageszeit = "nachmittag" | "abend";

export const VARIANTEN: Array<{
  wert: Variante;
  titel: string;
  kurz: string;
  /** Was im Angebot an Positionen entsteht, in einem Satz. */
  enthaelt: string;
}> = [
  {
    wert: "menue",
    titel: "Show mit Menü",
    kurz: "Der Normalfall",
    enthaelt: "Empfang, 4-Gang-Menü, Showticket",
  },
  {
    wert: "fingerfood",
    titel: "Show mit Fingerfood",
    kurz: "Die sparsame Fassung, etwa 150 Euro je Gast",
    enthaelt: "Empfang, Fingerfood an Stehtischen, Showticket",
  },
  {
    wert: "nurshow",
    titel: "Nur die Show",
    kurz: "Ohne Essen",
    enthaelt: "Showticket, sonst nichts",
  },
  {
    wert: "exklusiv_show",
    titel: "Exklusivevent mit Show",
    kurz: "Das ganze Haus für eine Firma",
    enthaelt: "Exklusivbuchung, Empfang, Menü",
  },
  {
    wert: "exklusiv_ohne_show",
    titel: "Exklusivevent ohne Show",
    kurz: "Tagung, Firmenfeier, Präsentation",
    enthaelt: "Exklusivbuchung, Empfang, Menü, keine Show",
  },
];

export interface Station {
  zeit: string;
  titel: string;
  text: string;
}

/** Zeigt diese Fassung überhaupt eine Show? */
export function mitShow(v: Variante): boolean {
  return v !== "exklusiv_ohne_show";
}

/** Gibt es bei dieser Fassung etwas zu essen? */
export function mitEssen(v: Variante): boolean {
  return v !== "nurshow";
}

const EMPFANG: Station = {
  zeit: "17:30",
  titel: "Magicuvée-Empfang auf der Eventgalerie",
  text: "Ihre Gäste kommen an und bekommen ein Glas Magicuvée in die Hand. Zeit zum Ankommen.",
};

const MENUE: Station = {
  zeit: "18:00",
  titel: "4-Gang-Menü by Osman Kavak",
  text:
    "Magicuisine, zur Forelle. Classic, Vegan oder Sea, gerne angepasst an besondere Wünsche. "
    + "Serviert auf der Eventgalerie, oder soweit verfügbar in Ihrer Loge im Showroom.",
};

const AUSKLANG: Station = {
  zeit: "22:30",
  titel: "Ausklang an der Magic Bar",
  text: "Danach bleibt Zeit. Der Teil des Abends, an den sich Ihre Gäste am längsten erinnern.",
};

/** Der Fingerfood-Text, wenn er nach der Show serviert wird. */
const FINGERFOOD_NACH_SHOW =
  "Herzhafte und süße Kleinigkeiten auf Etageren zum Teilen, im Stehen und im Gespräch. "
  + "Serviert nach der Show auf der Eventgalerie.";

const FINGERFOOD: Station = {
  zeit: "19:00",
  titel: "Fingerfood an den Stehtischen im Foyer",
  text:
    "Herzhafte und süße Kleinigkeiten auf Etageren zum Teilen, im Stehen und im Gespräch. "
    + "Serviert vor der Show oder in der Pause, ganz wie ihr mögt.",
};

/**
 * Die Showzeile.
 *
 * Die Tageszeit steht mit drin, weil "das Highlight des Abends" bei
 * einer Nachmittagsshow falsch ist. "die vorschau /ablauf des angebots
 * ist weiterhin für die abendveranstaltung, selbst wenn man nachmittag
 * eingibt" (Florian, 30.10.2026).
 */
function show(zeit: string, name: string, tageszeit: Tageszeit = "abend"): Station {
  const wann = tageszeit === "nachmittag" ? "Tages" : "Abends";
  return {
    zeit,
    titel: `Die Magieshow „${name}“`,
    text: `Das Highlight des ${wann}: live, hautnah und mit bestem Blick zur Bühne.`,
  };
}

/**
 * Wie lange eine Vorstellung samt Pause dauert, in Minuten.
 *
 * Gebraucht nur noch, um zu pruefen, ob eine spaete Nachmittagsshow in
 * die Essenszeit hineinragt.
 */
const SHOWDAUER = 150;

/**
 * Wann gegessen wird. Immer.
 *
 * "das essen ist fast immer um 18:00 uhr. bei mittagshow nach der show
 * und bei abendshow davor" (Florian, 30.10.2026).
 *
 * Davor stand hier eine Rechnung: Essen gleich Showzeit plus Showdauer
 * plus eine halbe Stunde. Bei einer 15-Uhr-Show kam dabei zufaellig
 * 18:00 heraus, und das sah richtig aus. War aber eine 20-Uhr-Show als
 * Nachmittag eingetragen, stand das Menue um 23:00 und der Ausklang um
 * 02:00 im Angebot.
 *
 * Eine Hausregel gehoert nicht gerechnet, sondern hingeschrieben.
 */
const EMPFANGSZEIT = "17:30";
const ESSENSZEIT = "18:00";

/**
 * Was FloTix ueber diesen Termin weiss.
 *
 * "du kennst doch flotix. da steht genau drin wann was ist.. menue um
 * 18:00 uhr show um 20:00 uhr oder um 15 uhr" (Florian, 30.10.2026).
 *
 * Steht hier etwas, gilt es. Die Zeiten oben sind nur noch der
 * Rueckfall fuer ein Angebot ohne festen Termin, bei dem es nichts
 * nachzuschlagen gibt. Damit ist die Regel an einer Stelle im Haus,
 * samt der Ausnahmen fuer Silvester und RegioTV, die FloTix kennt und
 * eine Kopie hier nie kennen wuerde.
 */
export interface Terminzeiten {
  /** Wann die Tueren oeffnen, als "14:00". */
  einlass?: string | null;
  /** Wann gegessen wird, als "18:00". */
  menue?: string | null;
  /** Wird nach der Show gegessen? */
  menueNachDerShow?: boolean | null;
}

/**
 * Ab wann eine Show als Abendshow gilt.
 *
 * Gelesen wird die Uhrzeit der Vorstellung und nicht das Haekchen
 * daneben: Steht im Angebot "nachmittag", die Show beginnt aber um 20
 * Uhr, dann ist es eine Abendshow, ganz gleich was angekreuzt wurde.
 * Genau daran ist das 23-Uhr-Menue entstanden.
 */
const ABENDS_AB_STUNDE = 16;

/**
 * Wird nach der Show gegessen?
 *
 * Drei Quellen, in dieser Reihenfolge: was FloTix zum Termin fuehrt,
 * sonst die Uhrzeit der Vorstellung, sonst das Haekchen im Baukasten.
 * Das Haekchen steht zuletzt, weil es sich am leichtesten verklickt;
 * genau daran ist das Menue um 23:00 Uhr entstanden.
 */
function nachDerShowGegessen(
  showzeit: string | undefined,
  tageszeit: Tageszeit,
  zeiten: Terminzeiten,
): boolean {
  if (typeof zeiten.menueNachDerShow === "boolean") return zeiten.menueNachDerShow;
  if (!showzeit) return tageszeit === "nachmittag";
  const [stunde] = showzeit.split(":").map(Number);
  return Number.isFinite(stunde) && stunde < ABENDS_AB_STUNDE;
}

/** Die spaetere von zwei Uhrzeiten. */
function spaeter(a: string, b: string): string {
  return alsMinuten(a) >= alsMinuten(b) ? a : b;
}

function alsMinuten(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Wie lange vor der Mittagsshow das Foyer aufmacht, in Minuten.
 *
 * "show beginnt um 15:00 uhr mitags, einlass ins foyer ist um 14:00
 * Uhr" (Florian, 30.10.2026). Abends sind es 45 Minuten, nachmittags
 * eine ganze Stunde.
 */
const EINLASS_NACHMITTAG = 60;

/** "17:30" aus "15:00" plus 150. */
function plus(uhrzeit: string, minuten: number): string {
  return minus(uhrzeit, -minuten);
}

/**
 * Der Ablauf für eine Fassung.
 *
 * @param showname Name der Show, für die Zeile mitten im Ablauf.
 * @param showzeit Uhrzeit der Vorstellung, falls bekannt.
 */
export function ablaufFuer(o: {
  variante: Variante;
  tageszeit: Tageszeit;
  showname: string;
  showzeit?: string;
  /** Was FloTix zu diesem Termin fuehrt. Hat Vorrang vor der Hausregel. */
  zeiten?: Terminzeiten;
}): Station[] {
  const name = o.showname || "ULMfassbar by Florian Zimmer";
  const ausFlotix = o.zeiten ?? {};

  if (o.variante === "exklusiv_ohne_show") {
    return [
      { ...EMPFANG, zeit: o.tageszeit === "nachmittag" ? "14:30" : "17:30" },
      { ...MENUE, zeit: o.tageszeit === "nachmittag" ? "15:00" : "18:00" },
      {
        zeit: o.tageszeit === "nachmittag" ? "18:00" : "21:00",
        titel: "Das Haus gehört Ihnen",
        text:
          "Showroom, Eventgalerie und Foyer stehen allein für Sie bereit, mit unserer Technik "
          + "und unserem Team. Was ihr daraus macht, entscheidet ihr.",
      },
      o.tageszeit === "nachmittag"
        ? {
            ...AUSKLANG,
            zeit: "21:00",
            text:
              "Danach bleibt Zeit. Der Teil des Tages, an den sich Ihre Gäste am "
              + "längsten erinnern.",
          }
        : AUSKLANG,
    ];
  }

  if (o.variante === "nurshow") {
    const nachmittags = nachDerShowGegessen(o.showzeit, o.tageszeit, ausFlotix);
    const showzeit = o.showzeit ?? (nachmittags ? "15:00" : "20:00");
    return [
      {
        zeit: ausFlotix.einlass || minus(showzeit, nachmittags ? EINLASS_NACHMITTAG : 45),
        titel: nachmittags ? "Einlass ins Foyer" : "Einlass",
        text: "Die Türen öffnen, an der Magic Bar gibt es etwas zu trinken.",
      },
      show(showzeit, name, nachmittags ? "nachmittag" : "abend"),
      nachmittags
        ? {
            ...AUSKLANG,
            zeit: plus(showzeit, SHOWDAUER),
            text:
              "Danach bleibt Zeit an der Magic Bar. Der Teil des Tages, an den sich Ihre "
              + "Gäste am längsten erinnern.",
          }
        : AUSKLANG,
    ];
  }

  /*
    Die 15-Uhr-Show dreht den Abend um: erst die Show, danach wird
    gegessen. "bei einer 15 Uhr Show: Empfang und Essen nach der Show"
    (Florian, 15.10.2026).
  */
  if (nachDerShowGegessen(o.showzeit, o.tageszeit, ausFlotix)) {
    const showzeit = o.showzeit ?? "15:00";
    /*
      Die Essenszeit aus FloTix, sonst 18:00. Zieht sich die Show
      ausnahmsweise laenger, rutscht beides dahinter: Gegessen wird
      nicht waehrend der Vorstellung.
    */
    const essen = spaeter(ausFlotix.menue || ESSENSZEIT, plus(showzeit, SHOWDAUER + 30));
    const empfang = minus(essen, 30);
    return [
      {
        zeit: ausFlotix.einlass || minus(showzeit, EINLASS_NACHMITTAG),
        titel: "Einlass ins Foyer",
        text: "Die Türen öffnen, an der Magic Bar gibt es etwas zu trinken.",
      },
      show(showzeit, name, "nachmittag"),
      {
        ...EMPFANG,
        zeit: empfang,
        text:
          "Nach der Show gibt es ein Glas Magicuvée auf der Eventgalerie. "
          + "Zeit, die Show nachklingen zu lassen.",
      },
      o.variante === "fingerfood"
        ? { ...FINGERFOOD, zeit: essen, text: FINGERFOOD_NACH_SHOW }
        : { ...MENUE, zeit: essen },
      {
        ...AUSKLANG,
        zeit: plus(essen, 180),
        text:
          "Danach bleibt Zeit. Der Teil des Tages, an den sich Ihre Gäste am längsten erinnern.",
      },
    ];
  }

  if (o.variante === "fingerfood") {
    return [
      { ...EMPFANG, zeit: ausFlotix.menue ? plus(ausFlotix.menue, 30) : "18:30" },
      FINGERFOOD,
      show(o.showzeit ?? "20:00", name, "abend"),
      AUSKLANG,
    ];
  }

  return [
    { ...EMPFANG, zeit: ausFlotix.menue ? minus(ausFlotix.menue, 30) : EMPFANG.zeit },
    { ...MENUE, zeit: ausFlotix.menue || MENUE.zeit },
    show(o.showzeit ?? "20:00", name, "abend"),
    AUSKLANG,
  ];
}

/** "19:15" aus "20:00" minus 45. */
function minus(uhrzeit: string, minuten: number): string {
  const [h, m] = uhrzeit.split(":").map(Number);
  const gesamt = (h * 60 + m - minuten + 1440) % 1440;
  return `${String(Math.floor(gesamt / 60)).padStart(2, "0")}:${String(gesamt % 60).padStart(2, "0")}`;
}

const WOCHENTAGE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export function wochentagName(nummer: number): string {
  return WOCHENTAGE[nummer] ?? "";
}

/**
 * Die Überschrift über dem Ablauf.
 *
 * Steht ein Termin fest, nennt sie das Datum. Sonst den Wochentag:
 * "Ihr Event an einem Donnerstag". So sieht der Kunde, worauf sich der
 * Preis bezieht, denn donnerstags und sonntags ist es günstiger als am
 * Wochenende (Florian, 15.10.2026).
 */
export function ablaufUeberschrift(o: {
  datum?: string | null;
  wochentag?: number | null;
  zeitraum?: string;
}): string {
  if (o.datum) {
    const d = new Date(`${o.datum}T12:00:00Z`);
    return `Ihr Event am ${wochentagName(d.getUTCDay())}, dem ${o.datum
      .split("-")
      .reverse()
      .join(".")}, im Florian Zimmer Theater`;
  }
  const tag = typeof o.wochentag === "number" ? wochentagName(o.wochentag) : "";
  const wann = [tag ? `an einem ${tag}` : "", o.zeitraum ? o.zeitraum.trim() : ""]
    .filter(Boolean)
    .join(" ");
  return `Ihr Event ${wann || "im Florian Zimmer Theater"}`.trim();
}
