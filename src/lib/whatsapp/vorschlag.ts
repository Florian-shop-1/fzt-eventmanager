/**
 * Textvorschläge für die Antwort im Posteingang.
 *
 * Die Fragen wiederholen sich: Ist das Essen vor oder nach der Show? Kann
 * man nur essen? Kann ich das Menü noch dazubuchen? Wer sie jedes Mal neu
 * formuliert, schreibt jedes Mal etwas anderes, und irgendwann steht eine
 * halbe Auskunft im Chat (Florian, 04.10.2026: "es ist doch immer wieder
 * dasselbe. dann kannst du immer einen passenden textvorschlag in die
 * antwort gleich reinpacken").
 *
 * Die Bausteine sind ein VORSCHLAG: Im Posteingang steht der Text zum
 * Überschreiben, niemand schickt ihn ungelesen hinaus.
 *
 * Was hier steht, muss stimmen. Deshalb nur Dinge, die Florian so gesagt
 * hat oder die im Programm nachzulesen sind (die Zeiten des
 * Essensservice stehen in ditix/spielplan.ts).
 *
 * Geschrieben wird in ganzen Absätzen ohne eigene Zeilenumbrüche mitten
 * im Satz: In WhatsApp bricht die Blase selbst um, und ein Umbruch an der
 * falschen Stelle sieht nach Formular aus.
 */

import { MENUE_BEGINNT, RESTAURANT_OEFFNET } from "@/lib/ditix/spielplan";

export interface Vorschlag {
  /** Kurzer Name für den Knopf im Posteingang. */
  titel: string;
  text: string;
}

export interface VorschlagDaten {
  /** Anrede, meist der Vorname. */
  vorname: string;
  /** Uhrzeit der gebuchten Vorstellung, falls bekannt ("20:00"). */
  showUhrzeit?: string | null;
  /** Datum der Buchung, schon lesbar ("25.12.2026"). */
  showDatum?: string | null;
  /** Persönlicher Link zum Dazubuchen, falls es eine Buchung gibt. */
  link?: string | null;
}

const GRUSS = "Viele Grüße\nDein Team vom Florian Zimmer Theater";

/**
 * Isst diese Vorstellung vor der Show?
 *
 * Abendshows ja, Nachmittagsvorstellungen nein: Es gibt pro Tag nur einen
 * Essensservice, und der liegt um 18 Uhr. Ist die Vorstellung unbekannt,
 * gilt der häufigere Fall, der Abend.
 */
function vorDerShow(uhrzeit: string | null | undefined): boolean {
  return !uhrzeit || uhrzeit >= MENUE_BEGINNT;
}

/** Der Ablauf des Abends, in zwei Fassungen. */
function ablauf(d: VorschlagDaten): string {
  if (vorDerShow(d.showUhrzeit)) {
    return (
      "das Magic-Menü unserer Magicuisine servieren wir vor der Show auf der Eventgalerie. " +
      "Ihr sitzt also schon mitten in der Theateratmosphäre, lasst euch in Ruhe bewirten und seid " +
      "rechtzeitig in der Show: Erst wenn das Menü zu Ende ist, geht es hinüber in den Showroom " +
      "zur Zaubershow.\n\n" +
      `Das Restaurant öffnet um ${RESTAURANT_OEFFNET} Uhr, das Menü beginnt um ${MENUE_BEGINNT} Uhr.`
    );
  }
  return (
    "bei unseren Nachmittagsvorstellungen ist es umgekehrt: Erst seht ihr die Zaubershow im " +
    "Showroom, danach servieren wir das Magic-Menü unserer Magicuisine auf der Eventgalerie. " +
    "So klingt der Nachmittag in aller Ruhe aus, ohne dass ihr auf die Uhr schauen müsst."
  );
}

const NUR_MIT_KARTE =
  "Das Menü gibt es nur zusammen mit einer Eintrittskarte zur Show. Ihr müsst euch also nicht " +
  "zwischen Essen und Show entscheiden, ihr bekommt beides nacheinander.";

function linkTeil(d: VorschlagDaten): string {
  if (!d.link) return "";
  return (
    "\n\n" +
    (d.showDatum
      ? `Dazubuchen kannst du über diesen Link zu deiner Buchung vom ${d.showDatum}:`
      : "Dazubuchen kannst du über diesen Link zu deiner Buchung:") +
    `\n${d.link}\n\n` +
    "Der Link gehört nur zu deiner Buchung, du musst nichts noch einmal eingeben."
  );
}

/** Anrede, Mitte, Gruß. */
function brief(vorname: string, mitte: string): string {
  return `Hallo ${vorname},\n\n${mitte}\n\n${GRUSS}`;
}

interface Baustein {
  titel: string;
  /** Woran die Frage erkannt wird. */
  erkennt: RegExp;
  bauen: (d: VorschlagDaten) => string;
}

const BAUSTEINE: Baustein[] = [
  /*
    Der Schlemmerblock steht ganz oben.

    Wer einen Gutschein hat, fragt nach dem Gutschein und nicht nach dem
    Ablauf des Abends. Eine Antwort ueber das Menue geht an der Frage
    vorbei (Florian, 04.10.2026: "wenn die was vom schlemmerblock wissen
    will natürlich nicht mit menü antworten").

    Was hier steht, deckt sich mit der Code-Mail in mail/codevorlagen.ts:
    eine Karte wird gekauft, die zweite ist frei, und der Abriss aus dem
    Heft muss zur Show mit.
  */
  {
    titel: "Schlemmerblock",
    erkennt: /schlemmer|gutschein(heft)?|freizeit ?block|kundenkarte/i,
    bauen: (d) =>
      brief(
        d.vorname,
        "schön, dass du deinen Schlemmerblock bei uns einlösen möchtest. Für den Gutschein kaufst " +
          "du eine Karte, die zweite geht auf uns. Wir richten das für euren Wunschtermin ein und " +
          "melden uns mit allem Weiteren bei dir.\n\n" +
          "Zwei Dinge dazu: Der Gutschein gilt für zwei Personen, weitere Karten kommen ganz " +
          "normal dazu. Und bitte bring den Abriss aus deinem Schlemmerblock zur Show mit und gib " +
          "ihn beim Einlass ab, ohne ihn können wir die Freikarte leider nicht anerkennen.\n\n" +
          "Wenn ihr dazu essen möchtet: Zu beiden Karten lässt sich im Shop ein Menü dazubuchen, " +
          "auch zur Freikarte.",
      ),
  },
  {
    titel: "Essen vor oder nach der Show",
    erkennt:
      /(essen|men[uü]|dinner|speisen|gegessen).{0,40}(vor|nach|davor|danach|wann|ablauf)|(vor|nach|wann|ablauf).{0,40}(essen|men[uü]|dinner)/i,
    bauen: (d) => brief(d.vorname, `${ablauf(d)}\n\n${NUR_MIT_KARTE}${linkTeil(d)}`),
  },
  {
    titel: "Nur essen, ohne Show",
    erkennt:
      /(nur|ohne).{0,20}(essen|men[uü])|(essen|men[uü]).{0,20}ohne.{0,20}show|restaurant.{0,20}(besuchen|kommen)/i,
    bauen: (d) =>
      brief(
        d.vorname,
        "unsere Magicuisine gehört zum Theaterabend: Das Menü gibt es nur zusammen mit einer " +
          "Eintrittskarte zur Show, ein Restaurantbesuch allein ist leider nicht möglich.\n\n" +
          ablauf(d) +
          linkTeil(d),
      ),
  },
  {
    titel: "Menü dazubuchen",
    erkennt: /(dazu|nach).{0,10}buchen|men[uü].{0,30}(dazu|noch|nachtr)|(noch|nachtr).{0,30}men[uü]|upgrade/i,
    bauen: (d) =>
      brief(
        d.vorname,
        d.link
          ? "sehr gern! Du musst dafür keine neuen Karten kaufen." + linkTeil(d) + "\n\n" + ablauf(d)
          : "sehr gern! Schreib uns einfach, welches Menü ihr möchtet, dann buchen wir es zu euren " +
            "Karten dazu.\n\n" +
            ablauf(d),
      ),
  },
  {
    titel: "Wann soll ich da sein",
    erkennt: /(wann|uhrzeit|einlass|beginn).{0,30}(da sein|kommen|anfang|beginnt|einlass)/i,
    bauen: (d) =>
      brief(
        d.vorname,
        vorDerShow(d.showUhrzeit)
          ? `das Restaurant öffnet um ${RESTAURANT_OEFFNET} Uhr, das Menü beginnt um ${MENUE_BEGINNT} Uhr. ` +
            "Kommt gern ein paar Minuten vorher, dann habt ihr in Ruhe Zeit anzukommen. Nach dem Menü " +
            "geht es gemeinsam in den Showroom zur Zaubershow."
          : "kommt gern eine halbe Stunde vor Showbeginn, dann habt ihr in Ruhe Zeit anzukommen. " +
            "Nach der Show servieren wir das Magic-Menü auf der Eventgalerie.",
      ),
  },
];

/**
 * Welche Vorschläge zu dieser Frage passen, der beste zuerst.
 *
 * Passt nichts, kommt nichts: Lieber ein leeres Feld als eine Antwort,
 * die an der Frage vorbeigeht.
 */
export function vorschlaege(frage: string, d: VorschlagDaten): Vorschlag[] {
  const text = String(frage ?? "");
  if (!text.trim()) return [];
  return BAUSTEINE.filter((b) => b.erkennt.test(text)).map((b) => ({
    titel: b.titel,
    text: b.bauen(d),
  }));
}
