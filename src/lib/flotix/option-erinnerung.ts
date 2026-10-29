/**
 * Die blockierten Plätze laufen morgen aus. Ruf an.
 *
 * "ja auch zu der mail, dass die option ausläuft. er soll dann anrufen
 * und soll nochmal verlängern können" (Florian, 26.10.2026).
 *
 * Die Mail ist keine Verwaltungsmeldung, sie ist ein Verkaufsanlass. Wer
 * anruft und sagt "Ihre Plätze sind noch bis morgen reserviert, soll ich
 * sie festmachen?", hat einen Grund, der dem Kunden nützt, und keine
 * Floskel.
 *
 * Einmal je Option, am Tag davor. Läuft eine Option heute aus und wurde
 * gestern schon gemeldet, kommt nichts mehr: Zweimal dasselbe liest
 * niemand.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { optionen } from "./option";

const APP = process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de";

export function empfaenger(): string[] {
  return (process.env.ANGEBOT_MELDEN_AN ?? "kevin.steele@florianzimmer.com,info@florianzimmer.com")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
}

async function schonGemeldet(vorgang: string, bis: string): Promise<boolean> {
  const z = (await db()`
    select 1 from option_erinnerung where vorgang = ${vorgang} and gilt_bis = ${bis}::timestamptz limit 1
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export async function optionenErinnern(): Promise<{ gemeldet: number }> {
  let gemeldet = 0;

  for (const o of await optionen().catch(() => [])) {
    const bis = new Date(o.bis);
    const stunden = (bis.getTime() - Date.now()) / 3600000;
    // Das Fenster: zwischen zwölf und sechsunddreißig Stunden vorher.
    if (stunden < 12 || stunden > 36) continue;
    if (await schonGemeldet(o.vorgang, o.bis)) continue;

    await db()`
      insert into option_erinnerung (vorgang, gilt_bis) values (${o.vorgang}, ${o.bis}::timestamptz)
      on conflict do nothing
    `.catch(() => undefined);

    const [v] = (await db()`
      select v.id::text as id, coalesce(k.telefon, '') as telefon,
             coalesce(k.ansprechpartner, k.name, '') as person
        from vorgang v left join kunde k on k.id = v.kunde_id
       where v.nummer = ${o.vorgang}
    `.catch(() => [])) as Array<{ id: string; telefon: string; person: string }>;

    const abend = `${new Date(o.beginn).toLocaleDateString("de-DE")}, ${o.show}`;
    const text = [
      `Die blockierten Plätze für ${o.firma} laufen morgen aus.`,
      "",
      `Abend: ${abend}`,
      `Plätze: ${o.plaetze.length}`,
      `Reserviert bis: ${bis.toLocaleDateString("de-DE")}`,
      v?.person ? `Ansprechpartner: ${v.person}` : "",
      v?.telefon ? `Telefon: ${v.telefon}` : "Telefonnummer fehlt im Vorgang.",
      "",
      "Ruf an und sag genau das:",
      '"Ich wollte mich nur kurz melden: Ihre Plätze sind noch bis morgen für Sie reserviert.',
      'Soll ich sie festmachen?"',
      "",
      "Das ist kein Nachfassen, das ist ein Gefallen. Entweder er sagt zu, oder die Plätze gehen",
      "morgen zurück in den Verkauf, und beides ist besser als ein Abend, an dem niemand sitzt.",
      "",
      v?.id ? `Vorgang öffnen und verlängern: ${APP}/vorgaenge/${v.id}` : "",
    ]
      .filter((z) => z !== "")
      .join("\n");

    for (const an of empfaenger()) {
      await mailVerschicken({
        an,
        absender: postfachPersonal(),
        antwortAn: antwortPersonal(),
        betreff: `Blockierte Plätze laufen morgen aus: ${o.firma} (${o.plaetze.length} Plätze)`,
        text,
      }).catch((f) => console.error("[option] Erinnerung an", an, "fehlgeschlagen:", f));
    }

    gemeldet++;
  }

  return { gemeldet };
}
