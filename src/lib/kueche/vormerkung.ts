/**
 * Menüs, die für Firmen vorgemerkt sind.
 *
 * "wir möchten wenn wir angebote an firmen senden gerne schon menüs
 * vormerken/reservieren ... flotix darf dann nur noch weniger menüs
 * öffentlich im shop verkaufen und muss dann die warteliste anzeigen"
 * (Florian, 25.10.2026).
 *
 * Die Küche kocht an einem Tag höchstens 90 Menüs. Bisher zählte FloTix
 * nur das, was durch den Shop gelaufen ist. Ein Firmenevent mit sechzig
 * Essen war darin unsichtbar, und der Shop hätte an demselben Tag
 * fröhlich weitere neunzig verkauft.
 *
 * Gezählt wird ab dem Augenblick, in dem ein Angebot steht. Eine bloße
 * Anfrage reserviert nichts: Sonst sperrt ein Telefonat, aus dem nie
 * etwas wird, der Küche einen ganzen Samstag. Die Anfragen stehen
 * trotzdem in der Auskunft, als Zahl zum Danebenhalten.
 *
 * Gemeldet wird je Tag und immer der ganze Tag. FloTix weiß von Angeboten
 * nichts und soll nichts davon wissen müssen: Was hier steht, gilt. Ein
 * zurückgezogenes Angebot verschwindet damit von selbst.
 */

import { db } from "@/lib/db/client";
import { flotixQuelle, flotixVormerkungen, flotixVormerkungMelden } from "@/lib/flotix/tuer";

/** Ab diesen Ständen ist ein Angebot draußen und das Essen gehört reserviert. */
const ZAEHLT = [
  "angebot_erstellt",
  "angebot_versendet",
  "angebot_geoeffnet",
  "angenommen",
  "teilzahlung",
  "bezahlt",
];

/** Noch kein Angebot: zählt nicht gegen die Grenze, ist aber gut zu wissen. */
const NOCH_OFFEN = ["anfrage", "in_klaerung"];

export interface Vormerkposten {
  firma: string;
  personen: number;
  menues: number;
  status: string;
  vorgang: string;
}

export interface Vormerktag {
  tag: string;
  /** Menüs aus Angeboten. Diese Zahl geht an FloTix. */
  menues: number;
  /** Menüs aus Anfragen, die noch kein Angebot sind. Nur zur Information. */
  angefragt: number;
  posten: Vormerkposten[];
}

/**
 * Was an welchem Tag vorgemerkt ist, ab heute.
 *
 * Ein Vorgang kann mehrere Gruppen haben, und jede Gruppe wählt ihre
 * Menüs selbst. Gezählt wird die Summe über alle Varianten, denn für die
 * Küche ist ein Veggy genauso ein Essen wie ein Classic.
 */
export async function vorgemerkteMenues(abDatum?: string): Promise<Vormerktag[]> {
  const ab = abDatum ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  const zeilen = (await db()`
    select v.datum::text as tag,
           vg.id::text   as vorgang,
           vg.nummer,
           vg.status,
           coalesce(k.name, 'Firma') as firma,
           coalesce(sum(g.personen), 0)::int  as personen,
           coalesce(sum((
             select coalesce(sum((wert)::int), 0)
               from jsonb_each_text(g.menues) as m(schluessel, wert)
           )), 0)::int as menues,
           coalesce(max(ang.menues), 0)::int as menues_angebot,
           coalesce(max(tisch.plaetze), 0)::int as plaetze_am_tisch
      from vorgang vg
      join vorstellung v on v.id = vg.vorstellung_id
      left join kunde k on k.id = vg.kunde_id
      left join gruppe g on g.vorgang_id = vg.id
      /*
        Was im juengsten Angebot an Menues steht.

        Die Menuewahl je Gast traegt das Buero erst kurz vor dem Abend
        ein, das Angebot steht Wochen vorher. Ohne diesen Weg bleibt die
        Kueche bis zuletzt blind, und der Shop verkauft denselben Abend
        weiter voll (Florian, 28.10.2026: "dort sollten doch die tickets
        und menues vorgemerkt werden").

        Abgelehnte Angebote zaehlen nicht, optionale Zeilen und
        Alternativen auch nicht: Der Kunde hat sie nicht bestellt.
      */
      left join lateral (
        select a.id from angebot a
         where a.vorgang_id = vg.id and a.abgelehnt_am is null
         order by a.erstellt_am desc limit 1
      ) neuestes on true
      left join lateral (
        select coalesce(sum(p.menge), 0)::int as menues
          from position p
         where p.angebot_id = neuestes.id
           and p.artikel_nummer in ('4GANG', '4GANGLOGE')
           and coalesce(p.optional, false) = false
           and p.ist_alternative_zu is null
      ) ang on true
      /*
        Was am Tisch blockiert ist.

        "auch wenn nicht feststeht wieviele menues das sind" (Florian,
        28.10.2026): Wer vierzig Plaetze in der Loge oder auf der
        Eventgalerie blockiert, braucht vierzig Essen, auch wenn noch
        niemand weiss, wer Classic und wer Veggy nimmt.
      */
      left join lateral (
        select coalesce(sum(e.plaetze), 0)::int as plaetze
          from essplatz_sperre e
         where e.vorgang_id = vg.id and e.bis > now()
      ) tisch on true
     where v.datum >= ${ab}::date
       and vg.status = any(${[...ZAEHLT, ...NOCH_OFFEN]})
     group by v.datum, vg.id, vg.nummer, vg.status, k.name
     order by v.datum
  `) as Array<Record<string, unknown>>;

  const nachTag = new Map<string, Vormerktag>();
  for (const z of zeilen) {
    /*
      Die erfasste Menuewahl geht vor, das Angebot springt ein.

      Steht die Wahl schon je Gast, ist sie genauer: Dort stecken auch
      Nachmeldungen und Absagen drin. Steht sie noch nicht, gilt das
      Angebot, und wenn auch das nichts hergibt, die am Tisch
      blockierten Plaetze. Erst wenn alle drei leer sind, ist an dem
      Abend wirklich kein Essen vorgesehen, zum Beispiel bei einer
      Buchung nur fuer die Show.
    */
    const ausWahl = Number(z.menues ?? 0);
    const ausAngebot = Number(z.menues_angebot ?? 0);
    const amTisch = Number(z.plaetze_am_tisch ?? 0);
    const menues = ausWahl > 0 ? ausWahl : ausAngebot > 0 ? ausAngebot : amTisch;
    if (menues <= 0) continue;

    const tag = String(z.tag);
    const eintrag = nachTag.get(tag) ?? { tag, menues: 0, angefragt: 0, posten: [] };
    const status = String(z.status);

    if (ZAEHLT.includes(status)) {
      eintrag.menues += menues;
      eintrag.posten.push({
        firma: String(z.firma ?? "Firma"),
        personen: Number(z.personen ?? 0),
        menues,
        status,
        vorgang: String(z.nummer ?? z.vorgang),
      });
    } else {
      eintrag.angefragt += menues;
    }

    nachTag.set(tag, eintrag);
  }

  return [...nachTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Einen einzelnen Tag an FloTix melden.
 *
 * Auch dann, wenn nichts mehr vorgemerkt ist: Dann ist die Null die
 * Nachricht, und FloTix gibt die Plätze wieder frei.
 */
export async function tagMelden(tag: string): Promise<number> {
  if (!flotixQuelle()) return 0;
  const alle = await vorgemerkteMenues(tag);
  const eintrag = alle.find((t) => t.tag === tag);
  await flotixVormerkungMelden({
    tag,
    anzahl: eintrag?.menues ?? 0,
    posten: eintrag?.posten ?? [],
  });
  return eintrag?.menues ?? 0;
}

/**
 * Alle kommenden Tage melden, für den Nachtlauf.
 *
 * Der Abgleich am Tag reicht nicht: Ein Angebot kann abgelaufen sein, ein
 * Vorgang in einer anderen Ecke des Programms geändert worden. Einmal in
 * der Nacht steht alles wieder richtig, ohne dass jemand daran denkt.
 *
 * Gemeldet werden auch die Tage, an denen nichts mehr vorgemerkt ist,
 * solange FloTix dort noch eine Zahl führt: Sonst bliebe eine alte
 * Reservierung ewig stehen und nähme dem Shop Plätze weg.
 */
export async function alleTageMelden(): Promise<{ tage: number; menues: number }> {
  if (!flotixQuelle()) return { tage: 0, menues: 0 };

  const eigene = await vorgemerkteMenues();
  const beiFloTix = await flotixVormerkungen().catch(() => []);

  const tage = new Set<string>([...eigene.map((e) => e.tag), ...beiFloTix.map((v) => v.tag)]);
  let menues = 0;

  for (const tag of [...tage].sort()) {
    const eintrag = eigene.find((e) => e.tag === tag);
    const dort = beiFloTix.find((v) => v.tag === tag);
    const soll = eintrag?.menues ?? 0;
    // Nichts schreiben, was schon stimmt: Das spart Lärm im Protokoll.
    if ((dort?.anzahl ?? 0) === soll) {
      menues += soll;
      continue;
    }
    await flotixVormerkungMelden({ tag, anzahl: soll, posten: eintrag?.posten ?? [] });
    menues += soll;
  }

  return { tage: tage.size, menues };
}


/**
 * Nach einer Änderung an einem Vorgang: den betroffenen Tag neu melden.
 *
 * Wirft nie. Eine Vormerkung ist wichtig, aber sie darf kein Angebot
 * verhindern: Geht FloTix gerade nicht ans Telefon, zieht der Nachtlauf
 * die Zahl ein paar Stunden später nach.
 */
export async function vormerkungNachziehen(vorgangId: string): Promise<void> {
  try {
    const [z] = (await db()`
      select v.datum::text as tag from vorgang vg
        join vorstellung v on v.id = vg.vorstellung_id
       where vg.id = ${vorgangId}::uuid
    `) as Array<{ tag: string }>;
    if (!z?.tag) return;
    await tagMelden(z.tag);
  } catch (f) {
    console.warn("[vormerkung] Tag nicht gemeldet:", f);
  }
}

export interface FingerfoodPosten {
  firma: string;
  vorgangId: string;
  nummer: string;
  anzahl: number;
  status: string;
}

/**
 * Fingerfood an einem Abend, fuer das Foyer.
 *
 * "Fingerfood braucht nicht gegen menues laufen. das muss bei uns im
 * foyer serviert werden und da gibts keine begrenzung nach oben. du
 * kannst es aber gerne bei foyer / stehtischen irgendwo als info
 * unterbringen" (Florian, 28.10.2026).
 *
 * Gegen die neunzig Menues der Kueche zaehlt es deshalb bewusst nicht,
 * siehe vorgemerkteMenues. Hier geht es nur ums Bescheidwissen: Wer das
 * Foyer stellt, soll sehen, dass an diesem Abend fuer vierzig Leute
 * Etageren auf die Stehtische kommen.
 *
 * Gelesen wird aus dem juengsten nicht abgelehnten Angebot, genau wie
 * bei den Menues: Die Zahl steht dort lange bevor jemand eine
 * Essenswahl erfasst.
 */
export async function fingerfoodAmTag(datum: string): Promise<FingerfoodPosten[]> {
  const zeilen = (await db()`
    select vg.id::text as vorgang_id, vg.nummer, vg.status,
           coalesce(k.name, 'Firma') as firma,
           coalesce(ff.anzahl, 0)::int as anzahl
      from vorgang vg
      join vorstellung v on v.id = vg.vorstellung_id
      left join kunde k  on k.id = vg.kunde_id
      left join lateral (
        select a.id from angebot a
         where a.vorgang_id = vg.id and a.abgelehnt_am is null
         order by a.erstellt_am desc limit 1
      ) neuestes on true
      left join lateral (
        select coalesce(sum(p.menge), 0)::int as anzahl
          from position p
         where p.angebot_id = neuestes.id
           and p.artikel_nummer = 'FINGERFOOD'
           and coalesce(p.optional, false) = false
           and p.ist_alternative_zu is null
      ) ff on true
     where v.datum = ${datum}::date
       and vg.status = any(${ZAEHLT})
       and coalesce(ff.anzahl, 0) > 0
     order by k.name
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return zeilen.map((z) => ({
    firma: String(z.firma),
    vorgangId: String(z.vorgang_id),
    nummer: String(z.nummer),
    anzahl: Number(z.anzahl ?? 0),
    status: String(z.status),
  }));
}
