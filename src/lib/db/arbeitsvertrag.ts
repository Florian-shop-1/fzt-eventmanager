/**
 * Arbeitsverträge: anlegen, ansehen, unterschreiben.
 *
 * Der Weg ist immer derselbe: Der Mitarbeiter füllt seinen Personalbogen
 * aus, das Büro legt daraus den Vertrag an und trägt nur noch ein, was
 * der Bogen nicht weiss (Stelle, Lohn, Beginn), und der Mitarbeiter
 * unterschreibt am Bildschirm (Florian, 30.09.2026).
 *
 * Unterschrieben wird genau der Text, der auf dem Bildschirm stand. Er
 * wird mit der Unterschrift zusammen gespeichert, samt Fingerabdruck.
 * Ändert sich später die Vorlage, bleibt der unterschriebene Vertrag
 * unberührt.
 */

import { createHash } from "node:crypto";
import { db } from "./client";
import {
  ganzerVertragstext,
  type Luecken,
  type Vertragsart,
} from "@/lib/personal/arbeitsvertrag";

export interface Arbeitsvertrag {
  id: string;
  benutzerId: string;
  name: string;
  email: string;
  art: Vertragsart;
  taetigkeit: string;
  aufgaben: string;
  position: string;
  beginn: string;
  ende: string;
  stundenlohnCent: number | null;
  monatsstunden: number | null;
  wochenstunden: number | null;
  festgehaltCent: number | null;
  probezeitMonate: number | null;
  personalien: Record<string, string>;
  angelegtVon: string;
  angelegtAm: string;
  vertragstext: string | null;
  textstand: string | null;
  unterschrift: string | null;
  unterschriebenAm: string | null;
  /**
   * Die Unterschrift des Arbeitgebers.
   *
   * Steht erst da, wenn der Mitarbeiter unterschrieben hat. Vorher ist
   * sie nicht nur unsichtbar, sie existiert am Vertrag gar nicht: Sonst
   * koennte jemand an ein Blatt kommen, auf dem nur der Chef
   * unterschrieben hat (Florian, 01.10.2026).
   */
  arbeitgeberUnterschrift: string | null;
  freigegebenAm: string | null;
  freigegebenVon: string | null;
  /** Verdient die Person mit diesem Vertrag mehr als mit dem letzten? */
  erhoehung: boolean;
  /** Der Satz, den der Hase sagt. Leer heisst: der Standardsatz. */
  hasenText: string;
  zurueckgezogenAm: string | null;
  zurueckgezogenVon: string | null;
}

function baue(z: Record<string, unknown>): Arbeitsvertrag {
  const zahl = (w: unknown) => (w === null || w === undefined ? null : Number(w));
  const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : null);
  return {
    id: String(z.id),
    benutzerId: String(z.benutzer_id),
    name: String(z.name ?? ""),
    email: String(z.email ?? ""),
    art: (z.art as Vertragsart) ?? "kurzfristig",
    taetigkeit: String(z.taetigkeit ?? ""),
    aufgaben: String(z.aufgaben ?? ""),
    position: String(z.position ?? ""),
    beginn: String(z.beginn),
    ende: String(z.ende),
    stundenlohnCent: zahl(z.stundenlohn_cent),
    monatsstunden: zahl(z.monatsstunden),
    wochenstunden: zahl(z.wochenstunden),
    festgehaltCent: zahl(z.festgehalt_cent),
    probezeitMonate: zahl(z.probezeit_monate),
    personalien: (z.personalien as Record<string, string>) ?? {},
    angelegtVon: String(z.angelegt_von ?? ""),
    angelegtAm: zeit(z.angelegt_am)!,
    vertragstext: (z.vertragstext as string) ?? null,
    textstand: (z.textstand as string) ?? null,
    unterschrift: (z.unterschrift as string) ?? null,
    unterschriebenAm: zeit(z.unterschrieben_am),
    arbeitgeberUnterschrift: (z.arbeitgeber_unterschrift as string) ?? null,
    freigegebenAm: zeit(z.freigegeben_am),
    freigegebenVon: (z.freigegeben_von as string) || null,
    erhoehung: z.erhoehung === true,
    hasenText: String(z.hase_text ?? ""),
    zurueckgezogenAm: zeit(z.zurueckgezogen_am),
    zurueckgezogenVon: (z.zurueckgezogen_von as string) ?? null,
  };
}

/** Der Vertrag einer Person, sofern es einen gibt. */
export async function vertragVon(benutzerId: string): Promise<Arbeitsvertrag | null> {
  const z = (await db()`
    select v.id, v.benutzer_id, v.art, v.taetigkeit, v.aufgaben, v.position,
           v.beginn::text as beginn, v.ende::text as ende, v.stundenlohn_cent, v.monatsstunden,
           v.wochenstunden, v.festgehalt_cent, v.probezeit_monate, v.personalien, v.angelegt_von,
           v.angelegt_am, v.vertragstext, v.textstand, v.unterschrift, v.unterschrieben_am,
           v.arbeitgeber_unterschrift,
           v.freigegeben_am, v.freigegeben_von, v.erhoehung, v.hase_text,
           v.zurueckgezogen_am, v.zurueckgezogen_von, b.name, b.email
      from arbeitsvertrag v join benutzer b on b.id = v.benutzer_id
     where v.benutzer_id = ${benutzerId} and v.zurueckgezogen_am is null
     limit 1
  `) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

export async function vertragLesen(id: string): Promise<Arbeitsvertrag | null> {
  const z = (await db()`
    select v.id, v.benutzer_id, v.art, v.taetigkeit, v.aufgaben, v.position,
           v.beginn::text as beginn, v.ende::text as ende, v.stundenlohn_cent, v.monatsstunden,
           v.wochenstunden, v.festgehalt_cent, v.probezeit_monate, v.personalien, v.angelegt_von,
           v.angelegt_am, v.vertragstext, v.textstand, v.unterschrift, v.unterschrieben_am,
           v.arbeitgeber_unterschrift,
           v.freigegeben_am, v.freigegeben_von, v.erhoehung, v.hase_text,
           v.zurueckgezogen_am, v.zurueckgezogen_von, b.name, b.email
      from arbeitsvertrag v join benutzer b on b.id = v.benutzer_id
     where v.id = ${id}::uuid
  `) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/** Alle gültigen Verträge, neueste zuerst. */
export async function vertraege(): Promise<Arbeitsvertrag[]> {
  const z = (await db()`
    select v.id, v.benutzer_id, v.art, v.taetigkeit, v.aufgaben, v.position,
           v.beginn::text as beginn, v.ende::text as ende, v.stundenlohn_cent, v.monatsstunden,
           v.wochenstunden, v.festgehalt_cent, v.probezeit_monate, v.personalien, v.angelegt_von,
           v.angelegt_am, v.vertragstext, v.textstand, v.unterschrift, v.unterschrieben_am,
           v.arbeitgeber_unterschrift,
           v.freigegeben_am, v.freigegeben_von, v.erhoehung, v.hase_text,
           v.zurueckgezogen_am, v.zurueckgezogen_von, b.name, b.email
      from arbeitsvertrag v join benutzer b on b.id = v.benutzer_id
     where v.zurueckgezogen_am is null
     order by v.unterschrieben_am nulls first, b.name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/**
 * Wer noch keinen Vertrag hat.
 *
 * Nur eigene, interne Leute: Die Gastronomie und der Food-Kiosk gehören
 * zu anderen Betrieben, Externe schreiben Rechnungen. Wer schon einen
 * gültigen Vertrag hat, steht nicht mehr in der Liste, damit niemand aus
 * Versehen einen zweiten anlegt (Florian, 30.09.2026).
 */
export async function ohneVertrag(): Promise<Array<{ id: string; name: string; email: string; bogenAm: string | null }>> {
  const z = (await db()`
    select b.id, b.name, b.email, b.personalbogen_am
      from benutzer b
     where b.aktiv
       and coalesce(b.art, 'intern') = 'intern'
       and b.rolle not in ('gastro', 'kiosk', 'agentur')
       and not exists (
         select 1 from arbeitsvertrag v
          where v.benutzer_id = b.id and v.zurueckgezogen_am is null
       )
     order by b.name
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    bogenAm: r.personalbogen_am ? new Date(r.personalbogen_am as string).toISOString() : null,
  }));
}

export interface NeuerVertrag {
  benutzerId: string;
  art: Vertragsart;
  taetigkeit: string;
  aufgaben: string;
  position: string;
  beginn: string;
  ende: string;
  stundenlohnCent?: number | null;
  monatsstunden?: number | null;
  wochenstunden?: number | null;
  festgehaltCent?: number | null;
  probezeitMonate?: number | null;
  personalien: Record<string, string>;
  angelegtVon: string;
  /** Eigener Satz fuer den Hasen. Leer heisst: der Standardsatz. */
  hasenText?: string;
}

export async function vertragAnlegen(o: NeuerVertrag): Promise<string> {
  /*
    Verdient die Person jetzt mehr als vorher?

    Verglichen wird mit dem zuletzt angelegten Vertrag derselben Person,
    auch wenn er zurueckgezogen wurde. Das muss beim Anlegen passieren:
    Spaeter liesse es sich nicht mehr sauber sagen (Florian, 01.10.2026).
  */
  const vorher = (await db()`
    select stundenlohn_cent, festgehalt_cent from arbeitsvertrag
     where benutzer_id = ${o.benutzerId}::uuid
     order by angelegt_am desc limit 1
  `.catch(() => [])) as Array<Record<string, unknown>>;

  const alterSatz = vorher[0]
    ? Number(vorher[0].stundenlohn_cent ?? vorher[0].festgehalt_cent ?? 0)
    : 0;
  const neuerSatz = o.stundenlohnCent ?? o.festgehaltCent ?? 0;
  const erhoehung = alterSatz > 0 && neuerSatz > alterSatz;

  const z = (await db()`
    insert into arbeitsvertrag (benutzer_id, art, taetigkeit, aufgaben, position, beginn, ende,
                                stundenlohn_cent, monatsstunden, wochenstunden, festgehalt_cent,
                                probezeit_monate, personalien, angelegt_von, erhoehung, hase_text)
    values (${o.benutzerId}::uuid, ${o.art}, ${o.taetigkeit}, ${o.aufgaben}, ${o.position},
            ${o.beginn}::date, ${o.ende}::date, ${o.stundenlohnCent ?? null}, ${o.monatsstunden ?? null},
            ${o.wochenstunden ?? null}, ${o.festgehaltCent ?? null}, ${o.probezeitMonate ?? null},
            ${JSON.stringify(o.personalien)}::jsonb, ${o.angelegtVon}, ${erhoehung},
            ${(o.hasenText ?? "").slice(0, 300)})
    returning id
  `) as Array<{ id: string }>;
  return String(z[0].id);
}

/**
 * Unterschreiben.
 *
 * Gespeichert wird der Text, der gerade auf dem Bildschirm stand, und
 * sein Fingerabdruck. Damit lässt sich später beantworten, was
 * unterschrieben wurde, ohne sich auf die heutige Vorlage verlassen zu
 * müssen.
 */
export async function vertragUnterschreiben(o: {
  id: string;
  benutzerId: string;
  bild: string;
  art: Vertragsart;
  luecken: Luecken;
  /** Die hinterlegte Unterschrift des Arbeitgebers. */
  arbeitgeber?: string | null;
  ip: string;
  geraet: string;
}): Promise<boolean> {
  const text = ganzerVertragstext(o.art, o.luecken);
  const stand = createHash("sha256").update(text).digest("hex").slice(0, 16);

  /*
    Die Unterschrift des Arbeitgebers kommt in derselben Sekunde dazu.

    Vorher steht sie nirgends am Vertrag, auch nicht unsichtbar im
    Quelltext der Seite. So kann niemand ein Blatt bekommen, auf dem nur
    der Chef unterschrieben hat (Florian, 01.10.2026). Gespeichert wird
    sie am Vertrag: Aendert sich spaeter die hinterlegte Unterschrift,
    bleibt auf diesem Vertrag die von heute.
  */
  const z = (await db()`
    update arbeitsvertrag
       set unterschrieben_am = now(),
           unterschrift = ${o.bild},
           arbeitgeber_unterschrift = ${o.arbeitgeber ?? null},
           unterschrift_ip = ${o.ip},
           unterschrift_geraet = ${o.geraet},
           vertragstext = ${text},
           textstand = ${stand}
     where id = ${o.id}::uuid
       and benutzer_id = ${o.benutzerId}::uuid
       and unterschrieben_am is null
       and zurueckgezogen_am is null
     returning id
  `) as Array<{ id: string }>;
  return z.length > 0;
}

/**
 * Den Vertrag zur Unterschrift freigeben.
 *
 * Bis dahin ist er ein Entwurf, den nur das Büro sieht. Erst mit der
 * Freigabe erscheint er beim Mitarbeiter (Florian, 30.09.2026).
 */
export async function vertragFreigeben(id: string, wer: string): Promise<void> {
  await db()`
    update arbeitsvertrag
       set freigegeben_am = now(), freigegeben_von = ${wer}
     where id = ${id}::uuid and freigegeben_am is null and zurueckgezogen_am is null
  `;
}

/** Doch noch etwas ändern: die Freigabe zurücknehmen. */
export async function freigabeZurueck(id: string): Promise<void> {
  await db()`
    update arbeitsvertrag
       set freigegeben_am = null, freigegeben_von = ''
     where id = ${id}::uuid and unterschrieben_am is null
  `;
}

/** Wurde die Ausfertigung heruntergeladen? Jeder Abruf zählt. */
export async function downloadMerken(o: {
  vertragId: string;
  wer: string;
  eigener: boolean;
  ip: string;
  geraet: string;
}): Promise<void> {
  await db()`
    insert into vertrag_download (vertrag_id, wer, eigener, ip, geraet)
    values (${o.vertragId}::uuid, ${o.wer}, ${o.eigener}, ${o.ip}, ${o.geraet})
  `.catch((f) => console.warn("[vertrag] Download nicht vermerkt:", f));
}

export async function downloads(vertragId: string): Promise<Array<{ wer: string; eigener: boolean; wann: string }>> {
  const z = (await db()`
    select wer, eigener, wann from vertrag_download
     where vertrag_id = ${vertragId}::uuid order by wann desc limit 20
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    wer: String(r.wer ?? ""),
    eigener: Boolean(r.eigener),
    wann: new Date(r.wann as string).toISOString(),
  }));
}

/** Ein Vertrag war ein Versehen: zurückziehen, nicht löschen. */
export async function vertragZurueckziehen(id: string, wer: string): Promise<void> {
  await db()`
    update arbeitsvertrag
       set zurueckgezogen_am = now(), zurueckgezogen_von = ${wer}
     where id = ${id}::uuid
  `;
}

/**
 * Was die Leute verdienen, zum Nachschlagen.
 *
 * Nur fuer die Stundenmeldung und nur fuer Werner, Kevin und Florian: Der
 * Mitarbeiter sieht seinen Lohn in seinem Vertrag, aber niemand sieht den
 * der anderen (Florian, 01.10.2026).
 *
 * Genommen wird der gueltige Vertrag, auch der noch nicht unterschriebene:
 * Wer ab dem Ersten mehr bekommt, soll in der Meldung fuer diesen Monat
 * schon mit dem neuen Satz auftauchen.
 */
export async function loehne(): Promise<
  Map<string, { art: Vertragsart; stundenlohnCent: number | null; festgehaltCent: number | null; beginn: string }>
> {
  const z = (await db()`
    select benutzer_id, art, stundenlohn_cent, festgehalt_cent, beginn::text as beginn
      from arbeitsvertrag
     where zurueckgezogen_am is null
  `.catch(() => [])) as Array<Record<string, unknown>>;

  const karte = new Map<
    string,
    { art: Vertragsart; stundenlohnCent: number | null; festgehaltCent: number | null; beginn: string }
  >();
  for (const r of z) {
    karte.set(String(r.benutzer_id), {
      art: (r.art as Vertragsart) ?? "kurzfristig",
      stundenlohnCent: r.stundenlohn_cent === null ? null : Number(r.stundenlohn_cent),
      festgehaltCent: r.festgehalt_cent === null ? null : Number(r.festgehalt_cent),
      beginn: String(r.beginn),
    });
  }
  return karte;
}

/** Wie viele Verträge warten noch auf eine Unterschrift? */
export async function offeneVertraege(): Promise<number> {
  const z = (await db()`
    select count(*)::int as n from arbeitsvertrag
     where unterschrieben_am is null and zurueckgezogen_am is null and freigegeben_am is not null
  `.catch(() => [{ n: 0 }])) as Array<{ n: number }>;
  return Number(z[0]?.n ?? 0);
}
