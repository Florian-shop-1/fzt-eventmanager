/**
 * Meldet, wenn jemand eingestempelt bleibt, obwohl er weg ist.
 *
 * Wichtig zum Verständnis, was technisch geht: Eine Webseite darf im
 * Hintergrund nicht auf das GPS zugreifen. Sobald das Handy gesperrt ist
 * oder der Eventmanager geschlossen wird, weiß das Programm nicht mehr,
 * wo jemand ist. Deshalb gibt es zwei Wege:
 *
 *  1. Solange die Stempeluhr offen ist, prüft sie alle paar Minuten die
 *     Position. Verlässt jemand das Gelände, ohne auszustempeln, meldet
 *     sie das sofort (siehe /stempeluhr/standort).
 *  2. Ein Lauf auf dem Server prüft regelmäßig, wer zu lange eingestempelt
 *     ist. Das fängt den Fall ab, dass jemand einfach das Handy weglegt.
 *
 * Gemeldet wird einmal je Schicht, nicht im Minutentakt.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { einstellungLesen, meldungMerken, ohnePause, schonGemeldet, stempelSetzen, stunden, werIstDa } from "./db";

/**
 * Nach so vielen Minuten Arbeit ohne Pause kommt die Erinnerung.
 *
 * § 4 Arbeitszeitgesetz: Wer länger als sechs Stunden arbeitet, muss eine
 * Pause gemacht haben. Erinnert wird schon etwas davor, damit die Pause
 * noch innerhalb der sechs Stunden beginnen kann.
 */
export const PAUSE_NACH_MINUTEN = 345;

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

function zeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
}

/** Schickt die Meldung an die hinterlegten Personen (Florian und Kevin). */
export async function melden(betreff: string, zeilen: string[]): Promise<void> {
  const e = await einstellungLesen();
  if (e.meldenAn.length === 0) return;
  const leute = (await db()`
    select name, email from benutzer where aktiv and id = any(${e.meldenAn}::uuid[])
  `) as Array<{ name: string; email: string }>;
  const text = `${zeilen.join("\n")}\n\nStempeluhr ansehen: ${APP}/stempeluhr`;
  for (const p of leute) {
    try {
      await mailVerschicken({ an: p.email, betreff, text });
    } catch (f) {
      console.error("[stempel] Meldung an", p.email, "fehlgeschlagen:", f);
    }
  }
}

/**
 * Stempelt jemanden automatisch aus.
 *
 * Wer das Gelände verlässt, arbeitet nicht mehr. Bisher wurde das nur
 * gemeldet, die Zeit lief weiter (Florian, 21.09.2026). Jetzt setzt das
 * Programm selbst den Feierabendstempel und schreibt dazu, warum. Die
 * Zeit lässt sich hinterher korrigieren, dafür gibt es die Anträge und
 * die Korrektur in der Stempeluhr.
 */
export async function automatischAusstempeln(o: {
  benutzerId: string;
  name: string;
  grund: "gelaende" | "zu_lange" | "feierabend" | "kurzbefehl";
  entfernungM?: number;
  /** Abweichende Uhrzeit, etwa der Feierabend statt der Nachtstunde. */
  zeitpunkt?: string;
}): Promise<void> {
  const notiz =
    o.grund === "gelaende"
      ? `Automatisch ausgestempelt: Gelände verlassen${o.entfernungM ? `, rund ${o.entfernungM} m entfernt` : ""}`
      : o.grund === "zu_lange"
        ? "Automatisch ausgestempelt: zu lange eingestempelt"
        : o.grund === "feierabend"
          ? "Automatisch ausgestempelt: Feierabend, es war niemand mehr im Haus"
          : "Ausgestempelt über den Kurzbefehl am Handy";

  await stempelSetzen({
    benutzerId: o.benutzerId,
    name: o.name,
    art: "gehen",
    imHaus: false,
    quelle: o.grund === "kurzbefehl" ? "kurzbefehl" : "auto",
    notiz,
    zeitpunkt: o.zeitpunkt,
  });

  const p = (await db()`select email from benutzer where id = ${o.benutzerId}`) as Array<{ email: string }>;
  if (!p[0]?.email) return;
  try {
    await mailVerschicken({
      an: p[0].email,
      betreff: "Du wurdest automatisch ausgestempelt",
      text: [
        `Hallo ${o.name.split(" ")[0]},`,
        "",
        o.grund === "gelaende"
          ? "dein Handy hat gemeldet, dass du nicht mehr auf dem Gelände bist, du warst aber noch eingestempelt."
          : o.grund === "kurzbefehl"
            ? "dein Handy hat gemeldet, dass du das Gelände verlassen hast."
            : o.grund === "feierabend"
              ? "du warst am Ende des Tages noch eingestempelt."
              : "du warst ungewöhnlich lange eingestempelt, ohne Feierabend zu stempeln.",
        "",
        `Das Programm hat dich deshalb um ${new Date(o.zeitpunkt ?? Date.now()).toLocaleTimeString("de-DE", {
          timeZone: "Europe/Berlin",
          hour: "2-digit",
          minute: "2-digit",
        })} Uhr ausgestempelt.`,
        "",
        "Stimmt die Zeit nicht? Dann stell in der Stempeluhr kurz einen Änderungswunsch,",
        "das Büro trägt die richtige Zeit ein:",
        `${APP}/stempeluhr#antrag`,
      ].join("\n"),
    });
  } catch (f) {
    console.error("[stempel] Hinweis auf das automatische Ausstempeln fehlgeschlagen:", f);
  }
}

/**
 * Jemand ist laut Handy nicht mehr auf dem Gelände, aber noch eingestempelt.
 * Wird von der Stempeluhr gemeldet, während sie offen ist.
 */
export async function gelaendeVerlassen(o: {
  kommenId: string;
  benutzerId: string;
  name: string;
  seit: string;
  entfernungM: number;
  /** Wahr, wenn die Person gerade selbst von unterwegs ausgestempelt hat. */
  schonGestempelt?: boolean;
}): Promise<boolean> {
  if (await schonGemeldet(o.kommenId, "gelaende_verlassen")) return false;
  await meldungMerken(o.kommenId, "gelaende_verlassen");
  if (!o.schonGestempelt) {
    await automatischAusstempeln({
      benutzerId: o.benutzerId,
      name: o.name,
      grund: "gelaende",
      entfernungM: o.entfernungM,
    });
  }
  await melden(
    o.schonGestempelt
      ? `${o.name} hat von außerhalb ausgestempelt`
      : `${o.name} hat das Gelände verlassen und wurde ausgestempelt`,
    [
      `${o.name} war seit ${zeit(o.seit)} eingestempelt.`,
      `Das Handy hat rund ${o.entfernungM} Meter Entfernung vom Haus gemeldet.`,
      o.schonGestempelt
        ? "Der Feierabendstempel kam von ihm selbst, nur eben nicht im Haus."
        : "Das Programm hat den Feierabend automatisch gestempelt.",
      "Wenn die Zeit nicht stimmt, in der Stempeluhr unter „Zeiten korrigieren“ ändern.",
    ],
  );
  return true;
}

/**
 * Der regelmäßige Lauf: Wer ist zu lange eingestempelt?
 * Greift auch dann, wenn das Handy längst aus ist.
 */
export async function langeSchichtenPruefen(): Promise<{ gemeldet: number }> {
  const e = await einstellungLesen();
  if (!e.aktiv) return { gemeldet: 0 };
  const da = await werIstDa();
  let gemeldet = 0;
  for (const p of da) {
    const stundenOffen = p.minuten / 60;
    if (stundenOffen < e.maxStunden) continue;
    if (await schonGemeldet(p.kommenId, "zu_lange")) continue;
    await meldungMerken(p.kommenId, "zu_lange");
    await automatischAusstempeln({ benutzerId: p.benutzerId, name: p.name, grund: "zu_lange" });
    await melden(`${p.name} war ${stunden(p.minuten)} Stunden eingestempelt und wurde ausgestempelt`, [
      `${p.name} hat am ${zeit(p.seit)} eingestempelt und seitdem nicht ausgestempelt.`,
      "Das Programm hat den Feierabend automatisch gestempelt.",
      "Vermutlich wurde das Ausstempeln vergessen. Die Zeit lässt sich in der Stempeluhr korrigieren.",
    ]);
    gemeldet++;
  }
  return { gemeldet };
}

/**
 * Die Pausenerinnerung: Wer lange ohne Pause arbeitet, bekommt eine Mail.
 *
 * Das Arbeitszeitgesetz erlaubt höchstens sechs Stunden am Stück ohne
 * Pause. Daran müssen wir uns halten, deshalb erinnert das Programm kurz
 * vorher. Wenn es an dem Tag wirklich nicht anders ging, kann der
 * Mitarbeiter im Programm dazuschreiben, warum.
 */
export async function pausenPflichtPruefen(): Promise<{ erinnert: number }> {
  const e = await einstellungLesen();
  if (!e.aktiv) return { erinnert: 0 };
  let erinnert = 0;
  for (const p of await ohnePause()) {
    if (p.minuten < PAUSE_NACH_MINUTEN) continue;
    if (await schonGemeldet(p.kommenId, "pause_faellig")) continue;
    await meldungMerken(p.kommenId, "pause_faellig");
    try {
      await mailVerschicken({
        an: p.email,
        betreff: "Bitte Pause machen",
        text: [
          `Hallo ${p.name.split(" ")[0]},`,
          "",
          `du arbeitest seit ${stunden(p.minuten)} Stunden ohne Pause.`,
          "",
          "In Deutschland darf man nicht länger als sechs Stunden ohne Pause arbeiten",
          "(§ 4 Arbeitszeitgesetz). Daran müssen wir uns als Betrieb halten, sonst gibt",
          "es Ärger mit dem Amt. Bitte stempel jetzt eine Pause.",
          "",
          "Wenn es heute nicht anders ging, schreib bitte im Eventmanager kurz dazu,",
          "woran es lag. Ein Satz reicht:",
          `${APP}/stempeluhr#pause`,
          "",
          "Danke dir!",
        ].join("\n"),
      });
      erinnert++;
    } catch (f) {
      console.error("[stempel] Pausenerinnerung an", p.email, "fehlgeschlagen:", f);
    }
  }
  return { erinnert };
}

/**
 * Dieselbe Prüfung, aber sparsam: höchstens alle zehn Minuten.
 *
 * Wird beim Aufruf einer Seite von Florian oder Kevin mitgemacht. So fällt
 * ein vergessenes Ausstempeln schon tagsüber auf und nicht erst beim
 * nächtlichen Lauf. Kostet im Normalfall eine einzige Abfrage.
 */
let zuletztGeprueft = 0;

export async function nebenbeiPruefen(): Promise<void> {
  if (Date.now() - zuletztGeprueft < 300000) return;
  zuletztGeprueft = Date.now();
  await langeSchichtenPruefen().catch((f) => console.error("[stempel] Prüfung nebenbei:", f));
  await pausenPflichtPruefen().catch((f) => console.error("[stempel] Pausenprüfung nebenbei:", f));
}

/**
 * Der Schlussstrich am Ende des Tages.
 *
 * Wer jetzt noch eingestempelt ist, hat es vergessen: Nachts ist niemand
 * mehr im Haus. Ausgestempelt wird nicht zur Laufzeit dieses Laufs,
 * sondern zur hinterlegten Feierabendzeit, damit in der Monatsliste eine
 * plausible Zeit steht und nicht halb zwei.
 *
 * Das ist die Absicherung für den Fall, den kein Browser abfangen kann:
 * Handy in der Tasche, Programm zu, Heimweg. Stimmt die Zeit nicht, wird
 * sie am nächsten Tag korrigiert, dafür gibt es die Änderungswünsche.
 */
export async function nachtabschluss(): Promise<{ beendet: number }> {
  const e = await einstellungLesen();
  const da = await werIstDa();
  let beendet = 0;

  for (const p of da) {
    // Die Feierabendzeit des Tages, an dem die Schicht begonnen hat.
    const start = new Date(p.seit);
    const tag = start.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const [h, m] = e.feierabend.split(":").map(Number);
    const schluss = new Date(`${tag}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    // Der Browser des Servers rechnet in UTC, deshalb den Abstand zu
    // Europe/Berlin herausrechnen.
    const versatz =
      new Date(schluss.toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime() -
      new Date(schluss.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    let zeitpunkt = new Date(schluss.getTime() - versatz);

    // Wer nach der Feierabendzeit gekommen ist, bekommt wenigstens eine
    // halbe Stunde. Und nie in der Zukunft stempeln.
    if (zeitpunkt.getTime() <= start.getTime()) zeitpunkt = new Date(start.getTime() + 30 * 60000);
    if (zeitpunkt.getTime() > Date.now()) zeitpunkt = new Date();

    await automatischAusstempeln({
      benutzerId: p.benutzerId,
      name: p.name,
      grund: "feierabend",
      zeitpunkt: zeitpunkt.toISOString(),
    });
    await melden(`${p.name} war noch eingestempelt und wurde zum Feierabend ausgestempelt`, [
      `${p.name} hat am ${zeit(p.seit)} eingestempelt und nicht ausgestempelt.`,
      `Das Programm hat den Feierabend auf ${zeit(zeitpunkt.toISOString())} gesetzt.`,
      "Wenn die Zeit nicht stimmt, in der Stempeluhr unter „Zeiten korrigieren“ ändern.",
    ]);
    beendet++;
  }
  return { beendet };
}
