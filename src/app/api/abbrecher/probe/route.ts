import { NextResponse } from "next/server";
import { mailVerschicken } from "@/lib/mail/versand";
import { angebotMail, frageMail } from "@/lib/abbrecher/mails";
import { ANGEBOT_STUNDEN } from "@/lib/abbrecher/lauf";
import type { Abbrecher } from "@/lib/abbrecher/db";
import type { GeschenkArt } from "@/lib/abbrecher/geschenk";

/**
 * Probemails für die Abbrecher-Strecke, an Florian.
 *
 * Alle vier Fassungen auf einmal: die Frage und die drei Geschenke. Mit
 * einem erfundenen Warenkorb, damit kein echter Gast berührt wird, und
 * mit einem Schlüssel, der nirgends im Programm zu einer echten Buchung
 * gehört: Ein Klick auf die Knöpfe speichert deshalb nichts.
 *
 * Nur mit dem CRON_SECRET aufrufbar, wie die nächtlichen Läufe.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AN = "info@florianzimmer.com";

const BEISPIEL: Abbrecher = {
  id: "probe",
  cartId: null,
  ditixEventId: "",
  datum: "2026-10-18",
  uhrzeit: "20:00",
  show: "ULMFASSBAR",
  name: "Florian Zimmer",
  email: AN,
  telefon: "",
  plaetze: 4,
  gesamtCent: 31600,
  // Ein Schlüssel, den es in der Datenbank nicht gibt.
  zugangToken: "probe0000probe0000probe0000probe",
  werbeOk: true,
  eingegangenAm: new Date(Date.now() - 3 * 86400000).toISOString(),
  frageAm: null,
  angebotAm: null,
  abbruchGrund: null,
  abbruchText: null,
  posten: [
    { name: "Kat. 2", anzahl: 4, gruppe: "sitzplatz" },
    { name: "4-Gang-Menü CLASSIC inkl. Welcome Drink", anzahl: 2, gruppe: "menue" },
  ],
  spaeterGekauft: false,
  status: "neu",
  bearbeiterId: null,
  bearbeiter: null,
  vertriebNotiz: "",
  vertriebAm: null,
  wiedervorlage: null,
};

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const bis = new Date(Date.now() + ANGEBOT_STUNDEN * 3600000);
  const arten: GeschenkArt[] = ["baendchen", "glas", "zauberstab"];
  const raus: string[] = [];
  const fehler: string[] = [];

  const schicken = async (was: string, m: { betreff: string; text: string; html: string }) => {
    try {
      await mailVerschicken({
        an: AN,
        betreff: `[Probe] ${m.betreff}`,
        text: m.text,
        html: m.html,
        ueberBrevo: true,
        schlagwort: "probe",
      });
      raus.push(was);
    } catch (f) {
      fehler.push(`${was}: ${f instanceof Error ? f.message : f}`);
    }
  };

  await schicken("frage", frageMail(BEISPIEL));
  for (const art of arten) await schicken(art, angebotMail(BEISPIEL, art, bis));

  return NextResponse.json({ ok: fehler.length === 0, verschickt: raus, fehler });
}
