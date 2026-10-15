/**
 * Die Stunden für die Lohnabrechnung.
 *
 * Werner gibt sie an Frau Buschow im Steuerbüro weiter. Deshalb zählt
 * hier nicht nur die Summe, sondern auch, wie sie zustande kommt: Wer
 * wann gekommen und gegangen ist, wie lange Pause war, an welchen Tagen
 * jemand Urlaub hatte oder krank war (Florian, 29.09.2026).
 *
 * Gerechnet wird aus den Stempeln, nicht aus einer nebenher geführten
 * Liste. Was der Mitarbeiter am Handy gedrückt hat, ist die Wahrheit;
 * alles andere ließe sich hinterher nicht mehr belegen.
 */

import { db } from "@/lib/db/client";
import { nachFamilienname } from "@/lib/domain/namen";
import { nachtschichtenAnhaengen, tagRechnen } from "@/lib/stempel/tag";
import type { Zeitraum } from "./zeitraum";

export type Abwesenheitsart = "urlaub" | "krank" | "privat";

export interface Tagesprotokoll {
  /** JJJJ-MM-TT in hiesiger Zeit. */
  datum: string;
  /** Die Stempel des Tages, in der Reihenfolge des Drückens. */
  stempel: Array<{ art: string; uhrzeit: string; quelle: string; imHaus: boolean }>;
  arbeitMinuten: number;
  /** Nur am Zuschauertag: was die Uhr wirklich gezaehlt hat. */
  gestempelteMinuten?: number;
  /**
   * Bezahlte Anfahrt dieses Tages, in arbeitMinuten enthalten.
   *
   * Nur bei Leuten, bei denen eine Anfahrtszeit hinterlegt ist, und nur
   * an Tagen, an denen wirklich gestempelt wurde (Florian, 15.10.2026).
   */
  anfahrtMinuten?: number;
  /** War dieser Tag ein Dienst als eingeweihter Zuschauer? */
  zuschauer?: boolean;
  pauseMinuten: number;
  /** Offen heißt: gekommen, aber nie gegangen. Dann fehlt die Zeit. */
  offen: boolean;
  /** Wie viele Fehlstempel herausgefallen sind, etwa dreimal Einstempeln. */
  fehlstempel: number;
  /** Warum der Tag nicht plausibel ist, sonst null. */
  unplausibel: string | null;
  /** Das Büro hat den Tag angefasst und damit bestätigt. */
  bestaetigt: boolean;
  /** Zählt der Tag mit? Ein offener oder unplausibler Tag zählt nicht. */
  gewertet: boolean;
}

export interface Abwesenheitstag {
  datum: string;
  art: Abwesenheitsart;
  grund: string;
}

export interface Mitarbeiterzeiten {
  benutzerId: string;
  name: string;
  email: string;
  arbeitMinuten: number;
  pauseMinuten: number;
  arbeitstage: number;
  urlaubstage: number;
  kranktage: number;
  /** Tage, an denen ein Gehen fehlt. Die muss jemand nacharbeiten. */
  offeneTage: string[];
  /** Tage, deren Zeiten nicht plausibel sind und noch bestätigt werden müssen. */
  unplausibleTage: Array<{ datum: string; grund: string }>;
  protokoll: Tagesprotokoll[];
  abwesend: Abwesenheitstag[];
  /**
   * Stunden aus der Schnupperzeit.
   *
   * Wer schnuppert, stempelt mit: Wer im Haus ist, soll im Haus gestempelt
   * sein. Gemeldet wird davon nichts, so war es bei den Proben ausgemacht
   * (Florian, 05.10.2026). Diese Minuten stecken deshalb NICHT in
   * arbeitMinuten, sondern stehen hier daneben.
   */
  schnupperMinuten: number;
  schnupperTage: string[];
  /** Schnuppert diese Person gerade? Für die Anzeige. */
  schnuppert: boolean;
  /**
   * Arbeitet auf Rechnung, also als Freelancer.
   *
   * "schaffe bei den Stunden eine eigene Rubrik Freelancer-Stunden auf
   * Rechnung, diese müssen abgesetzt dargestellt werden und bedürfen
   * keiner Meldung ans Lohnbüro" (Florian, 15.10.2026). Die Stunden
   * werden gerechnet und angezeigt, gehen aber nicht in die Meldung.
   */
  aufRechnung: boolean;
}

const ZEITZONE = "Europe/Berlin";

/** Datum und Uhrzeit in hiesiger Zeit, nicht in UTC. */
function hier(iso: string): { tag: string; uhrzeit: string } {
  const d = new Date(iso);
  const tag = d.toLocaleDateString("sv-SE", { timeZone: ZEITZONE });
  const uhrzeit = d.toLocaleTimeString("de-DE", {
    timeZone: ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { tag, uhrzeit };
}

/** Alle Tage eines Zeitraums als JJJJ-MM-TT. */
function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = [];
  const d = new Date(`${von}T12:00:00Z`);
  const ende = new Date(`${bis}T12:00:00Z`);
  while (d <= ende) {
    tage.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return tage;
}

/**
 * Die Zeiten aller Mitarbeiter in einem Zeitraum.
 *
 * Ein Tag beginnt und endet nach hiesiger Zeit. Deshalb wird großzügig
 * geladen (ein Tag vorher und nachher) und danach genau zugeordnet:
 * Sonst fiele eine Schicht, die um 23:30 Uhr endet, im Winter in den
 * falschen Tag.
 */
export async function zeitenImZeitraum(z: Zeitraum): Promise<Mitarbeiterzeiten[]> {
  const stempel = (await db()`
    select s.benutzer_id, s.name, s.art, s.zeitpunkt, s.quelle, s.im_haus, s.geaendert_von, b.email,
           b.schnuppert, b.schnuppert_seit::text as schnuppert_seit, b.schnuppert_bis::text as schnuppert_bis,
           coalesce(b.anfahrt_minuten, 0) as anfahrt_minuten,
           coalesce(b.auf_rechnung, false) as auf_rechnung
      from stempel s
      left join benutzer b on b.id = s.benutzer_id
     where s.zeitpunkt >= (${z.von}::date - 1)::timestamptz
       and s.zeitpunkt < (${z.bis}::date + 2)::timestamptz
       /*
         Die Geschaeftsfuehrung stempelt nur zum Ausprobieren.

         "mich, Kevin und Werner bitte rausnehmen aus der Stundenliste,
         wenn wir stempeln ist das nur zum Testen, von uns dreien werden
         nie Stunden gemeldet" (Florian, 15.10.2026). Die Stempel bleiben
         stehen, ausgewertet werden sie nicht mehr.
       */
       and coalesce(b.ohne_lohnmeldung, false) = false
     order by s.benutzer_id, s.zeitpunkt
  `) as Array<Record<string, unknown>>;

  const abwesend = (await db()`
    select a.benutzer_id, b.name, b.email, a.von::text as von, a.bis::text as bis, a.grund, a.art
      from dienst_abwesend a
      join benutzer b on b.id = a.benutzer_id
     where a.von <= ${z.bis}::date and a.bis >= ${z.von}::date
       and coalesce(b.ohne_lohnmeldung, false) = false
     order by a.von
  `) as Array<Record<string, unknown>>;

  /*
    Die Zuschauer-Dienste im Zeitraum.

    "buch beim Zuschauer immer nur die volle Stunde, max. zwei"
    (Florian, 14.10.2026). Der Eingeweihte sitzt im Publikum und sieht
    die Show; abgerechnet werden deshalb volle Stunden, abgerundet, und
    nie mehr als zwei. Die Uhr zeichnet weiter die echten Zeiten auf,
    im Protokoll bleibt beides nebeneinander lesbar.
  */
  const zuschauertage = new Set(
    ((await db()`
      select benutzer_id, datum::text as datum
        from dienst_einsatz
       where position = 'ZUSCHAUER' and datum between ${z.von}::date and ${z.bis}::date
       union all
      select f.benutzer_id, d::text as datum
        from dienst_fest f
        cross join generate_series(${z.von}::date, ${z.bis}::date, interval '1 day') as d
       where f.position = 'ZUSCHAUER'
         and (f.wochentag is null or f.wochentag = extract(dow from d))
         and not exists (
           select 1 from dienst_einsatz e
            where e.datum = d::date and e.position = 'ZUSCHAUER'
         )
    `.catch(() => [])) as Array<{ benutzer_id: string; datum: string }>).map(
      (r) => `${r.benutzer_id}|${r.datum}`,
    ),
  );

  /**
   * Volle Stunden, abgerundet, höchstens zwei.
   *
   * Unter einer Stunde bleibt die echte Zeit stehen, statt auf null zu
   * fallen: "das passiert also nie, ausser er kommt total spät und geht
   * früh, dafür wäre es sinnvoll" (Florian, 14.10.2026). Wer 45 Minuten
   * da war, bekommt 45 Minuten; wer eine Hälfte bleibt, eine Stunde;
   * wer beide bleibt, zwei.
   */
  const alsZuschauerstunden = (minuten: number): number =>
    minuten < 60 ? minuten : Math.min(120, Math.floor(minuten / 60) * 60);

  const imZeitraum = (tag: string) => tag >= z.von && tag <= z.bis;
  const leute = new Map<string, Mitarbeiterzeiten>();

  /*
    Die bezahlte Anfahrt je Person und Arbeitstag.

    "bei Julian Scherer wird pro Tag wo er hier ist eine extra Stunde
    gestempelt, es ist die Zeit fuer die Anfahrt nach Ulm" (Florian,
    15.10.2026). Sie kommt nicht aus der Uhr, sondern aus der Person,
    deshalb wird sie hier addiert und im Protokoll getrennt ausgewiesen.
  */
  const anfahrt = new Map<string, number>();
  const aufRechnung = new Set<string>();
  for (const s of stempel) {
    const minuten = Number(s.anfahrt_minuten ?? 0);
    if (minuten > 0) anfahrt.set(String(s.benutzer_id), minuten);
    if (s.auf_rechnung === true) aufRechnung.add(String(s.benutzer_id));
  }

  /*
    Wer wann geschnuppert hat.

    Ein Tag zaehlt als Schnuppertag, wenn er in den Zeitraum faellt, den
    das Kennzeichen abdeckt. Ohne Ende laeuft er bis heute weiter.
  */
  const schnupperzeit = new Map<string, { von: string; bis: string | null; laeuft: boolean }>();
  for (const s of stempel) {
    const id = String(s.benutzer_id);
    if (schnupperzeit.has(id)) continue;
    const seit = (s.schnuppert_seit as string) ?? null;
    const bis = (s.schnuppert_bis as string) ?? null;
    const laeuft = s.schnuppert === true;
    if (!laeuft && !bis) continue;
    schnupperzeit.set(id, { von: seit ?? "0000-01-01", bis, laeuft });
  }

  const istSchnuppertag = (id: string, tag: string): boolean => {
    const z = schnupperzeit.get(id);
    if (!z) return false;
    if (tag < z.von) return false;
    return z.bis ? tag < z.bis : z.laeuft;
  };

  const hole = (id: string, name: string, email: string): Mitarbeiterzeiten => {
    const da = leute.get(id);
    if (da) return da;
    const neu: Mitarbeiterzeiten = {
      benutzerId: id,
      name,
      email,
      arbeitMinuten: 0,
      pauseMinuten: 0,
      arbeitstage: 0,
      urlaubstage: 0,
      kranktage: 0,
      offeneTage: [],
      unplausibleTage: [],
      protokoll: [],
      abwesend: [],
      schnupperMinuten: 0,
      schnupperTage: [],
      schnuppert: schnupperzeit.get(id)?.laeuft ?? false,
      aufRechnung: aufRechnung.has(id),
    };
    leute.set(id, neu);
    return neu;
  };

  /*
    Die Stempel je Person zu Tagen buendeln.

    Ein Tag ist hier eine Schicht, kein Kalendertag: Wer um 17 Uhr kommt
    und nach dem Aufraeumen um halb eins geht, hat einmal gearbeitet.
    Deshalb wandern die Stempel der Nacht in nachtschichtenAnhaengen()
    zurueck zum Vortag (Florian, 29.09.2026).
  */
  interface RohStempel {
    art: string;
    ms: number;
    geaendertVon: string | null;
    uhrzeit: string;
    quelle: string;
    imHaus: boolean;
  }

  const jePerson = new Map<string, Map<string, RohStempel[]>>();
  for (const s of stempel) {
    const id = String(s.benutzer_id);
    hole(id, String(s.name ?? ""), String(s.email ?? ""));
    const { tag, uhrzeit } = hier(String(s.zeitpunkt));

    const tage = jePerson.get(id) ?? new Map<string, RohStempel[]>();
    jePerson.set(id, tage);
    tage.set(tag, [
      ...(tage.get(tag) ?? []),
      {
        art: String(s.art),
        ms: Date.parse(String(s.zeitpunkt)),
        geaendertVon: (s.geaendert_von as string) ?? null,
        uhrzeit,
        quelle: String(s.quelle ?? "app"),
        imHaus: s.im_haus !== false,
      },
    ]);
  }

  /*
    Aus den Stempeln die Minuten rechnen.

    Gerechnet wird in tagRechnen(), derselben Stelle wie in der
    Stempeluhr. Dort fallen auch Fehlstempel heraus und dort entscheidet
    sich, ob ein Tag plausibel ist. Ein Tag, der nicht gewertet wird,
    zaehlt mit null Minuten: Lieber eine Luecke, die jemand sieht, als eine
    geratene Zahl in der Lohnabrechnung.
  */
  for (const [id, tage] of jePerson) {
    const person = leute.get(id)!;
    const gruppen = nachtschichtenAnhaengen(
      [...tage].map(([datum, liste]) => ({ datum, stempel: liste })),
    );

    /*
      An welchen Tagen war die Person ueberhaupt da?

      Gebraucht fuer die Anfahrt: Wer an zwei Tagen hintereinander
      arbeitet, hat im Theater geschlafen und ist nur einmal gefahren
      (Florian, 15.10.2026). Hier stehen auch Tage knapp ausserhalb des
      Zeitraums, damit ein Monatswechsel die Kette nicht zerreisst.
    */
    const stempeltage = new Set(gruppen.map((g) => g.datum));
    const vortagVon = (datum: string): string => {
      const d = new Date(`${datum}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };

    for (const g of gruppen) {
      // Erst nach dem Zusammenfuehren entscheidet sich, zu welchem Tag
      // eine Nachtschicht gehoert. Deshalb wird hier gefiltert, nicht vorher.
      if (!imZeitraum(g.datum)) continue;

      const r = tagRechnen(g.datum, g.stempel);

      /*
        Am Zuschauertag zaehlen nur volle Stunden, hoechstens zwei.

        Gekuerzt wird einmal und an dieser Stelle, damit Protokoll,
        Summe und Meldung ans Lohnbuero dieselbe Zahl zeigen.
      */
      const istZuschauertag = zuschauertage.has(`${id}|${g.datum}`);
      const gerechnet = istZuschauertag ? alsZuschauerstunden(r.arbeitMinuten) : r.arbeitMinuten;

      /*
        Die Anfahrt kommt obendrauf, aber nur einmal je Aufenthalt.

        Zwei Tage hintereinander heissen: Er hat hier geschlafen und ist
        nur einmal gefahren, also nur eine Stunde. "sollte er Samstag und
        Sonntag arbeiten, oder Freitag und Samstag, dann heisst es, dass
        er im Theater geschlafen hat, fuer so einen Fall darf nur eine
        Stunde gebucht werden" (Florian, 15.10.2026). Die Stunde haengt
        am ersten Tag der Kette.

        Ein offener oder unplausibler Tag bekommt sie nicht: Dort steht
        ohnehin nichts, was gemeldet wird.
      */
      const ersterTagDerKette = !stempeltage.has(vortagVon(g.datum));
      const anfahrtMinuten =
        r.gewertet && gerechnet > 0 && ersterTagDerKette ? (anfahrt.get(id) ?? 0) : 0;
      const arbeitMinuten = gerechnet + anfahrtMinuten;

      const tagProt: Tagesprotokoll = {
        datum: g.datum,
        stempel: g.stempel.map((x) => ({
          art: x.art,
          uhrzeit: x.uhrzeit,
          quelle: x.quelle,
          imHaus: x.imHaus,
        })),
        arbeitMinuten,
        zuschauer: istZuschauertag,
        gestempelteMinuten: r.arbeitMinuten,
        anfahrtMinuten: anfahrtMinuten || undefined,
        pauseMinuten: r.pauseMinuten,
        offen: r.offen,
        fehlstempel: r.fehlstempel,
        unplausibel: r.unplausibel,
        bestaetigt: r.bestaetigt,
        gewertet: r.gewertet,
      };
      person.protokoll.push(tagProt);

      if (r.gewertet) {
        /*
          Schnupperstunden zaehlen fuer sich.

          Sie stehen im Protokoll und im Arbeitszeitkonto, gehen aber
          nicht in die Meldung ans Lohnbuero (Florian, 05.10.2026).
        */
        if (istSchnuppertag(id, g.datum)) {
          person.schnupperMinuten += arbeitMinuten;
          if (arbeitMinuten > 0) person.schnupperTage.push(g.datum);
        } else {
          person.arbeitMinuten += arbeitMinuten;
          person.pauseMinuten += r.pauseMinuten;
          if (arbeitMinuten > 0) person.arbeitstage += 1;
        }
      }
      if (r.offen) person.offeneTage.push(g.datum);
      if (r.unplausibel && !r.bestaetigt) {
        person.unplausibleTage.push({ datum: g.datum, grund: r.unplausibel });
      }
    }
  }

  // Urlaub und Krankheit tageweise, nur innerhalb des Zeitraums.
  for (const a of abwesend) {
    const id = String(a.benutzer_id);
    const person = hole(id, String(a.name ?? ""), String(a.email ?? ""));
    const art = String(a.art ?? "privat") as Abwesenheitsart;
    for (const tag of tageZwischen(String(a.von), String(a.bis))) {
      if (!imZeitraum(tag)) continue;
      person.abwesend.push({ datum: tag, art, grund: String(a.grund ?? "") });
      if (art === "urlaub") person.urlaubstage += 1;
      if (art === "krank") person.kranktage += 1;
    }
  }

  for (const p of leute.values()) {
    p.protokoll.sort((a, b) => a.datum.localeCompare(b.datum));
    p.abwesend.sort((a, b) => a.datum.localeCompare(b.datum));
    p.unplausibleTage.sort((a, b) => a.datum.localeCompare(b.datum));
  }

  return [...leute.values()]
    .filter(
      (p) =>
        p.arbeitMinuten > 0 ||
        // Wer nur geschnuppert hat, soll hier trotzdem stehen: Florian
        // und Werner sollen die Stunden sehen, nur melden sie sie nicht.
        p.schnupperMinuten > 0 ||
        p.abwesend.length > 0 ||
        p.offeneTage.length > 0 ||
        p.unplausibleTage.length > 0,
    )
    .sort(nachFamilienname);
}

/** "7:45" aus 465 Minuten. */
export function alsStunden(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/*
  Industrieminuten gibt es hier nicht mehr.

  "wir möchten bei den arbeitszeiten keine industrieminuten, sondern die
  echte arbeitszeit. also kein quatsch wie 23,68 stunden" (Florian,
  01.10.2026). Überall, wo früher 7,75 stand, steht jetzt 7:45. Das ist
  die Zeit, die auf der Uhr stand, und nur die lässt sich mit einem
  Dienstplan vergleichen.
*/
