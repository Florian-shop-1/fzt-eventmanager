/**
 * Die Abende, für die es etwas zu planen gibt.
 *
 * Wichtige Änderung gegenüber früher: Die Liste kommt aus dem Spielplan des
 * Ticketshops, nicht aus der eigenen Datenbank. Vorher tauchte ein Abend erst
 * auf, wenn jemand einen Vorgang dafür angelegt hatte. Dabei ist der weitaus
 * häufigere Fall, dass nur Einzelgäste über den Shop gebucht haben: auch die
 * wollen essen und brauchen einen Tisch.
 *
 * Eine Vorstellung wird in der eigenen Datenbank erst dann angelegt, wenn es
 * wirklich etwas zu speichern gibt, also bei einem Vorgang oder einem
 * festgelegten Sitzplan. Bis dahin genügen die Daten aus dem Shop.
 */

import { db } from "@/lib/db/client";
import {
  kommendeTermine,
  type Vorstellungstermin,
} from "@/lib/ditix/spielplan";
import { holeShopGruppen } from "@/lib/shop/rohdaten";

export interface PlanbarerAbend {
  /** Kennung der ersten Vorstellung des Tages. Sie adressiert den Tag. */
  ditixEventId: string;
  datum: string;
  /** Uhrzeit der ersten Vorstellung. Fuer die knappe Anzeige. */
  uhrzeit: string;
  /** Alle Anfangszeiten des Tages, zum Beispiel ["15:00", "20:00"]. */
  uhrzeiten: string[];
  name: string;
  /** Alle Vorstellungen des Tages mit Kennung und Namen. */
  shows: Array<{ ditixEventId: string; uhrzeit: string; name: string }>;
  /** Gäste mit Menü aus dem Webshop. */
  ausShop: number;
  /** Gäste aus Firmenvorgängen. */
  ausVorgaengen: number;
  gaeste: number;
  /**
   * Verkaufte Showtickets aus dem Webshop. Sagt, wie viele Leute an diesem
   * Abend überhaupt im Haus sind, unabhängig vom Essen.
   */
  showgaeste: number;
  /** Kennung der Vorstellung in der eigenen Datenbank, falls schon angelegt. */
  vorstellungId: string | null;
  /** true, wenn für diesen Abend schon ein Sitzplan festgelegt wurde. */
  planFestgelegt: boolean;
}

/**
 * Alle kommenden Showtage, ohne Ausnahme.
 *
 * Ein Eintrag ist ein TAG, nicht eine Vorstellung. Laufen an einem Tag
 * zwei Shows, erscheinen sie als ein Eintrag: Gegessen wird gemeinsam.
 *
 * Für Funktionsheet und Küchenblatt: Die Gastronomie ist an jedem Spieltag
 * im Haus, auch wenn niemand ein Menü gebucht hat. Dann laufen eben Bar und
 * Foyer, und Osman muss trotzdem wissen, wie viele Leute kommen.
 *
 * Der Spielplan reicht rund ein Jahr voraus, daher die hohe Obergrenze:
 * Es soll kein Termin abgeschnitten werden, nur weil er weit weg ist.
 */
export async function alleShowtage(maxAnzahl = 400): Promise<PlanbarerAbend[]> {
  return abendeAufbauen(maxAnzahl);
}

/**
 * Nur die Abende, an denen jemand am Tisch sitzt.
 * Für den Sitzplan: Ohne Menügäste gibt es dort nichts zu verteilen.
 */
export async function planbareAbende(
  maxAnzahl = 400,
): Promise<PlanbarerAbend[]> {
  return (await abendeAufbauen(maxAnzahl)).filter((a) => a.gaeste > 0);
}

async function abendeAufbauen(maxAnzahl: number): Promise<PlanbarerAbend[]> {
  const termine = await kommendeTermine(maxAnzahl);

  // Menügäste aus dem Shop, einmal geholt und nach Vorstellung gezählt.
  const shopJeEvent = new Map<string, number>();
  const ticketsJeEvent = new Map<string, number>();
  try {
    for (const g of await holeShopGruppen()) {
      if (g.menuesGesamt > 0) {
        shopJeEvent.set(
          g.ditixEventId,
          (shopJeEvent.get(g.ditixEventId) ?? 0) + g.menuesGesamt,
        );
      }
      if (g.tickets > 0) {
        ticketsJeEvent.set(
          g.ditixEventId,
          (ticketsJeEvent.get(g.ditixEventId) ?? 0) + g.tickets,
        );
      }
    }
  } catch {
    // Ohne Shop-Liste bleiben nur die eigenen Vorgänge. Besser eine
    // unvollständige Liste als gar keine.
  }

  // Was in der eigenen Datenbank steht.
  const eigene = (await db()`
    select s.id, s.ditix_event_id,
           coalesce((select sum(g.personen)
                       from gruppe g
                       join vorgang v on v.id = g.vorgang_id
                      where v.vorstellung_id = s.id and v.status <> 'abgesagt'), 0)::int as personen,
           exists(select 1 from sitzplan p where p.vorstellung_id = s.id) as festgelegt
      from vorstellung s
     where s.ditix_event_id is not null
  `) as Array<{
    id: string;
    ditix_event_id: string;
    personen: number;
    festgelegt: boolean;
  }>;

  const eigeneJeEvent = new Map(eigene.map((e) => [e.ditix_event_id, e]));

  // Nach Tagen zusammenfassen: Das Restaurant serviert einmal am Tag,
  // also ist der Tag die Einheit, nicht die einzelne Vorstellung.
  const nachTag = new Map<string, Vorstellungstermin[]>();
  for (const t of termine) {
    if (!nachTag.has(t.datum)) nachTag.set(t.datum, []);
    nachTag.get(t.datum)!.push(t);
  }

  return [...nachTag.entries()].map(([datum, shows]) => {
    const sortiert = [...shows].sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));

    let ausShop = 0;
    let ausVorgaengen = 0;
    let showgaeste = 0;
    let vorstellungId: string | null = null;
    let planFestgelegt = false;

    for (const t of sortiert) {
      ausShop += shopJeEvent.get(t.ditixEventId) ?? 0;
      showgaeste += ticketsJeEvent.get(t.ditixEventId) ?? 0;
      const eigen = eigeneJeEvent.get(t.ditixEventId);
      if (eigen) {
        ausVorgaengen += eigen.personen;
        vorstellungId ??= eigen.id;
        planFestgelegt = planFestgelegt || eigen.festgelegt;
      }
    }

    return {
      ditixEventId: sortiert[0].ditixEventId,
      datum,
      uhrzeit: sortiert[0].uhrzeit,
      uhrzeiten: sortiert.map((t) => t.uhrzeit),
      name: sortiert[0].name,
      shows: sortiert.map((t) => ({
        ditixEventId: t.ditixEventId,
        uhrzeit: t.uhrzeit,
        name: t.name,
      })),
      ausShop,
      ausVorgaengen,
      gaeste: ausShop + ausVorgaengen,
      showgaeste,
      vorstellungId,
      planFestgelegt,
    };
  });
}

/**
 * Findet die Vorstellung in der eigenen Datenbank oder legt sie an.
 * Wird gebraucht, sobald etwas gespeichert werden soll, etwa ein
 * festgelegter Sitzplan.
 */
export async function vorstellungFuerEvent(
  ditixEventId: string,
  datum: string,
  show: string,
): Promise<string> {
  const vorhanden = (await db()`
    select id from vorstellung where ditix_event_id = ${ditixEventId} limit 1
  `) as Array<{ id: string }>;
  if (vorhanden.length > 0) return vorhanden[0].id;

  // Es kann eine Vorstellung mit gleichem Datum und Namen geben, die noch
  // keine Ditix-Kennung hat, etwa von Hand angelegt. Die wird ergänzt statt
  // doppelt angelegt.
  const nachDatum = (await db()`
    select id from vorstellung where datum = ${datum} and show = ${show} limit 1
  `) as Array<{ id: string }>;
  if (nachDatum.length > 0) {
    await db()`
      update vorstellung set ditix_event_id = ${ditixEventId} where id = ${nachDatum[0].id}
    `;
    return nachDatum[0].id;
  }

  const neu = (await db()`
    insert into vorstellung (datum, show, ditix_event_id)
    values (${datum}, ${show}, ${ditixEventId})
    returning id
  `) as Array<{ id: string }>;
  return neu[0].id;
}
