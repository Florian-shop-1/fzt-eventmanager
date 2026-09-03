/**
 * Legt ein Beispielangebot an, um die Kundenansicht anzusehen, und
 * raeumt es auf Wunsch wieder weg. Nur zum Pruefen der Gestaltung.
 *
 *   npx tsx scripts/demo-angebot.ts          -> anlegen
 *   npx tsx scripts/demo-angebot.ts weg      -> loeschen
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { erzeugePositionen, einleitungstext, SCHLUSSTEXT, STANDARD_ANGEBOTSOPTIONEN } from "@/lib/angebot/erstellen";
import type { Vorgang } from "@/lib/domain/vorgang";

const KUNDE = "Musterfirma GmbH (Demo)";

async function weg() {
  // Erst die Vorgaenge, dann den Kunden: der Fremdschluessel laesst sich
  // sonst nicht loeschen.
  await db()`delete from vorgang where kunde_id in (select id from kunde where name = ${KUNDE})`;
  await db()`delete from kunde where name = ${KUNDE}`;
  console.log("Demo entfernt.");
}

async function anlegen() {
  await weg();
  const k = (await db()`
    insert into kunde (name, ansprechpartner, email) values (${KUNDE}, 'Frau Berger', 'demo@example.com')
    returning id` ) as Array<{ id: string }>;
  const s = (await db()`
    insert into vorstellung (datum, show) values ('2026-11-13', 'ULMFASSBAR')
    on conflict do nothing returning id`) as Array<{ id: string }>;
  const vorstellungId = s[0]?.id ?? ((await db()`
    select id from vorstellung where datum = '2026-11-13' and show = 'ULMFASSBAR' limit 1`) as Array<{ id: string }>)[0].id;

  const v = (await db()`
    insert into vorgang (nummer, status, kunde_id, vorstellung_id, quelle)
    values ('V-DEMO-001', 'angebot_erstellt', ${k[0].id}, ${vorstellungId}, 'Demo')
    returning id`) as Array<{ id: string }>;

  await db()`
    insert into gruppe (vorgang_id, name, personen, herkunft, menues)
    values (${v[0].id}, ${KUNDE}, 20, 'firma', '{"classic":20}'::jsonb)`;

  const fuerRechnung = {
    id: v[0].id, nummer: "V-DEMO-001", status: "angebot_erstellt",
    kunde: { id: k[0].id, name: KUNDE, email: "demo@example.com" },
    vorstellung: { datum: "2026-11-13", show: "ULMFASSBAR" },
    gruppen: [{ id: "g", name: KUNDE, personen: 20, herkunft: "firma" as const,
                sicherheit: "reserviert" as const, menues: { classic: 20 } }],
    angebote: [], zahlungen: [], notizen: [], aufgaben: [],
    quelle: "Demo", erstelltAm: new Date().toISOString(), geaendertAm: new Date().toISOString(),
  } as Vorgang;

  const positionen = erzeugePositionen(fuerRechnung, null, STANDARD_ANGEBOTSOPTIONEN);
  const token = randomBytes(24).toString("base64url");
  const a = (await db()`
    insert into angebot (vorgang_id, nummer, gueltig_bis, einleitung, schlusstext, tracking_token)
    values (${v[0].id}, 'AG-DEMO-0001', '2026-10-15', ${einleitungstext(fuerRechnung)}, ${SCHLUSSTEXT}, ${token})
    returning id`) as Array<{ id: string }>;

  let i = 0;
  const ids = new Map<string, string>();
  for (const p of positionen.filter((x) => !x.istAlternativeZu)) {
    const z = (await db()`
      insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge, einheit,
                            einzel_brutto_cent, ust, sortierung)
      values (${a[0].id}, ${p.artikelNummer}, ${p.bezeichnung}, ${p.beschreibung ?? null}, ${p.menge},
              ${p.einheit}, ${p.einzelBruttoCent}, ${p.ust}, ${i++})
      returning id`) as Array<{ id: string }>;
    ids.set(p.id, z[0].id);
  }
  for (const p of positionen.filter((x) => x.istAlternativeZu)) {
    await db()`
      insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge, einheit,
                            einzel_brutto_cent, ust, ist_alternative_zu, sortierung)
      values (${a[0].id}, ${p.artikelNummer}, ${p.bezeichnung}, ${p.beschreibung ?? null}, ${p.menge},
              ${p.einheit}, ${p.einzelBruttoCent}, ${p.ust}, ${ids.get(p.istAlternativeZu!) ?? null}, ${i++})`;
  }

  console.log("TOKEN " + token);
}

async function los() {
  if (process.argv[2] === "weg") await weg();
  else await anlegen();
}

los();
