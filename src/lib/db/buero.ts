"use server";

/**
 * Bearbeitungsstand für Versand und Anfragen.
 *
 * Die Listen selbst kommen aus Google-Tabellen, die der Shop befüllt. Was
 * das Büro daran tut, steht hier: abgehakte Sendungen, geänderte
 * Anfragestände, und die Verbindung von einer Anfrage zum Vorgang.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";

async function verlangeBuero(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfKaufmaennisches(benutzer.rolle)) {
    throw new Error("Für diese Änderung fehlt die Berechtigung.");
  }
  return benutzer.name;
}

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

// ── Versand ──────────────────────────────────────────────────────────

export interface VersandStand {
  erledigtAm: string | null;
  erledigtVon: string | null;
  notiz: string | null;
  /** Von Hand aus Ditix übernommener Gutscheincode. */
  gutscheincode: string | null;
  /** Abweichender Betrag in Cent, falls der aus der Tabelle nicht stimmt. */
  betragCent: number | null;
  /** Überschreiben die Grußworte aus der Tabelle, falls jemand sie geändert hat. */
  widmungFuer: string | null;
  widmungText: string | null;
  widmungVon: string | null;
  gueltigBis: string | null;
}

export async function versandStaende(): Promise<Map<string, VersandStand>> {
  const zeilen = (await db()`
    select bestellnummer, erledigt_am, erledigt_von, notiz, gutscheincode, betrag_cent,
           widmung_fuer, widmung_text, widmung_von, gueltig_bis
      from versand_stand
  `) as Array<{
    bestellnummer: string;
    erledigt_am: string | null;
    erledigt_von: string | null;
    notiz: string | null;
    gutscheincode: string | null;
    betrag_cent: number | null;
    widmung_fuer: string | null;
    widmung_text: string | null;
    widmung_von: string | null;
    gueltig_bis: string | null;
  }>;

  return new Map(
    zeilen.map((z) => [
      z.bestellnummer,
      {
        erledigtAm: z.erledigt_am ? new Date(z.erledigt_am).toISOString() : null,
        erledigtVon: z.erledigt_von,
        notiz: z.notiz,
        gutscheincode: z.gutscheincode,
        betragCent: z.betrag_cent,
        widmungFuer: z.widmung_fuer,
        widmungText: z.widmung_text,
        widmungVon: z.widmung_von,
        gueltigBis: z.gueltig_bis,
      },
    ]),
  );
}

/**
 * Hakt eine Sendung als verschickt ab, oder nimmt das Häkchen zurück.
 *
 * Nach dem Klick wird auf dieselbe Ansicht zurückgeführt, aber mit einem
 * Vermerk, was gerade geschehen ist. Die Seite zeigt daraufhin eine
 * Rückmeldung mit einem Weg zurück.
 *
 * Das ist kein Beiwerk. Eine abgehakte Sendung verschwindet aus der
 * offenen Liste, und ohne Rückmeldung ist sie danach einfach weg: kein
 * Hinweis, wohin, kein Hinweis, dass es rückgängig geht. Genau so sind
 * an einem Abend fünf Sendungen unbemerkt aus der Liste gefallen.
 */
export async function versandAbhaken(
  bestellnummer: string,
  zurueck: boolean,
  ansicht: string = "",
): Promise<void> {
  const name = await verlangeBuero();

  if (zurueck) {
    await db()`
      update versand_stand set erledigt_am = null, erledigt_von = null
       where bestellnummer = ${bestellnummer}
    `;
  } else {
    await db()`
      insert into versand_stand (bestellnummer, erledigt_am, erledigt_von)
      values (${bestellnummer}, now(), ${name})
      on conflict (bestellnummer) do update
         set erledigt_am = now(), erledigt_von = excluded.erledigt_von
    `;
  }

  revalidatePath("/versand");

  const frage = new URLSearchParams();
  if (ansicht) frage.set("zeige", ansicht);
  frage.set("zuletzt", bestellnummer);
  frage.set("aktion", zurueck ? "zurueck" : "ab");
  redirect(`/versand?${frage.toString()}`);
}

/**
 * Trägt den Gutscheincode aus Ditix ein.
 *
 * Ditix gibt ihn nicht über die Schnittstelle heraus, deshalb holt ihn
 * jemand aus dem Backend und fügt ihn hier ein. Danach steht er auf dem
 * gedruckten Gutschein, und niemand muss ihn ein zweites Mal abtippen.
 *
 * Leerzeichen und Bindestriche fliegen raus: Beim Kopieren rutscht gern
 * etwas mit, und der Code selbst besteht nur aus Buchstaben und Ziffern.
 */
export async function gutscheincodeSetzen(
  bestellnummer: string,
  formData: FormData,
): Promise<void> {
  await verlangeBuero();
  const roh = text(formData, "code").replace(/[\s-]/g, "").toUpperCase();
  const code = roh || null;

  await db()`
    insert into versand_stand (bestellnummer, gutscheincode) values (${bestellnummer}, ${code})
    on conflict (bestellnummer) do update set gutscheincode = excluded.gutscheincode
  `;
  revalidatePath("/versand");
}

/**
 * Ändert die Grußworte auf dem Gutschein.
 *
 * Der Käufer gibt sie im Shop ein, und meistens passen sie. Manchmal
 * fehlt ein Punkt, ein Name ist falsch geschrieben, oder die Anrede
 * stimmt nicht. Dann wird hier korrigiert, statt in der Tabelle.
 *
 * Ein leeres Feld bedeutet nicht "leer lassen", sondern "Wert aus der
 * Tabelle nehmen". Wer eine Widmung wirklich entfernen will, trägt ein
 * Minuszeichen ein.
 */
export async function widmungSpeichern(
  bestellnummer: string,
  formData: FormData,
): Promise<void> {
  await verlangeBuero();

  await db()`
    insert into versand_stand (bestellnummer, widmung_fuer, widmung_text, widmung_von, gueltig_bis)
    values (${bestellnummer}, ${text(formData, "fuer") || null},
            ${text(formData, "widmung") || null}, ${text(formData, "von") || null},
            ${text(formData, "gueltig_bis") || null})
    on conflict (bestellnummer) do update
       set widmung_fuer = excluded.widmung_fuer,
           widmung_text = excluded.widmung_text,
           widmung_von = excluded.widmung_von,
           gueltig_bis = excluded.gueltig_bis
  `;
  revalidatePath("/versand");
}

/** Notiz an einer Sendung, etwa "Adresse beim Kunden erfragt". */
export async function versandNotiz(bestellnummer: string, formData: FormData): Promise<void> {
  await verlangeBuero();
  const notiz = text(formData, "notiz");
  await db()`
    insert into versand_stand (bestellnummer, notiz) values (${bestellnummer}, ${notiz || null})
    on conflict (bestellnummer) do update set notiz = excluded.notiz
  `;
  revalidatePath("/versand");
}

// ── Anfragen ─────────────────────────────────────────────────────────

export interface LeadStand {
  status: string | null;
  kommentar: string | null;
  ablehnungsgrund: string | null;
  vorgangId: string | null;
  geaendertVon: string | null;
  geaendertAm: string | null;
}

export async function leadStaende(): Promise<Map<string, LeadStand>> {
  const zeilen = (await db()`
    select schluessel, status, kommentar, ablehnungsgrund, vorgang_id,
           geaendert_am, geaendert_von
      from lead_stand
  `) as Array<Record<string, unknown>>;

  return new Map(
    zeilen.map((z) => [
      String(z.schluessel),
      {
        status: (z.status as string) ?? null,
        kommentar: (z.kommentar as string) ?? null,
        ablehnungsgrund: (z.ablehnungsgrund as string) ?? null,
        vorgangId: z.vorgang_id ? String(z.vorgang_id) : null,
        geaendertVon: (z.geaendert_von as string) ?? null,
        geaendertAm: z.geaendert_am ? new Date(z.geaendert_am as string).toISOString() : null,
      },
    ]),
  );
}

/** Speichert Stand, Kommentar und Ablehnungsgrund einer Anfrage. */
export async function leadSpeichern(schluessel: string, formData: FormData): Promise<void> {
  const name = await verlangeBuero();

  await db()`
    insert into lead_stand (schluessel, status, kommentar, ablehnungsgrund, geaendert_von)
    values (${schluessel}, ${text(formData, "status") || null},
            ${text(formData, "kommentar") || null},
            ${text(formData, "ablehnungsgrund") || null}, ${name})
    on conflict (schluessel) do update
       set status = excluded.status,
           kommentar = excluded.kommentar,
           ablehnungsgrund = excluded.ablehnungsgrund,
           geaendert_am = now(),
           geaendert_von = excluded.geaendert_von
  `;
  revalidatePath("/leads");
}

/**
 * Macht aus einer Anfrage einen Vorgang.
 *
 * Das ist die Stelle, an der aus einer Zeile in einer Tabelle ein Kunde
 * wird: Name, Mail und Telefon wandern mit, die Anfrage merkt sich den
 * entstandenen Vorgang, und danach geht es dort weiter mit Angebot,
 * Sitzplan und Rechnung.
 */
export async function leadZuVorgang(schluessel: string, formData: FormData): Promise<void> {
  const name = await verlangeBuero();

  const kundenname = text(formData, "name") || "Ohne Namen";
  const email = text(formData, "email");
  const telefon = text(formData, "telefon");
  const personen = text(formData, "personen");
  const wunsch = text(formData, "wunschdatum");
  const anfragetyp = text(formData, "anfragetyp");

  // Kunde suchen oder anlegen, damit derselbe Kunde nicht doppelt entsteht.
  let kundeId: string | null = null;
  if (email) {
    const vorhanden = (await db()`
      select id from kunde where lower(email) = lower(${email}) limit 1
    `) as Array<{ id: string }>;
    kundeId = vorhanden[0]?.id ?? null;
  }
  if (!kundeId) {
    const neu = (await db()`
      insert into kunde (name, email, telefon) values (${kundenname}, ${email}, ${telefon})
      returning id
    `) as Array<{ id: string }>;
    kundeId = neu[0].id;
  }

  const jetzt = new Date();
  const praefix = `V-${String(jetzt.getMonth() + 1).padStart(2, "0")}${String(jetzt.getFullYear()).slice(-2)}-`;
  const letzte = (await db()`
    select nummer from vorgang where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as Array<{ nummer: string }>;
  const nummer =
    praefix +
    String((letzte.length > 0 ? Number(letzte[0].nummer.split("-")[2]) : 0) + 1).padStart(3, "0");

  const vorgang = (await db()`
    insert into vorgang (nummer, status, kunde_id, quelle, personen_ungefaehr, wunschzeitraum)
    values (${nummer}, 'anfrage', ${kundeId},
            ${anfragetyp ? `Anfrage (${anfragetyp})` : "Anfrage"},
            ${personen || null}, ${wunsch || null})
    returning id
  `) as Array<{ id: string }>;

  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${vorgang[0].id}, ${name},
            ${"Aus der Anfragenliste übernommen." + (telefon ? ` Telefon: ${telefon}` : "")})
  `;

  await db()`
    insert into lead_stand (schluessel, status, vorgang_id, geaendert_von)
    values (${schluessel}, 'Kontakt hergestellt', ${vorgang[0].id}, ${name})
    on conflict (schluessel) do update
       set vorgang_id = excluded.vorgang_id,
           status = coalesce(lead_stand.status, excluded.status),
           geaendert_am = now(),
           geaendert_von = excluded.geaendert_von
  `;

  revalidatePath("/leads");
  revalidatePath("/vorgaenge");
  redirect(`/vorgaenge/${vorgang[0].id}`);
}
