/**
 * Meldet, wenn jemand eingestempelt bleibt, obwohl er vermutlich nicht
 * mehr arbeitet.
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
 * Wichtig, und anders als früher (Florian, 29.09.2026): Das Programm setzt
 * dabei selbst KEINEN Feierabendstempel mehr. Vorher tat es das, und das
 * klang zu sehr danach, dem Programm die Schuld zu geben, wenn jemand das
 * Ausstempeln vergisst – und wer nach der Schicht noch auf einen Drink im
 * Haus blieb, bekam diese Zeit als Arbeitszeit gutgeschrieben, ohne dass
 * es stimmte. Jetzt wird nur noch gemeldet: an den Mitarbeiter und ans
 * Büro. Als Arbeitszeit zählt erst, was der Mitarbeiter selbst über die
 * Nachmeldung angibt (siehe stempeluhr/aktionen.ts) oder was das Büro von
 * Hand einträgt. Bis dahin bleibt die Schicht offen, absichtlich: Eine
 * auffällig lange offene Schicht in der Monatsübersicht fällt auf, eine
 * plausibel aussehende falsche Zeit fällt niemandem auf.
 *
 * Gemeldet wird höchstens einmal je Tag und Grund, nicht im Minutentakt.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { isoDatum } from "@/lib/zeit";
import { einstellungLesen, meldungMerken, ohnePause, schonGemeldet, stunden, werIstDa } from "./db";

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
 * Jemand hat gestempelt, aber der Standort passt nicht oder fehlt ganz.
 *
 * Blockiert wird deswegen nicht mehr (Florian, 28.09.2026): Lieber einmal
 * zu viel einstempeln als jemanden vor der Tür stehen lassen, weil das
 * Handy kein GPS bekommt. Stattdessen erfährt das Büro davon und prüft
 * später, ob die Zeit stimmt.
 */
export async function standortUnklarMelden(o: {
  name: string;
  art: string;
  grund: string;
}): Promise<void> {
  await melden(`${o.name}: Standort beim Stempeln unklar`, [
    `${o.name} hat "${o.art}" gestempelt, der Standort passt aber nicht: ${o.grund}`,
    "Eingestempelt wurde trotzdem, damit niemand draußen warten muss.",
    "Bitte später kurz prüfen, ob die Zeit stimmt (Stempeluhr, „Zeiten korrigieren“).",
  ]);
}

/**
 * Meldet eine Schicht, die vermutlich zu Ende ist, aber noch offen steht.
 *
 * Setzt bewusst keinen Stempel: Das Programm entscheidet nicht, wann
 * jemand gegangen ist. Der Mitarbeiter bekommt eine Erinnerung mit dem
 * Weg zur Nachmeldung, das Büro eine Kopie. Wiederholt wird höchstens
 * einmal am Tag je Grund, damit niemand mit Mails zugeschüttet wird, auch
 * wenn die Schicht tagelang offen bleibt.
 */
async function schichtOffenMelden(o: {
  benutzerId: string;
  name: string;
  seit: string;
  grund: "gelaende" | "zu_lange" | "feierabend";
  entfernungM?: number;
}): Promise<void> {
  const tag = isoDatum(new Date(o.seit));

  await melden(
    o.grund === "gelaende"
      ? `${o.name} hat das Gelände verlassen, ist aber noch eingestempelt`
      : o.grund === "zu_lange"
        ? `${o.name} ist ungewöhnlich lange eingestempelt`
        : `${o.name} war über Nacht noch eingestempelt`,
    [
      `${o.name} hat am ${zeit(o.seit)} eingestempelt und bisher nicht ausgestempelt.`,
      o.grund === "gelaende" && o.entfernungM
        ? `Das Handy hat rund ${o.entfernungM} Meter Entfernung vom Haus gemeldet.`
        : "",
      "Das Programm hat die Zeit nicht selbst beendet, damit niemand eine Zeit gutgeschrieben bekommt, die nicht",
      "stimmt. Der Mitarbeiter bekommt ebenfalls eine Erinnerung. Bis er selbst nachträgt oder ihr die Zeit",
      "eintragt, zählt der offene Teil nicht als Arbeitszeit.",
    ].filter(Boolean),
  );

  const p = (await db()`select email from benutzer where id = ${o.benutzerId} and aktiv`) as Array<{ email: string }>;
  if (!p[0]?.email) return;
  try {
    await mailVerschicken({
      an: p[0].email,
      betreff: "Du bist noch eingestempelt",
      text: [
        `Hallo ${o.name.split(" ")[0]},`,
        "",
        `du hast am ${zeit(o.seit)} eingestempelt und bist laut Programm immer noch nicht ausgestempelt.`,
        "",
        o.grund === "gelaende"
          ? "Dein Handy hat gemeldet, dass du nicht mehr auf dem Gelände bist."
          : o.grund === "zu_lange"
            ? "Das ist ungewöhnlich lange."
            : "Das war auch am Ende des Tages noch so.",
        "",
        "Bist du noch da, zum Beispiel auf einen Drink? Dann ist das kein Problem, aber bitte stempel trotzdem",
        "AUS, sobald du wirklich gehst. Die Zeit danach läuft sonst weiter mit, als würdest du noch arbeiten.",
        "",
        "Bist du schon weg? Dann trag kurz ein, wann du tatsächlich gegangen bist, und ob du eine Pause gemacht",
        "hast. Florian oder Kevin übernehmen die Zeit dann direkt:",
        `${APP}/stempeluhr?tag=${tag}#nachmelden`,
        "",
        "Bis dahin zählt die Zeit nicht als Arbeitszeit, das trägt erst das Büro ein.",
      ].join("\n"),
    });
  } catch (f) {
    console.error("[stempel] Erinnerung an", p[0].email, "fehlgeschlagen:", f);
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
  const grundHeute = `gelaende_verlassen:${isoDatum(new Date())}`;
  if (await schonGemeldet(o.kommenId, grundHeute)) return false;
  await meldungMerken(o.kommenId, grundHeute);

  if (o.schonGestempelt) {
    // Hat sich gerade selbst ausgestempelt, nur eben nicht im Haus. Das
    // Büro erfährt es zur Info, es gibt nichts zu erinnern.
    await melden(`${o.name} hat von außerhalb ausgestempelt`, [
      `${o.name} war seit ${zeit(o.seit)} eingestempelt und hat sich gerade selbst ausgestempelt.`,
      `Das Handy hat rund ${o.entfernungM} Meter Entfernung vom Haus gemeldet.`,
      "Wenn die Zeit nicht stimmt, in der Stempeluhr unter „Zeiten korrigieren“ ändern.",
    ]);
    return true;
  }

  await schichtOffenMelden({
    benutzerId: o.benutzerId,
    name: o.name,
    seit: o.seit,
    grund: "gelaende",
    entfernungM: o.entfernungM,
  });
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
    const grundHeute = `zu_lange:${isoDatum(new Date())}`;
    if (await schonGemeldet(p.kommenId, grundHeute)) continue;
    await meldungMerken(p.kommenId, grundHeute);
    await schichtOffenMelden({ benutzerId: p.benutzerId, name: p.name, seit: p.seit, grund: "zu_lange" });
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
 * Der nächtliche Rundgang: Wer ist noch eingestempelt?
 *
 * Nachts ist niemand mehr im Haus. Wer jetzt noch offen steht, hat das
 * Ausstempeln vermutlich vergessen, oder ist noch da (Drink an der Bar).
 * Beides klärt das Programm nicht selbst, das war früher anders und ist
 * genau das, was hier nicht mehr passieren soll (Florian, 29.09.2026).
 * Es meldet nur, jede Nacht neu, bis die Schicht geschlossen wird.
 */
export async function nachtabschluss(): Promise<{ gemeldet: number }> {
  const da = await werIstDa();
  let gemeldet = 0;

  for (const p of da) {
    const grundHeute = `feierabend:${isoDatum(new Date())}`;
    if (await schonGemeldet(p.kommenId, grundHeute)) continue;
    await meldungMerken(p.kommenId, grundHeute);
    await schichtOffenMelden({ benutzerId: p.benutzerId, name: p.name, seit: p.seit, grund: "feierabend" });
    gemeldet++;
  }
  return { gemeldet };
}

/**
 * Ein Stempel zu einer Uhrzeit, zu der niemand arbeitet.
 *
 * Wer um zwei Uhr nachts einstempelt, hat entweder etwas Ungewoehnliches
 * gemacht oder danebengegriffen. Das Programm entscheidet das nicht: Es
 * schreibt der Person, dass der Tag erst gewertet wird, wenn die Zeiten
 * vorliegen, und bittet um die Nachmeldung, die Florian oder Kevin
 * bestaetigen (Florian, 29.09.2026).
 *
 * Silvester und Neujahr sind ausgenommen, da wird wirklich nachts
 * gearbeitet, siehe istSilvester().
 */
export async function unplausibelMelden(o: {
  stempelId: string;
  benutzerId: string;
  name: string;
  art: string;
  zeitpunkt: string;
  grund: string;
}): Promise<void> {
  const tag = isoDatum(new Date(o.zeitpunkt));
  // Hoechstens einmal je Tag, sonst kommt bei jedem weiteren Stempel
  // derselben Nacht eine neue Mail.
  if (await schonGemeldet(o.stempelId, `unplausibel:${tag}`)) return;
  await meldungMerken(o.stempelId, `unplausibel:${tag}`);

  await melden(`${o.name}: Stempel zu ungewoehnlicher Uhrzeit`, [
    `${o.name} hat "${o.art}" gestempelt: ${zeit(o.zeitpunkt)}.`,
    `Das ist nicht plausibel (${o.grund}).`,
    "Der Tag zaehlt vorerst nicht als Arbeitszeit. Die Person wurde gebeten, ihre Zeiten nachzumelden.",
    "Sobald ihr die Nachmeldung uebernehmt oder die Zeit von Hand eintragt, zaehlt der Tag wieder.",
  ]);

  const p = (await db()`select email from benutzer where id = ${o.benutzerId} and aktiv`) as Array<{ email: string }>;
  if (!p[0]?.email) return;
  try {
    await mailVerschicken({
      an: p[0].email,
      betreff: "Deine Zeiten von heute brauchen eine Bestaetigung",
      text: [
        `Hallo ${o.name.split(" ")[0]},`,
        "",
        `du hast um ${zeit(o.zeitpunkt)} gestempelt. Zu dieser Uhrzeit arbeitet normalerweise niemand,`,
        "deshalb kann dieser Tag erst gewertet werden, wenn die Zeiten dafuer vorliegen.",
        "",
        "Bitte trag kurz nach, wann du tatsaechlich gekommen und gegangen bist und ob du Pause gemacht hast.",
        "Florian oder Kevin bestaetigen das dann, und der Tag zaehlt ganz normal mit:",
        `${APP}/stempeluhr?tag=${tag}#nachmelden`,
        "",
        "War die Uhrzeit richtig, schreib es einfach dazu. Dann wird sie so bestaetigt.",
        "",
        "Danke dir.",
      ].join("\n"),
    });
  } catch (f) {
    console.error("[stempel] Hinweis an", p[0].email, "fehlgeschlagen:", f);
  }
}
