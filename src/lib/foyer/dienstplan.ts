/**
 * Der Foyerdienst. Siehe migrations/065_foyer_dienstplan.sql.
 *
 * Sarah plant, wer im Foyer steht. Bis zu drei Leute je Showtag, die
 * Zeiten stehen in ihrer Aufstellung vom 22.09.2026:
 *
 *   Freitag (eine Abendshow)      1. Person 18:00, 2. Person 18:45, bis ~23:00
 *   Samstag (Nachmittag + Abend)  1. Person 13:00, 2. Person 14:00,
 *                                 Pause 18:00 bis 18:45, danach bis ~23:00
 *   Sonntag (nur Nachmittag)      1. Person 13:00, 2. Person 13:30, bis ~18:00
 *   Sonntag mit Flo-Zirkus        1. Person 11:30, 2. Person 12:00, bis ~18:00
 *
 * Daraus die Regel, die das Programm rechnet: Die erste Person kommt
 * zwei Stunden vor der ersten Show, die zweite anderthalb Stunden vorher;
 * Schluss ist rund drei Stunden nach Beginn der letzten Show. Die Zeiten
 * sind ein Vorschlag, Sarah kann sie je Tag überschreiben.
 *
 * Wie viele Leute es braucht, ist Sarahs Einschätzung. Als Faustregel gilt
 * eine Person je 50 Gäste: bis 50 eine, über 50 zwei, über 100 drei
 * (Florian, 25.09.2026). Deshalb steht der dritte Platz immer zur
 * Verfügung, auch wenn er meist leer bleibt.
 *
 * Olena und Sarah sind fest angestellt und ohne Rückfrage einteilbar.
 * Wen Sarah sonst einteilt, ist eine Aushilfe. Eine Freigabe braucht es
 * dafür nicht mehr, Kevin und Florian werden nur noch informiert
 * (Florian, 25.09.2026).
 */

import { abgesagteEventIds } from "@/lib/absage/db";
import { planLaden } from "@/lib/dienstplan/laden";
import { db } from "@/lib/db/client";
import { showtageAbHeute, type Vorstellungstermin } from "@/lib/ditix/spielplan";

export type Freigabe = "nicht_noetig" | "angefragt" | "frei" | "abgelehnt";

/**
 * Welchen Teil des Tages ein Dienst abdeckt.
 *
 * "wäre besser, das zu trennen in vormittag und nachmittag, bzw.
 * mittagsshow und abendshow.. es würden auch gerne mal mitarbeiter sich
 * aufteilen" (Florian, 23.10.2026, nach einem Hinweis aus dem Foyer).
 *
 * "ganz" ist der Normalfall und bleibt es: An Tagen mit einer einzigen
 * Show gibt es nichts zu teilen, und wer einen Doppeltag am Stück machen
 * will, soll das weiter können.
 */
export type Abschnitt = "ganz" | "mittag" | "abend";

export interface FoyerPerson {
  id: string;
  name: string;
  email: string;
  /** Fest angestellt: darf ohne Rückfrage eingeteilt werden. */
  fest: boolean;
}

export interface FoyerDienst {
  id: string;
  datum: string;
  abschnitt: Abschnitt;
  nummer: number;
  benutzerId: string | null;
  name: string | null;
  von: string;
  bis: string;
  freigabe: Freigabe;
  freigabeVon: string | null;
  notiz: string;
  /**
   * Was diese Person ausser dem Foyerdienst uebernimmt.
   *
   * "die aushilfe geht normalerweise nach der Pause der Show. wenn eine
   * Aushilfe aber beide shows macht, ist es ja bloed fuer sie zwischen
   * den shows nach hause zu gehen. sie kriegt dann eine sonderaufgabe
   * fuer die zweite haelfte der ersten show und auch danach"
   * (Florian, 24.10.2026).
   */
  sonderaufgabe: string;
}

/**
 * Wer an diesem Abend an der Technik verantwortlich ist.
 *
 * Das Foyer muss wissen, an wen es sich wendet, wenn im Saal etwas nicht
 * läuft, gerade bei Sonderveranstaltungen: Dort ist oft nur eine einzige
 * Person für Licht und Ton da (Florian, 05.10.2026).
 */
export interface FoyerTechnik {
  ditixEventId: string;
  showName: string;
  uhrzeit: string;
  /**
   * Die ganze Besetzung hinter der Bühne, in der Reihenfolge FOH, T1, T2.
   *
   * "mach es konkret, FOH, T1, T2, kannst du da hintereinander
   * schreiben" (Florian, 15.10.2026). Das Foyer ruft nicht irgendeine
   * Technik, es ruft den, der für Licht und Ton zuständig ist.
   */
  besetzung: Array<{ position: string; name: string }>;
  /** Ein eigener Termin ohne Show: Firmenabend, Uni, Tagung. */
  sonderveranstaltung: boolean;
}

export interface FoyerTag {
  datum: string;
  /** Anfangszeiten der Shows an diesem Tag, für die Anzeige. */
  shows: Array<{ uhrzeit: string; name: string; abgesagt: boolean }>;
  /**
   * Alle Vorstellungen dieses Tages sind abgesagt.
   *
   * "wenn eine Show ausfällt, dann muss das bitte auch in den
   * Dienstplänen der Gastro berücksichtigt werden" (Florian,
   * 15.10.2026). Bisher verschwand der Tag einfach, samt den Leuten,
   * die schon eingeteilt waren. Jetzt bleibt er stehen und ist rot.
   */
  abgesagt: boolean;
  /** Verantwortliche Technik je Vorstellung an diesem Tag. */
  technik: FoyerTechnik[];
  /**
   * Die Dienste des Tages, in einem Block oder in zweien.
   *
   * Ungeteilt steht hier genau ein Block "ganz" und die Seite sieht aus
   * wie vorher. Geteilt sind es zwei, Mittag und Abend, jeder mit
   * eigenen Plaetzen und eigenen Zeiten.
   */
  bloecke: FoyerBlock[];
  /** Laesst sich dieser Tag ueberhaupt teilen? Nur bei zwei Shows. */
  teilbar: boolean;
  /** Ist er geteilt? */
  geteilt: boolean;
  /** Pause zwischen den Shows, nur an ungeteilten Tagen mit zwei Vorstellungen. */
  pause: string | null;
}

export interface FoyerBlock {
  abschnitt: Abschnitt;
  /** "Mittagsshow", "Abendshow" oder leer beim ganzen Tag. */
  titel: string;
  dienste: FoyerDienst[];
  /** Vorgeschlagene Zeiten, wenn noch nichts eingetragen ist. */
  vorschlag: Array<{ von: string; bis: string }>;
}

/*
  Zwei Plaetze stehen immer da, alles darueber kommt dazu.

  Frueher waren es drei feste Plaetze, und beim dritten war Schluss.
  Reichen drei nicht, braucht Sarah einen vierten und fuenften, ohne dass
  jemand am Programm etwas aendert: "nach den zwei standart ein + kommen
  (weitere Mitarbeiter einteilen) und dann wenn man das geklickt hat
  darunter wieder ein +" (Florian, 04.10.2026).
*/
const PLAETZE = [1, 2];

/** "18:45" aus "20:00" minus 75 Minuten. */
function minus(uhrzeit: string, minuten: number): string {
  const [h, m] = uhrzeit.split(":").map(Number);
  const gesamt = h * 60 + m - minuten;
  const hh = Math.floor(((gesamt % 1440) + 1440) % 1440 / 60);
  const mm = ((gesamt % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function plus(uhrzeit: string, minuten: number): string {
  return minus(uhrzeit, -minuten);
}

/**
 * Die Zeiten eines Tages nach Sarahs Aufstellung.
 *
 * Erste Person zwei Stunden vor der ersten Show, die zweite 45 Minuten
 * später, Schluss rund drei Stunden nach Beginn der letzten Show. An
 * Tagen, die schon mittags anfangen (Flo-Zirkus), reichen anderthalb
 * Stunden Vorlauf, sonst stünde jemand um halb elf im leeren Haus.
 *
 * Die dritte Person, falls es bei vielen Gästen eine braucht, bekommt
 * denselben Vorschlag wie die zweite: sie kommt dazu, nicht später.
 */
export function foyerZeiten(shows: Array<{ uhrzeit: string }>): {
  vorschlag: Array<{ von: string; bis: string }>;
  pause: string | null;
  /** Die Zeiten der beiden Haelften, falls der Tag zwei Shows hat. */
  geteilt: { mittag: Array<{ von: string; bis: string }>; abend: Array<{ von: string; bis: string }> } | null;
} {
  if (shows.length === 0) return { vorschlag: [], pause: null, geteilt: null };
  const erste = shows[0].uhrzeit;
  const letzte = shows[shows.length - 1].uhrzeit;
  const ende = plus(letzte, 180);
  const vorlauf = erste < "14:00" ? 90 : 120;

  /*
    Die Aushilfe geht nach der Pause.

    "die Foyer-Aushilfe geht circa nach der Pause der Show, diese müsste
    so ca. 21:30 Uhr sein" (Florian, 15.10.2026). Nach der Pause wird
    nichts mehr verkauft, dafür bleibt eine Person allein (siehe
    lib/foyer/pause-mail.ts). Die Pause liegt etwa eineinviertel Stunden
    nach Showbeginn, nach anderthalb Stunden ist sie vorbei: Bei einer
    Show um 20 Uhr ist das halb zehn.
  */
  const nachDerPause = plus(letzte, 90);
  const zweitePerson = { von: minus(erste, vorlauf - 45), bis: nachDerPause };
  const vorschlag = [{ von: minus(erste, vorlauf), bis: ende }, zweitePerson, zweitePerson];
  // Zwei Shows an einem Tag: dazwischen ist Pause, meist eine Dreiviertelstunde.
  const pause =
    shows.length > 1 ? `${minus(letzte, 120)} bis ${minus(letzte, 75)}` : null;

  /*
    Geteilter Tag: zwei eigenstaendige Dienste statt eines langen.

    Der Mittagsdienst endet drei Stunden nach dem Beginn der Matinee, der
    Abenddienst beginnt zwei Stunden vor der Abendshow. Bei 14 und 19 Uhr
    treffen sich beide um 17 Uhr, die Uebergabe passiert also im Haus und
    nicht per Telefon. Die zweite Person kommt wie immer 45 Minuten
    spaeter dazu und geht abends nach der Pause.
  */
  /*
    Teilen lohnt nur, wenn zwischen den Shows wirklich ein Tag liegt.

    Am 01.11.2026 stehen zwei Vorstellungen um 12 und um 14 Uhr im Plan.
    Zwei Dienste daraus zu machen hiesse, dass sich beide ueberlappen und
    die zweite Person kaeme, waehrend die erste noch arbeitet. Unter drei
    Stunden Abstand bleibt es deshalb bei einem Dienst.
  */
  const abstand =
    Number(letzte.slice(0, 2)) * 60 + Number(letzte.slice(3)) -
    (Number(erste.slice(0, 2)) * 60 + Number(erste.slice(3)));

  const geteilt =
    shows.length > 1 && abstand >= 210
      ? {
          mittag: [
            { von: minus(erste, erste < "14:00" ? 90 : 120), bis: plus(erste, 180) },
            { von: minus(erste, (erste < "14:00" ? 90 : 120) - 45), bis: plus(erste, 180) },
            { von: minus(erste, (erste < "14:00" ? 90 : 120) - 45), bis: plus(erste, 180) },
          ],
          abend: [
            { von: minus(letzte, 120), bis: ende },
            { von: minus(letzte, 75), bis: nachDerPause },
            { von: minus(letzte, 75), bis: nachDerPause },
          ],
        }
      : null;

  return { vorschlag, pause, geteilt };
}

/**
 * Uhrzeit in Minuten, damit nach Mitternacht nicht "frueher" heisst.
 *
 * "00:30" ist spaeter als "23:00", als Zeichenkette aber kleiner. Alles
 * vor sechs Uhr frueh gehoert noch zum Abend davor.
 */
function alsMinuten(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return (h < 6 ? h + 24 : h) * 60 + m;
}

/**
 * Bis wann dieser Platz ohne Sonderaufgabe arbeitet.
 *
 * Platz eins macht den Abend zu Ende, alle weiteren gehen nach der
 * Pause: Das ist genau der Vorschlag, den der Plan ohnehin rechnet.
 */
export function regelEnde(vorschlag: Array<{ von: string; bis: string }>, nummer: number): string {
  return vorschlag[Math.min(nummer, vorschlag.length) - 1]?.bis ?? "";
}

/**
 * Laenger bleiben nur die, die auch etwas zu tun haben.
 *
 * "die tragen sich da selber bis 23:00 uhr ein. das geht nicht. mach
 * das so, dass die zeit nur auf 23:00 uhr bzw. laenger eingestellt
 * werden kann, wenn man eine Sonderaufgabe eintraegt. Ansonsten endet
 * die Schicht wie gewohnt nach Ende der Pause der show" (Florian,
 * 29.10.2026).
 *
 * Nach der Pause wird nichts mehr verkauft. Wer dann noch da ist,
 * arbeitet entweder an etwas anderem, und das steht dann als
 * Sonderaufgabe da, oder die Stunde wird bezahlt, ohne dass es sie
 * braucht. Deshalb schneidet diese Stelle ueberlange Enden zurueck,
 * und zwar beim Anzeigen wie beim Speichern.
 */
export function endeBegrenzen(bis: string, grenze: string, sonderaufgabe: string): string {
  if (sonderaufgabe.trim() || !bis || !grenze) return bis;
  return alsMinuten(bis) > alsMinuten(grenze) ? grenze : bis;
}

/** Wer im Foyer arbeiten kann, mit dem Vermerk, wer fest angestellt ist. */
export async function foyerLeute(): Promise<FoyerPerson[]> {
  const z = (await db()`
    select b.id, b.name, b.email, coalesce(f.fest, false) as fest
      from benutzer b
      left join foyer_person f on f.benutzer_id = b.id
     where b.aktiv and (b.rolle = 'foyer' or f.benutzer_id is not null)
     order by coalesce(f.fest, false) desc, b.name
  `) as Array<{ id: string; name: string; email: string; fest: boolean }>;
  return z.map((r) => ({ id: r.id, name: r.name, email: r.email, fest: Boolean(r.fest) }));
}

export async function festSetzen(benutzerId: string, fest: boolean): Promise<void> {
  await db()`
    insert into foyer_person (benutzer_id, fest) values (${benutzerId}, ${fest})
    on conflict (benutzer_id) do update set fest = excluded.fest
  `;
}

/** Ein einzelner Dienst über seine id, fürs Übernehmen-Anbieten. */
export async function foyerDienstLesen(id: string): Promise<FoyerDienst | null> {
  const z = (await db()`
    select d.id, d.datum::text as datum, d.abschnitt, d.nummer, d.benutzer_id, b.name,
           coalesce(d.von, '') as von, coalesce(d.bis, '') as bis,
           d.freigabe, d.freigabe_von, d.notiz, coalesce(d.sonderaufgabe, '') as sonderaufgabe
      from foyer_dienst d left join benutzer b on b.id = d.benutzer_id
     where d.id = ${id}
  `) as Array<Record<string, unknown>>;
  const r = z[0];
  if (!r) return null;
  return {
    id: String(r.id),
    datum: String(r.datum),
    abschnitt: ((r.abschnitt as Abschnitt) ?? "ganz"),
    nummer: Number(r.nummer),
    benutzerId: (r.benutzer_id as string) ?? null,
    name: (r.name as string) ?? null,
    von: String(r.von ?? ""),
    bis: String(r.bis ?? ""),
    freigabe: (r.freigabe as Freigabe) ?? "nicht_noetig",
    freigabeVon: (r.freigabe_von as string) ?? null,
    notiz: String(r.notiz ?? ""),
    sonderaufgabe: String(r.sonderaufgabe ?? ""),
  };
}

/** Alle Einträge ab heute, für die Planung. */
async function diensteAb(datum: string): Promise<FoyerDienst[]> {
  const z = (await db()`
    select d.id, d.datum::text as datum, d.abschnitt, d.nummer, d.benutzer_id, b.name,
           coalesce(d.von, '') as von, coalesce(d.bis, '') as bis,
           d.freigabe, d.freigabe_von, d.notiz, coalesce(d.sonderaufgabe, '') as sonderaufgabe
      from foyer_dienst d left join benutzer b on b.id = d.benutzer_id
     where d.datum >= ${datum}::date
     order by d.datum, d.abschnitt, d.nummer
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    datum: String(r.datum),
    abschnitt: ((r.abschnitt as Abschnitt) ?? "ganz"),
    nummer: Number(r.nummer),
    benutzerId: (r.benutzer_id as string) ?? null,
    name: (r.name as string) ?? null,
    von: String(r.von ?? ""),
    bis: String(r.bis ?? ""),
    freigabe: (r.freigabe as Freigabe) ?? "nicht_noetig",
    freigabeVon: (r.freigabe_von as string) ?? null,
    notiz: String(r.notiz ?? ""),
    sonderaufgabe: String(r.sonderaufgabe ?? ""),
  }));
}

/**
 * Die Plaetze eines Tages: die zwei festen, die zusaetzlich besetzten,
 * und ganz unten ein leerer fuer den naechsten.
 *
 * Der leere Platz ist das Pluszeichen in der Oberflaeche. Sobald er
 * besetzt ist, kommt beim naechsten Laden wieder ein leerer darunter.
 */
function plaetzeBauen(
  datum: string,
  abschnitt: Abschnitt,
  amTag: FoyerDienst[],
  vorschlag: Array<{ von: string; bis: string }>,
): FoyerDienst[] {
  const leer = (n: number): FoyerDienst => ({
    id: "",
    datum,
    abschnitt,
    nummer: n,
    benutzerId: null,
    name: null,
    // Wer zusaetzlich kommt, bekommt die Zeiten der zweiten Person: Er
    // kommt dazu, nicht spaeter.
    von: vorschlag[Math.min(n, vorschlag.length) - 1]?.von ?? "",
    bis: vorschlag[Math.min(n, vorschlag.length) - 1]?.bis ?? "",
    freigabe: "nicht_noetig",
    freigabeVon: null,
    notiz: "",
    sonderaufgabe: "",
  });

  const fest = PLAETZE.map((n) => amTag.find((d) => d.nummer === n) ?? leer(n));

  // Zusaetzliche Plaetze zaehlen nur, wenn jemand darauf steht. Ein leer
  // gespeicherter Platz wuerde die Liste sonst mit jedem Speichern laenger
  // machen, ohne dass jemand mehr arbeitet.
  const zusaetzlich = amTag
    .filter((d) => d.nummer > PLAETZE.length && d.benutzerId)
    .sort((a, b) => a.nummer - b.nummer);

  const naechste = (zusaetzlich.at(-1)?.nummer ?? PLAETZE.length) + 1;

  return [...fest, ...zusaetzlich, leer(naechste)].map((d) => {
    const begrenzt = endeBegrenzen(d.bis, regelEnde(vorschlag, d.nummer), d.sonderaufgabe);
    return begrenzt === d.bis ? d : { ...d, bis: begrenzt };
  });
}

/** Der Plan: zwei feste Plätze je Showtag, dazu beliebig viele weitere. */
export async function foyerPlan(wochen = 8): Promise<FoyerTag[]> {
  const bis = Date.now() + wochen * 7 * 86400000;
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const [termine, dienste, abgesagt, plan] = await Promise.all([
    showtageAbHeute(400),
    diensteAb(heute),
    abgesagteEventIds().catch(() => new Set<string>()),
    planLaden().catch(() => ({ schichten: [] as never[] })),
  ]);

  /*
    Die verantwortliche Technik je Vorstellung, aus dem Showdienstplan.
    An einem Abend ohne Show ist das die Stelle "Technik", sonst T1.
  */
  const REIHENFOLGE = ["TECHNIK", "FOH", "T1", "T2"];
  const technikJeEvent = new Map<
    string,
    { besetzung: Array<{ position: string; name: string }>; sonder: boolean }
  >();
  for (const s of plan.schichten as Array<{ termin: Vorstellungstermin; slots: Array<{ position: string; person: { name: string } | null }> }>) {
    const besetzt = s.slots
      .filter((x) => REIHENFOLGE.includes(x.position) && x.person)
      .sort((a, b) => REIHENFOLGE.indexOf(a.position) - REIHENFOLGE.indexOf(b.position))
      .map((x) => ({ position: x.position === "TECHNIK" ? "Technik" : x.position, name: x.person!.name }));
    if (besetzt.length === 0) continue;
    technikJeEvent.set(s.termin.ditixEventId, {
      besetzung: besetzt,
      sonder: s.slots.some((x) => x.position === "TECHNIK"),
    });
  }

  /*
    Stornierte Vorstellungen bleiben sichtbar.

    Frueher fiel eine abgesagte Show hier heraus, und mit der letzten
    Show des Tages verschwand der ganze Tag aus dem Plan, samt den
    Leuten, die schon eingeteilt waren. Niemand sah mehr, dass da jemand
    umsonst kommen wuerde (Florian, 15.10.2026).

    Jetzt bleibt der Tag stehen und wird rot gezeigt, wie beim Showteam.
    Die Zeiten richten sich weiter nach den Shows, die stattfinden;
    faellt alles aus, stehen die Zeiten der abgesagten Show da, damit
    man sieht, worum es ging.
  */
  const nachTag = new Map<string, Vorstellungstermin[]>();
  for (const t of termine) {
    if (t.beginn.getTime() > bis) continue;
    nachTag.set(t.datum, [...(nachTag.get(t.datum) ?? []), t]);
  }

  /*
    Zwei Shows, zwei Kacheln. Ohne Knopf.

    Frueher musste jemand "Tag aufteilen" druecken, sonst stand ein
    Dienst von mittags bis nachts im Plan. "das mit dem aufteilen ist
    doch quatsch, wir wollten, dass die shows extra kacheln haben, also
    die mittagshow und abendshow getrennt eingeteilt werden" (Florian,
    26.10.2026, nach einem Hinweis von Veronica, bei der der Knopf nichts
    tat). Also teilt der Plan selbst, sobald zwischen den Shows genug
    Zeit liegt.

    Wer an so einem Tag schon fuer den ganzen Tag eingetragen war, wird
    dabei einmal umgeschrieben, genau wie der Knopf es tat: mittags und
    abends dieselben Leute, abends herausnehmen ist schnell. Danach gibt
    es an dem Tag nichts mehr nachzuziehen.
  */
  let nachgezogen = false;
  for (const [datum, shows] of nachTag) {
    const laufen = shows.filter((s) => !abgesagt.has(s.ditixEventId));
    const sortiert = [...(laufen.length > 0 ? laufen : shows)].sort((a, b) =>
      a.uhrzeit.localeCompare(b.uhrzeit),
    );
    const { geteilt } = foyerZeiten(sortiert);
    if (!geteilt) continue;
    if (!dienste.some((d) => d.datum === datum && d.abschnitt === "ganz")) continue;
    await tagTeilen(datum, geteilt, "Plan");
    nachgezogen = true;
  }
  const alleDienste = nachgezogen ? await diensteAb(heute) : dienste;

  return [...nachTag.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([datum, shows]) => {
      const sortiert = [...shows].sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));
      const laufen = sortiert.filter((s) => !abgesagt.has(s.ditixEventId));
      const allesAbgesagt = laufen.length === 0;
      // Die Zeiten richten sich nach dem, was stattfindet.
      const { vorschlag, pause, geteilt } = foyerZeiten(allesAbgesagt ? sortiert : laufen);
      const amTag = alleDienste.filter((d) => d.datum === datum);
      const teilbar = geteilt !== null;
      // Zwei Shows mit Abstand sind immer zwei Dienste, auch wenn noch
      // niemand eingeteilt ist: Die Kacheln stehen von Anfang an getrennt.
      const istGeteilt = teilbar || amTag.some((d) => d.abschnitt !== "ganz");
      const bloecke: FoyerBlock[] = istGeteilt
        ? [
            {
              abschnitt: "mittag" as const,
              titel: "Mittagsshow",
              vorschlag: geteilt?.mittag ?? vorschlag,
              dienste: plaetzeBauen(
                datum,
                "mittag",
                amTag.filter((d) => d.abschnitt === "mittag"),
                geteilt?.mittag ?? vorschlag,
              ),
            },
            {
              abschnitt: "abend" as const,
              titel: "Abendshow",
              vorschlag: geteilt?.abend ?? vorschlag,
              dienste: plaetzeBauen(
                datum,
                "abend",
                amTag.filter((d) => d.abschnitt === "abend"),
                geteilt?.abend ?? vorschlag,
              ),
            },
          ]
        : [
            {
              abschnitt: "ganz" as const,
              titel: "",
              vorschlag,
              dienste: plaetzeBauen(datum, "ganz", amTag.filter((d) => d.abschnitt === "ganz"), vorschlag),
            },
          ];
      return {
        datum,
        abgesagt: allesAbgesagt,
        shows: sortiert.map((s) => ({
          uhrzeit: s.uhrzeit,
          name: s.name,
          abgesagt: abgesagt.has(s.ditixEventId),
        })),
        technik: sortiert
          .filter((s) => technikJeEvent.has(s.ditixEventId))
          .map((s) => {
            const t = technikJeEvent.get(s.ditixEventId)!;
            return {
              ditixEventId: s.ditixEventId,
              showName: s.name,
              uhrzeit: s.uhrzeit,
              besetzung: t.besetzung,
              sonderveranstaltung: t.sonder,
            };
          }),
        bloecke,
        teilbar,
        geteilt: istGeteilt,
        pause: istGeteilt ? null : pause,
      };
    });
}

/** Einteilen oder wieder frei machen. Gibt den gespeicherten Eintrag zurück. */
export async function dienstSetzen(o: {
  datum: string;
  abschnitt?: Abschnitt;
  nummer: number;
  benutzerId: string | null;
  von: string;
  bis: string;
  freigabe: Freigabe;
  von_wem: string;
}): Promise<void> {
  await db()`
    insert into foyer_dienst (datum, abschnitt, nummer, benutzer_id, von, bis, freigabe, geaendert_von, geaendert_am)
    values (${o.datum}::date, ${o.abschnitt ?? "ganz"}, ${o.nummer}, ${o.benutzerId}, ${o.von}, ${o.bis},
            ${o.freigabe}, ${o.von_wem}, now())
    on conflict (datum, abschnitt, nummer) do update set
      benutzer_id = excluded.benutzer_id, von = excluded.von, bis = excluded.bis,
      freigabe = excluded.freigabe, freigabe_von = null, freigabe_am = null,
      geaendert_von = excluded.geaendert_von, geaendert_am = now()
  `;
}

export async function zeitenSetzen(o: {
  datum: string;
  abschnitt?: Abschnitt;
  nummer: number;
  von: string;
  bis: string;
  notiz: string;
  sonderaufgabe?: string;
  von_wem: string;
}): Promise<void> {
  await db()`
    insert into foyer_dienst (datum, abschnitt, nummer, von, bis, notiz, sonderaufgabe,
                              geaendert_von, geaendert_am)
    values (${o.datum}::date, ${o.abschnitt ?? "ganz"}, ${o.nummer}, ${o.von}, ${o.bis}, ${o.notiz},
            ${o.sonderaufgabe ?? ""}, ${o.von_wem}, now())
    on conflict (datum, abschnitt, nummer) do update set
      von = excluded.von, bis = excluded.bis, notiz = excluded.notiz,
      sonderaufgabe = excluded.sonderaufgabe,
      geaendert_von = excluded.geaendert_von, geaendert_am = now()
  `;
}


/**
 * Einen zusaetzlichen Platz wieder wegnehmen.
 *
 * Nur fuer Plaetze ueber die zwei festen hinaus: Wird dort "offen"
 * gespeichert, soll die Zeile ganz verschwinden und nicht als leerer
 * Platz stehen bleiben.
 */
export async function dienstWeg(datum: string, nummer: number, abschnitt: Abschnitt = "ganz"): Promise<void> {
  if (nummer <= PLAETZE.length) return;
  await db()`
    delete from foyer_dienst
     where datum = ${datum}::date and abschnitt = ${abschnitt} and nummer = ${nummer}
  `;
}

/**
 * Einen Doppelshow-Tag in Mittag und Abend teilen.
 *
 * Wer schon eingeteilt ist, bleibt eingeteilt, und zwar mittags: Die
 * Matinee faengt frueher an, und wer sich umentscheidet, verschiebt sich
 * mit zwei Klicks. Der Abend startet leer, mit den Vorschlagszeiten.
 * Niemand verliert durch die Teilung seinen Dienst.
 */
export async function tagTeilen(
  datum: string,
  zeiten: { mittag: Array<{ von: string; bis: string }>; abend: Array<{ von: string; bis: string }> },
  vonWem: string,
): Promise<void> {
  const vorhanden = (await db()`
    select nummer, von, bis from foyer_dienst
     where datum = ${datum}::date and abschnitt = 'ganz' and benutzer_id is not null
     order by nummer
  `) as Array<{ nummer: number; von: string | null; bis: string | null }>;

  await db()`
    update foyer_dienst set abschnitt = 'mittag', geaendert_von = ${vonWem}, geaendert_am = now()
     where datum = ${datum}::date and abschnitt = 'ganz'
  `;

  /*
    Der Abend startet nicht leer.

    Frueher schon: Die Teilung schob alle in den Mittag, und abends
    stand niemand mehr da. Im Foyer sah das aus, als waere der Plan
    verschwunden. "wenn wir die show spielen und sie nicht abgesagt
    wurde, dann brauchen wir leute" (Florian, 24.10.2026).

    Deshalb stehen dieselben Leute zunaechst in beiden Haelften, mit
    den Abendzeiten. Wer wirklich nur mittags arbeitet, wird abends
    auf "offen" gesetzt: Jemanden herausnehmen ist schnell, jemanden
    suchen, der im Plan fehlt, dauert.
  */
  for (const d of vorhanden) {
    const z = zeiten.abend[Math.min(d.nummer, zeiten.abend.length) - 1];
    await db()`
      insert into foyer_dienst (datum, abschnitt, nummer, benutzer_id, von, bis, freigabe,
                                geaendert_von, geaendert_am)
      select ${datum}::date, 'abend', ${d.nummer}, benutzer_id,
             ${z?.von ?? null}, ${z?.bis ?? null}, freigabe, ${vonWem}, now()
        from foyer_dienst
       where datum = ${datum}::date and abschnitt = 'mittag' and nummer = ${d.nummer}
      on conflict (datum, abschnitt, nummer) do nothing
    `;
  }

  // Die Mittagszeiten setzen, aber nur dort, wo noch der alte
  // Tagesvorschlag steht: Von Hand gesetzte Zeiten bleiben stehen.
  for (const d of vorhanden) {
    const z = zeiten.mittag[Math.min(d.nummer, zeiten.mittag.length) - 1];
    if (!z) continue;
    await db()`
      update foyer_dienst set bis = ${z.bis}, geaendert_am = now()
       where datum = ${datum}::date and abschnitt = 'mittag' and nummer = ${d.nummer}
    `;
  }
}

/** Die Teilung wieder aufheben: alles zurueck auf einen Tagesdienst. */
export async function teilungAufheben(datum: string, vonWem: string): Promise<void> {
  /*
    Der Abend wird mit dem Mittag zusammengelegt. Steht abends jemand
    anderes als mittags, bleibt er als zusaetzlicher Platz erhalten,
    damit die Teilung niemanden aus dem Plan wirft.
  */
  const abend = (await db()`
    select nummer, benutzer_id, von, bis, notiz from foyer_dienst
     where datum = ${datum}::date and abschnitt = 'abend' and benutzer_id is not null
     order by nummer
  `) as Array<Record<string, unknown>>;
  const mittagsLeute = (await db()`
    select benutzer_id from foyer_dienst
     where datum = ${datum}::date and abschnitt = 'mittag' and benutzer_id is not null
  `) as Array<{ benutzer_id: string }>;
  const schon = new Set(mittagsLeute.map((x) => x.benutzer_id));

  await db()`delete from foyer_dienst where datum = ${datum}::date and abschnitt = 'abend'`;
  await db()`
    update foyer_dienst set abschnitt = 'ganz', geaendert_von = ${vonWem}, geaendert_am = now()
     where datum = ${datum}::date and abschnitt = 'mittag'
  `;

  const [{ hoechste }] = (await db()`
    select coalesce(max(nummer), 0)::int as hoechste from foyer_dienst
     where datum = ${datum}::date and abschnitt = 'ganz'
  `) as Array<{ hoechste: number }>;

  let naechste = Math.max(hoechste, PLAETZE.length);
  for (const a of abend) {
    if (schon.has(String(a.benutzer_id))) continue;
    naechste += 1;
    await db()`
      insert into foyer_dienst (datum, abschnitt, nummer, benutzer_id, von, bis, notiz, geaendert_von, geaendert_am)
      values (${datum}::date, 'ganz', ${naechste}, ${String(a.benutzer_id)},
              ${(a.von as string) ?? ""}, ${(a.bis as string) ?? ""}, ${(a.notiz as string) ?? ""},
              ${vonWem}, now())
      on conflict (datum, abschnitt, nummer) do nothing
    `;
  }
}
