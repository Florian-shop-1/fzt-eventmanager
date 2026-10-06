/**
 * Prüft das Mitschreiben der Ditix-Meldungen, ohne echte Datenbank.
 * Aufruf: npx tsx scripts/test-ditix-eingang.ts
 *
 * Läuft gegen PGlite, ein vollständiges Postgres im Arbeitsspeicher. Die
 * Meldungen unten sind von Hand gebaut nach dem Aufbau, den Make aus der
 * Ditix-Meldung liest (data.order_id, data.events[].ticketTypes[].tickets).
 * Echte Kundendaten stehen hier nicht.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { antwortAufPruefung, MAX_BYTES, nimmAn } from "../src/lib/ditix/annahme";
import {
  INHALT_NACHTRAGEN,
  KOPF_BEREINIGUNG,
  kopfzeilen,
  legeMeldungAb,
  letzteMeldungen,
  MAX_VERSUCHE,
  pruefbericht,
  TABELLE_DDL,
  uebersicht,
  unlesbar,
  type Abfrage,
} from "../src/lib/db/ditix-eingang";

let fehler = 0;

function pruefe(bedingung: boolean, text: string, istwert?: unknown) {
  if (bedingung) {
    console.log(`  stimmt: ${text}`);
  } else {
    console.log(`  FEHLER: ${text}${istwert === undefined ? "" : ` (ist: ${JSON.stringify(istwert)})`}`);
    fehler++;
  }
}

/** Macht aus der Vorlage-Abfrage von Neon eine Abfrage an PGlite. */
function alsAbfrage(pg: PGlite): Abfrage {
  return async (teile, ...werte) => {
    const sql = teile.reduce((q, t, i) => q + t + (i < werte.length ? `$${i + 1}` : ""), "");
    const r = await pg.query(sql, werte as unknown[]);
    return r.rows as unknown[];
  };
}

function meldung(id: string, bestellung: string, art = "order_created") {
  return {
    event_type: art,
    message_id: id,
    date: "2026-10-06T08:15:00.000Z",
    data: {
      order_id: bestellung,
      customer_name: "Erika Beispiel",
      customer_email_address: "erika@example.org",
      customer: { name: "Erika Beispiel", email_address: "erika@example.org", company: "KEINE ANGABE" },
      order_amount_gross: { amount: 198, currency: "EUR" },
      events: [
        {
          id: "E-1",
          name: "ULMFASSBAR",
          code: "UF",
          timestamp_start: "1794000000000",
          ticketTypes: [{ id: "t1", name: "Kat. 1", tickets: [{}, {}] }],
        },
      ],
    },
  };
}

async function main() {
  const pg = new PGlite();
  const sql = alsAbfrage(pg);

  console.log("=== Migrationen einspielen ===");
  const ordner = join(process.cwd(), "migrations");
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(ordner, datei), "utf8"));
  }
  console.log("  alle eingespielt");

  console.log("\n=== Notbehelf: Tabelle bei Bedarf anlegen ===");
  // Dieselbe Tabelle auf zwei Wegen: einmal aus der Migration, einmal aus dem
  // Code. Weichen sie ab, würde der Webhook gegen eine andere Tabelle laufen
  // als die Migration verspricht.
  const ausCode = new PGlite();
  for (const anweisung of TABELLE_DDL) await ausCode.exec(anweisung);
  await ausCode.exec(TABELLE_DDL.join(";\n")); // zweiter Durchlauf: muss folgenlos sein
  const nurMigration = new PGlite();
  await nurMigration.exec(readFileSync(join(ordner, "150_ditix_webhook_eingang.sql"), "utf8"));
  const form = async (p: PGlite) => ({
    spalten: (
      await p.query(
        `select column_name, data_type, is_nullable, column_default from information_schema.columns
          where table_name = 'webhook_eingang' order by column_name`,
      )
    ).rows,
    indizes: (await p.query(`select indexdef from pg_indexes where tablename = 'webhook_eingang' order by indexdef`)).rows,
  });
  pruefe(
    JSON.stringify(await form(ausCode)) === JSON.stringify(await form(nurMigration)),
    "Tabelle aus dem Code ist dieselbe wie aus der Migration",
  );

  console.log("\n=== Upgrade einer schon bestehenden Tabelle (Stand 06.10.2026, 20:00) ===");
  // So sah die Tabelle im Livebetrieb aus: ohne inhalt_md5, mit dem ersten
  // Dublettenschutz nur über die message_id.
  const altDb = new PGlite();
  await altDb.exec(`
    create table webhook_eingang (
      id uuid primary key default gen_random_uuid(), quelle text not null, nachricht_id text,
      event_type text not null default '', order_id text not null default '',
      empfangen_am timestamptz not null default now(), empfangen_n int not null default 1,
      zuletzt_am timestamptz not null default now(), roh jsonb not null, kopf jsonb not null default '{}'::jsonb);
    create unique index webhook_eingang_nachricht on webhook_eingang (quelle, nachricht_id);
    create index webhook_eingang_zeit on webhook_eingang (quelle, empfangen_am desc);
    create index webhook_eingang_order on webhook_eingang (quelle, order_id);
    insert into webhook_eingang (quelle, nachricht_id, event_type, order_id, roh)
      values ('ditix_verkauf', 'X-1', 'order_created', 'X-1', '{"a":1}'::jsonb);`);
  for (const anweisung of TABELLE_DDL) await altDb.exec(anweisung);
  await altDb.exec(INHALT_NACHTRAGEN);
  const altSql = alsAbfrage(altDb);
  const altZeile = await altDb.query<{ inhalt_md5: string }>("select inhalt_md5 from webhook_eingang where nachricht_id = 'X-1'");
  pruefe(altZeile.rows[0].inhalt_md5.length === 32, "bestehende Zeile bekommt ihren Inhalts-Hash", altZeile.rows);
  const altIndizes = (await altDb.query<{ indexname: string }>("select indexname from pg_indexes where tablename = 'webhook_eingang'")).rows.map((r) => r.indexname);
  pruefe(!altIndizes.includes("webhook_eingang_nachricht") && altIndizes.includes("webhook_eingang_dublette"), "alter Dublettenschutz ersetzt", altIndizes);
  const wiederAlt = await legeMeldungAb({ event_type: "order_created", message_id: "X-1", data: { order_id: "X-1" }, a: 1 }, {}, altSql);
  const neuAlt = await legeMeldungAb({ event_type: "order_cancelled", message_id: "X-1", data: { order_id: "X-1" } }, {}, altSql);
  pruefe(neuAlt.id !== wiederAlt.id && !neuAlt.wiederholt, "neue Art mit derselben message_id wird abgelegt", neuAlt);

  console.log("\n=== Dubletten: nur echte Wiederholungen ===");
  // Ditix nimmt bei order_created die Bestellnummer als message_id (beobachtet).
  // Dieselbe ID bei einer Änderung darf nicht als Wiederholung verschluckt werden.
  const ersteD = await legeMeldungAb(meldung("D-1", "D-1", "order_created"), {}, sql);
  const wieder = await legeMeldungAb(meldung("D-1", "D-1", "order_created"), {}, sql);
  pruefe(wieder.id === ersteD.id && wieder.wiederholt && wieder.mal === 2, "gleiche ID, Art und Inhalt: Wiederholung", wieder);
  const andereArt = await legeMeldungAb(meldung("D-1", "D-1", "order_updated"), {}, sql);
  pruefe(andereArt.id !== ersteD.id && !andereArt.wiederholt, "gleiche ID, andere Art: eigene Zeile", andereArt);
  const geaendert = meldung("D-1", "D-1", "order_created");
  (geaendert.data.events[0].ticketTypes[0].tickets as unknown[]).push({});
  const anderer = await legeMeldungAb(geaendert, {}, sql);
  pruefe(anderer.id !== ersteD.id && !anderer.wiederholt, "gleiche ID und Art, anderer Inhalt: eigene Zeile", anderer);
  const zeilenD = await pg.query<{ n: number }>("select count(*)::int as n from webhook_eingang where nachricht_id = 'D-1'");
  pruefe(zeilenD.rows[0].n === 3, "drei Zeilen, keine verschluckt", zeilenD.rows[0]);
  await pg.exec("delete from webhook_eingang where nachricht_id = 'D-1'");

  console.log("\n=== Ablegen ===");
  const a = await legeMeldungAb(meldung("m-1", "A-1"), { "content-type": "application/json" }, sql);
  pruefe(!a.wiederholt && a.mal === 1, "erste Meldung abgelegt", a);

  const b = await legeMeldungAb(meldung("m-1", "A-1"), {}, sql);
  pruefe(b.wiederholt && b.mal === 2 && b.id === a.id, "dieselbe Meldung: nicht doppelt, aber mitgezählt", b);

  const n = await pg.query<{ n: number }>("select count(*)::int as n from webhook_eingang");
  pruefe(n.rows[0].n === 1, "nur eine Zeile", n.rows[0]);

  await legeMeldungAb(meldung("m-2", "A-1", "order_updated"), {}, sql);
  await legeMeldungAb(meldung("m-3", "A-2", "order_manuell_gepflegt"), {}, sql);
  const ohneId = meldung("x", "A-3");
  delete (ohneId as { message_id?: string }).message_id;
  await legeMeldungAb(ohneId, {}, sql);
  await legeMeldungAb(ohneId, {}, sql);
  const nachher = await pg.query<{ n: number }>("select count(*)::int as n from webhook_eingang");
  pruefe(nachher.rows[0].n === 5, "ohne message_id zählt jede als neu", nachher.rows[0]);

  console.log("\n=== Ungewöhnliches wird trotzdem abgelegt ===");
  const kaputt = await legeMeldungAb(unlesbar("das ist kein json"), {}, sql);
  pruefe(!kaputt.wiederholt, "unlesbarer Rumpf abgelegt");
  const leer = await legeMeldungAb(null, {}, sql);
  pruefe(!leer.wiederholt, "leere Meldung abgelegt");
  const liste = await letzteMeldungen(50, sql);
  pruefe(
    liste.some((m) => JSON.stringify(m.roh).includes("das ist kein json")),
    "unlesbarer Text ist später zu lesen",
  );
  // Zwei Ablagen kurz hintereinander können denselben Zeitstempel bekommen.
  // Für die Prüfung "neueste zuerst" deshalb ein Wimpernschlag Abstand.
  await new Promise((r) => setTimeout(r, 15));
  const lang = await legeMeldungAb(unlesbar("x".repeat(20000)), {}, sql);
  const gespeichert = (await letzteMeldungen(1, sql))[0];
  pruefe(lang.id === gespeichert.id, "neueste zuerst");
  pruefe(
    (gespeichert.roh as { _unlesbar: string })._unlesbar.length === 5000,
    "sehr langer Rumpf wird gekürzt",
  );

  console.log("\n=== Kopfzeilen ===");
  const kopf = kopfzeilen(
    new Headers({
      "content-type": "application/json",
      "user-agent": "Ditix-Webhook/1.0",
      authorization: "Bearer geheim",
      cookie: "a=b",
      "x-ditix-schluessel": "geheim",
      "x-signature": "abc",
    }),
  );
  pruefe(kopf["user-agent"] === "Ditix-Webhook/1.0", "User-Agent bleibt");
  pruefe(kopf["x-signature"] === "abc", "andere Kopfzeilen bleiben, etwa eine Signatur");
  pruefe(
    kopf.authorization === "[entfernt]" && kopf.cookie === "[entfernt]" && kopf["x-ditix-schluessel"] === "[entfernt]",
    "Schlüssel und Cookies: Kopfzeile sichtbar, Wert nie",
    kopf,
  );
  const fremd = kopfzeilen(
    new Headers({ "x-make-apikey": "geheim", "x-api-token": "geheim", "x-webhook-secret": "geheim", "tally-signature": "sig" }),
  );
  pruefe(
    fremd["x-make-apikey"] === "[entfernt]" && fremd["x-api-token"] === "[entfernt]" && fremd["x-webhook-secret"] === "[entfernt]",
    "auch fremd benannte Schlüssel werden geschwärzt",
    fremd,
  );
  pruefe(fremd["tally-signature"] === "sig", "Signaturen bleiben lesbar");
  const abgelegt = JSON.stringify((await letzteMeldungen(200, sql)).map((m) => m.kopf));
  pruefe(!abgelegt.includes("geheim"), "kein Schlüsselwert in der Datenbank");

  console.log("\n=== Interne Kopfzeilen und Schlüssel in der Adresse (Fund vom Livetest) ===");
  process.env.DITIX_WEBHOOK_SCHLUESSEL = "geheimer-schreibschluessel-1234";
  const live = kopfzeilen(
    new Headers({
      "content-type": "application/json",
      "user-agent": "Ditix/2.0",
      "x-ditix-signatur": "sig-abc",
      "x-real-ip": "203.0.113.7",
      "x-suche": "?schluessel=geheimer-schreibschluessel-1234",
      "x-pfad": "/api/ditix/verkauf",
      "x-vercel-sc-headers": '{"Authorization":"Bearer eyJ"}',
      "x-vercel-proxy-signature": "Bearer abc",
      "x-vercel-id": "fra1::x",
      "x-forwarded-for": "203.0.113.7",
      forwarded: "for=203.0.113.7;sig=AAAA",
      "x-matched-path": "/api/ditix/verkauf",
      host: "eventmanager.example",
      "x-fremd": "kam mit ?schluessel=geheimer-schreibschluessel-1234&a=b und key=zweiter",
      "x-nur-wert": "vorn geheimer-schreibschluessel-1234 hinten",
    }),
  );
  const liveText = JSON.stringify(live);
  pruefe(!liveText.includes("geheimer-schreibschluessel"), "kein Schlüssel in irgendeinem Wert", live);
  pruefe(!("x-suche" in live) && !("x-pfad" in live) && !("forwarded" in live), "interne Kopfzeilen fehlen");
  pruefe(!Object.keys(live).some((k) => k.startsWith("x-vercel-") || k.startsWith("x-forwarded-")), "Vercel-Kopfzeilen fehlen");
  pruefe(live["x-ditix-signatur"] === "sig-abc" && live["x-real-ip"] === "203.0.113.7", "Absenderangaben bleiben");
  pruefe(live["x-fremd"]?.includes("schluessel=[entfernt]") && live["x-fremd"]?.includes("key=[entfernt]"), "Schlüssel in fremden Werten geschwärzt", live["x-fremd"]);
  delete process.env.DITIX_WEBHOOK_SCHLUESSEL;

  // Zeilen, die vor der Korrektur abgelegt wurden, werden nachträglich bereinigt.
  await pg.exec(`insert into webhook_eingang (quelle, nachricht_id, roh, kopf) values
    ('ditix_verkauf', 'alt-belastet', '{}'::jsonb,
     '{"x-suche":"?schluessel=ALT","x-vercel-sc-headers":"x","forwarded":"for=1","x-ditix-signatur":"sig","user-agent":"curl"}'::jsonb)`);
  const vorher = await pruefbericht(sql);
  pruefe(vorher.kopfBelastet === 1, "Bericht zeigt belastete Zeile", vorher.kopfBelastet);
  await pg.exec(KOPF_BEREINIGUNG);
  const nachherBericht = await pruefbericht(sql);
  pruefe(nachherBericht.kopfBelastet === 0, "nach der Bereinigung nichts Belastetes", nachherBericht.kopfBelastet);
  const alt = await pg.query<{ kopf: Record<string, string> }>("select kopf from webhook_eingang where nachricht_id = 'alt-belastet'");
  pruefe(
    JSON.stringify(Object.keys(alt.rows[0].kopf).sort()) === JSON.stringify(["user-agent", "x-ditix-signatur"]),
    "Absenderangaben bleiben, Internes ist weg",
    alt.rows[0].kopf,
  );
  await pg.exec("delete from webhook_eingang where nachricht_id = 'alt-belastet'");
  await pg.exec(KOPF_BEREINIGUNG); // ohne Treffer: folgenlos

  console.log("\n=== Ansehen ===");
  const drei = await letzteMeldungen(3, sql);
  pruefe(drei.length === 3, "Begrenzung gilt", drei.length);
  const erste = (await letzteMeldungen(200, sql)).find((m) => m.nachrichtId === "m-1");
  pruefe(erste?.mal === 2 && erste?.eventType === "order_created" && erste?.orderId === "A-1", "Kennungen stimmen", erste);
  pruefe(erste?.kopf["content-type"] === "application/json", "Kopfzeilen lesbar");
  pruefe((await letzteMeldungen(100000, sql)).length <= 200, "höchstens 200");

  console.log("\n=== Übersicht ===");
  const u = await uebersicht(200, sql);
  pruefe(u.nachArt.order_created >= 2 && u.nachArt.order_updated === 1, "Meldungsarten gezählt", u.nachArt);
  pruefe(u.wiederholt === 1, "eine Meldung kam doppelt", u.wiederholt);
  // A-1 kam mit zwei Meldungen (m-1, m-2), A-3 zweimal ohne Kennung: beide zählen.
  pruefe(u.bestellungenMitMehrerenMeldungen === 2, "A-1 und A-3 kamen mit mehreren Meldungen", u.bestellungenMitMehrerenMeldungen);
  const feld = (p: string) => u.felder.find((f) => f.pfad === p);
  pruefe(feld("data.order_id")?.vorkommen === 5, "Feld data.order_id gezählt", feld("data.order_id"));
  pruefe(feld("data.events[].ticketTypes[].tickets")?.typen.includes("array") === true, "Listen erkannt");
  pruefe(feld("data.order_amount_gross.amount")?.typen.includes("number") === true, "Betrag ist eine Zahl");
  pruefe(feld("data.order_amount_gross.amount")?.beispiel === "198", "Zahlen zeigen ein Beispiel");
  pruefe(feld("data.customer.name")?.beispiel === undefined, "Namen erscheinen nie als Beispiel");
  pruefe(feld("data.customer_email_address")?.beispiel === undefined, "Adressen erscheinen nie als Beispiel");
  // Welcher Wert als Beispiel dient, hängt von der Reihenfolge ab. Es muss einer der echten sein.
  pruefe(
    ["order_created", "order_updated", "order_manuell_gepflegt"].includes(feld("event_type")?.beispiel ?? ""),
    "Meldungsart zeigt ein Beispiel",
    feld("event_type"),
  );
  pruefe(u.kopfzeilen["content-type"] === 1, "Kopfzeilen gezählt", u.kopfzeilen);

  console.log("\n=== Prüfbericht (ohne Personendaten) ===");
  const bericht = await pruefbericht(sql);
  const text = JSON.stringify(bericht);
  pruefe(bericht.insgesamt === 8, "alle Meldungen gezählt", bericht.insgesamt);
  pruefe(bericht.tage.length >= 1 && bericht.tage[0].meldungen === 8, "Tageszähler", bericht.tage);
  pruefe(bericht.nachArt.order_created >= 2 && bericht.nachArt.order_updated === 1, "Meldungsarten je Zeitraum", bericht.nachArt);
  pruefe(bericht.wiederholt === 1, "Wiederholung gezählt", bericht.wiederholt);
  pruefe(bericht.unlesbar === 2, "unlesbare Rümpfe gezählt", bericht.unlesbar);
  // A-3 zweimal, dazu die drei unlesbaren bzw. leeren Meldungen.
  pruefe(bericht.ohneNachrichtId === 5, "Meldungen ohne message_id gezählt", bericht.ohneNachrichtId);
  pruefe(bericht.ticketTypen.some((t) => t.name === "Kat. 1" && t.tickets >= 2), "Ticket-Typ mit Menge", bericht.ticketTypen);
  pruefe(bericht.veranstaltungen.some((v) => v.name === "ULMFASSBAR"), "Veranstaltung genannt");
  pruefe(bericht.betrag.anzahl >= 1 && bericht.betrag.kleinster === 198 && bericht.betrag.mitNachkomma === 0, "Betrag nur als Spanne", bericht.betrag);
  pruefe(bericht.letzte.length >= 1 && bericht.letzte.some((m) => m.tickets === 2), "Mengen je Meldung");
  pruefe(!text.includes("Erika") && !text.includes("erika@example.org"), "weder Name noch E-Mail im Bericht");
  pruefe(!/"beispiel":"198"/.test(text), "kein Betrag als Beispielwert");
  pruefe(!text.includes("geheim"), "kein Schlüsselwert im Bericht");
  pruefe(bericht.felder.some((f) => f.pfad === "data.order_id"), "Aufbau der Meldungen enthalten");

  console.log("\n=== Annahme: Schlüssel, Größe, Anklopfen ===");
  const K = "annahme-schluessel-1234567";
  process.env.DITIX_WEBHOOK_SCHLUESSEL = K;
  const URL0 = "http://x/api/ditix/verkauf";
  const anzahl = async (quelle: string) =>
    Number((await pg.query<{ n: number }>("select count(*)::int as n from webhook_eingang where quelle = $1", [quelle])).rows[0].n);
  const senden = (url: string, kopf: Record<string, string>, id: string, opt: { pfadSchluessel?: string } = {}) =>
    nimmAn(
      new Request(url, { method: "POST", headers: { "content-type": "application/json", ...kopf }, body: JSON.stringify(meldung(id, `B-${id}`)) }),
      { sql, ...opt },
    );

  const vorMeldungen = await anzahl("ditix_verkauf");
  pruefe((await senden(URL0, { "x-ditix-schluessel": K }, "h-1")).status === 200, "Schlüssel im Header");
  pruefe((await senden(URL0, { authorization: `Bearer ${K}` }, "h-2")).status === 200, "Schlüssel als Bearer");
  pruefe((await senden(`${URL0}?schluessel=${K}`, {}, "h-3")).status === 200, "Schlüssel in der Adresse");
  pruefe((await senden(`${URL0}/${K}`, {}, "h-4", { pfadSchluessel: K })).status === 200, "Schlüssel im Pfad");
  pruefe((await anzahl("ditix_verkauf")) === vorMeldungen + 4, "vier Meldungen abgelegt");
  // Ditix hat die Adresse klein geschrieben gespeichert (Fund vom 06.10.2026).
  pruefe((await senden(`${URL0}?schluessel=${K.toUpperCase()}`, {}, "g-1")).status === 200, "Schlüssel in Großbuchstaben gilt");
  pruefe((await senden(`${URL0}/${K.toUpperCase()}`, {}, "g-2", { pfadSchluessel: K.toUpperCase() })).status === 200, "Schlüssel im Pfad in Großbuchstaben gilt");
  pruefe((await senden(`${URL0}?schluessel=${K.slice(0, -1)}X`, {}, "g-3")).status === 401, "ein anderes Zeichen am Ende: 401");
  pruefe((await senden(`${URL0}?schluessel=${K}${K}`, {}, "g-4")).status === 401, "doppelt so lang: 401");
  // Die zwei Meldungen in Großbuchstaben kommen zu den vier oben hinzu.
  pruefe((await anzahl("ditix_verkauf")) === vorMeldungen + 6, "zwei weitere Meldungen abgelegt");

  const vorVersuchen = await anzahl("ditix_versuch");
  pruefe((await senden(URL0, {}, "n-1")).status === 401, "ohne Schlüssel: 401");
  pruefe((await senden(`${URL0}?schluessel=WRONGVALUE42`, {}, "n-2")).status === 401, "falscher Schlüssel in der Adresse: 401");
  pruefe((await senden(`${URL0}/WRONGVALUE42`, {}, "n-3", { pfadSchluessel: "WRONGVALUE42" })).status === 401, "falscher Schlüssel im Pfad: 401");
  pruefe((await senden(URL0, { "x-ditix-schluessel": `${K}x` }, "n-4")).status === 401, "Schlüssel mit anderer Länge: 401");
  pruefe((await anzahl("ditix_verkauf")) === vorMeldungen + 6, "abgewiesene Meldungen werden nicht als Meldung abgelegt");
  pruefe((await anzahl("ditix_versuch")) === vorVersuchen + 4, "die vier Versuche sind vermerkt");

  const get = await antwortAufPruefung(new Request(`${URL0}?schluessel=${K}`, { method: "GET", headers: { "user-agent": "Ditix-Pruefung/1" } }), { sql });
  pruefe(get.status === 200 && (await get.json()).ok === true, "GET: 200, ohne etwas abzulegen");
  const head = await antwortAufPruefung(new Request(URL0, { method: "HEAD" }), { sql });
  pruefe(head.status === 200, "HEAD: 200");
  pruefe((await anzahl("ditix_verkauf")) === vorMeldungen + 6, "Anklopfen legt keine Meldung ab");

  const gross = await nimmAn(
    new Request(URL0, { method: "POST", headers: { "x-ditix-schluessel": K }, body: "x".repeat(MAX_BYTES + 10) }),
    { sql },
  );
  pruefe(gross.status === 413, "über 1 MB: 413", gross.status);
  const grossOhne = await nimmAn(new Request(URL0, { method: "POST", body: "x".repeat(MAX_BYTES + 10) }), { sql });
  pruefe(grossOhne.status === 401, "über 1 MB ohne Schlüssel: 401, nicht 413");

  const versuchsText = (await pg.query<{ t: string }>("select string_agg(roh::text || kopf::text, ' ') as t from webhook_eingang where quelle = 'ditix_versuch'")).rows[0].t;
  pruefe(!versuchsText.includes(K) && !versuchsText.includes("WRONGVALUE42"), "in den Versuchen steht kein Schlüssel", versuchsText.slice(0, 200));
  pruefe(versuchsText.includes("Ditix-Pruefung/1"), "User-Agent des Anklopfens ist zu sehen");
  const pfadZeile = (await pg.query<{ roh: { pfadMitSchluessel: string; adressparameter: string[]; schluesselOrt: string | null } }>(
    "select roh from webhook_eingang where quelle = 'ditix_versuch' and event_type = 'falscher Schlüssel' and roh->>'schluesselOrt' = 'pfad'",
  )).rows[0]?.roh;
  pruefe(pfadZeile?.pfadMitSchluessel === "/api/ditix/verkauf/[schluessel]", "Schlüssel im Pfad wird nicht mit abgelegt", pfadZeile);

  const b2 = await pruefbericht(sql);
  pruefe(b2.versuche.gesamt === (await anzahl("ditix_versuch")), "Prüfbericht zählt die Versuche");
  pruefe(b2.versuche.letzte.some((v) => v.methode === "GET" && v.userAgent === "Ditix-Pruefung/1" && v.adressparameter.includes("schluessel")), "Prüfbericht zeigt GET mit Adressparametern", b2.versuche.letzte[0]);
  pruefe(b2.versuche.letzte.some((v) => v.grund === "kein Schlüssel" && v.hatSchluessel === false), "Prüfbericht unterscheidet fehlenden und falschen Schlüssel");
  pruefe(!JSON.stringify(b2).includes(K), "Prüfbericht enthält den Schlüssel nicht");
  pruefe(b2.insgesamt === vorMeldungen + 6, "Versuche zählen nicht als Meldungen", b2.insgesamt);

  // Die Obergrenze gilt, auch wenn jemand die Adresse mit Anfragen überschwemmt.
  for (let i = 0; i < MAX_VERSUCHE + 10; i++) await senden(URL0, {}, `flut-${i}`);
  pruefe((await anzahl("ditix_versuch")) === MAX_VERSUCHE, "höchstens 100 Versuche werden vermerkt", await anzahl("ditix_versuch"));
  delete process.env.DITIX_WEBHOOK_SCHLUESSEL;

  console.log(fehler === 0 ? "\nAlles in Ordnung." : `\n${fehler} Fehler.`);
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
