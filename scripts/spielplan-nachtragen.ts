/**
 * Traegt vergangene Vorstellungen ins Spielplan-Gedaechtnis nach.
 * Aufruf: npm run spielplan:nachtragen
 *
 * Der Ticketshop nennt nur Vorstellungen, die noch im Verkauf sind. Alles,
 * was vor dem 03.10.2026 lief, hat er also nie an das Gedaechtnis
 * weitergegeben (siehe lib/ditix/gedaechtnis.ts). Diese Termine stehen
 * aber noch in unseren eigenen Tabellen: in den Shop-Buchungen mit Datum,
 * Uhrzeit und Showname, im Dienstplan mit Datum und Uhrzeit.
 *
 * Das Skript darf mehrfach laufen. Was der Shop selbst gemeldet hat, wird
 * nicht angetastet.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { db } from "../src/lib/db/client";

async function main() {
  // Aus den Shop-Buchungen: dort steht auch der Name der Show.
  const ausBuchungen = (await db()`
    insert into spielplan_termin (event_id, name, beginn, ort, verkauf, art, gesehen_am)
    select b.ditix_event_id,
           max(b.show),
           min((b.datum::date + b.uhrzeit::time) at time zone 'Europe/Berlin'),
           'Florian Zimmer Theater', 'CLOSED', 'nachgetragen', now()
      from shop_buchung b
     where b.ditix_event_id is not null and b.datum is not null and b.uhrzeit <> ''
     group by b.ditix_event_id
    on conflict (event_id) do nothing
    returning event_id
  `) as Array<{ event_id: string }>;

  // Aus dem Dienstplan: Abende ohne Shop-Buchung, etwa Firmenabende.
  const ausDienstplan = (await db()`
    insert into spielplan_termin (event_id, name, beginn, ort, verkauf, art, gesehen_am)
    select e.ditix_event_id, '',
           min((e.datum::date + e.uhrzeit::time) at time zone 'Europe/Berlin'),
           'Florian Zimmer Theater', 'CLOSED', 'nachgetragen', now()
      from dienst_einsatz e
     where e.ditix_event_id is not null and e.datum is not null and e.uhrzeit <> ''
     group by e.ditix_event_id
    on conflict (event_id) do nothing
    returning event_id
  `) as Array<{ event_id: string }>;

  // Namen ergaenzen, wo wir sie nachtraeglich finden.
  await db()`
    update spielplan_termin t
       set name = q.show
      from (select ditix_event_id, max(show) as show from shop_buchung
             where show <> '' group by ditix_event_id) q
     where t.event_id = q.ditix_event_id and t.name = ''
  `;

  const stand = (await db()`
    select count(*)::int as n, min(beginn) as von, max(beginn) as bis from spielplan_termin
  `) as Array<{ n: number; von: string; bis: string }>;

  console.log(`Aus Shop-Buchungen nachgetragen: ${ausBuchungen.length}`);
  console.log(`Aus dem Dienstplan nachgetragen: ${ausDienstplan.length}`);
  console.log(
    `Im Gedaechtnis: ${stand[0]?.n ?? 0} Termine, ` +
      `von ${stand[0]?.von ?? "-"} bis ${stand[0]?.bis ?? "-"}`,
  );
}

main().catch((f) => {
  console.error(f);
  process.exit(1);
});
