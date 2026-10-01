/**
 * Show-Absage: eine Vorstellung fällt aus, die Gäste bekommen einen
 * Ausweichtermin angeboten. Siehe migrations/091_show_absage.sql.
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";

export interface ShowAbsage {
  id: string;
  ditixEventId: string;
  datum: string;
  uhrzeit: string;
  show: string;
  grund: string;
  abgesagtVon: string;
  abgesagtAm: string;
}

export interface AbsageGast {
  id: string;
  absageId: string;
  buchungId: string | null;
  name: string;
  email: string;
  plaetze: number;
  alteKategorie: string;
  kompensationArt: "upgrade" | "glas";
  neueKategorie: string | null;
  zugangToken: string;
  entwurfBetreff: string;
  entwurfText: string;
  versendetAm: string | null;
  gewaehlterTerminId: string | null;
  gewaehlterTerminName: string | null;
  gewaehltAm: string | null;
  umgebuchtVon: string | null;
  umgebuchtAm: string | null;
  /** Der Gast bittet um einen Rückruf statt selbst zu wählen. */
  rueckrufNummer: string;
  rueckrufNotiz: string;
  rueckrufAm: string | null;
  rueckrufErledigtVon: string | null;
  rueckrufErledigtAm: string | null;
}

function baueAbsage(r: Record<string, unknown>): ShowAbsage {
  return {
    id: String(r.id),
    ditixEventId: String(r.ditix_event_id),
    datum: String(r.datum_text ?? r.datum),
    uhrzeit: String(r.uhrzeit),
    show: String(r.show),
    grund: String(r.grund),
    abgesagtVon: String(r.abgesagt_von),
    abgesagtAm: new Date(r.abgesagt_am as string).toISOString(),
  };
}

function baueGast(r: Record<string, unknown>): AbsageGast {
  return {
    id: String(r.id),
    absageId: String(r.absage_id),
    buchungId: (r.buchung_id as string) ?? null,
    name: String(r.name),
    email: String(r.email),
    plaetze: Number(r.plaetze ?? 1),
    alteKategorie: String(r.alte_kategorie),
    kompensationArt: r.kompensation_art as "upgrade" | "glas",
    neueKategorie: (r.neue_kategorie as string) ?? null,
    zugangToken: String(r.zugang_token),
    entwurfBetreff: String(r.entwurf_betreff),
    entwurfText: String(r.entwurf_text),
    versendetAm: r.versendet_am ? new Date(r.versendet_am as string).toISOString() : null,
    gewaehlterTerminId: (r.gewaehlter_termin_id as string) ?? null,
    gewaehlterTerminName: (r.gewaehlter_termin_name as string) ?? null,
    gewaehltAm: r.gewaehlt_am ? new Date(r.gewaehlt_am as string).toISOString() : null,
    umgebuchtVon: (r.umgebucht_von as string) ?? null,
    umgebuchtAm: r.umgebucht_am ? new Date(r.umgebucht_am as string).toISOString() : null,
    rueckrufNummer: String(r.rueckruf_nummer ?? ""),
    rueckrufNotiz: String(r.rueckruf_notiz ?? ""),
    rueckrufAm: r.rueckruf_am ? new Date(r.rueckruf_am as string).toISOString() : null,
    rueckrufErledigtVon: (r.rueckruf_erledigt_von as string) ?? null,
    rueckrufErledigtAm: r.rueckruf_erledigt_am ? new Date(r.rueckruf_erledigt_am as string).toISOString() : null,
  };
}

export async function absageAnlegen(o: {
  ditixEventId: string;
  datum: string;
  uhrzeit: string;
  show: string;
  grund: string;
  von: string;
}): Promise<ShowAbsage> {
  const z = (await db()`
    insert into show_absage (ditix_event_id, datum, uhrzeit, show, grund, abgesagt_von)
    values (${o.ditixEventId}, ${o.datum}::date, ${o.uhrzeit}, ${o.show}, ${o.grund}, ${o.von})
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return baueAbsage(z[0]);
}

export async function absageLesen(id: string): Promise<ShowAbsage | null> {
  const z = (await db()`select *, datum::text as datum_text from show_absage where id = ${id}`) as Array<
    Record<string, unknown>
  >;
  return z[0] ? baueAbsage(z[0]) : null;
}

export async function absagenListe(): Promise<ShowAbsage[]> {
  const z = (await db()`
    select *, datum::text as datum_text from show_absage order by abgesagt_am desc
  `) as Array<Record<string, unknown>>;
  return z.map(baueAbsage);
}

export async function gastAnlegen(o: {
  absageId: string;
  buchungId: string | null;
  name: string;
  email: string;
  plaetze: number;
  alteKategorie: string;
  kompensationArt: "upgrade" | "glas";
  neueKategorie: string | null;
  entwurfBetreff: string;
  entwurfText: string;
}): Promise<AbsageGast> {
  const token = randomBytes(16).toString("hex");
  const z = (await db()`
    insert into absage_gast
      (absage_id, buchung_id, name, email, plaetze, alte_kategorie, kompensation_art,
       neue_kategorie, zugang_token, entwurf_betreff, entwurf_text)
    values
      (${o.absageId}, ${o.buchungId}, ${o.name}, ${o.email}, ${o.plaetze}, ${o.alteKategorie},
       ${o.kompensationArt}, ${o.neueKategorie}, ${token}, ${o.entwurfBetreff}, ${o.entwurfText})
    returning *
  `) as Array<Record<string, unknown>>;
  return baueGast(z[0]);
}

export async function gaesteFuerAbsage(absageId: string): Promise<AbsageGast[]> {
  const z = (await db()`
    select * from absage_gast where absage_id = ${absageId} order by erstellt_am
  `) as Array<Record<string, unknown>>;
  return z.map(baueGast);
}

export async function gastLesen(id: string): Promise<AbsageGast | null> {
  const z = (await db()`select * from absage_gast where id = ${id}`) as Array<Record<string, unknown>>;
  return z[0] ? baueGast(z[0]) : null;
}

export async function gastPerToken(token: string): Promise<AbsageGast | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const z = (await db()`select * from absage_gast where zugang_token = ${token}`) as Array<Record<string, unknown>>;
  return z[0] ? baueGast(z[0]) : null;
}

export async function entwurfSpeichern(id: string, betreff: string, text: string): Promise<void> {
  await db()`update absage_gast set entwurf_betreff = ${betreff}, entwurf_text = ${text} where id = ${id}`;
}

export async function alsVersendetMarkieren(id: string): Promise<void> {
  await db()`update absage_gast set versendet_am = now() where id = ${id}`;
}

export async function alternativeWaehlen(token: string, terminId: string, terminName: string): Promise<AbsageGast | null> {
  const z = (await db()`
    update absage_gast
       set gewaehlter_termin_id = ${terminId}, gewaehlter_termin_name = ${terminName}, gewaehlt_am = now()
     where zugang_token = ${token} and gewaehlt_am is null
    returning *
  `) as Array<Record<string, unknown>>;
  return z[0] ? baueGast(z[0]) : null;
}

/**
 * Der Gast bittet um einen Rückruf.
 *
 * Eine zweite Bitte überschreibt die erste: Wer noch einmal schreibt, hat
 * meist eine neue Nummer oder einen Nachtrag, und zwei offene Zettel zur
 * selben Person helfen niemandem (Florian, 01.10.2026).
 */
export async function rueckrufBitten(
  token: string,
  nummer: string,
  notiz: string,
): Promise<AbsageGast | null> {
  const z = (await db()`
    update absage_gast
       set rueckruf_nummer = ${nummer}, rueckruf_notiz = ${notiz}, rueckruf_am = now(),
           rueckruf_erledigt_von = null, rueckruf_erledigt_am = null
     where zugang_token = ${token}
    returning *
  `) as Array<Record<string, unknown>>;
  return z[0] ? baueGast(z[0]) : null;
}

/** Jemand hat zurückgerufen. */
export async function rueckrufErledigt(id: string, von: string): Promise<void> {
  await db()`
    update absage_gast set rueckruf_erledigt_von = ${von}, rueckruf_erledigt_am = now() where id = ${id}
  `;
}

export async function umgebuchtMarkieren(id: string, von: string): Promise<void> {
  await db()`update absage_gast set umgebucht_von = ${von}, umgebucht_am = now() where id = ${id}`;
}

/** Für die Vorfreude-Mail: welche Ditix-Termine sind abgesagt, überspringen. */
export async function abgesagteEventIds(): Promise<Set<string>> {
  const z = (await db()`select ditix_event_id from show_absage`) as Array<{ ditix_event_id: string }>;
  return new Set(z.map((r) => r.ditix_event_id));
}

/** Wer die Ditix-Umbuchung von Hand erledigt: Florian und Kevin. */
export async function absageZuInformieren(): Promise<Array<{ name: string; email: string }>> {
  return (await db()`
    select name, email from benutzer
     where aktiv and (rolle = 'chef' or lower(email) = 'kevin.steele@florianzimmer.com')
  `) as Array<{ name: string; email: string }>;
}
