/**
 * Die Vorfreude-Mail, eine Woche vor der Show.
 *
 * Der Gast hat seine Karten. Diese Mail soll ihn an den Abend erinnern und ihm
 * anbieten, was noch dazugehören könnte -- aber nur das, was er nicht ohnehin
 * schon gebucht hat.
 *
 * Drei Entscheidungen, die den Ton bestimmen:
 *
 *  - Reiner Text, keine Formatierung. Wie beim Codeversand: kommt überall an,
 *    landet seltener im Spam, und eine Mail, die aussieht wie ein Newsletter,
 *    wird gelesen wie ein Newsletter. Diese hier soll klingen, als hätte
 *    Florian sie geschrieben.
 *  - Kein Preis, kein Rabatt, keine Frist. Wer schon gekauft hat, muss nicht
 *    überredet werden. Was etwas kostet, steht auf der Seite.
 *  - Es wird nur genannt, was fehlt. Ein Menü anzubieten, das der Gast längst
 *    gebucht hat, wirkt wie ein Fehler und beschädigt die ganze Mail. Deshalb
 *    kommen die Bausteine unten je nach Buchung dazu oder eben nicht.
 *
 * Rechtlich: Die Mail geht an Menschen, die bei uns gekauft haben, und bietet
 * eigene ähnliche Ware zum selben Abend an. Das erlaubt § 7 Abs. 3 UWG, wenn
 * in JEDER Mail auf den Widerspruch hingewiesen wird. Deshalb steht der Absatz
 * ganz unten nicht zur Auswahl, sondern immer.
 */

import type { ShopBuchung } from "@/lib/db/shop-buchungen";
import { MENUE_BEGINNT, isstVorDerShow } from "@/lib/ditix/spielplan";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

const NL = String.fromCharCode(10);
const z = (...zeilen: string[]) => zeilen.join(NL);

export interface Vorfreudemail {
  betreff: string;
  text: string;
  /** Was die Mail anspricht. Für die Übersicht im Programm. */
  angeboten: string[];
}

/** "Samstag, 15. November" */
function tagLang(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  });
}

/** "20 Uhr" statt "20:00 Uhr". In einem Satz liest sich das besser. */
function stunde(uhrzeit: string | null): string {
  if (!uhrzeit) return "";
  const [h, m] = uhrzeit.split(":");
  if (!h) return "";
  return m && m !== "00" ? `${h}:${m} Uhr` : `${Number(h)} Uhr`;
}

function hatGruppe(buchung: ShopBuchung, gruppe: string): boolean {
  return buchung.posten.some((p) => p.gruppe === gruppe && p.anzahl > 0);
}

/**
 * Baut die Mail zu einer Buchung.
 *
 * Gibt auch dann eine Mail zurück, wenn nichts fehlt. Der Gast bekommt dann
 * eine reine Erinnerung, und das ist richtig so: Wer alles gebucht hat, ist
 * unser bester Gast und soll nicht ausgerechnet der sein, von dem wir uns eine
 * Woche vorher nicht melden.
 */
export function baueVorfreudemail(buchung: ShopBuchung): Vorfreudemail {
  const link = `${SHOP}/upgrade/${buchung.zugangToken}`;
  const abmelden = `${SHOP}/abmelden/${buchung.zugangToken}`;

  const wann = stunde(buchung.uhrzeit);
  const termin = wann ? `${tagLang(buchung.datum)} um ${wann}` : tagLang(buchung.datum);

  const menueFehlt = !hatGruppe(buchung, "menue");
  const vipFehlt = !hatGruppe(buchung, "vip");
  const angeboten: string[] = [];

  const absaetze: string[] = [
    "Hallo,",
    "",
    `in einer Woche ist es so weit: Am ${termin} sitzt du bei mir im Theater.`,
    "Ich freue mich darauf.",
  ];

  if (menueFehlt) {
    angeboten.push("Menü");
    const menueStunde = stunde(MENUE_BEGINNT);
    // Bei der Nachmittagsvorstellung wird nach der Show aufgetischt, nicht
    // davor. Wer dem Gast die falsche Reihenfolge schreibt, verliert ihn an
    // genau der Stelle, an der er sich den Abend vorstellen soll.
    const davor = !buchung.uhrzeit || isstVorDerShow(buchung.uhrzeit);
    absaetze.push(
      "",
      "Eines möchte ich dir vorher noch ans Herz legen, weil viele es erst",
      "hinterher erfahren: Bei uns im Haus kocht Osman Kavak vom Restaurant",
      `zur Forelle. Vier Gänge, ab ${menueStunde}, in Ruhe und ohne Zeitdruck.`,
      ...(davor
        ? [
            "Danach musst du nur aufstehen und dich in den Saal setzen: kein",
            "Restaurantwechsel, kein zweites Mal Parkplatz suchen.",
          ]
        : [
            "Nach der Show bleibst du einfach da, statt noch einmal loszuziehen",
            "und dir irgendwo einen Tisch zu suchen.",
          ]),
      "",
      "Buchen kann man dieses Menü ausschließlich als Showgast. Es gibt es",
      "nirgendwo sonst, auch nicht als Restaurantbesuch. Dein Ticket ist die",
      "einzige Eintrittskarte dazu.",
    );
  }

  if (vipFehlt) {
    angeboten.push("Abend drumherum");
    absaetze.push(
      "",
      menueFehlt ? "Und wenn du magst:" : "Eines möchte ich dir noch anbieten:",
      "Für die Pause reservieren wir dir einen eigenen Stehtisch im Foyer, mit",
      "allem, was dazugehört. Oder du nimmst das Armband für die Getränke und",
      "musst dich den ganzen Abend an keiner Bar anstellen.",
    );
  }

  absaetze.push(
    "",
    angeboten.length > 0
      ? "Alles, was zu deinem Abend noch dazukommen kann, habe ich dir hier"
      : "Was du gebucht hast, und was sonst noch zu deinem Abend dazugehören kann,",
    angeboten.length > 0 ? "zusammengestellt:" : "findest du hier:",
    "",
    link,
    "",
    "Dort siehst du auch, was du schon gebucht hast. Deine Karten bleiben",
    "davon unberührt, es kommt nur dazu, was du dort auswählst.",
    "",
    "Bis nächste Woche,",
    "Florian Zimmer",
    "",
    "",
    "--",
    "Du bekommst diese Mail, weil du Karten bei uns gekauft hast. Wenn du",
    "keine solchen Hinweise mehr möchtest, genügt ein Klick:",
    abmelden,
    "",
    "Florian Zimmer Theater GmbH, Grethe-Weiser-Str. 2/1, 89231 Neu-Ulm",
    "Telefon 0731 7906 110, tickets@florianzimmer.com",
  );

  return {
    betreff: "Noch eine Woche, dann sehen wir uns",
    text: z(...absaetze),
    angeboten,
  };
}
