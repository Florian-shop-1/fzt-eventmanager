/**
 * Kassenverkäufe in die Vorfreude-Mail holen.
 *
 * Florian, 26.10.2026: "auch wenn man eine Freikarte geschickt bekommen hat, soll man dazu verleitet werden noch Menüs zu
 * holen." Die Vorfreude-Mail und der Link zum Dazubuchen hängen an der Tabelle shop_buchung, und die füllt nur der
 * Webshop, wenn jemand zur Kasse geht. Was an unserer eigenen Kasse verkauft oder als Freikarte verschickt wurde, steht dort
 * nicht und bekam deshalb nie eine Vorfreude-Mail.
 *
 * Hier wird es nachgetragen: Für den Showtag, an dem der Lauf gerade verschickt, wird jede bezahlte Bestellung, die nicht aus dem
 * Webshop kam, als Buchung angelegt. Wer schon eine Zeile hat (cart_id flotix:<Kennung>), wird nur aufgefrischt, ohne dass
 * die Vorfreude-Mail ein zweites Mal rausgeht, denn der Versandstand steht an der Zeile und bleibt unberührt.
 *
 * Bestellungen, die der Webshop schon gemeldet hat, werden ausgelassen (gleiche Adresse, gleicher Tag), sonst bekäme dieselbe
 * Person zwei Mails.
 */

import { db } from "@/lib/db/client";
import { speichereBuchung, type BuchungsPosten, type PostenGruppe } from "@/lib/db/shop-buchungen";
import { flotixBestellungen, flotixQuelle, type FlotixBestellung } from "@/lib/flotix/tuer";
import { isoDatum } from "@/lib/zeit";

const KASSE = "flotix:";

function gruppeVon(name: string): PostenGruppe {
  if (/men(ü|ue)|gericht|cuisine/i.test(name)) return "menue";
  if (/vip|armband|parkplatz|stehtisch|getränk/i.test(name)) return "vip";
  return "";
}

/** Zeigt die Bestellung einen Gast, der kommt? Mit Platz oder Eintrittskarte, nicht nur ein Menü allein. */
function hatEintritt(b: FlotixBestellung): boolean {
  return b.positionen.some((p) => p.menge > 0 && (p.mitPlatz || p.art === "admission"));
}

export async function kassenbuchungenNachtragen(datum: string): Promise<number> {
  if (!flotixQuelle()) return 0;

  let bestellungen: FlotixBestellung[];
  try {
    bestellungen = await flotixBestellungen();
  } catch (e) {
    // Die Vorfreude-Mails an Webshop-Gäste dürfen daran nicht scheitern.
    console.warn("[kassenbuchungen] FloTix nicht erreichbar:", e);
    return 0;
  }

  let neu = 0;
  for (const b of bestellungen) {
    if (!b.bezahltAm || b.storniertAm) continue;
    if (!b.email || !b.email.includes("@")) continue;
    if (isoDatum(new Date(b.beginn)) !== datum) continue;
    if (!hatEintritt(b)) continue;

    /*
      Aus dem Webshop? Dann hat der Shop die Buchung schon gemeldet und diese Adresse steht für den Tag bereits da. FloTix
      selbst nennt die Herkunft nicht (source ist überall "native"), also entscheidet die Tabelle.
    */
    const adresse = b.email.trim().toLowerCase();
    const schon = (await db()`
      select 1 from shop_buchung
       where datum = ${datum} and lower(email) = ${adresse} and cart_id not like ${KASSE + "%"} limit 1
    `) as unknown[];
    if (schon.length > 0) continue;

    const plaetze = b.positionen.filter((p) => p.mitPlatz || p.art === "admission").reduce((s, p) => s + p.menge, 0);
    const posten: BuchungsPosten[] = b.positionen
      .filter((p) => p.menge > 0)
      .map((p) => ({
        ticketTypeId: "",
        name: p.bezeichnung,
        anzahl: p.menge,
        preisCent: p.einzelpreisCent,
        gruppe: p.mitPlatz || p.art === "admission" ? "sitzplatz" : gruppeVon(p.bezeichnung),
      }));

    const cartId = `${KASSE}${b.id}`;
    const uhrzeit = new Date(b.beginn).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    await speichereBuchung({
      cartId,
      ditixEventId: b.vorstellungId,
      datum,
      uhrzeit,
      show: b.showTitel,
      name: [b.vorname, b.nachname].filter(Boolean).join(" "),
      email: adresse,
      telefon: b.telefon ?? "",
      plaetze: plaetze || null,
      hinweis: b.freikarte
        ? `Freikarte von der Kasse${b.freikarteGrund ? ` (${b.freikarteGrund})` : ""}, für die Vorfreude-Mail übernommen.`
        : "Von der Kasse verkauft, für die Vorfreude-Mail übernommen.",
      posten,
    });
    // Bezahlt ist es, sonst stünde es nicht hier. Ohne das Häkchen gälte die Zeile als abgebrochener Warenkorb.
    await db()`update shop_buchung set bestaetigt = true where cart_id = ${cartId}`;
    neu += 1;
  }
  return neu;
}
