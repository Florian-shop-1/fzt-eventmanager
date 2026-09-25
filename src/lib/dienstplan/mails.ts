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
export async function eingeteiltMail(o: {
  an: Person;
  wer: string;
  termin: Vorstellungstermin;
  position: Position;
  notiz?: string | null;
}) {
  const vorname = o.wer.split(" ")[0];
  return schicken([o.an], `Du bist eingeteilt: ${datumMitWochentag(o.termin.datum)}`, () => ({
    absaetze: [
      `${vorname} hat dich für diese Show eingeteilt:`,
      ...(o.notiz ? [`Notiz von ${vorname}: ${o.notiz}`] : []),
      "Wenn du nicht kannst, klick im Dienstplan auf „Ich kann nicht“, dann werden die anderen gefragt.",
    ],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Zum Dienstplan",
    link: `${appUrl()}/dienstplan`,
  }));
}

/**
 * Florian oder Kevin fragen eine Person direkt. Nur sie bekommt die Mail,
 * und sie entscheidet selbst: zusagen oder absagen.
 */
export async function anfrageMail(o: {
  an: Person;
  wer: string;
  termin: Vorstellungstermin;
  position: Position;
  notiz?: string | null;
}) {
  const vorname = o.wer.split(" ")[0];
  const link = `${appUrl()}/dienstplan?s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`;
  return schicken([o.an], `Kannst du am ${datumMitWochentag(o.termin.datum)}?`, () => ({
    absaetze: [
      `${vorname} fragt, ob du diese Show übernehmen kannst:`,
      ...(o.notiz ? [`Notiz von ${vorname}: ${o.notiz}`] : []),
      "Im Dienstplan kannst du mit einem Klick zusagen oder absagen. Erst mit deiner Zusage bist du eingeteilt.",
    ],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Zusagen oder absagen",
    link,
  }));
}

/** Die Antwort auf eine direkte Anfrage geht zurück an den, der gefragt hat. */
export async function anfrageAntwortMail(o: {
  an: Person;
  wer: string;
  termin: Vorstellungstermin;
  position: Position;
  zugesagt: boolean;
  grund?: string | null;
}) {
  return schicken(
    [o.an],
    o.zugesagt
      ? `${o.wer} sagt zu: ${datumMitWochentag(o.termin.datum)}`
      : `${o.wer} kann am ${datumMitWochentag(o.termin.datum)} nicht`,
    () => ({
      absaetze: o.zugesagt
        ? [`${o.wer} hat zugesagt und ist eingeteilt.`]
        : [
            `${o.wer} kann diese Schicht nicht übernehmen${o.grund ? ` (${o.grund})` : ""}.`,
            "Die Schicht steht wieder so da wie vorher. Du kannst jemand anderen fragen.",
          ],
      liste: [schichtText(o.termin, o.position)],
      knopf: "Zum Dienstplan",
      link: `${appUrl()}/dienstplan?s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`,
    }),
  );
}

/**
 * Jemand hat unter einer Show etwas geschrieben.
 *
 * Geht an alle, die unter dieser Show eingeteilt sind oder dort schon
 * geschrieben haben, so wie man bei Facebook eine Benachrichtigung
 * bekommt, wenn unter einem Beitrag weitergeredet wird, an dem man
 * beteiligt ist. Nicht an den Schreiber selbst (Florian, 23.09.2026).
 */
export async function kommentarMail(o: {
  an: Person[];
  wer: string;
  termin: Vorstellungstermin;
  text: string;
  antwort: boolean;
}) {
  const vorname = o.wer.split(" ")[0];
  const link = `${appUrl()}/dienstplan?s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`;
  const kurz = o.text.length > 300 ? `${o.text.slice(0, 300)}...` : o.text;
  return schicken(
    o.an,
    `${vorname} schreibt zum ${datumMitWochentag(o.termin.datum)}`,
    () => ({
      absaetze: [
        o.antwort
          ? `${vorname} hat auf einen Kommentar zu dieser Show geantwortet:`
          : `${vorname} hat etwas zu dieser Show geschrieben:`,
        `"${kurz}"`,
      ],
      liste: [`${datumMitWochentag(o.termin.datum)}, ${o.termin.uhrzeit} Uhr, ${o.termin.name}`],
      knopf: "Im Dienstplan antworten",
      link,
    }),
  );
}

/**
 * Ein Rookie lernt an einer schon besetzten Position mit.
 *
 * Die Mail geht an den, der die Position hatte: Er macht den Abend nicht
 * mehr allein, sondern geht als Shadow mit. Das muss er vorher wissen.
 *
 * Bewusst eine Mitteilung und keine Frage: Einen Rookie mitzunehmen gehört
 * zur Position, da hat der Techniker nicht zu widersprechen (Florian,
 * 23.09.2026). Passt der Abend wirklich nicht, klärt das Florian.
 */
export async function mitlernenMail(o: {
  an: Person;
  rookie: string;
  termin: Vorstellungstermin;
  position: Position;
}) {
  const link = `${appUrl()}/dienstplan?s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`;
  return schicken([o.an], `${o.rookie} lernt bei dir mit, ${datumMitWochentag(o.termin.datum)}`, () => ({
    absaetze: [
      `${o.rookie} lernt an diesem Abend ${BEZEICHNUNG[o.position]} und geht dafür auf deine Position.`,
      "Du bist deshalb an dem Abend als Shadow eingetragen: Du gehst mit, springst ein, wenn es klemmt, und hast das letzte Wort.",
      "Danke, dass du ihn mitnimmst. So lernt bei uns jeder die Position.",
    ],
    liste: [schichtText(o.termin, o.position)],
    knopf: "Im Dienstplan ansehen",
    link,
  }));
}

/**
 * Der Aufruf an alle: Wer spielt den eingeweihten Zuschauer?
 *
 * Diese Position kann jeder. Deshalb geht die Anfrage nicht nur an die
 * Leute einer Position, sondern ans ganze Haus, und sie erklärt in zwei
 * Sätzen, dass man nichts können muss (Florian, 23.09.2026).
 */
export async function zuschauerGesuchtMail(o: {
  an: Person[];
  termin: Vorstellungstermin;
  wer: string;
  notiz?: string | null;
}) {
  const link = `${appUrl()}/dienstplan?nur=alle&s=${o.termin.ditixEventId}#s-${o.termin.ditixEventId}`;
  return schicken(o.an, `Wer macht den Zuschauer am ${datumMitWochentag(o.termin.datum)}?`, () => ({
    absaetze: [
      "für diese Show fehlt uns noch der eingeweihte Zuschauer im Publikum.",
      "Das kann jeder von euch: Wir zeigen es dir 30 Minuten vor Einlass, es ist wirklich einfach, und du bist nur in der ersten Hälfte dran.",
      ...(o.notiz ? [`${o.wer} schreibt dazu: ${o.notiz}`] : []),
      "Trag dich einfach im Dienstplan ein. Fragen dazu kannst du gern als Kommentar unter die Show schreiben, dann sehen es alle.",
      "Wenn du an dem Abend als Rookie mitläufst: Du darfst wechseln. Deine bisherige Position wird dann automatisch wieder ausgeschrieben.",
    ],
    liste: [`${datumMitWochentag(o.termin.datum)}, ${o.termin.uhrzeit} Uhr, ${o.termin.name}`],
    knopf: "Ich mache das",
    link,
  }));
}
