/**
 * Termine ausserhalb des Hauses, und ob sie mit dem Spielplan kollidieren.
 *
 * "ich werde auch im Theater Ulm gebraucht. Ich möchte, dass diese
 * Termine im Eventmanager sichtbar sind, dass ich da im Theater Ulm bin
 * (von bis Uhrzeit). Es soll nur für Kevin und mich sichtbar sein.
 * Bevor du was live stellst, guck mal durch, ob es Kollisionen gibt"
 * (Florian, 16.10.2026).
 *
 * Die Regel dafür ist einfach: Eine halbe Stunde vor Showbeginn muss er
 * im eigenen Haus sein, die Fahrt dauert eine Viertelstunde. Also muss
 * der Termin in Ulm spätestens 45 Minuten vor der eigenen Vorstellung
 * enden.
 */

import { db } from "@/lib/db/client";
import { showtageAbHeute } from "@/lib/ditix/spielplan";

/** So lange vor Showbeginn muss er im eigenen Haus sein. */
export const VORLAUF_MINUTEN = 30;

/** Fahrt zwischen den beiden Häusern. */
export const FAHRT_MINUTEN = 15;

export interface Fremdtermin {
  id: string;
  datum: string;
  von: string;
  bis: string;
  ort: string;
  raum: string;
  art: string;
}

const minuten = (uhrzeit: string): number =>
  Number(uhrzeit.slice(0, 2)) * 60 + Number(uhrzeit.slice(3, 5));

export const alsUhrzeit = (m: number): string =>
  `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Wer seine Fremdtermine im Eventmanager führt. */
export async function fremdtermine(abDatum?: string): Promise<Fremdtermin[]> {
  const ab = abDatum ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const z = (await db()`
    select id, datum::text as datum, von, bis, ort, raum, art
      from fremdtermin where datum >= ${ab}::date order by datum, von
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    datum: String(r.datum),
    von: String(r.von ?? ""),
    bis: String(r.bis ?? ""),
    ort: String(r.ort ?? ""),
    raum: String(r.raum ?? ""),
    art: String(r.art ?? ""),
  }));
}

export interface Kollision {
  datum: string;
  showzeit: string;
  showname: string;
  termin: Fremdtermin;
  /** Wann er in Ulm spätestens losmüsste. */
  aufbruch: string;
}

/**
 * Wo sich ein Termin in Ulm mit einer eigenen Vorstellung beisst.
 *
 * Gemeldet wird, was zu spät endet oder während der eigenen Show läuft.
 * Eine Probe, die um 14 Uhr endet, stört eine Abendshow nicht.
 */
export async function kollisionen(): Promise<Kollision[]> {
  const [termine, shows] = await Promise.all([
    fremdtermine(),
    showtageAbHeute(400).catch(() => []),
  ]);

  const treffer: Kollision[] = [];
  for (const s of shows) {
    const beginn = minuten(s.uhrzeit);
    const spaetestens = beginn - VORLAUF_MINUTEN - FAHRT_MINUTEN;

    for (const t of termine.filter((x) => x.datum === s.datum)) {
      const endeDort = minuten(t.bis);
      const beginnDort = minuten(t.von);
      // Zu spaet fertig, oder faengt an, waehrend die eigene Show laeuft.
      if (endeDort > spaetestens && beginnDort < beginn + 180) {
        treffer.push({
          datum: s.datum,
          showzeit: s.uhrzeit,
          showname: s.name,
          termin: t,
          aufbruch: alsUhrzeit(spaetestens),
        });
      }
    }
  }

  return treffer.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * An welchen Tagen wäre eine zusätzliche Vorstellung möglich?
 *
 * "wir würden gerne auch zusätzliche Termine in meinem Theater
 * donnerstags spielen" (Florian, 16.10.2026). Geprüft wird gegen die
 * Termine in Ulm, nicht gegen den eigenen Spielplan: Ob an dem Tag schon
 * eine Show steht, sieht man dort.
 */
export async function freieTage(o: {
  wochentag: number;
  showzeit?: string;
  bisDatum?: string;
}): Promise<Array<{ datum: string; frei: boolean; was: string }>> {
  const termine = await fremdtermine();
  const beginn = minuten(o.showzeit ?? "20:00");
  const spaetestens = beginn - VORLAUF_MINUTEN - FAHRT_MINUTEN;

  const tage = [...new Set(termine.map((t) => t.datum))];
  const letzter = o.bisDatum ?? tage.at(-1) ?? "";
  if (!letzter) return [];

  const ergebnis: Array<{ datum: string; frei: boolean; was: string }> = [];
  const lauf = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}T12:00:00Z`);
  const ende = new Date(`${letzter}T12:00:00Z`);

  while (lauf <= ende) {
    if (lauf.getUTCDay() === o.wochentag) {
      const datum = lauf.toISOString().slice(0, 10);
      const amTag = termine.filter((t) => t.datum === datum);
      const spaetestesEnde = amTag.reduce((m, t) => Math.max(m, minuten(t.bis)), 0);
      ergebnis.push({
        datum,
        frei: spaetestesEnde <= spaetestens,
        was: amTag.map((t) => `${t.von} bis ${t.bis} ${t.art}`).join(", ") || "nichts auswärts",
      });
    }
    lauf.setUTCDate(lauf.getUTCDate() + 1);
  }

  return ergebnis;
}

/**
 * Nachts prüfen, ob eine neue Vorstellung mit Ulm kollidiert.
 *
 * "bitte melden, sobald ein neuer Donnerstagstermin bei uns eingestellt
 * wird" (Florian, 16.10.2026). Gemeldet wird jede Kollision genau
 * einmal: Sonst kaeme die Mail jede Nacht neu.
 */
export async function auswaertsWache(): Promise<{ neu: number; gemeldet: string[] }> {
  const treffer = await kollisionen();
  if (treffer.length === 0) return { neu: 0, gemeldet: [] };

  const schluessel = treffer.map((k) => `${k.datum}|${k.showzeit}|${k.termin.von}`);
  const bekannt = new Set(
    ((await db()`
      select schluessel from auswaerts_gemeldet where schluessel = any(${schluessel}::text[])
    `.catch(() => [])) as Array<{ schluessel: string }>).map((r) => r.schluessel),
  );

  const neue = treffer.filter((_, i) => !bekannt.has(schluessel[i]));
  if (neue.length === 0) return { neu: 0, gemeldet: [] };

  const de = (iso: string) => iso.split("-").reverse().join(".");
  const zeilen = neue.map(
    (k) =>
      `${de(k.datum)}: eigene Vorstellung ${k.showzeit} Uhr "${k.showname}", `
      + `in Ulm ${k.termin.von} bis ${k.termin.bis} (${k.termin.art}). `
      + `Spaetester Aufbruch in Ulm: ${k.aufbruch} Uhr.`,
  );

  const { mailVerschicken } = await import("@/lib/mail/versand");
  const { postfachPersonal, antwortPersonal } = await import("@/lib/mail/postfaecher");

  await mailVerschicken({
    an: ["info@florianzimmer.com", "kevin.steele@florianzimmer.com"],
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff:
      neue.length === 1
        ? "Neue Terminkollision mit dem Theater Ulm"
        : `${neue.length} neue Terminkollisionen mit dem Theater Ulm`,
    text: [
      "Hallo,",
      "",
      "im Spielplan steht etwas Neues, das sich mit Florians Terminen im Theater Ulm beisst:",
      "",
      ...zeilen,
      "",
      "Gerechnet wird mit 30 Minuten Vorlauf im eigenen Haus und 15 Minuten Fahrt.",
      "An Tagen mit eigener Vorstellung um 20 Uhr kann in Ulm bis 19:00 Uhr geprobt werden.",
      "",
      "Alle Auswaertstermine stehen im Eventmanager unter Auswaerts.",
    ].join(String.fromCharCode(10)),
  });

  for (const s of schluessel.filter((_, i) => !bekannt.has(schluessel[i]))) {
    await db()`
      insert into auswaerts_gemeldet (schluessel) values (${s})
      on conflict (schluessel) do nothing
    `.catch(() => undefined);
  }

  return { neu: neue.length, gemeldet: zeilen };
}
