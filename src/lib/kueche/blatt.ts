/**
 * Küchenblatt: führt zusammen, was an einem Abend gegessen und getrunken wird.
 *
 * Es gibt zwei Quellen, und das ist Absicht:
 *  - Der Shop liefert die Bestellungen der Einzelgäste über die Menüliste.
 *  - Der Eventmanager liefert die Firmenevents, die von Hand eingebucht werden.
 *
 * Das Blatt addiert beides und zeigt beide Zahlen getrennt daneben. So sieht
 * die Küche eine Gesamtzahl, und wer nachrechnen will, sieht auch woher sie
 * kommt. Laufen Angebot und tatsächliche Einbuchung auseinander, fällt das
 * hier auf und nicht erst am Abend.
 */

import { db } from "@/lib/db/client";
import type { MenueVariante, Sicherheit } from "@/lib/domain/types";
import { sicherheitAusStatus, type VorgangStatus } from "@/lib/domain/vorgang";
import { vorOrtBetragCent } from "@/lib/domain/vorOrt";
import { shopZusammenfassung, type ShopZusammenfassung } from "@/lib/shop/menueliste";
import {
  findeTermin,
  isstVorDerShow,
  termineDesTages,
  type Vorstellungstermin,
} from "@/lib/ditix/spielplan";
import { shopGruppenDesAbends } from "@/lib/shop/rohdaten";

export interface FirmenGruppe {
  /** Kennung der Gruppe selbst, zum Abhaken der Zahlung. */
  gruppeId: string;
  vorgangId: string;
  vorgangNummer: string;
  kunde: string;
  gruppe: string;
  personen: number;
  menues: Partial<Record<MenueVariante, number>>;
  menuesGesamt: number;
  unvertraeglichkeiten: string | null;
  getraenkepauschalen: string[];
  /** Zu welcher Vorstellung des Tages die Gruppe gehoert. */
  showUhrzeit: string | null;
  /** true, wenn die Gruppe vor ihrer Show isst. */
  vorDerShow: boolean;
  /** Frei vereinbarte Leistung, fuer die Gastronomie und die Abrechnung. */
  sondervereinbarung: string | null;
  /** true, wenn am Abend am Tisch kassiert werden muss. */
  vorOrtKassieren: boolean;
  /** Was zu kassieren ist, in Cent. Eingetragen oder aus den Menues gerechnet. */
  vorOrtBetragCent: number;
  vorOrtHinweis: string | null;
  vorOrtKassiertAm: string | null;
  vorOrtKassiertVon: string | null;
  status: string;
  /** Fest gebucht oder nur reserviert. */
  sicherheit: Sicherheit;
}

export interface Kuechenblatt {
  datum: string;
  show: string;
  ditixEventId: string | null;
  /**
   * Alle Vorstellungen dieses Tages. Gegessen wird gemeinsam um 18 Uhr,
   * gespielt wird moeglicherweise zweimal.
   */
  shows: Vorstellungstermin[];
  /** Menues je Vorstellung, damit sichtbar wird, woraus sich die Zahl ergibt. */
  menuesJeShow: Array<{ uhrzeit: string; name: string; menues: number; vorDerShow: boolean }>;
  /**
   * Was einzelne Gaeste aus dem Shop zusaetzlich gebucht haben, mit Namen:
   * Stehtische, Armbaender, alles ausser Menue und Ticket. Das Foyer
   * braucht die Zuordnung, nicht nur die Summe.
   */
  shopZusatz: Array<{ name: string; bezeichnung: string; menge: number }>;
  /** Menüs aus dem Shop, aus der Google-Tabelle. */
  shop: ShopZusammenfassung | null;
  /** Fehlermeldung, falls die Menüliste nicht erreichbar war. */
  shopFehler: string | null;
  /** Firmenevents aus dem Eventmanager. */
  firmen: FirmenGruppe[];
  /**
   * Verkaufte Showtickets aus dem Webshop. So viele Leute sind an diesem
   * Abend im Haus, auch wenn niemand ein Menü gebucht hat.
   */
  showgaeste: number;
  /** Menüs beider Quellen zusammen. */
  gesamt: Record<MenueVariante, number>;
  gesamtMenues: number;
  /**
   * Menues aus Firmenvorgaengen, die nur reserviert und noch nicht bezahlt
   * sind. Die Kueche soll wissen, welcher Teil der Zahl noch wackeln kann.
   */
  reservierteMenues: number;
  /** Personen der Firmengruppen, unabhängig von der Menüwahl. */
  firmenPersonen: number;
  /** Gruppen, bei denen Menüzahl und Personenzahl auseinanderlaufen. */
  luecken: Array<{ gruppe: string; personen: number; menues: number }>;
  unvertraeglichkeiten: Array<{ gruppe: string; text: string }>;
}

/** Holt alle Firmengruppen des Tages, ueber alle Vorstellungen hinweg. */
async function firmenGruppen(
  vorstellungIds: string[],
  showZuVorstellung: Map<string, Vorstellungstermin>,
): Promise<FirmenGruppe[]> {
  if (vorstellungIds.length === 0) return [];
  const zeilen = (await db()`
    select g.id as gruppe_id, v.id as vorgang_id, v.nummer, v.status, k.name as kunde,
           v.vorstellung_id,
           g.name as gruppe, g.personen, g.menues, g.unvertraeglichkeiten,
           g.getraenkepauschalen, g.sondervereinbarung, g.bereich_fixiert,
           g.vor_ort_kassieren, g.vor_ort_betrag_cent, g.vor_ort_hinweis,
           g.vor_ort_kassiert_am, g.vor_ort_kassiert_von
      from gruppe g
      join vorgang v on v.id = g.vorgang_id
      join kunde k   on k.id = v.kunde_id
     where v.vorstellung_id = any(${vorstellungIds})
       and v.status <> 'abgesagt'
     order by g.personen desc
  `) as Record<string, unknown>[];

  return zeilen.map((z) => {
    const menues = (z.menues ?? {}) as Partial<Record<MenueVariante, number>>;
    return {
      gruppeId: String(z.gruppe_id),
      vorgangId: String(z.vorgang_id),
      vorgangNummer: String(z.nummer),
      kunde: String(z.kunde),
      gruppe: String(z.gruppe),
      personen: Number(z.personen),
      menues,
      menuesGesamt: Object.values(menues).reduce((s, n) => s + (n ?? 0), 0),
      unvertraeglichkeiten: (z.unvertraeglichkeiten as string) ?? null,
      getraenkepauschalen: (z.getraenkepauschalen as string[]) ?? [],
      sondervereinbarung: (z.sondervereinbarung as string) ?? null,
      showUhrzeit: showZuVorstellung.get(String(z.vorstellung_id))?.uhrzeit ?? null,
      vorDerShow: isstVorDerShow(
        showZuVorstellung.get(String(z.vorstellung_id))?.uhrzeit ?? "20:00",
      ),
      vorOrtKassieren: z.vor_ort_kassieren === true,
      vorOrtBetragCent: vorOrtBetragCent(
        {
          kassieren: z.vor_ort_kassieren === true,
          betragCent: (z.vor_ort_betrag_cent as number) ?? undefined,
        },
        menues,
        Number(z.personen),
        z.bereich_fixiert === "logen",
      ),
      vorOrtHinweis: (z.vor_ort_hinweis as string) ?? null,
      vorOrtKassiertAm: z.vor_ort_kassiert_am
        ? new Date(z.vor_ort_kassiert_am as string).toISOString()
        : null,
      vorOrtKassiertVon: (z.vor_ort_kassiert_von as string) ?? null,
      status: String(z.status),
      sicherheit: sicherheitAusStatus(z.status as VorgangStatus),
    };
  });
}

/**
 * Baut das Küchenblatt für einen ganzen Tag.
 *
 * Angesprochen wird es über die Kennung einer Vorstellung, gerechnet wird
 * aber immer der ganze Tag. Der Grund steht in spielplan.ts: Das Restaurant
 * serviert einmal, um 18 Uhr, und dann sitzen alle gleichzeitig im Raum.
 * Für die Küche zählt deshalb nur eine Zahl, die Summe des Tages.
 *
 * Eine Vorstellung in der eigenen Datenbank muss es nicht geben: An vielen
 * Tagen essen nur Gäste, die über den Shop gebucht haben.
 */
export async function holeKuechenblatt(ditixEventId: string): Promise<Kuechenblatt | null> {
  const anker = await findeTermin(ditixEventId);
  if (!anker) return null;

  const shows = await termineDesTages(anker.datum);
  const eventIds = shows.map((s) => s.ditixEventId);

  const eigene = (await db()`
    select id, ditix_event_id from vorstellung where ditix_event_id = any(${eventIds})
  `) as Array<{ id: string; ditix_event_id: string }>;

  const showZuEvent = new Map(shows.map((s) => [s.ditixEventId, s]));
  const showZuVorstellung = new Map(
    eigene
      .map((e) => [e.id, showZuEvent.get(e.ditix_event_id)] as const)
      .filter((paar): paar is [string, Vorstellungstermin] => Boolean(paar[1])),
  );

  const datum = anker.datum;
  const show = shows.map((s) => s.name).join(" · ");
  const ditix_event_id: string | null = ditixEventId;

  const firmen = await firmenGruppen(
    eigene.map((e) => e.id),
    showZuVorstellung,
  );

  let shop: ShopZusammenfassung | null = null;
  let shopFehler: string | null = null;
  let showgaeste = 0;
  const menuesJeShow: Kuechenblatt["menuesJeShow"] = [];
  const shopZusatz: Kuechenblatt["shopZusatz"] = [];
  try {
    // Über alle Vorstellungen des Tages: Alle essen gemeinsam.
    const menues = { classic: 0, sea: 0, veggy: 0, kids: 0 };
    let armbaender = 0;
    let bestellungen = 0;
    let vipGold = 0;
    let stehtische = 0;
    let tickets = 0;
    const sonstiges = new Map<string, number>();

    for (const eventId of eventIds) {
      const alle = await shopGruppenDesAbends(eventId);
      const mitMenue = alle.filter((g) => g.menuesGesamt > 0);
      bestellungen += mitMenue.length;

      // Wer hat was dazugebucht? Namentlich, fuer das Foyer.
      for (const g of alle) {
        for (const z of g.zusatzleistungen) {
          shopZusatz.push({
            name: g.firma ?? g.name,
            bezeichnung: z.bezeichnung,
            menge: z.menge,
          });
        }
      }

      let menuesDieserShow = 0;
      for (const g of mitMenue) {
        for (const [v, n] of Object.entries(g.menues)) {
          menues[v as MenueVariante] += n ?? 0;
          menuesDieserShow += n ?? 0;
        }
        armbaender += g.getraenkeArmbaender;
      }
      showgaeste += alle.reduce((s, g) => s + g.tickets, 0);

      const t = showZuEvent.get(eventId);
      if (t) {
        menuesJeShow.push({
          uhrzeit: t.uhrzeit,
          name: t.name,
          menues: menuesDieserShow,
          vorDerShow: isstVorDerShow(t.uhrzeit),
        });
      }

      const zusatz = await shopZusammenfassung(eventId).catch(() => null);
      vipGold += zusatz?.vipArmbandGold ?? 0;
      stehtische += zusatz?.stehtische ?? 0;
      tickets += zusatz?.tickets ?? 0;
      for (const eintrag of zusatz?.sonstiges ?? []) {
        sonstiges.set(
          eintrag.bezeichnung,
          (sonstiges.get(eintrag.bezeichnung) ?? 0) + eintrag.menge,
        );
      }
    }

    shop = {
      bestellungen,
      menues,
      menuesGesamt: Object.values(menues).reduce((s, n) => s + n, 0),
      getraenkeArmbaender: armbaender,
      vipArmbandGold: vipGold,
      stehtische,
      tickets,
      sonstiges: [...sonstiges].map(([bezeichnung, menge]) => ({ bezeichnung, menge })),
    };
  } catch (e) {
    shopFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const gesamt: Record<MenueVariante, number> = { classic: 0, sea: 0, veggy: 0, kids: 0 };
  for (const variante of ["classic", "sea", "veggy", "kids"] as MenueVariante[]) {
    gesamt[variante] = (shop?.menues[variante] ?? 0) + firmen.reduce((s, f) => s + (f.menues[variante] ?? 0), 0);
  }

  // Firmengruppen ihrer Show zuordnen, damit die Aufstellung stimmt.
  for (const f of firmen) {
    const eintrag = menuesJeShow.find((m) => m.uhrzeit === f.showUhrzeit);
    if (eintrag) eintrag.menues += f.menuesGesamt;
  }
  menuesJeShow.sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));

  return {
    datum,
    show,
    ditixEventId: ditix_event_id,
    shows,
    menuesJeShow,
    shopZusatz: shopZusatz.sort(
      (a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de") || a.name.localeCompare(b.name, "de"),
    ),
    shop,
    shopFehler,
    showgaeste,
    firmen,
    gesamt,
    gesamtMenues: Object.values(gesamt).reduce((s, n) => s + n, 0),
    reservierteMenues: firmen
      .filter((f) => f.sicherheit === "reserviert")
      .reduce((s, f) => s + (f.menuesGesamt || f.personen), 0),
    firmenPersonen: firmen.reduce((s, f) => s + f.personen, 0),
    luecken: firmen
      .filter((f) => f.menuesGesamt !== f.personen)
      .map((f) => ({ gruppe: f.gruppe, personen: f.personen, menues: f.menuesGesamt })),
    unvertraeglichkeiten: firmen
      .filter((f) => f.unvertraeglichkeiten?.trim())
      .map((f) => ({ gruppe: f.gruppe, text: f.unvertraeglichkeiten! })),
  };
}


