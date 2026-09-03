/**
 * Liest die Menübestellungen aus dem Ticketshop.
 *
 * Quelle ist die Google-Tabelle, in die der Shop jede Bestellung mit Zusatz
 * ausgibt. Jede Zeile ist eine Bestellung, jede Spalte ab "EventID" ein
 * Artikel mit der bestellten Menge.
 *
 * Die Verknüpfung zur Vorstellung läuft über die Spalte EventID. Sie enthält
 * dieselbe Kennung wie der Spielplan, geprüft an 27 von 29 Vorstellungen.
 * Die beiden fehlenden sind vergangene Termine, die nicht mehr im Spielplan
 * stehen.
 *
 * Gelesen wird über die Freigabe "Jeder mit dem Link". Ändert sich diese
 * Einstellung, meldet sich das Programm mit einer verständlichen Meldung.
 */

import type { MenueVariante } from "@/lib/domain/types";

const TABELLE_ID =
  process.env.SHOP_MENUELISTE_ID ?? "1Ma0OxVsVdAhNmt9pl2xtx3Pbz2IPAVHkdORSPOUGg2g";
const TABELLE_BLATT = process.env.SHOP_MENUELISTE_GID ?? "824665040";

/** Eine Bestellung aus dem Shop. */
export interface ShopBestellung {
  bestellung: string;
  show: string;
  kunde: string;
  orderId: string;
  ditixEventId: string;
  menues: Partial<Record<MenueVariante, number>>;
  /** Getränkeflatrates als Armbänder. */
  getraenkeArmbaender: number;
  /** Aufpreis auf das goldene VIP-Armband. */
  vipArmbandGold: number;
  stehtische: number;
  /** Verkaufte Showtickets dieser Bestellung. */
  tickets: number;
  /** Alles Übrige, damit nichts verloren geht: Bezeichnung mit Menge. */
  sonstiges: Array<{ bezeichnung: string; menge: number }>;
}

/** Zusammenfassung für einen Abend. */
export interface ShopZusammenfassung {
  bestellungen: number;
  menues: Record<MenueVariante, number>;
  menuesGesamt: number;
  getraenkeArmbaender: number;
  vipArmbandGold: number;
  stehtische: number;
  /**
   * Verkaufte Showtickets. Getrennt gefuehrt, weil die Gastronomie sie
   * nicht sehen soll: Wie viele Karten verkauft sind, geht sie nichts an.
   */
  tickets: number;
  sonstiges: Array<{ bezeichnung: string; menge: number }>;
}

/**
 * Erkennt Spalten, in denen Showtickets stehen.
 *
 * Die Namen wechseln ("Kat. 2", "Golden Seats", "Schnupper Magic"),
 * deshalb wird nach Mustern gesucht. Was hier haengenbleibt, taucht im
 * Funktionsheet nicht als Bestellung auf.
 */
function istShowticket(spalte: string): boolean {
  const s = spalte.toLowerCase();
  return (
    /\bkat\.?\s?\d/.test(s) ||
    s.includes("golden seat") ||
    s.includes("vip empore") ||
    s.includes("rollstuhl") ||
    s.includes("ticket") ||
    s.includes("show)") ||
    s.includes("schnupper")
  );
}

/**
 * Ordnet eine Spaltenüberschrift einer Menüvariante zu.
 * Bewusst über Muster statt über den genauen Text: Wenn jemand die Spalte
 * umbenennt oder ein Leerzeichen ergänzt, funktioniert es weiter.
 */
function alsMenue(spalte: string): MenueVariante | null {
  const s = spalte.toLowerCase();
  if (s.includes("kids") && s.includes("menü")) return "kids";
  if (!s.includes("gang")) return null;
  if (s.includes("classic")) return "classic";
  if (s.includes("sea")) return "sea";
  if (s.includes("veggy") || s.includes("vegan")) return "veggy";
  return null;
}

/** Einfacher CSV-Parser, der Anführungszeichen und Zeilenumbrüche in Feldern beachtet. */
export function csvZerlegen(text: string): string[][] {
  const zeilen: string[][] = [];
  let feld = "";
  let zeile: string[] = [];
  let inAnfuehrung = false;

  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (inAnfuehrung) {
      if (z === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else inAnfuehrung = false;
      } else feld += z;
    } else if (z === '"') {
      inAnfuehrung = true;
    } else if (z === ",") {
      zeile.push(feld);
      feld = "";
    } else if (z === "\n") {
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = "";
    } else if (z !== "\r") {
      feld += z;
    }
  }
  if (feld || zeile.length > 0) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen;
}

/**
 * Prüft, ob die Tabelle überhaupt Daten enthält.
 *
 * Google liefert für kaputte Formeln trotzdem Status 200, im Inhalt steht
 * dann #REF!, #N/A oder ähnliches. Ohne diese Prüfung würde das Programm
 * eine leere Liste zurückgeben, und die Oberfläche zeigte in aller Ruhe
 * "keine Gäste" an. Genau das darf nicht passieren: Wer nichts kocht, weil
 * eine Formel kaputt ist, steht am Abend mit leeren Töpfen da.
 */
export function pruefeTabelle(text: string, was: string): void {
  const anfang = text.trim().slice(0, 200);

  if (!anfang) {
    throw new Error(
      `${was} ist leer. Prüfe die Google-Tabelle, dort steht gerade nichts drin.`,
    );
  }

  const fehlerwerte = ["#REF!", "#N/A", "#ERROR!", "#VALUE!", "#NAME?", "#DIV/0!"];
  const treffer = fehlerwerte.find((f) => anfang.startsWith(f));
  if (treffer) {
    throw new Error(
      `${was} liefert ${treffer} statt Daten. In der Google-Tabelle ist eine Formel kaputt, ` +
        `oft weil ein Blatt oder eine Spalte umbenannt oder gelöscht wurde. ` +
        `Bis das repariert ist, fehlen hier alle Buchungen aus dem Webshop.`,
    );
  }

  // Auch wenn nur die Datenzeilen kaputt sind, ist die Liste unbrauchbar.
  const zeilen = text
    .split("\n")
    .slice(1, 60)
    .filter((z) => z.trim());
  if (zeilen.length > 0) {
    const kaputt = zeilen.filter((z) => fehlerwerte.some((f) => z.trimStart().startsWith(f)));
    if (kaputt.length / zeilen.length > 0.5) {
      throw new Error(
        `${was} enthält fast nur Fehlerwerte statt Buchungen. In der Google-Tabelle ist eine ` +
          `Formel kaputt. Bis das repariert ist, fehlen hier alle Buchungen aus dem Webshop.`,
      );
    }
  }
}

/** Holt alle Bestellungen aus der Tabelle. */
export async function holeShopBestellungen(): Promise<ShopBestellung[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${TABELLE_BLATT}`;

  const antwort = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Menüliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Menüliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim());
  const spalte = (name: string) => kopf.findIndex((k) => k.toLowerCase() === name.toLowerCase());

  const iBestellung = spalte("Bestellung");
  const iShow = spalte("Show");
  const iKunde = spalte("Kunde");
  const iOrder = spalte("OrderID");
  const iEvent = spalte("EventID");
  if (iEvent < 0) {
    throw new Error("In der Menüliste fehlt die Spalte EventID. Ohne sie ist keine Zuordnung möglich.");
  }

  // Alles rechts von EventID sind Artikelspalten.
  const artikelAb = iEvent + 1;

  return zeilen
    .slice(1)
    .filter((z) => z.some((f) => f.trim()))
    .map((z) => {
      const menues: Partial<Record<MenueVariante, number>> = {};
      let getraenkeArmbaender = 0;
      let vipArmbandGold = 0;
      let stehtische = 0;
      let tickets = 0;
      const sonstiges: Array<{ bezeichnung: string; menge: number }> = [];

      for (let i = artikelAb; i < kopf.length; i++) {
        const menge = parseInt((z[i] ?? "").trim(), 10);
        if (!Number.isFinite(menge) || menge <= 0) continue;

        const bezeichnung = kopf[i];
        const klein = bezeichnung.toLowerCase();
        const variante = alsMenue(bezeichnung);

        const istGoldArmband = klein.includes("armband") && klein.includes("gold");

        if (variante) {
          menues[variante] = (menues[variante] ?? 0) + menge;
        } else if (istGoldArmband) {
          // Muss vor der Flatrate geprüft werden: "upgrade: vip-armband gold"
          // enthält ebenfalls das Wort Armband.
          vipArmbandGold += menge;
        } else if (klein.includes("getränke-flat") || klein.includes("armband")) {
          getraenkeArmbaender += menge;
        } else if (klein.includes("stehtisch")) {
          stehtische += menge;
        } else if (istShowticket(bezeichnung)) {
          tickets += menge;
        } else {
          sonstiges.push({ bezeichnung, menge });
        }
      }

      return {
        bestellung: (z[iBestellung] ?? "").trim(),
        show: (z[iShow] ?? "").trim(),
        kunde: (z[iKunde] ?? "").trim(),
        orderId: (z[iOrder] ?? "").trim(),
        ditixEventId: (z[iEvent] ?? "").trim(),
        menues,
        getraenkeArmbaender,
        vipArmbandGold,
        stehtische,
        tickets,
        sonstiges,
      };
    });
}

/** Zählt alle Shop-Bestellungen einer Vorstellung zusammen. */
export async function shopZusammenfassung(ditixEventId: string): Promise<ShopZusammenfassung> {
  const alle = await holeShopBestellungen();
  const passend = alle.filter((b) => b.ditixEventId === ditixEventId);

  const menues: Record<MenueVariante, number> = { classic: 0, sea: 0, veggy: 0, kids: 0 };
  let getraenkeArmbaender = 0;
  let vipArmbandGold = 0;
  let stehtische = 0;
  let tickets = 0;
  const sonstigesMap = new Map<string, number>();

  for (const b of passend) {
    for (const [variante, anzahl] of Object.entries(b.menues)) {
      menues[variante as MenueVariante] += anzahl ?? 0;
    }
    getraenkeArmbaender += b.getraenkeArmbaender;
    vipArmbandGold += b.vipArmbandGold;
    stehtische += b.stehtische;
    tickets += b.tickets;
    for (const s of b.sonstiges) {
      sonstigesMap.set(s.bezeichnung, (sonstigesMap.get(s.bezeichnung) ?? 0) + s.menge);
    }
  }

  return {
    bestellungen: passend.length,
    menues,
    menuesGesamt: Object.values(menues).reduce((s, n) => s + n, 0),
    getraenkeArmbaender,
    vipArmbandGold,
    stehtische,
    tickets,
    sonstiges: [...sonstigesMap].map(([bezeichnung, menge]) => ({ bezeichnung, menge })),
  };
}
