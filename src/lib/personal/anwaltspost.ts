/**
 * Post von der Arbeitsrechtlerin, automatisch in die richtige Akte.
 *
 * "bei der Seichter möchte ich keinen Zwischenschritt, einfach
 * vollautomatisch der richtigen Person zuordnen. Jede Mail nur einmal.
 * Da ist eigentlich nur wichtig das PDF, kannst du uns auch gleich
 * anzeigen beim Schriftverkehr" (Florian, 15.10.2026).
 *
 * Der Weg einer Mail:
 *   1. Aus den Postfächern von Florian und Werner werden die Mails der
 *      Kanzlei geholt. Gelesen wird nur, nichts wird verschoben.
 *   2. Dieselbe Mail liegt in beiden Postfächern. Erkannt wird sie an
 *      der Message-ID aus dem Mailkopf, die in beiden gleich ist, also
 *      wird sie nur einmal abgelegt.
 *   3. Der Anhang ist mit einem Passwort geschützt. Er wird geöffnet und
 *      ohne Passwort abgelegt: Auf die Personalakten kommen ohnehin nur
 *      Werner, Kevin und Florian.
 *   4. Wer gemeint ist, steht im Schreiben. Der Name wird mit den Leuten
 *      im Haus verglichen, auch mit den ausgeschiedenen.
 *   5. Das PDF landet als Schriftverkehr in der Akte dieser Person.
 *
 * Findet sich niemand, bleibt die Mail als "niemand erkannt" stehen und
 * erscheint oben auf der Mitarbeiterseite. Verloren geht nichts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "@cantoo/pdf-lib";
import { db } from "@/lib/db/client";
import { GRAPH_BASIS, graphToken } from "@/lib/mail/versand";
import { unterlageAblegen } from "@/lib/db/unterlagen";

/** Von wem die Post kommt. */
export const KANZLEI = (process.env.ANWALT_ABSENDER ?? "info@kanzlei-seichter.de").toLowerCase();

/** In welchen Postfächern sie liegt. */
const POSTFAECHER = (
  process.env.ANWALT_POSTFAECHER ?? "info@florianzimmer.com,w.zimmer@florianzimmer.com"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/** Das Passwort, mit dem die Kanzlei ihre PDFs schützt. */
const PASSWORT = process.env.ANWALT_PDF_PASSWORT ?? "";

const MODELL = "claude-opus-5";

export interface Postlauf {
  gesehen: number;
  abgelegt: number;
  ohneZuordnung: number;
  fehler: number;
  meldungen: string[];
}

interface GraphNachricht {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
}

interface GraphAnhang {
  "@odata.type": string;
  name?: string;
  contentType?: string;
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
    if (antwort.status === 403) {
      throw new Error(
        "Der Eventmanager darf dieses Postfach nicht lesen. In Azure fehlt die Berechtigung Mail.Read.",
      );
    }
    throw new Error(`Microsoft hat abgelehnt (${antwort.status}): ${text.slice(0, 200)}`);
  }
  return (await antwort.json()) as T;
}

/** Welche Mails sind schon abgelegt? Geprüft wird über die Message-ID. */
async function schonDa(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const z = (await db()`
    select nachricht_id from anwaltspost where nachricht_id = any(${ids}::text[])
  `.catch(() => [])) as Array<{ nachricht_id: string }>;
  return new Set(z.map((r) => r.nachricht_id));
}

/**
 * Das Passwort vom PDF nehmen.
 *
 * Kommt es ohne Schutz, bleibt es wie es ist. Klappt das Öffnen nicht,
 * wird das Original abgelegt: Lieber ein Anhang, den jemand mit dem
 * Passwort öffnet, als gar keiner.
 */
async function ohnePasswort(roh: Buffer): Promise<{ datei: Buffer; offen: boolean }> {
  try {
    const doc = await PDFDocument.load(roh, {
      password: PASSWORT,
      ignoreEncryption: false,
    } as Parameters<typeof PDFDocument.load>[1]);
    return { datei: Buffer.from(await doc.save()), offen: true };
  } catch {
    return { datei: roh, offen: false };
  }
}

/** Alle Namen im Haus, auch die ausgeschiedenen. */
async function namen(): Promise<Array<{ id: string; name: string }>> {
  const z = (await db()`
    select id, name from benutzer where not geteilt order by name
  `.catch(() => [])) as Array<{ id: string; name: string }>;
  return z.map((r) => ({ id: String(r.id), name: String(r.name) }));
}

/**
 * Um wen geht es in diesem Schreiben?
 *
 * Gefragt wird das Modell, das auch die Belege liest, und zwar mit der
 * Liste der Leute im Haus: So kommt entweder ein Name aus dieser Liste
 * zurück oder gar keiner. Raten soll es nicht.
 */
async function wemGehoertDas(o: {
  pdfBase64: string;
  betreff: string;
  vorschau: string;
  leute: Array<{ id: string; name: string }>;
}): Promise<{ id: string | null; begruendung: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { id: null, begruendung: "Der Schlüssel für das Lesen fehlt." };
  }

  const liste = o.leute.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
  const antwort = await new Anthropic().messages.create({
    model: MODELL,
    max_tokens: 400,
    system:
      "Du ordnest Schreiben einer Arbeitsrechtskanzlei den Mitarbeitern des Florian Zimmer "
      + "Theaters zu. Antworte nur mit JSON: {\"nummer\": <Nummer aus der Liste oder null>, "
      + "\"begruendung\": \"<ein kurzer Satz>\"}. Nimm nur eine Nummer, wenn der Name der Person "
      + "im Schreiben steht oder eindeutig gemeint ist. Geht es nicht um einen Mitarbeiter, "
      + "sondern etwa um einen Rechtsstreit mit einer Firma, antworte mit null.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: o.pdfBase64 },
          },
          {
            type: "text",
            text: `Betreff der Mail: ${o.betreff}\n\nVorschau: ${o.vorschau}\n\nLeute im Haus:\n${liste}\n\nUm wen geht es?`,
          },
        ],
      },
    ],
  });

  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const roh = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      nummer: number | null;
      begruendung?: string;
    };
    const treffer = roh.nummer ? o.leute[roh.nummer - 1] : null;
    return { id: treffer?.id ?? null, begruendung: String(roh.begruendung ?? "") };
  } catch {
    return { id: null, begruendung: "Die Antwort war nicht lesbar." };
  }
}

async function vermerken(o: {
  id: string;
  von: string;
  betreff: string;
  empfangen: string | null;
  stand: string;
  notiz: string;
  benutzerId?: string | null;
  dateiId?: string | null;
}): Promise<void> {
  await db()`
    insert into anwaltspost (nachricht_id, von, betreff, empfangen_am, stand, notiz, benutzer_id, datei_id)
    values (${o.id}, ${o.von}, ${o.betreff}, ${o.empfangen}::timestamptz, ${o.stand}, ${o.notiz},
            ${o.benutzerId ?? null}::uuid, ${o.dateiId ?? null}::uuid)
    on conflict (nachricht_id) do update set stand = excluded.stand, notiz = excluded.notiz,
                                             benutzer_id = excluded.benutzer_id,
                                             datei_id = excluded.datei_id
  `;
}

/** Die Post der Kanzlei holen und ablegen. */
export async function anwaltspostHolen(): Promise<Postlauf> {
  const lauf: Postlauf = { gesehen: 0, abgelegt: 0, ohneZuordnung: 0, fehler: 0, meldungen: [] };
  const leute = await namen();

  for (const postfach of POSTFAECHER) {
    let nachrichten: GraphNachricht[] = [];
    try {
      const antwort = await graph<{ value: GraphNachricht[] }>(
        `/users/${encodeURIComponent(postfach)}/messages`
          + `?$filter=${encodeURIComponent(`from/emailAddress/address eq '${KANZLEI}'`)}`
          + "&$select=id,internetMessageId,subject,receivedDateTime,hasAttachments,bodyPreview,from"
          + "&$top=25&$orderby=receivedDateTime desc",
      );
      nachrichten = antwort.value ?? [];
    } catch (e) {
      lauf.fehler += 1;
      lauf.meldungen.push(`${postfach}: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
      continue;
    }

    const bekannt = await schonDa(nachrichten.map((n) => n.internetMessageId ?? n.id));

    for (const n of nachrichten) {
      const schluessel = n.internetMessageId ?? n.id;
      if (bekannt.has(schluessel)) continue;
      lauf.gesehen += 1;

      const betreff = n.subject ?? "Schreiben der Kanzlei";
      const kopf = {
        id: schluessel,
        von: n.from?.emailAddress?.address ?? KANZLEI,
        betreff,
        empfangen: n.receivedDateTime ?? null,
      };

      if (!n.hasAttachments) {
        await vermerken({ ...kopf, stand: "ohne_anhang", notiz: "Kein Anhang in der Mail." });
        continue;
      }

      try {
        const anhaenge = await graph<{ value: GraphAnhang[] }>(
          `/users/${encodeURIComponent(postfach)}/messages/${n.id}/attachments`,
        );
        const pdfs = (anhaenge.value ?? []).filter(
          (a) =>
            !a.isInline
            && a.contentBytes
            && (a.contentType?.toLowerCase().includes("pdf")
              || a.name?.toLowerCase().endsWith(".pdf")),
        );

        if (pdfs.length === 0) {
          await vermerken({ ...kopf, stand: "ohne_anhang", notiz: "Kein PDF im Anhang." });
          continue;
        }

        let abgelegt = 0;
        let letzteNotiz = "";
        for (const anhang of pdfs) {
          const roh = Buffer.from(anhang.contentBytes!, "base64");
          const { datei, offen } = await ohnePasswort(roh);

          const treffer = await wemGehoertDas({
            pdfBase64: datei.toString("base64"),
            betreff,
            vorschau: n.bodyPreview ?? "",
            leute,
          });

          if (!treffer.id) {
            letzteNotiz = treffer.begruendung || "Niemand im Haus erkannt.";
            continue;
          }

          const dateiId = await unterlageAblegen({
            benutzerId: treffer.id,
            art: "schriftverkehr",
            titel: betreff,
            dateiname: anhang.name ?? "Schreiben.pdf",
            typ: "application/pdf",
            inhalt: datei,
            notiz: `Von der Arbeitsrechtlerin, eingegangen am ${
              n.receivedDateTime ? n.receivedDateTime.slice(0, 10).split("-").reverse().join(".") : "unbekannt"
            }${offen ? "" : " (noch mit Passwort geschützt)"}`,
            von: "Kanzlei Seichter",
          });

          abgelegt += 1;
          letzteNotiz = treffer.begruendung;
          await vermerken({
            ...kopf,
            stand: "abgelegt",
            notiz: treffer.begruendung,
            benutzerId: treffer.id,
            dateiId: typeof dateiId === "string" ? dateiId : null,
          });
        }

        if (abgelegt > 0) {
          lauf.abgelegt += abgelegt;
        } else {
          lauf.ohneZuordnung += 1;
          await vermerken({ ...kopf, stand: "niemand_erkannt", notiz: letzteNotiz });
        }
      } catch (e) {
        lauf.fehler += 1;
        const grund = e instanceof Error ? e.message : "unbekannter Fehler";
        lauf.meldungen.push(`${betreff}: ${grund}`);
        await vermerken({ ...kopf, stand: "fehler", notiz: grund });
      }
    }
  }

  return lauf;
}

export interface OffenePost {
  nachrichtId: string;
  betreff: string;
  empfangenAm: string | null;
  stand: string;
  notiz: string;
}

/** Was nicht zugeordnet werden konnte. Steht oben auf der Mitarbeiterseite. */
export async function offeneAnwaltspost(): Promise<OffenePost[]> {
  const z = (await db()`
    select nachricht_id, betreff, empfangen_am, stand, notiz
      from anwaltspost
     where stand in ('niemand_erkannt', 'fehler')
     order by empfangen_am desc nulls last limit 20
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    nachrichtId: String(r.nachricht_id),
    betreff: String(r.betreff ?? ""),
    empfangenAm: r.empfangen_am ? new Date(r.empfangen_am as string).toISOString() : null,
    stand: String(r.stand),
    notiz: String(r.notiz ?? ""),
  }));
}
