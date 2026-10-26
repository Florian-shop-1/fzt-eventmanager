/**
 * Die Mail, wenn eine neue Anfrage hereinkommt.
 * Siehe migrations/175_anfrage_gemeldet.sql.
 *
 * Bisher kam sie aus Make und verlinkte in die Google-Tabelle. "wir
 * wollen uns von den google tabellen lösen" (Florian, 14.10.2026):
 * Jetzt meldet der Eventmanager selbst und verlinkt auf genau diese
 * Anfrage bei sich, wo man sie auch gleich bearbeiten kann.
 *
 * Gemeldet wird jede Anfrage nur einmal. Beim allerersten Lauf wird gar
 * nichts verschickt, sondern der Bestand still vermerkt: Sonst gingen
 * auf einen Schlag Mails zu allen Anfragen der letzten Monate hinaus.
 */

import { db } from "@/lib/db/client";
import { holeLeads, istStoerung, type Lead } from "@/lib/shop/leads";
import { mailVerschicken } from "@/lib/mail/versand";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const NL = String.fromCharCode(10);

/**
 * Wohin die Meldung geht. Ohne eigene Angabe ins Ticketpostfach.
 * Mehrere Adressen mit Komma (Julian, 20.10.2026: Kevin, Florian und Julian;
 * die Mail aus Make an Kevin fällt dafür weg).
 */
function empfaenger(): string[] {
  return (process.env.ANFRAGEN_MELDEN_AN ?? process.env.MAIL_ABSENDER ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function zeilen(l: Lead): Array<[string, string]> {
  return [
    ["Name", l.name],
    ["Firma", l.firma],
    ["E-Mail", l.email],
    ["Telefon", l.telefon],
    ["Teilnehmer", l.teilnehmer],
    ["Wunschdatum", l.wunschdatum],
    ["Art der Anfrage", l.anfragetyp],
    ["Herkunft", l.herkunft ?? ""],
    ["Kommentar", l.kommentar],
  ].filter(([, w]) => String(w).trim() !== "") as Array<[string, string]>;
}

export interface Meldelauf {
  neu: number;
  gemeldet: string[];
  ersterLauf: boolean;
  fehler: string[];
}

export async function anfragenMelden(): Promise<Meldelauf> {
  const ergebnis: Meldelauf = { neu: 0, gemeldet: [], ersterLauf: false, fehler: [] };

  const alle = (await holeLeads()).filter((l) => !istStoerung(l));
  if (alle.length === 0) return ergebnis;

  const schon = new Set(
    ((await db()`select schluessel from anfrage_gemeldet`) as Array<{ schluessel: string }>).map(
      (z) => z.schluessel,
    ),
  );

  const neue = alle.filter((l) => !schon.has(l.schluessel));
  ergebnis.neu = neue.length;

  // Der erste Lauf merkt sich nur den Bestand.
  if (schon.size === 0) {
    ergebnis.ersterLauf = true;
    for (const l of alle) {
      await db()`
        insert into anfrage_gemeldet (schluessel) values (${l.schluessel}) on conflict do nothing
      `;
    }
    return ergebnis;
  }

  const an = empfaenger();
  for (const l of neue) {
    const link = `${APP}/leads?lead=${encodeURIComponent(l.schluessel)}`;
    const felder = zeilen(l);
    const wer = l.name || l.email || "Jemand";

    try {
      if (an.length) {
        await mailVerschicken({
          an,
          // Antworten gehen direkt an den Anfragenden.
          ...(l.email.includes("@") ? { antwortAn: l.email } : {}),
          betreff: `Neue Anfrage: ${wer}${l.wunschdatum ? ` (${l.wunschdatum})` : ""}`,
          text: [
            "Es ist eine neue Anfrage hereingekommen.",
            "",
            ...felder.map(([t, w]) => `${t}: ${w}`),
            "",
            `Im Eventmanager ansehen und bearbeiten: ${link}`,
          ].join(NL),
          html:
            `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">`
            + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;font-size:15px;line-height:1.55">`
            + `<p style="margin:0 0 14px">Es ist eine neue Anfrage hereingekommen.</p>`
            + `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">`
            + felder
              .map(
                ([t, w]) =>
                  `<tr><td style="padding:2px 14px 2px 0;color:#7a746b">${h(t)}</td><td style="padding:2px 0"><strong>${h(String(w))}</strong></td></tr>`,
              )
              .join("")
            + `</table>`
            + `<p style="margin:22px 0 8px"><a href="${h(link)}" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Im Eventmanager ansehen</a></p>`
            + `<p style="margin:18px 0 0;font-size:12px;color:#7a746b">Florian Zimmer Theater, Eventmanager</p>`
            + `</div></body></html>`,
        });
      }
      await db()`
        insert into anfrage_gemeldet (schluessel) values (${l.schluessel}) on conflict do nothing
      `;
      ergebnis.gemeldet.push(wer);
    } catch (f) {
      ergebnis.fehler.push(`${wer}: ${f instanceof Error ? f.message : f}`);
    }
  }

  if (ergebnis.fehler.length) console.error("[anfragen]", ergebnis.fehler.join("; "));
  return ergebnis;
}
