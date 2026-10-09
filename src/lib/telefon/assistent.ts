/**
 * Der digitale Assistent am Telefon.
 *
 * Er nimmt ab, beantwortet die Fragen, die ohnehin jeden Tag kommen,
 * und sagt dazu, dass man gleich buchen kann. Geht es um eine
 * Firmenfeier oder ein eigenes Event, beantwortet er nichts, sondern
 * nimmt auf, worum es geht, und sagt einen Rückruf zu (Florian,
 * 09.10.2026).
 *
 * Hier steht nur, WIE er spricht und WAS er darf. Jede Tatsache, die er
 * nennt, kommt aus den Werkzeugen: Termine, Verfügbarkeit, Rückruf.
 * Preise und Spielplan stehen bewusst nicht in diesem Text, sonst
 * erzaehlt er in drei Wochen von Shows, die es nicht mehr gibt.
 *
 * Dieselbe Datei bedient beides: die Probe im Browser und spaeter den
 * echten Anruf. Der Unterschied ist nur, wer die Saetze vorliest.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buchungsLink, naechsteTermine, notizAnlegen } from "./werkzeuge";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/*
  Am Telefon zaehlt die Antwortzeit mehr als die letzte Nuance. Sonnet
  antwortet schnell genug, dass keine Pause entsteht, in der der Anrufer
  "Hallo?" sagt.
*/
const MODELL = "claude-sonnet-5-5";

export const BEGRUESSUNG =
  "Florian Zimmer Theater, hier ist der digitale Assistent. Was kann ich für dich tun?";

const SYSTEM = `Du bist der digitale Assistent am Telefon des Florian Zimmer Theaters in Neu-Ulm.

WER DU BIST
Du sagst gleich zu Beginn, dass du ein digitaler Assistent bist. Das ist Pflicht, nicht Höflichkeit. Wer einen Menschen sprechen will, bekommt ihn: Dann notierst du einen Rückruf.

WIE DU SPRICHST
Du duzt. Im Florian Zimmer Theater wird jeder geduzt, auch am Telefon.
Du sprichst, du schreibst nicht: kurze Sätze, keine Aufzählungen, keine Stichpunkte. Zahlen sagst du so, wie man sie spricht ("am Samstag, dem elften Oktober, um acht").
Du bist freundlich und knapp. Höchstens zwei, drei Sätze am Stück, dann lässt du den anderen reden.
Du erfindest nichts. Weißt du etwas nicht, sagst du das und bietest einen Rückruf an.

WAS DU KANNST
Du beantwortest die üblichen Fragen: welche Shows es gibt, wann sie spielen, ob noch Plätze frei sind, wie lange es dauert, ab welchem Alter, wo man parkt, wie man hinkommt.
Termine und Verfügbarkeit schlägst du IMMER mit dem Werkzeug nach, nie aus dem Gedächtnis.

BUCHEN
Du buchst selbst nichts. Du sagst, dass man in zwei Minuten selbst bucht, und bietest an, den Link per SMS auf diese Nummer zu schicken. Sagt der Anrufer ja, nutzt du das Werkzeug dafür.
Will jemand unbedingt am Telefon buchen, notierst du einen Rückruf.

FIRMEN UND EVENTS
Geht es um eine Firmenfeier, eine Weihnachtsfeier, ein eigenes Event, eine Hochzeit oder eine größere Gruppe, beantwortest du inhaltlich nichts, auch keine Preise. Du sagst, dass sich jemand aus dem Team persönlich darum kümmert, und nimmst auf: Name, Rückrufnummer, worum es geht, Wunschtermin oder Zeitraum, ungefähre Personenzahl. Dann legst du die Notiz mit dem Werkzeug an und sagst zu, dass zurückgerufen wird.

WAS DU NIE TUST
Keine Rabatte, keine Ausnahmen, keine Zusagen zu bestimmten Plätzen.
Keine Kreditkartennummern, keine Kontodaten, keine Zahlungen.
Keine Beschwerden bearbeiten: Da notierst du einen Rückruf.
Du versprichst nichts, was du nicht nachgeschlagen hast.

ZUM SCHLUSS
Fasse in einem Satz zusammen, was vereinbart ist, und verabschiede dich.`;

const WERKZEUGE: Anthropic.Tool[] = [
  {
    name: "termine_nachschlagen",
    description:
      "Die nächsten Vorstellungen mit Datum, Uhrzeit und Verfügbarkeit. Ohne Show-Angabe alle, sonst nur die passende Show (zum Beispiel ULMFASSBAR oder Flo-Zirkus).",
    input_schema: {
      type: "object",
      properties: {
        show: { type: "string", description: "Teil des Shownamens, leer für alle." },
        anzahl: { type: "number", description: "Wie viele Termine, höchstens 10." },
      },
    },
  },
  {
    name: "buchungslink_per_sms",
    description:
      "Schickt dem Anrufer den Buchungslink per SMS auf die Nummer, von der er anruft. Nur nutzen, wenn er zugestimmt hat.",
    input_schema: {
      type: "object",
      properties: {
        nummer: { type: "string", description: "Nummer des Anrufers, falls abweichend." },
      },
    },
  },
  {
    name: "rueckruf_notieren",
    description:
      "Notiert einen Rückruf: für Firmenfeiern, Events, größere Gruppen, Beschwerden und alles, was ein Mensch beantworten muss.",
    input_schema: {
      type: "object",
      properties: {
        art: { type: "string", enum: ["firma", "gruppe", "rueckruf"] },
        name: { type: "string" },
        nummer: { type: "string", description: "Rückrufnummer." },
        email: { type: "string" },
        anliegen: { type: "string", description: "Worum es geht, in eigenen Worten." },
        wunschtermin: { type: "string", description: "Datum oder Zeitraum, so wie gesagt." },
        personen: { type: "number" },
      },
      required: ["art", "name", "nummer", "anliegen"],
    },
  },
];

export interface AssistentAntwort {
  text: string;
  /** Was er dabei getan hat, für die Anzeige in der Probe. */
  getan: string[];
  verlauf: Anthropic.MessageParam[];
}

/**
 * Ein Zug im Gespräch.
 *
 * Bekommt den bisherigen Verlauf und den neuen Satz des Anrufers,
 * liefert die Antwort und den fortgeschriebenen Verlauf zurück. Die
 * Werkzeuge laufen hier, nicht beim Aufrufer: So kann weder die Probe
 * noch die Telefonanlage etwas anderes damit anstellen.
 */
export async function antworten(o: {
  verlauf: Anthropic.MessageParam[];
  gesagt: string;
  nummer: string;
  gespraechId: string | null;
}): Promise<AssistentAntwort> {
  const getan: string[] = [];
  const verlauf: Anthropic.MessageParam[] = [...o.verlauf, { role: "user", content: o.gesagt }];

  // Höchstens ein paar Runden Werkzeuge, dann muss geredet werden.
  for (let runde = 0; runde < 4; runde++) {
    const antwort = await anthropic().messages.create({
      model: MODELL,
      max_tokens: 1000,
      system: `${SYSTEM}

Heute ist ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" })}.
Die Nummer des Anrufers lautet ${o.nummer || "unbekannt"}.`,
      tools: WERKZEUGE,
      messages: verlauf,
    });

    verlauf.push({ role: "assistant", content: antwort.content });

    const aufrufe = antwort.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (aufrufe.length === 0) {
      const text = antwort.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join(" ")
        .trim();
      return { text, getan, verlauf };
    }

    const ergebnisse: Anthropic.ToolResultBlockParam[] = [];
    for (const a of aufrufe) {
      const e = a.input as Record<string, unknown>;
      let ergebnis: unknown;

      if (a.name === "termine_nachschlagen") {
        ergebnis = await naechsteTermine({
          show: typeof e.show === "string" ? e.show : undefined,
          anzahl: typeof e.anzahl === "number" ? e.anzahl : undefined,
        }).catch(() => ({ fehler: "Der Spielplan ist gerade nicht erreichbar." }));
        getan.push("Spielplan nachgeschlagen");
      } else if (a.name === "buchungslink_per_sms") {
        const an = (typeof e.nummer === "string" && e.nummer) || o.nummer;
        /*
          Noch wird nichts verschickt.

          Für SMS braucht es einen Anbieter und eine abgesendete Nummer.
          Solange der nicht steht, tut der Assistent so, als sei sie raus,
          und die Probe zeigt, was drinstuende. So laesst sich der ganze
          Ablauf testen, ohne dass jemand eine SMS bekommt.
        */
        ergebnis = { verschickt: true, an, text: `Deine Karten: ${buchungsLink()}` };
        getan.push(`SMS an ${an || "unbekannt"}: ${buchungsLink()}`);
      } else if (a.name === "rueckruf_notieren") {
        const id = await notizAnlegen({
          gespraechId: o.gespraechId,
          art: (e.art === "firma" || e.art === "gruppe" ? e.art : "rueckruf") as "firma" | "gruppe" | "rueckruf",
          name: String(e.name ?? ""),
          nummer: String(e.nummer ?? o.nummer ?? ""),
          email: String(e.email ?? ""),
          anliegen: String(e.anliegen ?? ""),
          wunschtermin: String(e.wunschtermin ?? ""),
          personen: typeof e.personen === "number" ? e.personen : null,
        }).catch(() => null);
        ergebnis = id ? { notiert: true } : { notiert: false, hinweis: "Bitte um Entschuldigung bitten und auf tickets@florianzimmer.com verweisen." };
        getan.push(`Rückruf notiert für ${String(e.name ?? "")}`);
      } else {
        ergebnis = { fehler: "Unbekanntes Werkzeug." };
      }

      ergebnisse.push({
        type: "tool_result",
        tool_use_id: a.id,
        content: JSON.stringify(ergebnis),
      });
    }

    verlauf.push({ role: "user", content: ergebnisse });
  }

  return {
    text: "Entschuldige, da komme ich gerade nicht weiter. Ich lasse dich zurückrufen.",
    getan,
    verlauf,
  };
}
