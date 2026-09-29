/**
 * Anfragen als Kontakte nach Brevo.
 *
 * Die Anfragen stehen in einer Tabelle, in Brevo sitzt der Mailversand.
 * Solange beides getrennt ist, tippt jemand Adressen ab, und die Listen
 * laufen auseinander (Florian, 29.09.2026).
 *
 * Was hier hinausgeht, sind Kontaktdaten, keine Mails. Brevo verschickt
 * erst, wenn dort jemand eine Kampagne startet. Und es geht nur in die
 * Liste, die ausdruecklich angegeben wird: Es gibt keine Standardliste,
 * damit niemand versehentlich in den Newsletter rutscht.
 *
 * Die Merkmale wandern mit (Anfragetyp, Stand, Herkunft, Wunschdatum).
 * Damit laesst sich in Brevo gezielt ansprechen, statt alle gleich.
 */

import type { Lead } from "@/lib/shop/leads";

const BREVO = "https://api.brevo.com/v3";

function schluessel(): string {
  const s = process.env.BREVO_API_KEY?.trim();
  if (!s) throw new Error("BREVO_API_KEY fehlt. Der Wert gehoert bei Vercel unter Settings, Environment Variables.");
  return s;
}

export interface BrevoListe {
  id: number;
  name: string;
  anzahl: number;
}

/** Die Listen, die es in Brevo gibt. Zum Auswaehlen, bevor etwas hochgeht. */
export async function listen(): Promise<BrevoListe[]> {
  const antwort = await fetch(`${BREVO}/contacts/lists?limit=50`, {
    headers: { "api-key": schluessel(), accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!antwort.ok) {
    throw new Error(`Brevo hat die Listen nicht herausgegeben (${antwort.status}).`);
  }
  const d = (await antwort.json()) as { lists?: Array<{ id: number; name: string; totalSubscribers?: number }> };
  return (d.lists ?? []).map((l) => ({ id: l.id, name: l.name, anzahl: l.totalSubscribers ?? 0 }));
}

/** Aus einer Anfrage wird ein Kontakt, so wie Brevo ihn erwartet. */
function alsKontakt(l: Lead) {
  const teile = l.name.trim().split(/\s+/);
  const vorname = teile[0] ?? "";
  const nachname = teile.slice(1).join(" ");

  return {
    email: l.email.trim().toLowerCase(),
    attributes: {
      VORNAME: vorname,
      NACHNAME: nachname,
      SMS: l.telefon?.trim() || undefined,
      ANFRAGETYP: l.anfragetyp || "",
      ANFRAGE_STAND: l.status || "",
      ANFRAGE_EINGANG: l.eingang || "",
      WUNSCHDATUM: l.wunschdatum || "",
      TEILNEHMER: l.teilnehmer || "",
      HERKUNFT: l.herkunft || "",
    },
  };
}

export interface Uebertragung {
  /** Wie viele Kontakte hochgegangen sind. */
  gesendet: number;
  /** Ohne brauchbare Mailadresse, deshalb ausgelassen. */
  ohneMail: number;
  /** Dieselbe Adresse mehrfach in der Tabelle. */
  doppelt: number;
  fehler: string[];
  /** Wahr, wenn nur gerechnet und nichts gesendet wurde. */
  trocken: boolean;
}

/**
 * Die Anfragen in eine Brevo-Liste schreiben.
 *
 * Standardmaessig ein Trockenlauf: Er rechnet nur aus, was hochginge.
 * Erst `trocken: false` schickt wirklich, und auch dann nur in die
 * angegebene Liste.
 */
export async function leadsUebertragen(o: {
  leads: Lead[];
  listeId: number;
  trocken?: boolean;
  /** Bestehende Kontakte mit den neuen Merkmalen aktualisieren. */
  aktualisieren?: boolean;
}): Promise<Uebertragung> {
  const e: Uebertragung = { gesendet: 0, ohneMail: 0, doppelt: 0, fehler: [], trocken: o.trocken !== false };

  const gesehen = new Set<string>();
  const kontakte: ReturnType<typeof alsKontakt>[] = [];

  for (const l of o.leads) {
    const email = (l.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      e.ohneMail++;
      continue;
    }
    if (gesehen.has(email)) {
      e.doppelt++;
      continue;
    }
    gesehen.add(email);
    kontakte.push(alsKontakt(l));
  }

  if (e.trocken) {
    e.gesendet = kontakte.length;
    return e;
  }

  /*
    In Haeppchen zu hundert.

    Brevo nimmt mehr an, aber bei einem Fehler mitten in einer grossen
    Sendung weiss man hinterher nicht, was angekommen ist. Kleine Pakete
    lassen sich einzeln melden und im Zweifel wiederholen: Ein Kontakt
    doppelt zu schicken ist harmlos, Brevo fuehrt ihn nur einmal.
  */
  for (let i = 0; i < kontakte.length; i += 100) {
    const paket = kontakte.slice(i, i + 100);
    try {
      const antwort = await fetch(`${BREVO}/contacts/import`, {
        method: "POST",
        headers: {
          "api-key": schluessel(),
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          listIds: [o.listeId],
          updateExistingContacts: o.aktualisieren !== false,
          emptyContactsAttributes: false,
          jsonBody: paket,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!antwort.ok) {
        const text = await antwort.text().catch(() => "");
        e.fehler.push(`Paket ab ${i + 1}: Brevo hat abgelehnt (${antwort.status}). ${text.slice(0, 200)}`);
        continue;
      }
      e.gesendet += paket.length;
    } catch (f) {
      e.fehler.push(`Paket ab ${i + 1}: ${f instanceof Error ? f.message : "Unbekannter Fehler"}`);
    }
  }

  return e;
}

/**
 * Welche Adressen Brevo schon kennt.
 *
 * Damit die Frage "sind die schon drin" eine Antwort bekommt, bevor
 * irgendetwas hochgeht (Florian, 29.09.2026). Geholt wird in Bloecken zu
 * tausend, das ist das Groesste, was Brevo auf einmal herausgibt.
 */
export async function bekannteAdressen(hoechstens = 20000): Promise<Set<string>> {
  const adressen = new Set<string>();
  const k = schluessel();

  for (let offset = 0; offset < hoechstens; offset += 1000) {
    const antwort = await fetch(`${BREVO}/contacts?limit=1000&offset=${offset}`, {
      headers: { "api-key": k, accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!antwort.ok) {
      throw new Error(`Brevo hat die Kontakte nicht herausgegeben (${antwort.status}).`);
    }
    const d = (await antwort.json()) as { contacts?: Array<{ email?: string }> };
    const teil = d.contacts ?? [];
    for (const c of teil) if (c.email) adressen.add(c.email.trim().toLowerCase());
    if (teil.length < 1000) break;
  }

  return adressen;
}

/**
 * Kontakte aus einer Datei uebertragen.
 *
 * Wie leadsUebertragen, nur mit den Feldern aus der Datei. Getrennt
 * gehalten, damit die Merkmale nicht durcheinandergeraten: Eine alte
 * Lead-Ads-Liste hat keinen Stand und kein Wunschdatum.
 */
export async function dateiUebertragen(o: {
  leads: Array<{
    email: string;
    vorname: string;
    nachname: string;
    telefon: string;
    eingang: string;
    formular: string;
    quelle: string;
  }>;
  listeId: number;
  herkunft: string;
  trocken?: boolean;
}): Promise<Uebertragung> {
  const e: Uebertragung = { gesendet: 0, ohneMail: 0, doppelt: 0, fehler: [], trocken: o.trocken !== false };

  const kontakte = o.leads.map((l) => ({
    email: l.email,
    attributes: {
      VORNAME: l.vorname,
      NACHNAME: l.nachname,
      SMS: l.telefon || undefined,
      ANFRAGE_EINGANG: l.eingang,
      ANFRAGETYP: l.formular || "Lead Ad",
      HERKUNFT: [o.herkunft, l.quelle].filter(Boolean).join(" \u00b7 "),
    },
  }));

  if (e.trocken) {
    e.gesendet = kontakte.length;
    return e;
  }

  for (let i = 0; i < kontakte.length; i += 100) {
    const paket = kontakte.slice(i, i + 100);
    try {
      const antwort = await fetch(`${BREVO}/contacts/import`, {
        method: "POST",
        headers: { "api-key": schluessel(), "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          listIds: [o.listeId],
          updateExistingContacts: true,
          emptyContactsAttributes: false,
          jsonBody: paket,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!antwort.ok) {
        const text = await antwort.text().catch(() => "");
        e.fehler.push(`Paket ab ${i + 1}: Brevo hat abgelehnt (${antwort.status}). ${text.slice(0, 200)}`);
        continue;
      }
      e.gesendet += paket.length;
    } catch (f) {
      e.fehler.push(`Paket ab ${i + 1}: ${f instanceof Error ? f.message : "Unbekannter Fehler"}`);
    }
  }

  return e;
}
