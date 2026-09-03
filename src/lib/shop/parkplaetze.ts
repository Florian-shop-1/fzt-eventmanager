/**
 * VIP-Parkplätze, gebucht über den Ticketshop.
 *
 * Quelle ist eine eigene Google-Tabelle, die der Shop befüllt: eine Zeile
 * je Parkplatzbuchung, mit Kunde, Vorstellung und Anzahl. Verknüpft wird
 * über die Spalte event_id, dieselbe Kennung wie im Spielplan.
 *
 * Zu jeder Buchung gehört ein Reservierungsschild, das bisher als eigene
 * Google-Präsentation erzeugt und einzeln geöffnet und gedruckt wurde.
 * Der Eventmanager druckt die Schilder stattdessen selbst, alle eines
 * Tages in einem Durchgang. Der Link auf die Präsentation bleibt trotzdem
 * erhalten, falls jemand die alte Fassung braucht.
 *
 * Gelesen wird nur. In die Tabelle schreibt ausschließlich der Shop.
 */

import { csvZerlegen, pruefeTabelle } from "./menueliste";
import { nameOrdentlich } from "@/lib/domain/namen";

const TABELLE_ID =
  process.env.SHOP_PARKPLATZ_ID ?? "1bLoiE2NAJkYRT184pJL0lRGdHytEF_FmyEwBxup5Z7E";
/** Blatt mit den Rohdaten, eine Zeile je Buchung. */
const ROHDATEN_GID = process.env.SHOP_PARKPLATZ_GID ?? "0";

export interface Parkplatzbuchung {
  orderId: string;
  name: string;
  email: string;
  ditixEventId: string;
  eventName: string;
  /** JJJJ-MM-TT */
  datum: string;
  /** HH:MM, aus der Startzeit der Vorstellung. */
  uhrzeit: string;
  /** Wie viele Plätze gebucht wurden. Meist einer. */
  anzahl: number;
  /** Link auf das bisherige Reservierungsschild, falls vorhanden. */
  schildUrl: string | null;
}

/** Macht aus "19/03/2026 19:30:00" die Uhrzeit "19:30". */
function uhrzeitAus(startBerlin: string): string {
  const treffer = startBerlin.match(/(\d{2}):(\d{2})/);
  return treffer ? `${treffer[1]}:${treffer[2]}` : "";
}

/** Holt alle Parkplatzbuchungen aus der Tabelle. */
export async function holeParkplaetze(): Promise<Parkplatzbuchung[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${ROHDATEN_GID}`;

  const antwort = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Parkplatzliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Parkplatzliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
  const sp = (name: string) => kopf.indexOf(name);

  const iOrder = sp("order_id");
  const iName = sp("customer_name");
  const iMail = sp("customer_email");
  const iEvent = sp("event_id");
  const iEventName = sp("event_name");
  const iDatum = sp("show_date_berlin");
  const iStart = sp("show_start_berlin");
  const iAnzahl = sp("parking_qty");
  const iSchild = sp("googleslides_url");

  if (iEvent < 0 || iName < 0) {
    throw new Error(
      "Der Parkplatzliste fehlen Spalten (event_id oder customer_name). " +
        "Wurde die Tabelle umgebaut?",
    );
  }

  const buchungen: Parkplatzbuchung[] = [];

  for (const z of zeilen.slice(1)) {
    if (!z.some((f) => f.trim())) continue;

    const eventId = (z[iEvent] ?? "").trim();
    const name = nameOrdentlich((z[iName] ?? "").trim());
    if (!eventId || !name) continue;

    const anzahl = parseInt((z[iAnzahl] ?? "1").trim(), 10);
    const schild = (z[iSchild] ?? "").trim();

    buchungen.push({
      orderId: (z[iOrder] ?? "").trim(),
      name,
      email: (z[iMail] ?? "").trim(),
      ditixEventId: eventId,
      eventName: (z[iEventName] ?? "").trim(),
      datum: (z[iDatum] ?? "").trim(),
      uhrzeit: uhrzeitAus((z[iStart] ?? "").trim()),
      anzahl: Number.isFinite(anzahl) && anzahl > 0 ? anzahl : 1,
      schildUrl: schild || null,
    });
  }

  return buchungen;
}

/**
 * Alle Parkplätze eines Tages.
 *
 * Nach Tag, nicht nach Vorstellung: Der Parkplatz gilt für den Abend, und
 * an Tagen mit zwei Shows steht das Auto ohnehin nur einmal da.
 */
export async function parkplaetzeDesTages(datum: string): Promise<Parkplatzbuchung[]> {
  const alle = await holeParkplaetze();
  return alle
    .filter((p) => p.datum === datum)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
