/**
 * Nachsehen, was im Magic-News-Verteiler wirklich auffällt.
 *
 *   npm run verteiler:pruefen
 *
 * Liest nur, ändert nichts. Die Frage dahinter: "bist du dir wirklich
 * sicher, dass knapp 10.000 E-Mail-Adressen Schrott sind?" (Florian,
 * 27.10.2026).
 *
 * Deshalb zählt dieses Skript die Vorschläge nicht einfach, sondern
 * schlüsselt auf, woher sie kommen, und sieht bei einer Stichprobe der
 * gesperrten Adressen in Brevo nach, ob dort wirklich eine Mail
 * abgeprallt ist oder ob sich jemand schlicht abgemeldet hat. Das sind
 * zwei völlig verschiedene Dinge.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { LISTE_MAGIC_NEWS } from "../src/lib/abbrecher/magic-news";
import { verdachtVon } from "../src/lib/verteiler/aufraeumen";

const BREVO = "https://api.brevo.com/v3";

function schluessel(): string {
  const k = process.env.BREVO_API_KEY?.trim();
  if (!k) throw new Error("BREVO_API_KEY fehlt.");
  return k;
}

async function hole<T>(pfad: string): Promise<T> {
  const r = await fetch(`${BREVO}${pfad}`, {
    headers: { "api-key": schluessel(), accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${pfad} -> ${r.status}`);
  return (await r.json()) as T;
}

interface Kontakt {
  email: string;
  emailBlacklisted?: boolean;
  attributes?: Record<string, unknown>;
}

async function main() {
  const liste = await hole<{ name: string; totalSubscribers: number; totalBlacklisted: number }>(
    `/contacts/lists/${LISTE_MAGIC_NEWS}`,
  );
  console.log(
    `Liste "${liste.name}": ${liste.totalSubscribers} Kontakte, davon ${liste.totalBlacklisted} in Brevo gesperrt.\n`,
  );

  const alle: Kontakt[] = [];
  for (let offset = 0; offset < 40000; offset += 500) {
    const d = await hole<{ contacts?: Kontakt[] }>(
      `/contacts/lists/${LISTE_MAGIC_NEWS}/contacts?limit=500&offset=${offset}`,
    );
    const teil = d.contacts ?? [];
    alle.push(...teil);
    if (teil.length < 500) break;
  }

  let gesperrt = 0;
  let maschine = 0;
  let postfach = 0;
  const beispieleMaschine: string[] = [];
  const beispielePostfach: string[] = [];

  for (const k of alle) {
    const v = verdachtVon(k);
    if (!v) continue;
    if (v.gesperrt) gesperrt++;
    else if (v.grund.includes("Automat")) {
      maschine++;
      if (beispieleMaschine.length < 8) beispieleMaschine.push(v.email);
    } else {
      postfach++;
      if (beispielePostfach.length < 8) beispielePostfach.push(v.email);
    }
  }

  console.log(`Kontakte in der Liste:        ${alle.length}`);
  console.log(`Vorgeschlagen insgesamt:      ${gesperrt + maschine + postfach}`);
  console.log(`  davon von Brevo gesperrt:   ${gesperrt}`);
  console.log(`  davon Automaten-Domains:    ${maschine}`);
  console.log(`  davon Sammelpostfächer:     ${postfach}`);
  if (beispieleMaschine.length) console.log(`\n  Automaten: ${beispieleMaschine.join(", ")}`);
  if (beispielePostfach.length) console.log(`  Postfächer: ${beispielePostfach.join(", ")}`);

  /*
    Die wichtige Frage: Was steckt hinter "gesperrt"?

    Brevo sperrt eine Adresse sowohl, wenn eine Mail hart abprallt, als
    auch, wenn sich jemand abmeldet. Das Erste ist eine kaputte Adresse,
    das Zweite ist ein Mensch, der nicht mehr angeschrieben werden will
    und dessen Widerspruch wir aufheben müssen.
  */
  const probe = alle.filter((k) => k.emailBlacklisted).slice(0, 30);
  let hart = 0;
  let abgemeldet = 0;
  let beschwerde = 0;
  let ohneSpur = 0;

  for (const k of probe) {
    try {
      const c = await hole<{ statistics?: Record<string, unknown> }>(
        `/contacts/${encodeURIComponent(k.email)}`,
      );
      const s = (c.statistics ?? {}) as {
        hardBounces?: unknown[];
        complaints?: unknown[];
        unsubscriptions?: { userUnsubscription?: unknown[]; adminUnsubscription?: unknown[] };
      };
      const hb = (s.hardBounces ?? []).length;
      const co = (s.complaints ?? []).length;
      const un =
        (s.unsubscriptions?.userUnsubscription ?? []).length +
        (s.unsubscriptions?.adminUnsubscription ?? []).length;
      if (hb > 0) hart++;
      else if (co > 0) beschwerde++;
      else if (un > 0) abgemeldet++;
      else ohneSpur++;
    } catch {
      ohneSpur++;
    }
  }

  console.log(`\nStichprobe von ${probe.length} gesperrten Adressen:`);
  console.log(`  Mail hart abgeprallt:       ${hart}`);
  console.log(`  selbst abgemeldet:          ${abgemeldet}`);
  console.log(`  beschwert:                  ${beschwerde}`);
  console.log(`  keine Spur in Brevo:        ${ohneSpur}`);
  if (abgemeldet > 0) {
    console.log(
      `\nAchtung: Abgemeldete sind keine kaputten Adressen. Sie müssen in der Sperrliste\n` +
        `bleiben, sonst bekommen sie beim nächsten Import wieder Post.`,
    );
  }
}

main().catch((f) => {
  console.error(f instanceof Error ? f.message : f);
  process.exit(1);
});
