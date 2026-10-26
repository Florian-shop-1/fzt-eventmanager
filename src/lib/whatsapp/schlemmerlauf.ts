/**
 * Den Schlemmerblock-Entwurf bauen, ohne dass jemand klickt.
 *
 * "du sollst das doch komplett fertig machen, so dass wir nur noch den
 * entwurf bestätigen und dem gast antworten mit einem click" (Florian,
 * 25.10.2026).
 *
 * Bisher war das Vorbereiten ein Knopf im Eventmanager. Wer ihn nicht
 * drückte, bekam die alte Vorlage mit dem Platzhalter "[HIER FREICODE
 * EINTRAGEN]" und musste den Code selbst heraussuchen. Genau das soll
 * wegfallen: Sobald eine Nachricht eingeht, in der es um den
 * Schlemmerblock geht, steht der fertige Entwurf schon da.
 *
 * Was dabei NICHT automatisch passiert, bleibt absichtlich so:
 *
 *   - Abgeschickt wird nichts. Ein Mensch liest und drückt.
 *   - Ohne Jahrgang wird kein Code gezogen, sondern nachgefragt. Eine
 *     Freikarte auf einen abgelaufenen Block nimmt man nicht zurück.
 *   - Bei einem abgelaufenen Block steht die Absage im Entwurf, nicht
 *     ein Code.
 */

import { db } from "@/lib/db/client";
import { entwurfSpeichern } from "@/lib/db/whatsapp-entwurf";
import { jahrgangAusBild, whatsappBild } from "@/lib/whatsapp/blockfoto";
import {
  antwortText,
  codesZiehen,
  jahrgangGueltig,
  nachfrageText,
  schlemmerErkennen,
} from "@/lib/whatsapp/schlemmerblock";

function vornameVon(profilname: string): string {
  return (profilname ?? "").trim().split(/\s+/)[0] ?? "";
}

export interface Entwurfslage {
  /** Ging es überhaupt um den Schlemmerblock? */
  trifft: boolean;
  /** Was gebaut wurde, für das Protokoll. */
  art: "codes" | "nachfrage" | "abgelaufen" | "mensch" | "nichts";
  codes: string[];
  meldung: string;
}

/**
 * Baut den Entwurf für eine Unterhaltung und legt ihn ab.
 *
 * `von` steht später am Entwurf: "Automatisch" bei der Vorbereitung aus
 * dem Eingang, sonst der Name dessen, der den Knopf gedrückt hat.
 */
export async function schlemmerEntwurfBauen(waId: string, von: string): Promise<Entwurfslage> {
  const letzten = (await db()`
    select n.id, n.text, n.typ, u.profilname
      from wa_nachricht n
      left join wa_unterhaltung u on u.wa_id = n.wa_id
     where n.wa_id = ${waId} and n.richtung = 'ein'
     order by n.zeitpunkt desc limit 8
  `) as Array<{ id: string; text: string | null; typ: string; profilname: string | null }>;

  if (letzten.length === 0) return { trifft: false, art: "nichts", codes: [], meldung: "Keine Nachricht da." };

  // Die letzte Nachricht MIT Text: Ein Foto allein trägt nur "[Bild]".
  const letzte = letzten.find((n) => (n.text ?? "").replace(/^\[[^\]]*\]\s*/, "").trim()) ?? letzten[0];
  const bildNachricht = letzten.find((n) => n.typ === "image" || n.typ === "sticker");

  const befund = schlemmerErkennen(letzte?.text ?? "");
  if (!befund.trifft) {
    return { trifft: false, art: "nichts", codes: [], meldung: "Kein Schlemmerblock in der Nachricht." };
  }
  if (befund.fuerMenschen) {
    return { trifft: true, art: "mensch", codes: [], meldung: befund.fuerMenschen };
  }

  const vorname = vornameVon(letzte?.profilname ?? letzten[0]?.profilname ?? "");

  let jahrgang = befund.jahrgang;
  let vomFoto = "";
  if (jahrgang === null && bildNachricht) {
    const bild = await whatsappBild(bildNachricht.id).catch(() => null);
    if (bild) {
      const lesung = await jahrgangAusBild(bild).catch(() => null);
      if (lesung?.jahrgang != null) {
        jahrgang = lesung.jahrgang;
        vomFoto = lesung.gelesen;
      }
    }
  }

  if (jahrgang !== null && !jahrgangGueltig(jahrgang)) {
    return {
      trifft: true,
      art: "abgelaufen",
      codes: [],
      meldung: `Der Block ist von ${jahrgang - 1}/${jahrgang} und galt nur bis zum 1. Dezember ${jahrgang}.`,
    };
  }

  if (jahrgang === null) {
    await entwurfSpeichern({
      waId,
      text: nachfrageText(vorname),
      anlass: "schlemmerblock-nachfrage",
      codes: "",
      von,
    });
    return {
      trifft: true,
      art: "nachfrage",
      codes: [],
      meldung: "Der Jahrgang steht nicht dabei, der Entwurf fragt danach.",
    };
  }

  const anzahl = Math.max(1, Math.min(3, befund.bloecke ?? 1));
  const gezogen = await codesZiehen(anzahl, letzte?.profilname?.trim() || waId);

  await entwurfSpeichern({
    waId,
    text: antwortText({ vorname, codes: gezogen.codes }),
    anlass: vomFoto ? "schlemmerblock-foto" : "schlemmerblock",
    codes: gezogen.codes.join(", "),
    von,
  });

  return {
    trifft: true,
    art: "codes",
    codes: gezogen.codes,
    meldung: `${gezogen.codes.length} Code${gezogen.codes.length === 1 ? "" : "s"} gezogen.`,
  };
}

/**
 * Nach dem Eingang: Entwurf bauen, wenn es um den Schlemmerblock geht.
 *
 * Wirft nie. Geht hier etwas schief, fehlt nur der Entwurf, und im
 * Eventmanager steht der Knopf wie bisher.
 */
export async function schlemmerAutomatisch(waId: string): Promise<void> {
  try {
    const lage = await schlemmerEntwurfBauen(waId, "Automatisch");
    if (lage.trifft) console.log("[schlemmerblock] Entwurf vorbereitet:", waId, lage.art, lage.meldung);
  } catch (f) {
    console.warn("[schlemmerblock] Entwurf nicht vorbereitet:", waId, f);
  }
}
