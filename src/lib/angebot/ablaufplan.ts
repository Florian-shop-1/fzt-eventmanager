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
 *   15-Uhr-Show: erst die Show, danach 17:30 Empfang und 18:00 Menü.
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
    kurz: "Die sparsame Fassung, etwa 110 Euro je Gast",
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

const FINGERFOOD: Station = {
  zeit: "19:00",
  titel: "Fingerfood an den Stehtischen im Foyer",
  text:
    "Herzhafte und süße Kleinigkeiten auf Etageren zum Teilen, im Stehen und im Gespräch. "
    + "Serviert vor der Show oder in der Pause, ganz wie ihr mögt.",
};

function show(zeit: string, name: string): Station {
  return {
    zeit,
    titel: `Die Magieshow „${name}“`,
    text: "Das Highlight des Abends: live, hautnah und mit bestem Blick zur Bühne.",
  };
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
}): Station[] {
  const name = o.showname || "ULMfassbar by Florian Zimmer";

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
      AUSKLANG,
    ];
  }

  if (o.variante === "nurshow") {
    return [
      {
        zeit: o.showzeit ? minus(o.showzeit, 45) : o.tageszeit === "nachmittag" ? "14:15" : "19:15",
        titel: "Einlass",
        text: "Die Türen öffnen, an der Magic Bar gibt es etwas zu trinken.",
      },
      show(o.showzeit ?? (o.tageszeit === "nachmittag" ? "15:00" : "20:00"), name),
      AUSKLANG,
    ];
  }

  /*
    Die 15-Uhr-Show dreht den Abend um: erst die Show, danach wird
    gegessen. "bei einer 15 Uhr Show: Empfang und Essen nach der Show"
    (Florian, 15.10.2026).
  */
  if (o.tageszeit === "nachmittag") {
    return [
      {
        zeit: minus(o.showzeit ?? "15:00", 45),
        titel: "Einlass",
        text: "Die Türen öffnen, an der Magic Bar gibt es etwas zu trinken.",
      },
      show(o.showzeit ?? "15:00", name),
      EMPFANG,
      o.variante === "fingerfood" ? { ...FINGERFOOD, zeit: "18:00" } : MENUE,
      { ...AUSKLANG, zeit: "21:00" },
    ];
  }

  if (o.variante === "fingerfood") {
    return [
      { ...EMPFANG, zeit: "18:30" },
      FINGERFOOD,
      show(o.showzeit ?? "20:00", name),
      AUSKLANG,
    ];
  }

  return [EMPFANG, MENUE, show(o.showzeit ?? "20:00", name), AUSKLANG];
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
