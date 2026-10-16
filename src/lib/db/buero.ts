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

/**
 * Wer den Versand abhaken darf: Buero und Foyer.
 *
 * Am geteilten Foyer-Zugang steht der Name nicht fest, deshalb kommt er
 * von der Auswahl auf der Seite (siehe lib/personal/wer.ts). Ohne
 * Auswahl geht nichts: Ein Haken ohne Namen hilft spaeter niemandem.
 */
async function verlangeVersand(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfKaufmaennisches(benutzer.rolle) && benutzer.rolle !== "foyer") {
    throw new Error("Für diese Änderung fehlt die Berechtigung.");
  }
  const { verlangeWer } = await import("@/lib/personal/wer");
  return verlangeWer();
}

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
  const name = await verlangeVersand();

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
  // Störungsmeldungen liegen in derselben Tabelle und teilen sich diesen
  // Stand, also muss ihre Seite ebenfalls neu gerechnet werden.
  revalidatePath("/stoerungen");
}

/**
 * Macht aus einer Anfrage einen Vorgang.
 *
 * Das ist die Stelle, an der aus einer Zeile in einer Tabelle ein Kunde
 * wird: Name, Mail und Telefon wandern mit, die Anfrage merkt sich den
 * entstandenen Vorgang, und danach geht es dort weiter mit Angebot,
 * Sitzplan und Rechnung.
 */
/**
 * Aus "12.12.2026", "12.12.26" oder "2026-12-12" wird "2026-12-12".
 *
 * Mehr muss es nicht koennen: Steht im Wunsch nur "im Dezember", bleibt
 * der Termin offen, und genau das ist dann auch richtig.
 */
function alsDatum(roh: string): string | null {
  const t = roh.trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/);
  if (!de) return null;
  const jahr = de[3].length === 2 ? `20${de[3]}` : de[3];
  return `${jahr}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
}

export async function leadZuVorgang(schluessel: string, formData: FormData): Promise<void> {
  const name = await verlangeBuero();

  const kundenname = text(formData, "name") || "Ohne Namen";
  const email = text(formData, "email");
  const telefon = text(formData, "telefon");
  const personen = text(formData, "personen");
  const wunsch = text(formData, "wunschdatum");
  const anfragetyp = text(formData, "anfragetyp");
  const kommentar = text(formData, "kommentar");

  /*
    Die Personenzahl aus der Anfrage.

    In den Formularen von Meta steht oft eine Spanne wie "11-50". Für
    den Vorgang braucht es eine Zahl, sonst stehen im Angebot null
    Gäste (Florian, 15.10.2026). Genommen wird die kleinere: lieber
    nachlegen als dem Kunden zu viel berechnen. Der Originaltext bleibt
    als "ungefähr" daneben stehen.
  */
  const zahlen = personen.match(/\d+/g) ?? [];
  const gaeste = zahlen.length > 0 ? Math.min(98, Math.max(1, Number(zahlen[0]))) : 0;

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
      insert into kunde (name, email, telefon, ansprechpartner)
      values (${kundenname}, ${email}, ${telefon}, ${kundenname})
      returning id
    `) as Array<{ id: string }>;
    kundeId = neu[0].id;
  }

  /*
    Die Firma aus der Mailadresse schliessen.

    "du kannst ueber die E-Mail ja auch schnell schlussfolgern, welche
    Firma es genau ist" (Florian, 16.10.2026). Schreibt jemand von einer
    eigenen Domain, steht im Impressum dieser Website die Anschrift. Sie
    wird gleich eingetragen, damit der Mitarbeiter es nicht tun muss;
    woher sie stammt, steht in der Notiz, und aendern kann sie jeder.

    Freie Postfaecher wie web.de fuehren zu nichts, dort wird nicht
    gesucht.
  */
  let adressnotiz = "";
  try {
    const { adresseSuchen, firmendomain } = await import("@/lib/shop/firmenadresse");
    if (email && firmendomain(email)) {
      const gefunden = await adresseSuchen({ firma: kundenname, email });
      if (gefunden) {
        /*
          Der Name aus dem Impressum gilt nur, wenn er nach Firma
          aussieht: Im Leadformular steht meist der Mensch, nicht das
          Unternehmen.
        */
        const nachFirma = /\b(gmbh|mbh|ag|kg|ohg|ug|gbr|se)\b|\be\. ?[kv]\./i;
        const firmenname = nachFirma.test(gefunden.firma) ? gefunden.firma : kundenname;

        await db()`
          update kunde
             set name = ${firmenname}, strasse = ${gefunden.strasse}, plz = ${gefunden.plz},
                 ort = ${gefunden.ort}, geaendert_am = now()
           where id = ${kundeId}
        `;
        adressnotiz = `Anschrift automatisch gefunden: ${gefunden.strasse}, ${gefunden.plz} ${gefunden.ort}. Quelle: ${gefunden.quelle || "Impressum"}. Bitte pruefen.`;
      }
    }
  } catch {
    // Die Suche ist Beiwerk. Faellt sie aus, entsteht der Vorgang trotzdem.
  }

  const jetzt = new Date();
  const praefix = `V-${String(jetzt.getMonth() + 1).padStart(2, "0")}${String(jetzt.getFullYear()).slice(-2)}-`;
  const letzte = (await db()`
    select nummer from vorgang where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as Array<{ nummer: string }>;
  const nummer =
    praefix +
    String((letzte.length > 0 ? Number(letzte[0].nummer.split("-")[2]) : 0) + 1).padStart(3, "0");

  /*
    Hat der Kunde ein Datum genannt, steht es gleich im Vorgang.

    "wenn der Kunde schon gesagt hat, wann er möchte, sollte der Termin
    drin stehen" (Florian, 14.10.2026). Nur bei genau einer Vorstellung
    an dem Tag: Laufen zwei, soll ein Mensch entscheiden, und der
    Wunschtext bleibt ja sichtbar.
  */
  let vorstellungId: string | null = null;
  const wunschTag = alsDatum(wunsch);
  if (wunschTag) {
    const { termineDesTages } = await import("@/lib/ditix/spielplan");
    const amTag = await termineDesTages(wunschTag).catch(() => []);
    if (amTag.length === 1) {
      const t = amTag[0];
      const vorhanden = (await db()`
        select id from vorstellung where datum = ${wunschTag} and show = ${t.name} limit 1
      `) as Array<{ id: string }>;
      if (vorhanden[0]) {
        vorstellungId = vorhanden[0].id;
      } else {
        const neu = (await db()`
          insert into vorstellung (datum, show, ditix_event_id)
          values (${wunschTag}, ${t.name}, ${t.ditixEventId}) returning id
        `) as Array<{ id: string }>;
        vorstellungId = neu[0].id;
      }
    }
  }

  const vorgang = (await db()`
    insert into vorgang (nummer, status, kunde_id, quelle, personen_ungefaehr, wunschzeitraum,
                         vorstellung_id)
    values (${nummer}, 'anfrage', ${kundeId},
            ${anfragetyp ? `Anfrage (${anfragetyp})` : "Anfrage"},
            ${personen || null}, ${wunsch || null}, ${vorstellungId})
    returning id
  `) as Array<{ id: string }>;

  /*
    Die Gruppe, damit die Gaestezahl im Vorgang steht und das Angebot
    nicht mit null Personen rechnet.
  */
  if (gaeste > 0) {
    await db()`
      insert into gruppe (vorgang_id, name, personen, herkunft)
      values (${vorgang[0].id}, ${kundenname}, ${gaeste}, 'firma')
    `.catch(() => undefined);
  }

  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${vorgang[0].id}, ${name},
            ${[
              "Aus der Anfragenliste übernommen.",
              telefon ? `Telefon: ${telefon}` : "",
              personen ? `Angabe zur Personenzahl: ${personen}` : "",
              wunsch ? `Wunschtermin: ${wunsch}` : "",
              kommentar ? `Anmerkung des Kunden: ${kommentar}` : "",
              adressnotiz,
            ]
              .filter(Boolean)
              .join(" ")})
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
