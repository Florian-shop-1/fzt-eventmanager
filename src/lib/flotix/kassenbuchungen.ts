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

  const amTag = bestellungen.filter(
    (b) => b.bezahltAm && !b.storniertAm && b.email && b.email.includes("@") && isoDatum(new Date(b.beginn)) === datum,
  );

  /*
    Menüs, die jemand nachträglich über den Link in der Mail dazugebucht hat, sind eine eigene Bestellung ohne Eintritt. Die
    Buchungstabelle kennt sie nicht, und die Vorfreude-Mail böte dem Gast sein Menü ein zweites Mal an. Deshalb: Hat die Adresse
    an diesem Tag irgendwo ein Menü gekauft, steht es auch an ihrer Buchung (Florian, 26.10.2026).
  */
  const menuesJeAdresse = new Map<string, { name: string; anzahl: number }>();
  for (const b of amTag) {
    for (const p of b.positionen) {
      if (p.menge > 0 && gruppeVon(p.bezeichnung) === "menue") {
        const a = b.email!.trim().toLowerCase();
        const alt = menuesJeAdresse.get(a);
        menuesJeAdresse.set(a, { name: alt?.name ?? p.bezeichnung, anzahl: (alt?.anzahl ?? 0) + p.menge });
      }
    }
  }
  for (const [adresse, m] of menuesJeAdresse) {
    await db()`
      insert into shop_buchung_posten (buchung_id, ticket_type_id, name, anzahl, preis_cent, gruppe)
      select b.id, '', ${m.name}, ${m.anzahl}, null, 'menue' from shop_buchung b
       where b.datum = ${datum} and lower(b.email) = ${adresse}
         and not exists (select 1 from shop_buchung_posten x where x.buchung_id = b.id and x.gruppe = 'menue')
    `.catch((e) => console.warn("[kassenbuchungen] Menü nicht eingetragen:", e));
  }

  let neu = 0;
  for (const b of amTag) {
    if (!hatEintritt(b)) continue;

    /*
      Aus dem Webshop? Dann hat der Shop die Buchung schon gemeldet und diese Adresse steht für den Tag bereits da. FloTix
      selbst nennt die Herkunft nicht (source ist überall "native"), also entscheidet die Tabelle.
    */
    const adresse = (b.email ?? "").trim().toLowerCase();
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
    // Ein Menü aus einer späteren Bestellung derselben Adresse zählt mit.
    const spaeter = menuesJeAdresse.get(adresse);
    if (spaeter && !posten.some((p) => p.gruppe === "menue")) {
      posten.push({ ticketTypeId: "", name: spaeter.name, anzahl: spaeter.anzahl, preisCent: null, gruppe: "menue" });
    }

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
      /*
        Leer lassen: Das Funktionsheet zeigt der Küche jeden Hinweis einer Buchung als Unverträglichkeit. Ein Satz wie
        "Freikarte von der Kasse" hätte dort nichts verloren. Woher die Zeile kommt, sagt die Herkunft "kasse".
      */
      hinweis: "",
      herkunft: { quelle: "kasse", medium: b.freikarte ? (/^supporter/i.test(b.freikarteGrund ?? "") ? "supporter" : "freikarte") : "kasse", kampagne: "", inhalt: "", landing: "" },
      posten,
    });
    // Bezahlt ist es, sonst stünde es nicht hier. Ohne das Häkchen gälte die Zeile als abgebrochener Warenkorb.
    const supporter = b.freikarte && /^supporter/i.test(b.freikarteGrund ?? "");
    await db()`update shop_buchung set bestaetigt = true where cart_id = ${cartId}`;
    // Eigene Anweisung: Fehlt die Spalte (Migration 216 noch nicht eingespielt), bleibt die Buchung trotzdem bestaetigt.
    if (supporter) await db()`update shop_buchung set supporter = true where cart_id = ${cartId}`.catch((e) => console.warn("[kassenbuchungen] Supporter:", e));
    neu += 1;
  }
  return neu;
}
