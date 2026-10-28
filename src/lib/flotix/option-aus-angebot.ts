/**
 * Ein Angebot hält die Plätze fest.
 *
 * "kevin erstellt ein angebot, der eventmanager blockiert dann die
 * plätze, und wenn das angebot abläuft werden sie automatisch
 * freigegeben" (Florian, 26.10.2026).
 *
 * Deshalb hängt die Option am Angebot und nicht an einem Knopf: Wer ein
 * Angebot schreibt, meint diese Plätze an diesem Abend. Das Ablaufdatum
 * ist das des Angebots, höchstens aber sieben Tage. FloTix gibt die
 * Plätze von selbst frei, wenn die Zeit um ist, auch wenn niemand
 * aufräumt.
 *
 * Nichts davon darf das Schreiben eines Angebots aufhalten. Geht FloTix
 * gerade nicht ans Telefon, steht das Angebot trotzdem, und im Vorgang
 * kann jemand die Plätze von Hand nachholen.
 */

import { db } from "@/lib/db/client";
import { flotixQuelle } from "./tuer";
import { HOECHSTENS_TAGE, optionAufheben, optionen, optionSetzen } from "./option";

/** Wie viele Plätze ein Angebot festhält, und für welchen Abend. */
async function angebotsdaten(vorgangId: string) {
  const [z] = (await db()`
    select vg.nummer,
           coalesce(s.ditix_event_id, '')       as vorstellung_id,
           coalesce(k.name, 'Firmenanfrage')    as firma,
           coalesce((select sum(g.personen) from gruppe g where g.vorgang_id = vg.id), 0)::int as personen,
           coalesce(vg.personen_ungefaehr, '')  as personen_ungefaehr,
           (select max(a.gueltig_bis) from angebot a where a.vorgang_id = vg.id) as gueltig_bis
      from vorgang vg
      left join vorstellung s on s.id = vg.vorstellung_id
      left join kunde k on k.id = vg.kunde_id
     where vg.id = ${vorgangId}::uuid
  `) as Array<{
    nummer: string;
    vorstellung_id: string;
    firma: string;
    personen: number;
    personen_ungefaehr: string;
    gueltig_bis: string | null;
  }>;
  return z;
}

/**
 * Nach dem Erstellen oder Versenden eines Angebots: Plätze festhalten.
 *
 * Wirft nie. Gibt zurück, was passiert ist, für das Protokoll.
 */
export async function optionAusAngebot(vorgangId: string): Promise<{
  gesetzt: number;
  bis: string | null;
  grund: string;
}> {
  const nichts = { gesetzt: 0, bis: null, grund: "" };

  try {
    if (!flotixQuelle()) return { ...nichts, grund: "FloTix ist nicht die Quelle." };

    const d = await angebotsdaten(vorgangId);
    if (!d) return { ...nichts, grund: "Vorgang nicht gefunden." };
    if (!d.vorstellung_id) return { ...nichts, grund: "Der Abend steht noch nicht fest." };

    /*
      Wie viele Plätze?

      Die Gruppen sind die verlässliche Zahl, sie stehen auch im Angebot.
      Fehlen sie, nehmen wir die ungefähre Zahl aus der Anfrage: Lieber
      zehn Plätze zu viel gehalten als der Abend weg.
    */
    const ungefaehr = Math.round(Number((d.personen_ungefaehr.match(/\d+/) ?? [])[0] ?? 0));
    const anzahl = d.personen > 0 ? d.personen : ungefaehr;
    if (anzahl < 1) return { ...nichts, grund: "Keine Personenzahl im Vorgang." };

    /*
      Schon optioniert? Dann nichts doppelt tun, aber sagen, was läuft.

      Wichtig für die zweite und dritte Fassung eines Angebots: Die
      Plätze sind dann schon gehalten, und trotzdem soll auf jedem
      dieser Angebote stehen, wie viele und bis wann (Florian,
      28.10.2026).
    */
    const laufende = await optionen().catch(() => []);
    const schon = laufende.find((o) => o.vorgang === d.nummer);
    if (schon) {
      return {
        gesetzt: schon.plaetze.length,
        bis: new Date(schon.bis).toISOString(),
        grund: "Für diesen Vorgang sind schon Plätze blockiert.",
      };
    }

    const grenze = new Date(Date.now() + HOECHSTENS_TAGE * 24 * 60 * 60 * 1000);
    const ausAngebot = d.gueltig_bis ? new Date(d.gueltig_bis) : null;
    const bis = ausAngebot && ausAngebot < grenze ? ausAngebot : grenze;

    const e = await optionSetzen({
      vorstellungId: d.vorstellung_id,
      anzahl,
      firma: d.firma,
      vorgang: d.nummer,
      bis,
    });

    console.log(
      `[option] ${e.gesetzt} Plätze für ${d.firma} bis ${bis.toLocaleDateString("de-DE")}` +
        (e.fehlende > 0 ? `, ${e.fehlende} waren nicht mehr frei` : ""),
    );
    return { gesetzt: e.gesetzt, bis: bis.toISOString(), grund: "" };
  } catch (f) {
    console.warn("[option] Plätze nicht festgehalten:", f);
    return { ...nichts, grund: f instanceof Error ? f.message : "Unbekannter Fehler" };
  }
}

/**
 * Das Angebot ist abgelehnt oder der Vorgang abgesagt: Plätze zurück.
 *
 * Abgelaufene Optionen löst FloTix von selbst. Hier geht es um den Fall,
 * in dem die Antwort früher kommt als der Ablauf, und das ist der
 * häufigere: Ein Nein am zweiten Tag soll nicht fünf Tage Plätze kosten.
 */
export async function optionZurueck(vorgangId: string): Promise<number> {
  try {
    if (!flotixQuelle()) return 0;
    const d = await angebotsdaten(vorgangId);
    if (!d) return 0;
    const e = await optionAufheben(d.nummer);
    if (e.freigegeben > 0) console.log(`[option] ${e.freigegeben} Plätze wieder frei (${d.nummer})`);
    return e.freigegeben;
  } catch (f) {
    console.warn("[option] Plätze nicht freigegeben:", f);
    return 0;
  }
}
