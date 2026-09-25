/**
 * Wer heute Geburtstag hat.
 *
 * Das Datum steht in der Geheimhaltungsvereinbarung (migrations/018), dort
 * trägt es jeder beim Eintragen selbst ein, im Format TT.MM.JJJJ.
 *
 * Gezeigt wird ausdrücklich nur, DASS jemand Geburtstag hat, nie das Alter
 * und nie das Geburtsjahr (Florian, 23.09.2026). Das Jahr steht zwar in
 * der Datenbank, verlässt sie aber nicht: Es geht ums Gratulieren, nicht
 * darum, wie alt jemand wird.
 */

import { db } from "@/lib/db/client";

export interface Geburtstagskind {
  id: string;
  name: string;
  vorname: string;
}

/**
 * Die Geburtstagskinder des heutigen Tages.
 *
 * Verglichen wird nur Tag und Monat, und zwar in der Datenbank über die
 * ersten fünf Zeichen ("06.03"). Damit ist es egal, wie alt der Eintrag
 * ist und ob jemand das Jahr falsch getippt hat.
 *
 * Der 29. Februar wird in Jahren ohne Schalttag am 1. März gefeiert, sonst
 * hätten diese Leute nur alle vier Jahre etwas davon.
 */
export async function heutigeGeburtstage(heute = new Date()): Promise<Geburtstagskind[]> {
  /*
    "TT.MM" selbst zusammensetzen. toLocaleDateString("de-DE") haengt bei
    Tag und Monat noch einen Punkt an ("23.09."), damit passt der
    Vergleich auf die ersten fuenf Zeichen nie. Beim Test aufgefallen.
  */
  const teile = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
  }).formatToParts(heute);
  const nur = (art: string) => teile.find((t) => t.type === art)?.value ?? "";
  const tag = `${nur("day")}.${nur("month")}`;
  const schaltjahr = (j: number) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
  const gesucht =
    tag === "01.03" && !schaltjahr(heute.getFullYear()) ? [tag, "29.02"] : [tag];

  // Zwei Quellen: das Feld am Benutzer (dort trägt es jeder selbst ein)
  // und als Rückfall die Geheimhaltungsvereinbarung von früher.
  const z = (await db()`
    select b.id, b.name
      from benutzer b
      left join geheimhaltung g on g.benutzer_id = b.id
     where b.aktiv
       and (b.geburtstag = any(${gesucht}::text[])
            or (b.geburtstag is null and left(btrim(coalesce(g.geburtsdatum, '')), 5) = any(${gesucht}::text[])))
     order by b.name
  `) as Array<{ id: string; name: string }>;

  return z.map((r) => ({ id: String(r.id), name: r.name, vorname: r.name.split(" ")[0] }));
}

/**
 * Ein Satz, den der Hase sagen kann.
 *
 * Getrennt nach "du selbst" und "die anderen": Dem Geburtstagskind sagt
 * man etwas anderes als dem Kollegen, der es wissen soll.
 */
export function geburtstagsText(kinder: Geburtstagskind[], ichId: string): string {
  const ich = kinder.find((k) => k.id === ichId);
  const andere = kinder.filter((k) => k.id !== ichId);

  if (ich && andere.length === 0) {
    return `Alles Gute zum Geburtstag, ${ich.vorname}! Heute zaubern wir für dich.`;
  }
  if (ich) {
    return (
      `Alles Gute zum Geburtstag, ${ich.vorname}! Und ${namenListe(andere.map((a) => a.vorname))} ` +
      `${andere.length === 1 ? "feiert" : "feiern"} heute auch.`
    );
  }
  if (andere.length === 1) {
    return `${andere[0].vorname} hat heute Geburtstag. Ein Glückwunsch von dir macht den Tag noch schöner.`;
  }
  return `${namenListe(andere.map((a) => a.vorname))} haben heute Geburtstag. Gratulier ihnen doch, wenn du sie siehst.`;
}

/** Wer noch kein Geburtsdatum hinterlegt hat. Einmal nachfragen, nicht drängen. */
export async function fehltGeburtstag(benutzerId: string): Promise<boolean> {
  const z = (await db()`
    select 1
      from benutzer b
      left join geheimhaltung g on g.benutzer_id = b.id
     where b.id = ${benutzerId}
       and b.geburtstag is null
       and left(btrim(coalesce(g.geburtsdatum, '')), 5) !~ '^[0-3][0-9]\.[0-1][0-9]$'
  `) as Array<unknown>;
  return z.length > 0;
}

/** Speichert Tag und Monat. Alles andere wird gar nicht erst angenommen. */
export async function geburtstagSpeichern(benutzerId: string, tag: string, monat: string): Promise<void> {
  const t = String(Number(tag)).padStart(2, "0");
  const m = String(Number(monat)).padStart(2, "0");
  if (!/^[0-3][0-9]$/.test(t) || !/^[0-1][0-9]$/.test(m)) throw new Error("Kein gültiges Datum.");
  await db()`update benutzer set geburtstag = ${`${t}.${m}`} where id = ${benutzerId}`;
}

function namenListe(namen: string[]): string {
  if (namen.length <= 1) return namen[0] ?? "";
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}
