/**
 * Der Rechnungsentwurf: ändern, verwerfen, festschreiben.
 *
 * "man muss aber die beträge in der rechnung auch noch von hand ändern
 * können! z.b. ein menü teuerer machen usw. man muss die rechnung ändern
 * oder verwerfen können. erst wenn man bestätigt soll die rechnung
 * tatsächlich eingebucht werden" (Florian, 30.10.2026).
 *
 * Bis dahin entstand aus dem Angebot sofort eine fertige Rechnung, mit
 * Nummer und allem. Am Telefon einigt man sich aber oft noch auf etwas
 * anderes: ein Menü teurer, zwei Gäste mehr, ein Nachlass. Dafür gab es
 * nur den Weg zurück ins Angebot oder eine Gutschrift hinterher.
 *
 * Jetzt ist der erste Schritt ein Entwurf. Er trägt noch keine
 * Rechnungsnummer, sondern einen Platzhalter, und er zählt für nichts:
 * nicht für die offenen Posten, nicht für den Kontoabgleich, nicht für
 * die Bücher. Erst das Festschreiben zieht die nächste Nummer und macht
 * eine Rechnung daraus. Wer ihn wegwirft, hinterlässt keine Lücke im
 * Nummernkreis, und genau darum geht es: Eine Lücke muss man dem
 * Steuerberater erklären.
 */

import { db } from "@/lib/db/client";
import { naechsteRechnungsnummer } from "./aus-angebot";
import { merken, rechnungLesen, type Rechnung } from "./db";

/** Eine Zeile der Rechnung, so wie sie in positionen steht. */
export interface Entwurfszeile {
  id: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelBruttoCent: number;
  ust: number;
  artikelNummer: string;
}

export class EntwurfFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = "EntwurfFehler";
  }
}

/** Nur ein Entwurf darf geändert werden. Alles andere ist gebucht. */
async function entwurfHolen(id: string): Promise<Rechnung> {
  const r = await rechnungLesen(id);
  if (!r) throw new EntwurfFehler("Diese Rechnung gibt es nicht.");
  if (r.status !== "DRAFT") {
    throw new EntwurfFehler(
      "Diese Rechnung ist schon festgeschrieben. Ändern lässt sie sich nur noch über eine Gutschrift.",
    );
  }
  return r;
}

/**
 * Der Steuersatz als Anteil, egal wie er hereinkommt.
 *
 * Im Haus gibt es den Satz in zwei Schreibweisen: Der Artikelstamm und
 * die Angebotspositionen fuehren ihn als Anteil (0.07), das Formular
 * zeigt Prozent (7). Beides meint dasselbe, und wer sie verwechselt,
 * macht aus sieben Prozent siebenhundert (gefunden am 30.10.2026).
 *
 * Gespeichert wird immer der Anteil, denn so rechnet das PDF.
 */
export function ustAnteil(wert: unknown): number {
  const n = Number(wert);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const anteil = n > 1 ? n / 100 : n;
  // Nur die Saetze, die es wirklich gibt. Alles andere waere ein Vertipper.
  return [0.07, 0.19].reduce((naechster, satz) =>
    Math.abs(satz - anteil) < Math.abs(naechster - anteil) ? satz : naechster, 0);
}

export function summeAusZeilen(zeilen: Entwurfszeile[]): number {
  return zeilen.reduce((n, z) => n + Math.round(z.menge * z.einzelBruttoCent), 0);
}

/**
 * Die Zeilen des Entwurfs ersetzen.
 *
 * Gerechnet wird hier, nicht im Browser: Die Summe der Rechnung muss zu
 * ihren Zeilen passen, auch wenn jemand das Formular von Hand schickt.
 */
export async function zeilenSpeichern(
  id: string,
  zeilen: Entwurfszeile[],
  wer: string,
): Promise<Rechnung> {
  // Wirft, wenn die Rechnung schon festgeschrieben ist.
  await entwurfHolen(id);
  const sauber = zeilen
    .map((z, i) => ({
      id: z.id || `zeile-${i + 1}`,
      bezeichnung: z.bezeichnung.trim().slice(0, 200),
      menge: Math.max(0, Math.min(9999, Number(z.menge) || 0)),
      einheit: (z.einheit || "Stück").trim().slice(0, 30),
      einzelBruttoCent: Math.max(0, Math.round(Number(z.einzelBruttoCent) || 0)),
      ust: ustAnteil(z.ust),
      artikelNummer: (z.artikelNummer ?? "").trim().slice(0, 40),
    }))
    .filter((z) => z.bezeichnung && z.menge > 0);

  if (sauber.length === 0) throw new EntwurfFehler("Ohne Zeilen gibt es nichts zu berechnen.");

  const summe = summeAusZeilen(sauber);
  await db()`
    update rechnung
       set positionen = ${JSON.stringify(sauber)}::jsonb,
           betrag_cent = ${summe},
           geaendert_am = now()
     where id = ${id} and status = 'DRAFT'
  `;
  await merken({
    rechnungId: id,
    art: "entwurf",
    text: `Entwurf geändert: ${sauber.length} ${sauber.length === 1 ? "Zeile" : "Zeilen"}, ${(summe / 100).toFixed(2)} Euro`,
    wer,
  }).catch(() => undefined);

  return (await rechnungLesen(id))!;
}

/**
 * Aus dem Entwurf wird eine Rechnung.
 *
 * Hier und nur hier entsteht die Nummer. Danach ist die Rechnung
 * gebucht: Sie steht in den offenen Posten, der Kontoabgleich sucht sie,
 * und ändern lässt sie sich nur noch über eine Gutschrift.
 */
export async function entwurfFestschreiben(id: string, wer: string): Promise<Rechnung> {
  const r = await entwurfHolen(id);
  if (r.betragCent <= 0) throw new EntwurfFehler("Eine Rechnung über null Euro geht nicht.");

  const nummer = await naechsteRechnungsnummer();
  await db()`
    update rechnung
       set nummer = ${nummer},
           status = 'CREATED',
           rechnungsdatum = (now() at time zone 'Europe/Berlin')::date,
           faellig_am = ((now() at time zone 'Europe/Berlin')::date + zahlungsziel_tage::int),
           geaendert_am = now()
     where id = ${id} and status = 'DRAFT'
  `;
  await merken({
    rechnungId: id,
    art: "festgeschrieben",
    text: `Rechnung ${nummer} festgeschrieben über ${(r.betragCent / 100).toFixed(2)} Euro`,
    wer,
  }).catch(() => undefined);

  return (await rechnungLesen(id))!;
}

/**
 * Den Entwurf wegwerfen.
 *
 * Wirklich löschen, nicht stornieren: Er war nie eine Rechnung, hat nie
 * eine Nummer getragen und soll in keiner Liste stehen bleiben. Was
 * gebucht ist, wird dagegen storniert und bleibt sichtbar.
 */
export async function entwurfVerwerfen(id: string, wer: string): Promise<{ vorgangId: string | null }> {
  const r = await entwurfHolen(id);
  await db()`delete from rechnung_ereignis where rechnung_id = ${id}`.catch(() => undefined);
  await db()`delete from rechnung where id = ${id} and status = 'DRAFT'`;
  console.info(`[rechnung] Entwurf ${r.nummer} verworfen von ${wer}`);
  return { vorgangId: r.vorgangId ?? null };
}

/**
 * Eine eingebuchte Rechnung ändern: Korrekturrechnung und neuer Entwurf.
 *
 * "die möglichkeit 'rechnung ändern' (dann wie gewohnt eine korrektur
 * rechnung, falls die schon eingebucht und versendet war!) selbe
 * vorgehensweise wie bei flotix" (Florian, 30.10.2026).
 *
 * Sobald eine Nummer vergeben ist, wird an der Rechnung nichts mehr
 * geändert. Sie ist gebucht, der Kunde hat sie womöglich in seiner
 * Buchhaltung liegen, und eine Rechnung, die sich hinterher ändert, ist
 * keine. Stattdessen passiert dasselbe wie bei FloTix:
 *
 *  1. Eine Korrekturrechnung mit eigener Nummer aus demselben Kreis.
 *     Sie nennt dieselben Zeilen mit umgekehrtem Vorzeichen und hebt
 *     die alte damit auf. Die alte bleibt unverändert im Archiv stehen.
 *  2. Ein neuer Entwurf mit denselben Zeilen zum Weiterarbeiten. Was
 *     daraus wird, entscheidet sich beim Einbuchen.
 *
 * Der Kunde bekommt am Ende zwei Belege: die Korrektur zur alten und
 * die neue Rechnung. Genau so erwartet es sein Steuerberater.
 */
export async function rechnungKorrigieren(
  id: string,
  wer: string,
  /**
   * Nur aufheben, ohne Nachfolger.
   *
   * "storno möglichkeit einer Rechnung brauchen wir auch im manager"
   * (Florian, 30.10.2026). Stornieren und Ändern sind derselbe Vorgang,
   * nur hört das Stornieren nach der Korrekturrechnung auf: Es kommt
   * keine neue Rechnung mehr, die Leistung fällt ja weg.
   */
  nurStorno = false,
): Promise<{ stornoNummer: string; entwurfId: string | null }> {
  const r = await rechnungLesen(id);
  if (!r) throw new EntwurfFehler("Diese Rechnung gibt es nicht.");
  if (r.status === "DRAFT") {
    throw new EntwurfFehler("Das ist noch ein Entwurf, der lässt sich direkt ändern.");
  }
  if (r.status === "CANCELLED") {
    throw new EntwurfFehler("Diese Rechnung ist bereits storniert.");
  }
  if (r.status === "PAID" || r.status === "PARTIALLY_PAID") {
    /*
      Auf einer bezahlten Rechnung liegt Geld. Die Korrektur erzeugt
      dann eine Rueckzahlung, und das soll jemand bewusst tun, nicht
      nebenbei mit einem Knopf.
    */
    throw new EntwurfFehler(
      "Auf diese Rechnung ist schon Geld eingegangen. Bitte erst die Zahlung klären, dann korrigieren.",
    );
  }

  const [alt] = (await db()`
    select positionen, absender, leistung, leistungszeitraum, kunde, kunde_email, kunde_anschrift,
           quelle, vorgang_id, angebot_id, zahlungsziel_tage, betrag_cent
      from rechnung where id = ${id}
  `) as Array<Record<string, unknown>>;
  const zeilen = (Array.isArray(alt?.positionen) ? alt.positionen : []) as Entwurfszeile[];
  if (zeilen.length === 0) throw new EntwurfFehler("Diese Rechnung hat keine Zeilen zum Umkehren.");

  // 1. Die Korrekturrechnung: dieselben Zeilen, Vorzeichen umgedreht.
  const stornoNummer = await naechsteRechnungsnummer();
  const gegenzeilen = zeilen.map((z) => ({ ...z, einzelBruttoCent: -z.einzelBruttoCent }));
  const [storno] = (await db()`
    insert into rechnung (nummer, quelle, vorgang_id, kunde, kunde_email, kunde_anschrift,
                          betrag_cent, rechnungsdatum, zahlungsziel_tage, faellig_am,
                          leistung, notiz, erstellt_von, status, positionen, absender,
                          leistungszeitraum)
    values (${stornoNummer}, ${String(alt.quelle ?? "vorgang")}, ${alt.vorgang_id ?? null},
            ${String(alt.kunde ?? "")}, ${String(alt.kunde_email ?? "")},
            ${JSON.stringify(alt.kunde_anschrift ?? null)}::jsonb,
            ${-Number(alt.betrag_cent ?? 0)},
            (now() at time zone 'Europe/Berlin')::date, 0,
            (now() at time zone 'Europe/Berlin')::date,
            ${`Korrektur zu Rechnung ${r.nummer} vom ${r.rechnungsdatum.split("-").reverse().join(".")}`},
            ${`Hebt Rechnung ${r.nummer} vollständig auf.`},
            ${wer}, 'CREATED', ${JSON.stringify(gegenzeilen)}::jsonb,
            ${JSON.stringify(alt.absender ?? null)}::jsonb, ${String(alt.leistungszeitraum ?? "")})
    returning id
  `) as Array<{ id: string }>;

  // 2. Die alte Rechnung ist damit erledigt, bleibt aber stehen.
  await db()`
    update rechnung
       set status = 'CANCELLED', storniert_am = now(),
           storniert_grund = ${`Korrigiert, siehe ${stornoNummer}`}, geaendert_am = now()
     where id = ${id}
  `;
  await merken({
    rechnungId: id,
    art: "korrigiert",
    text: nurStorno
      ? `Storniert mit Korrekturrechnung ${stornoNummer}`
      : `Aufgehoben durch Korrekturrechnung ${stornoNummer}, neuer Entwurf angelegt`,
    wer,
  }).catch(() => undefined);

  if (nurStorno) {
    console.info(`[rechnung] ${r.nummer} storniert mit Beleg ${stornoNummer} (${storno.id})`);
    return { stornoNummer, entwurfId: null };
  }

  // 3. Der neue Entwurf, zum Weiterarbeiten.
  const [entwurf] = (await db()`
    insert into rechnung (nummer, quelle, vorgang_id, angebot_id, kunde, kunde_email, kunde_anschrift,
                          betrag_cent, rechnungsdatum, zahlungsziel_tage, faellig_am,
                          leistung, notiz, erstellt_von, status, positionen, absender,
                          leistungszeitraum)
    values (${`ENTWURF-${Date.now().toString(36).toUpperCase()}`}, ${String(alt.quelle ?? "vorgang")},
            ${alt.vorgang_id ?? null}, ${alt.angebot_id ?? null},
            ${String(alt.kunde ?? "")}, ${String(alt.kunde_email ?? "")},
            ${JSON.stringify(alt.kunde_anschrift ?? null)}::jsonb,
            ${Number(alt.betrag_cent ?? 0)},
            (now() at time zone 'Europe/Berlin')::date, ${Number(alt.zahlungsziel_tage ?? 14)},
            ((now() at time zone 'Europe/Berlin')::date + ${Number(alt.zahlungsziel_tage ?? 14)}::int),
            ${String(alt.leistung ?? "")}, ${`Ersetzt Rechnung ${r.nummer}`},
            ${wer}, 'DRAFT', ${JSON.stringify(zeilen)}::jsonb,
            ${JSON.stringify(alt.absender ?? null)}::jsonb, ${String(alt.leistungszeitraum ?? "")})
    returning id
  `) as Array<{ id: string }>;

  console.info(`[rechnung] ${r.nummer} korrigiert: Storno ${stornoNummer} (${storno.id}), Entwurf ${entwurf.id}`);
  return { stornoNummer, entwurfId: String(entwurf.id) };
}
