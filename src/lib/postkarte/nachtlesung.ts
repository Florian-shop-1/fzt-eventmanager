/**
 * Postkarten werden nachts gelesen, im Batch.
 *
 * "bitte mach das so, dass du dir die fotos speicherst und dann den
 * antrophic scanner wie bei den emojis einfach über nacht nutzt, weil
 * es günstiger ist" (Florian, 02.11.2026).
 *
 * Der Weg:
 *
 *   Foto -> gespeichert, Stand "wartet"
 *        -> nachts 1:30 als Batch abgeschickt
 *        -> morgens 6:15 abgeholt, Stand "gelesen"
 *        -> Mensch entscheidet wie bisher
 *
 * Im Batch kostet dieselbe Lesung die Hälfte. Gebraucht wird das
 * Ergebnis erst am nächsten Tag: Entschieden wird im Büro und nicht im
 * Foyer zwischen zwei Gästen.
 *
 * Dasselbe Muster wie beim Glücks-Moji-Scanner, siehe
 * lib/scanner/claude.ts. Dort steht es seit dem 17.09.2026 und läuft.
 */

import { befundAusText, fingerabdruck, leseAnfrage, modellZugang } from "./lesen";
import { db } from "@/lib/db/client";

/** Wie viele Karten höchstens in einen Batch gehen. */
const HOECHSTENS = 200;

/**
 * Alle wartenden Karten abschicken.
 *
 * @returns wie viele Karten unterwegs sind.
 */
export async function postkartenAbschicken(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;

  const warten = (await db()`
    select id, bild, bild_typ from postkarte
     where status = 'wartet' and batch_id is null and bild is not null
     order by erstellt_am
     limit ${HOECHSTENS}
  `) as Array<{ id: string; bild: Buffer; bild_typ: string }>;
  if (warten.length === 0) return 0;

  const batch = await modellZugang().messages.batches.create({
    requests: warten.map((k) => ({
      custom_id: String(k.id),
      params: leseAnfrage(Buffer.from(k.bild).toString("base64"), k.bild_typ),
    })),
  });

  await db()`
    update postkarte set batch_id = ${batch.id}
     where id = any(${warten.map((k) => k.id)}::uuid[])
  `;
  console.info(`[postkarte] Batch ${batch.id} mit ${warten.length} Karten abgeschickt`);
  return warten.length;
}

/**
 * Fertige Batches abholen und die Karten füllen.
 *
 * @returns wie viele Karten gelesen wurden.
 */
export async function postkartenAbholen(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;

  const offen = (await db()`
    select distinct batch_id from postkarte
     where status = 'wartet' and batch_id is not null
  `) as Array<{ batch_id: string }>;

  let gelesen = 0;
  for (const { batch_id: batchId } of offen) {
    const stand = await modellZugang().messages.batches.retrieve(batchId);
    /* Noch nicht fertig: Der naechste Lauf schaut wieder nach. */
    if (stand.processing_status !== "ended") continue;

    for await (const r of await modellZugang().messages.batches.results(batchId)) {
      if (r.result.type !== "succeeded") {
        /*
          Abgelaufen oder abgebrochen: Die Karte wartet weiter, aber
          ohne Batch, damit der naechste Lauf sie wieder mitnimmt.
          Fehlgeschlagen heisst: ein Vermerk, und ein Mensch schaut.
        */
        const nochmal = r.result.type === "expired" || r.result.type === "canceled";
        await db()`
          update postkarte
             set batch_id = null,
                 status = ${nochmal ? "wartet" : "gelesen"},
                 fehler = ${nochmal ? "" : "Das Lesen ist fehlgeschlagen."}
           where id = ${r.custom_id}::uuid
        `;
        continue;
      }

      const text = r.result.message.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("");
      try {
        const befund = befundAusText(text);
        await karteFuellen(r.custom_id, befund);
        gelesen += 1;
      } catch (f) {
        console.error(`[postkarte] Antwort zu ${r.custom_id} unlesbar:`, f);
        await db()`
          update postkarte
             set status = 'gelesen', batch_id = null,
                 fehler = 'Die Antwort des Lesedienstes war unlesbar.'
           where id = ${r.custom_id}::uuid
        `;
      }
    }
  }

  if (gelesen > 0) console.info(`[postkarte] ${gelesen} Karten gelesen`);
  return gelesen;
}

/** Was der Batch herausgefunden hat, in die Karte schreiben. */
async function karteFuellen(
  id: string,
  befund: Awaited<ReturnType<typeof befundAusText>>,
): Promise<void> {
  if (!befund.karteOk) {
    await db()`
      update postkarte
         set status = 'verworfen', batch_id = null, gelesen_am = now(),
             fehler = ${befund.hinweis || "Darauf ist keine Gästepostkarte zu erkennen."}
       where id = ${id}::uuid
    `;
    return;
  }

  /*
    Dublettenpruefung wie bisher ueber den Text, jetzt eben erst hier:
    Beim Hochladen gab es den Text noch nicht. Das Foto selbst wird
    schon beim Hochladen auf Dubletten geprueft (bild_md5).
  */
  const abdruck = fingerabdruck(befund.transkript);
  const dublette = abdruck
    ? ((await db()`
        select id from postkarte
         where fingerabdruck = ${abdruck} and status <> 'verworfen' and id <> ${id}::uuid
         order by erstellt_am limit 1
      `) as Array<{ id: string }>)[0]?.id ?? null
    : null;

  await db()`
    update postkarte
       set status = ${dublette ? "verworfen" : "gelesen"},
           batch_id = null,
           gelesen_am = now(),
           transkript = ${befund.transkript},
           zitat = ${befund.zitat},
           zusammenfassung = ${befund.zusammenfassung},
           stimmung = ${befund.stimmung},
           bewertung = ${befund.bewertung},
           themen = ${befund.themen},
           gelesen = ${JSON.stringify(befund.roh ?? {})}::jsonb,
           datenschutz = ${befund.personenbezug.length > 0 ? "gesperrt" : "offen"},
           personenbezug = ${JSON.stringify(befund.personenbezug)}::jsonb,
           fingerabdruck = ${abdruck},
           dublette_von = ${dublette}::uuid,
           show = ${befund.show},
           fehler = ''
     where id = ${id}::uuid
  `;
}
