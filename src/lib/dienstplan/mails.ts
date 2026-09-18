/**
 * Mails rund um den Dienstplan. Gehen über das Postfach (Microsoft), nicht
 * über Brevo: Es sind interne Mails an Mitarbeiter, keine Werbung.
 */

import { mailVerschicken } from "@/lib/mail/versand";
import { datumMitWochentag } from "@/lib/zeit";
import type { Vorstellungstermin } from "@/lib/ditix/spielplan";
import { BEZEICHNUNG, ERKLAERUNG, type Person, type Position } from "./plan";

export function appUrl(): string {
  return process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function schichtText(t: Vorstellungstermin, position: Position): string {
  return `${datumMitWochentag(t.datum)}, ${t.uhrzeit} Uhr, ${t.name}: ${BEZEICHNUNG[position]} (${ERKLAERUNG[position]})`;
}

/** Ein schlichter Rahmen in den Farben des Hauses, mit einem großen Knopf. */
function rahmen(anrede: string, absaetze: string[], liste: string[], knopf: string, link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#1d1b18;color:#c9a45c;padding:14px 24px;font-size:13px;letter-spacing:2px;text-transform:uppercase">Dienstplan Showteam</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">${h(anrede)}</p>
${absaetze.map((a) => `<p style="margin:0 0 14px">${h(a)}</p>`).join("")}
${liste.length ? `<ul style="margin:0 0 18px;padding-left:18px">${liste.map((l) => `<li style="margin:0 0 6px">${h(l)}</li>`).join("")}</ul>` : ""}
<p style="margin:22px 0 8px"><a href="${h(link)}" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${h(knopf)}</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#7a746b">Florian Zimmer Theater, Eventmanager</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function schicken(an: Person[], betreff: string, bau: (p: Person) => { absaetze: string[]; liste: string[]; knopf: string; link: string }) {
  const fehler: string[] = [];
  for (const p of an) {
    const b = bau(p);
    const anrede = `Hallo ${p.vorname},`;
    try {
      await mailVerschicken({
        an: p.email,
        betreff,
        text: [anrede, "", ...b.absaetze, "", ...b.liste.map((l) => `- ${l}`), "", `${b.knopf}: ${b.link}`].join("\n"),
        html: rahmen(anrede, b.absaetze, b.liste, b.knopf, b.link),
      });
    } catch (f) {
      fehler.push(`${p.email}: ${f instanceof Error ? f.message : f}`);
    }
  }
  if (fehler.length) console.error("[dienstplan] Mails fehlgeschlagen:", fehler.join("; "));
  return fehler;
}

/** Jemand kann nicht und fragt die Kollegen der gleichen Position. */
export async function ersatzGesuchtMail(o: {
  an: Person[];
  wer: string;
  termin: Vorstellungstermin;
  position: Position;
  grund: string | null;
}) {
  const link = `${appUrl()}/dienstplan?s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`;
  return schicken(o.an, `Kannst du einspringen? ${datumMitWochentag(o.termin.datum)}, ${BEZEICHNUNG[o.position]}`, () => ({
    absaetze: [
      `${o.wer} kann an diesem Abend nicht und sucht jemanden, der übernimmt${o.grund ? ` (${o.grund})` : ""}.`,
      "Wenn du kannst, trag dich mit einem Klick ein. Wer zuerst kommt, übernimmt.",
    ],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Ich übernehme",
    link,
  }));
}

/** Eine Schicht ist offen, zum Beispiel weil Florian sie freigegeben hat. */
export async function offeneSchichtenMail(o: {
  an: Person;
  schichten: Array<{ termin: Vorstellungstermin; position: Position }>;
  dringend: boolean;
}) {
  const n = o.schichten.length;
  return schicken(
    [o.an],
    o.dringend
      ? `Dringend: ${n === 1 ? "eine Schicht ist" : `${n} Schichten sind`} noch nicht besetzt`
      : `${n === 1 ? "Eine Schicht sucht" : `${n} Schichten suchen`} noch jemanden`,
    () => ({
      absaetze: [
        n === 1
          ? "für diese Show ist deine Position noch nicht besetzt:"
          : "für diese Shows ist deine Position noch nicht besetzt:",
        "Wenn du kannst, trag dich im Dienstplan ein. Ein Klick reicht.",
      ],
      liste: o.schichten.map((s) => schichtText(s.termin, s.position)),
      knopf: "Zum Dienstplan",
      link: `${appUrl()}/dienstplan`,
    }),
  );
}

/** Jemand hat die Schicht übernommen, für die du Ersatz gesucht hast. */
export async function uebernommenMail(o: { an: Person; wer: string; termin: Vorstellungstermin; position: Position }) {
  return schicken([o.an], `${o.wer} übernimmt deine Schicht am ${datumMitWochentag(o.termin.datum)}`, () => ({
    absaetze: [`gute Nachricht: ${o.wer} übernimmt für dich. Du hast an diesem Abend frei.`],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Zum Dienstplan",
    link: `${appUrl()}/dienstplan`,
  }));
}

/** Florian hat jemanden eingeteilt. */
export async function eingeteiltMail(o: { an: Person; wer: string; termin: Vorstellungstermin; position: Position }) {
  return schicken([o.an], `Du bist eingeteilt: ${datumMitWochentag(o.termin.datum)}`, () => ({
    absaetze: [`${o.wer} hat dich für diese Show eingeteilt:`, "Wenn du nicht kannst, such im Dienstplan einen Ersatz."],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Zum Dienstplan",
    link: `${appUrl()}/dienstplan`,
  }));
}
