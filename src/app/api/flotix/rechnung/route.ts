import { NextResponse } from "next/server";
import { handRechnungAnlegen } from "@/lib/rechnung/hand";
import { rechnungsMailtext } from "@/lib/rechnung/mailversand";
import { rechnungsPdfEvent } from "@/lib/rechnung/pdf-event";
import { rechnungsDateiname, rechnungsPdfDaten } from "@/lib/rechnung/pdfdaten";
import { versandMerken } from "@/lib/rechnung/db";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * FloTix verkauft auf Rechnung (Florian, 21.10.2026).
 *
 * Wer in der Kasse "Auf Rechnung" waehlt, bekommt seine Tickets sofort. Die Rechnung dazu entsteht hier, im
 * Rechnungswesen des Eventmanagers: mit Rechnungsnummer, Zahlungsziel und der Bankverbindung im Hausstil, per Mail mit
 * PDF an den Kunden. Alles Weitere laeuft wie bei jeder anderen Rechnung: Der Abgleich mit dem Konto setzt sie auf
 * "Bezahlt", die Uebersicht unter /rechnungen zeigt, welche draussen sind, und es gibt die freundlichen Erinnerungen.
 *
 * Geschuetzt wie die anderen FloTix-Routen (FLOTIX_KEY, Kopf x-eventmanager-key).
 * Antworten: 200 angelegt (mailGesendet sagt, ob die Mail raus ist), 400 Angaben fehlen, 401, 502, 503.
 */

export const dynamic = "force-dynamic";

interface Eingabe {
  bestellnummer?: string;
  kunde?: string;
  ansprechpartner?: string;
  email?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  leistung?: string;
  leistungszeitraum?: string;
  zahlungszielTage?: number;
  von?: string;
  /** Eine von FloTix schon vergebene Rechnungsnummer: Dann ist das hier nur das Gegenstueck fuer Kontoabgleich und Erinnerung. */
  nummer?: string;
  /** FloTix hat die Rechnung selbst verschickt: Hier geht keine Mail raus, sie steht als versendet. */
  nichtMailen?: boolean;
  positionen?: Array<{ bezeichnung?: string; menge?: number; einzelBruttoCent?: number; ust?: number }>;
}

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => ({}))) as Eingabe;
  const positionen = (d.positionen ?? [])
    .map((p) => ({
      bezeichnung: String(p.bezeichnung ?? "").trim().slice(0, 200),
      menge: Number(p.menge),
      einheit: "Stück",
      einzelBruttoCent: Math.round(Number(p.einzelBruttoCent)),
      ust: Number(p.ust ?? 7),
    }))
    .filter((p) => p.bezeichnung && p.menge > 0 && Number.isFinite(p.einzelBruttoCent));

  const kunde = String(d.kunde ?? "").trim().slice(0, 160);
  const email = String(d.email ?? "").trim().slice(0, 200);
  const nummer = String(d.bestellnummer ?? "").trim().slice(0, 60);
  if (
    !kunde || !email.includes("@") || !String(d.strasse ?? "").trim() || !String(d.plz ?? "").trim() ||
    !String(d.ort ?? "").trim() || positionen.length === 0 || !nummer
  ) {
    return NextResponse.json({ ok: false, fehler: "Name, Adresse, E-Mail, Bestellnummer und Positionen werden gebraucht" }, { status: 400 });
  }
  const von = String(d.von ?? "FloTix").slice(0, 80);
  const ziel = Math.min(60, Math.max(1, Math.round(Number(d.zahlungszielTage) || 14)));

  let rechnung;
  try {
    rechnung = await handRechnungAnlegen({
      kunde,
      ansprechpartner: String(d.ansprechpartner ?? "").trim() || undefined,
      email,
      strasse: String(d.strasse).trim(),
      plz: String(d.plz).trim(),
      ort: String(d.ort).trim(),
      leistung: String(d.leistung ?? `Tickets, Bestellung ${nummer}`).slice(0, 200),
      leistungszeitraum: String(d.leistungszeitraum ?? "").slice(0, 80) || undefined,
      zahlungszielTage: ziel,
      notiz: `FloTix, Bestellung ${nummer}`,
      positionen,
      von,
      nummer: String(d.nummer ?? "").trim() || undefined,
    });
  } catch (fehler) {
    console.error("[flotix/rechnung] nicht angelegt:", fehler);
    return NextResponse.json({ ok: false, fehler: fehler instanceof Error ? fehler.message : "Rechnung nicht angelegt" }, { status: 502 });
  }

  // Per Mail mit PDF. Klappt das nicht, ist die Rechnung trotzdem angelegt und laesst sich unter /rechnungen verschicken.
  let mailGesendet = false;
  if (d.nichtMailen !== true) {
    try {
      const mail = await rechnungsMailtext({
        ansprechpartner: String(d.ansprechpartner ?? "").trim() || null,
        nummer: rechnung.nummer,
        faelligAm: rechnung.faelligAm,
        betragCent: rechnung.betragCent,
        leistung: rechnung.leistung,
        quelle: "hand",
        absender: von,
        zahlungszielTage: ziel,
      });
      const daten = await rechnungsPdfDaten(rechnung.id);
      if (!daten) throw new Error("Zu dieser Rechnung fehlen die Positionen.");
      const pdf = await rechnungsPdfEvent(daten);
      const nl = String.fromCharCode(10);
      await mailVerschicken({
        an: email,
        betreff: mail.betreff,
        text: `${mail.text}${nl}${nl}P.S. Deine Tickets haben wir dir separat geschickt.`,
        anhaenge: [{ name: rechnungsDateiname(daten.nummer), typ: "application/pdf", base64: pdf.toString("base64") }],
      });
      await versandMerken({ rechnungId: rechnung.id, an: email, wer: von });
      mailGesendet = true;
    } catch (fehler) {
      const meldung = fehler instanceof Error ? fehler.message : "Mail nicht verschickt";
      console.error("[flotix/rechnung] Mail:", meldung);
      await versandMerken({ rechnungId: rechnung.id, an: email, fehler: meldung, wer: von }).catch(() => undefined);
    }
  }

  // FloTix hat sie verschickt: Hier gilt sie als versendet, damit der Abgleich und die Erinnerungen sie wie jede andere behandeln.
  if (d.nichtMailen === true) {
    await versandMerken({ rechnungId: rechnung.id, an: email, wer: von }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, nummer: rechnung.nummer, id: rechnung.id, faelligAm: rechnung.faelligAm, mailGesendet });
}
