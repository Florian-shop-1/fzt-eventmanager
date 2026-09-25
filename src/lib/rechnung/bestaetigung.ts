/**
 * Die Bestätigung, sobald das Geld da ist.
 *
 * Der Kunde hat überwiesen und wartet. Bis jetzt hat er von uns nur
 * gehört, dass die Reservierung unverbindlich bleibt, solange nicht
 * bezahlt ist. Genau diesen Satz muss jemand zurücknehmen, und zwar
 * sofort, nicht erst wenn jemand im Büro Zeit hat (Florian, 25.09.2026).
 *
 * Deshalb hängt die Mail am Zahlungseingang selbst: Egal ob der
 * Bankabgleich sie automatisch zuordnet oder jemand sie von Hand
 * einträgt, sobald die Rechnung voll bezahlt ist, geht sie raus. Einmal,
 * nie zweimal: Das hält die Spalte dank_mail_am fest.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import {
  absatz,
  GOLD,
  h,
  kasten,
  klein,
  mailRahmen,
  ueberschrift,
} from "@/lib/abbrecher/rahmen";

const NL = String.fromCharCode(10);

interface Zeile {
  id: string;
  nummer: string;
  kunde: string;
  kunde_email: string;
  betrag_cent: number;
  show: string | null;
  datum: string | null;
  ansprechpartner: string | null;
}

/** Vorname aus dem Ansprechpartner, ohne Anrede und ohne "z.Hd.". */
function anrede(ansprechpartner: string | null): string {
  if (!ansprechpartner) return "Hallo";
  const sauber = ansprechpartner
    .replace(/z\.?\s?Hd\.?/i, "")
    .replace(/\b(Herrn?|Frau)\b/gi, "")
    .trim();
  return sauber ? `Hallo ${sauber}` : "Hallo";
}

function datumLang(iso: string): string {
  const tage = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const monate = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10).split("-").reverse().join(".");
  return `${tage[d.getUTCDay()]}, ${d.getUTCDate()}. ${monate[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Schickt die Bestätigung, wenn sie fällig ist.
 *
 * Tut nichts, wenn die Rechnung nicht voll bezahlt ist, keine
 * Mailadresse hat oder die Mail schon draußen war. Der Rückgabewert sagt,
 * ob wirklich etwas rausging.
 */
export async function bestaetigungSchicken(rechnungId: string): Promise<boolean> {
  const [z] = (await db()`
    select r.id, r.nummer, r.kunde, r.kunde_email, r.betrag_cent,
           s.show, to_char(s.datum, 'YYYY-MM-DD') as datum,
           k.ansprechpartner
      from rechnung r
      left join vorgang v      on v.id = r.vorgang_id
      left join kunde k        on k.id = v.kunde_id
      left join vorstellung s  on s.id = v.vorstellung_id
     where r.id = ${rechnungId}
       and r.dank_mail_am is null
       and r.storniert_am is null
       and r.kunde_email <> ''
       and (select coalesce(sum(z.betrag_cent), 0) from rechnung_zahlung z
             where z.rechnung_id = r.id) >= r.betrag_cent
  `) as Zeile[];

  if (!z) return false;

  const betrag = (Number(z.betrag_cent) / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
  });
  const termin = z.datum ? datumLang(z.datum) : null;

  const betreff = termin
    ? `Zahlung erhalten, euer Termin am ${z.datum!.split("-").reverse().join(".")} steht fest`
    : "Zahlung erhalten, euer Termin steht fest";

  const zeilen = [
    anrede(z.ansprechpartner) + ",",
    "",
    `euer Geld ist bei uns angekommen, ${betrag} Euro zur Rechnung ${z.nummer}. Vielen Dank.`,
    "",
    termin
      ? `Damit ist euer Abend am ${termin} fest gebucht. Der Saal gehört euch, die Küche weiß Bescheid, und wir freuen uns auf euch.`
      : "Damit ist eure Veranstaltung fest gebucht. Wir freuen uns auf euch.",
    "",
    "Was jetzt noch kommt:",
    "Spätestens sieben Tage vor der Veranstaltung brauchen wir eure Menüwahl sowie Allergien",
    "und Unverträglichkeiten. Meldet euch einfach, sobald ihr die Rückmeldungen habt.",
    "",
    "Wenn euch zwischendurch etwas einfällt, ruft an oder schreibt. Wir sind für euch da.",
    "",
    "Herzliche Grüße",
    "Florian Zimmer Theater",
  ];

  const html = mailRahmen({
    titel: betreff,
    vorschau: `Zahlung über ${betrag} Euro erhalten. Euer Termin ist fest gebucht.`,
    ueberschrift: ueberschrift("Es ist fest"),
    inhalt: [
      klein("Zahlung erhalten"),
      absatz(h(anrede(z.ansprechpartner)) + ","),
      absatz(
        `euer Geld ist bei uns angekommen, <strong style="color:${GOLD};">${h(betrag)} Euro</strong> ` +
          `zur Rechnung ${h(z.nummer)}. Vielen Dank.`,
      ),
      kasten(
        termin
          ? `<strong>Euer Abend am ${h(termin)} ist fest gebucht.</strong><br />` +
              "Der Saal gehört euch, die Küche weiß Bescheid."
          : "<strong>Eure Veranstaltung ist fest gebucht.</strong>",
      ),
      absatz(
        "Spätestens sieben Tage vor der Veranstaltung brauchen wir eure Menüwahl sowie Allergien " +
          "und Unverträglichkeiten. Meldet euch einfach, sobald ihr die Rückmeldungen habt.",
      ),
      absatz("Wir freuen uns auf euch."),
    ].join(""),
    fuss: "Florian Zimmer Theater GmbH",
  });

  await mailVerschicken({ an: z.kunde_email, betreff, text: zeilen.join(NL), html });

  await db()`update rechnung set dank_mail_am = now() where id = ${rechnungId}`;
  await db()`
    insert into rechnung_ereignis (rechnung_id, art, text, wer)
    values (${rechnungId}, 'bestaetigt',
            ${`Bestätigung nach Zahlungseingang an ${z.kunde_email} verschickt`}, 'System')
  `;

  return true;
}
