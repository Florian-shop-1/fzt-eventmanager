import { NextResponse } from "next/server";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * FloTix bittet um eine Rueckueberweisung (Florian, 21.10.2026).
 *
 * Eine Erstattung per Ueberweisung ist der Notfall: Kein anderer Weg macht Arbeit von Hand. FloTix schickt die
 * Angaben hierher, und der Eventmanager verschickt die Mail an Werner und Florian mit der Bitte zu ueberweisen.
 * Die IBAN steht nur in dieser Mail, FloTix speichert sie nicht.
 *
 * Geschuetzt wie die anderen FloTix-Routen (FLOTIX_KEY, Kopf x-eventmanager-key).
 * Empfaenger: ERSTATTUNG_MAIL_AN (kommagetrennt), sonst Werner und Florian.
 *
 * Antworten: 200 verschickt, 400 Angaben fehlen, 401 Schluessel, 502 Versand gescheitert, 503 nicht eingerichtet.
 */

export const dynamic = "force-dynamic";

const STANDARD_EMPFAENGER = ["w.zimmer@florianzimmer.com", "info@florianzimmer.com"];

const euro = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " EUR";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => ({}))) as {
    bestellnummer?: string; betragCent?: number; iban?: string; kontoinhaber?: string; grund?: string;
    gast?: string; wer?: string; show?: string; umfang?: string;
  };
  const betrag = Math.round(Number(d.betragCent));
  const iban = String(d.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const inhaber = String(d.kontoinhaber ?? "").trim().slice(0, 120);
  const nummer = String(d.bestellnummer ?? "").trim().slice(0, 60);
  if (!nummer || !(betrag > 0) || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || inhaber.length < 2) {
    return NextResponse.json({ ok: false, fehler: "Bestellnummer, Betrag, IBAN und Kontoinhaber werden gebraucht" }, { status: 400 });
  }

  const an = (process.env.ERSTATTUNG_MAIL_AN ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const empfaenger = an.length > 0 ? an : STANDARD_EMPFAENGER;
  const ibanLesbar = iban.replace(/(.{4})/g, "$1 ").trim();
  const gast = String(d.gast ?? "").slice(0, 120);
  const show = String(d.show ?? "").slice(0, 160);
  const umfang = String(d.umfang ?? "").slice(0, 300);
  const grund = String(d.grund ?? "").slice(0, 300);
  const wer = String(d.wer ?? "FloTix").slice(0, 80);

  const zeilen = [
    "Bitte diese Rückerstattung per Überweisung ausführen.",
    "",
    `Betrag: ${euro(betrag)}`,
    `Kontoinhaber: ${inhaber}`,
    `IBAN: ${ibanLesbar}`,
    `Verwendungszweck: Erstattung Bestellung ${nummer}`,
    "",
    `Bestellung: ${nummer}${gast ? ` (${gast})` : ""}`,
    ...(show ? [`Show: ${show}`] : []),
    ...(umfang ? [`Storniert wurde: ${umfang}`] : []),
    `Grund: ${grund || "nicht angegeben"}`,
    `Angefordert von: ${wer}`,
    "",
    "Dies ist der Notfallweg, bei dem alles von Hand läuft. Bitte kurz in FloTix bei der Bestellung vermerken, sobald überwiesen wurde.",
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.5">
<p><strong>Bitte diese Rückerstattung per Überweisung ausführen.</strong></p>
<table style="border-collapse:collapse;margin:10px 0">
<tr><td style="padding:3px 14px 3px 0;color:#666">Betrag</td><td><strong>${esc(euro(betrag))}</strong></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#666">Kontoinhaber</td><td><strong>${esc(inhaber)}</strong></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#666">IBAN</td><td><strong>${esc(ibanLesbar)}</strong></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#666">Verwendungszweck</td><td>Erstattung Bestellung ${esc(nummer)}</td></tr>
</table>
<p style="color:#555">Bestellung ${esc(nummer)}${gast ? ` (${esc(gast)})` : ""}${show ? `<br>Show: ${esc(show)}` : ""}${umfang ? `<br>Storniert wurde: ${esc(umfang)}` : ""}<br>Grund: ${esc(grund || "nicht angegeben")}<br>Angefordert von: ${esc(wer)}</p>
<p style="color:#555">Dies ist der Notfallweg, bei dem alles von Hand läuft. Bitte kurz in FloTix bei der Bestellung vermerken, sobald überwiesen wurde.</p></div>`;

  try {
    await mailVerschicken({
      an: empfaenger,
      betreff: `Bitte überweisen: ${euro(betrag)} an ${inhaber} (Bestellung ${nummer})`,
      text: zeilen.join("\n"),
      html,
      antwortAn: "tickets@florianzimmer.com",
    });
    return NextResponse.json({ ok: true, an: empfaenger.length });
  } catch (fehler) {
    console.error("[flotix/erstattung] Versand gescheitert:", fehler);
    return NextResponse.json({ ok: false, fehler: "Versand gescheitert" }, { status: 502 });
  }
}
