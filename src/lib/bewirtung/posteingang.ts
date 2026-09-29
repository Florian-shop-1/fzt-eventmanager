/**
 * Rechnungen aus dem Postfach holen.
 *
 * In rechnung@florianzimmer.com laufen die Rechnungen ohnehin ein: Meta,
 * Google, Amazon, Lieferanten. Bisher hat jemand sie von dort geholt und
 * wieder ins Programm geladen. Das macht jetzt das Programm selbst
 * (Florian, 29.09.2026).
 *
 * Gelesen wird nur. Es wird nichts beantwortet, nichts weitergeleitet,
 * nichts geloescht und nichts verschoben. Wer in dem Postfach arbeitet,
 * merkt vom Programm nichts.
 *
 * Was hereinkommt, wird zum Entwurf, nicht zum fertigen Beleg: Zweck und
 * Firma setzt weiterhin ein Mensch. Das Programm nimmt das Abtippen ab,
 * nicht die Entscheidung.
 */

import { db } from "@/lib/db/client";
import { GRAPH_BASIS, graphToken } from "@/lib/mail/versand";
import { entwurfAnlegen } from "./db";
import { belegLesen, leserEingerichtet } from "./lesen";
import type { Gesellschaft } from "./gesellschaft";

/** Das Postfach, in dem die Rechnungen einlaufen. */
export const RECHNUNGSPOSTFACH = process.env.RECHNUNGS_POSTFACH ?? "rechnung@florianzimmer.com";

/** Anhaenge, aus denen ein Beleg werden kann. */
const TAUGLICH = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/** Groesser als das nimmt weder die Datenbank noch die Lesehilfe gern. */
const GROESSTE_DATEI = 12 * 1024 * 1024;

export interface Postlauf {
  gesehen: number;
  neu: number;
  ohneAnhang: number;
  fehler: number;
  meldungen: string[];
}

interface GraphNachricht {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string; name?: string } };
}

interface GraphAnhang {
  "@odata.type": string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
  isInline?: boolean;
}

async function graph<T>(pfad: string): Promise<T> {
  const zugang = await graphToken();
  const antwort = await fetch(`${GRAPH_BASIS}${pfad}`, {
    headers: { Authorization: `Bearer ${zugang}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    /*
      Die haeufigsten Faelle beim Namen nennen.

      Ohne die Berechtigung Mail.Read antwortet Microsoft mit 403 und
      einem Satz, aus dem niemand schliesst, dass in Azure ein Haken
      fehlt.
    */
    if (antwort.status === 403) {
      throw new Error(
        `Der Eventmanager darf das Postfach ${RECHNUNGSPOSTFACH} nicht lesen. ` +
          "In Azure fehlt die Berechtigung Mail.Read fuer diese Anwendung, " +
          "oder die Zustimmung des Administrators dazu.",
      );
    }
    if (antwort.status === 404) {
      throw new Error(`Das Postfach ${RECHNUNGSPOSTFACH} gibt es nicht oder es ist kein Postfach.`);
    }
    throw new Error(`Microsoft hat abgelehnt (${antwort.status}): ${text.slice(0, 200)}`);
  }

  return (await antwort.json()) as T;
}

/** Welche Mails haben wir schon geholt? */
async function schonGeholt(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const z = (await db()`
    select nachricht_id from rechnungspost where nachricht_id = any(${ids}::text[])
  `) as Array<{ nachricht_id: string }>;
  return new Set(z.map((r) => r.nachricht_id));
}

async function vermerken(o: {
  id: string;
  von: string;
  betreff: string;
  empfangen: string | null;
  stand: string;
  notiz?: string;
  belegId?: string | null;
}): Promise<void> {
  await db()`
    insert into rechnungspost (nachricht_id, von, betreff, empfangen_am, stand, notiz, beleg_id)
    values (${o.id}, ${o.von}, ${o.betreff}, ${o.empfangen}::timestamptz, ${o.stand},
            ${o.notiz ?? ""}, ${o.belegId ?? null}::uuid)
    on conflict (nachricht_id) do update set stand = excluded.stand, notiz = excluded.notiz,
                                             beleg_id = excluded.beleg_id
  `;
}

/**
 * Den Posteingang durchsehen und neue Rechnungen als Entwurf anlegen.
 *
 * `tage` begrenzt, wie weit zurueck gesehen wird. Beim ersten Lauf darf
 * das mehr sein, danach reicht eine Woche: Was einmal geholt ist, steht
 * in rechnungspost und wird nicht wieder angefasst.
 */
export async function postAbholen(o: {
  tage?: number;
  hoechstens?: number;
  gesellschaft?: Gesellschaft;
  wer?: string;
} = {}): Promise<Postlauf> {
  const lauf: Postlauf = { gesehen: 0, neu: 0, ohneAnhang: 0, fehler: 0, meldungen: [] };

  if (!leserEingerichtet()) {
    lauf.meldungen.push("Die Belegerkennung ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt).");
    return lauf;
  }

  const seit = new Date(Date.now() - (o.tage ?? 14) * 86400_000).toISOString();
  const hoechstens = Math.min(50, o.hoechstens ?? 25);

  const liste = await graph<{ value: GraphNachricht[] }>(
    `/users/${encodeURIComponent(RECHNUNGSPOSTFACH)}/messages` +
      `?$filter=hasAttachments eq true and receivedDateTime ge ${seit}` +
      `&$select=id,subject,receivedDateTime,from,hasAttachments` +
      `&$orderby=receivedDateTime desc&$top=${hoechstens}`,
  );

  const nachrichten = liste.value ?? [];
  lauf.gesehen = nachrichten.length;
  const bekannt = await schonGeholt(nachrichten.map((n) => n.id));

  for (const n of nachrichten) {
    if (bekannt.has(n.id)) continue;

    const von = n.from?.emailAddress?.address ?? "";
    const betreff = (n.subject ?? "").slice(0, 300);
    const empfangen = n.receivedDateTime ?? null;

    try {
      const anhaenge = await graph<{ value: GraphAnhang[] }>(
        `/users/${encodeURIComponent(RECHNUNGSPOSTFACH)}/messages/${n.id}/attachments`,
      );

      /*
        Nur echte Dateianhaenge, keine eingebetteten Bilder.

        Eine Rechnungsmail traegt fast immer ein Logo im Text. Das ist
        ein Anhang wie jeder andere, nur eben keine Rechnung.
      */
      const brauchbar = (anhaenge.value ?? []).filter(
        (a) =>
          a["@odata.type"] === "#microsoft.graph.fileAttachment" &&
          !a.isInline &&
          TAUGLICH.includes((a.contentType ?? "").toLowerCase()) &&
          (a.size ?? 0) <= GROESSTE_DATEI,
      );

      if (brauchbar.length === 0) {
        lauf.ohneAnhang++;
        await vermerken({
          id: n.id, von, betreff, empfangen,
          stand: "kein_anhang",
          notiz: "Keine Rechnung als PDF oder Bild dabei.",
        });
        continue;
      }

      let letzterBeleg: string | null = null;
      for (const a of brauchbar) {
        if (!a.contentBytes) continue;
        const typ = (a.contentType ?? "application/pdf").toLowerCase();

        const lesung = await belegLesen(a.contentBytes, typ).catch(() => null);
        const { id, doppelt } = await entwurfAnlegen(
          a.contentBytes,
          typ,
          lesung,
          o.wer ?? "Posteingang",
          o.gesellschaft ?? "fzt",
        );
        letzterBeleg = id;
        if (!doppelt) lauf.neu++;

        // Woher der Beleg stammt, bleibt am Beleg stehen: Bei einer
        // Rueckfrage findet man so die Mail wieder.
        await db()`
          update bewirtung set herkunft = 'mail', mail_von = ${von}, mail_betreff = ${betreff}
           where id = ${id}::uuid
        `;
      }

      await vermerken({ id: n.id, von, betreff, empfangen, stand: "angelegt", belegId: letzterBeleg });
    } catch (f) {
      lauf.fehler++;
      const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
      lauf.meldungen.push(`${betreff.slice(0, 60)}: ${meldung}`);
      await vermerken({ id: n.id, von, betreff, empfangen, stand: "fehler", notiz: meldung.slice(0, 300) });
      // Eine kaputte Mail darf den Lauf nicht beenden, die naechste kann
      // in Ordnung sein.
    }
  }

  return lauf;
}

export interface Posteintrag {
  nachrichtId: string;
  von: string;
  betreff: string;
  empfangenAm: string | null;
  stand: string;
  notiz: string;
  belegId: string | null;
}

export async function letztePost(anzahl = 20): Promise<Posteintrag[]> {
  const z = (await db()`
    select nachricht_id, von, betreff, empfangen_am, stand, notiz, beleg_id
      from rechnungspost order by coalesce(empfangen_am, geholt_am) desc limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    nachrichtId: String(r.nachricht_id),
    von: String(r.von ?? ""),
    betreff: String(r.betreff ?? ""),
    empfangenAm: r.empfangen_am ? new Date(r.empfangen_am as string).toISOString() : null,
    stand: String(r.stand ?? ""),
    notiz: String(r.notiz ?? ""),
    belegId: r.beleg_id ? String(r.beleg_id) : null,
  }));
}
