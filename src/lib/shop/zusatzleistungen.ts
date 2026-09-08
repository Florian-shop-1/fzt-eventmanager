/**
 * Was es an einem bestimmten Abend überhaupt dazuzubuchen gibt.
 *
 * Der Grund für diese Datei ist ein Fehler, der ohne sie unweigerlich
 * passiert wäre: Nicht an jedem Abend gibt es ein Menü. Bei Schnupper-Magic,
 * beim RegioTV-Jahresrückblick und bei manchen Sonderterminen kocht die
 * Magicuisine nicht. Die Vorfreude-Mail entscheidet aber allein danach, ob
 * der Gast ein Menü gebucht hat -- und hätte damit ausgerechnet den Gästen
 * dieser Abende ein Menü angepriesen, das es nicht gibt. Der Gast klickt,
 * findet nichts, und die nächste Mail von uns wird nicht mehr geöffnet.
 *
 * Gefragt wird der Shop, über dieselbe öffentliche Adresse, die auch die
 * Upgrade-Seite benutzt. Es wird ausschließlich gelesen.
 *
 * Kann der Shop gerade nicht antworten, wird KEINE Gruppe gemeldet. Die Mail
 * geht dann als reine Erinnerung raus, ohne Angebote. Lieber eine schlichte
 * Mail als eine, die etwas verspricht, das wir nicht geprüft haben.
 */

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

export type Leistungsgruppe = "menue" | "vip" | "bundle";

interface Ticketart {
  id: string;
  name: string;
  isActive?: boolean;
  isHiddenInShop?: boolean;
  seatingPrice?: { seatmapPriceId?: string | null } | null;
}

/**
 * Dieselbe Einteilung wie im Buchungsablauf und auf der Upgrade-Seite.
 * Bewusst dort wie hier ausgeschrieben: Die beiden Programme teilen keinen
 * Code, und eine geteilte Kopie, die nur eine Seite pflegt, wäre schlimmer
 * als zwei, die man beim Suchen nach "Ratatouille" beide findet.
 */
function gruppeVon(name: string): Leistungsgruppe {
  const n = name.toLowerCase();
  if (/menü|menu|gericht|cuisine/.test(n)) return "menue";
  if (/vip|armband|parkplatz|stehtisch|getränk|flex/.test(n)) return "vip";
  return "bundle";
}

/** Die Flex-Option wird kurz vor der Show nicht mehr angeboten. */
function istFlex(name: string): boolean {
  return /flex|schutz|sicherung/i.test(name);
}

/**
 * Welche Gruppen an diesem Abend buchbar sind.
 *
 * Leere Menge heißt: nichts anbieten. Das gilt sowohl für einen Abend ohne
 * Zusatzleistungen als auch für den Fall, dass der Shop nicht antwortet.
 */
export async function verfuegbareGruppen(ditixEventId: string): Promise<Set<Leistungsgruppe>> {
  try {
    const antwort = await fetch(`${SHOP_BASIS}/api/ditix/ticket-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: ditixEventId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!antwort.ok) return new Set();

    const arten = (await antwort.json()) as Ticketart[];
    if (!Array.isArray(arten)) return new Set();

    const gruppen = new Set<Leistungsgruppe>();
    for (const a of arten) {
      if (!a?.name) continue;
      if (a.isActive === false || a.isHiddenInShop === true) continue;
      // Sitzplatzgebundenes ist die Eintrittskarte selbst, keine Zusatzleistung.
      if (a.seatingPrice?.seatmapPriceId) continue;
      if (istFlex(a.name)) continue;
      gruppen.add(gruppeVon(a.name));
    }
    return gruppen;
  } catch (e) {
    console.warn("[zusatzleistungen] Shop nicht erreichbar:", e);
    return new Set();
  }
}
