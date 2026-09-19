"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { rechnungErstellenUndSenden } from "@/lib/wein/rechnung";
import { mailVerschicken } from "@/lib/mail/versand";
import {
  artikelListe,
  bestellungAnlegen,
  einstellungLesen,
  stornieren,
  uebergeben,
  zugang,
} from "@/lib/wein/db";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

function zurueck(meldung: string, anker = ""): never {
  revalidatePath("/bestellungen");
  revalidatePath("/", "layout");
  redirect(`/bestellungen?meldung=${encodeURIComponent(meldung)}${anker}`);
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Die Gastro bestellt. Florian, Kevin und Sarah bekommen eine Mail. */
export async function bestellen(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.bestellen) throw new Error("Nicht erlaubt.");

  const artikel = await artikelListe();
  const mengen = artikel
    .map((a) => ({ artikel: a, menge: Math.round(Number(text(f, `menge:${a.id}`, 5)) || 0) }))
    .filter((m) => m.menge > 0);
  if (mengen.length === 0) zurueck("Bitte bei mindestens einem Wein eine Menge eintragen.");
  if (mengen.some((m) => m.menge > 500)) zurueck("Höchstens 500 Flaschen je Sorte.");

  const notiz = text(f, "notiz");
  await bestellungAnlegen(b, mengen, notiz);

  // Bescheid geben. Scheitert die Mail, ist die Bestellung trotzdem da und
  // steht im Eventmanager in der gelben Leiste.
  const e = await einstellungLesen();
  if (e.meldenAn.length) {
    const an = (await db()`select email, name from benutzer where aktiv and id = any(${e.meldenAn}::uuid[])`) as Array<{
      email: string;
      name: string;
    }>;
    const zeilen = mengen.map((m) => `${m.menge} × ${m.artikel.name}`);
    const betreff = `Weinbestellung von ${b.name}: ${zeilen.join(", ")}`;
    const klartext =
      `${b.name} möchte Magicuvée haben:\n\n${zeilen.map((z) => `- ${z}`).join("\n")}` +
      `${notiz ? `\n\nNotiz: ${notiz}` : ""}\n\nWenn der Wein übergeben ist, bitte abhaken: ${APP}/bestellungen`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1b18">
<p><strong>${h(b.name)}</strong> möchte Magicuvée haben:</p>
<ul>${zeilen.map((z) => `<li>${h(z)}</li>`).join("")}</ul>
${notiz ? `<p>Notiz: ${h(notiz)}</p>` : ""}
<p><a href="${APP}/bestellungen" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">Bestellung ansehen und abhaken</a></p></div>`;
    for (const p of an) {
      try {
        await mailVerschicken({ an: p.email, betreff, text: klartext, html });
      } catch (fehler) {
        console.error("[wein] Mail an", p.email, "fehlgeschlagen:", fehler);
      }
    }
  }
  zurueck(`Danke! Die Bestellung ist raus (${mengen.map((m) => `${m.menge} × ${m.artikel.name}`).join(", ")}).`);
}

export async function alsUebergebenMarkieren(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.uebergeben) throw new Error("Nicht erlaubt.");
  const ok = await uebergeben(text(f, "id", 40), b.name);
  zurueck(ok ? "Als übergeben gespeichert. Das kommt auf die Monatsrechnung." : "Diese Bestellung war schon erledigt.");
}

export async function bestellungStornieren(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.sehen) throw new Error("Nicht erlaubt.");
  // Die Gastro darf nur ihre eigenen offenen Bestellungen zurückziehen.
  const ok = await stornieren(text(f, "id", 40), b.name, z.uebergeben ? undefined : b.id);
  zurueck(ok ? "Bestellung zurückgezogen." : "Das ging nicht mehr, die Bestellung ist schon erledigt.");
}

// ---------------------------------------------------------------------------
// Nur Florian

async function nurInhaber() {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.verwalten) throw new Error("Nur für Florian.");
  return b;
}

/** Preise in Euro, "6,98" oder "6.98". */
function cent(roh: string): number {
  const s = roh.replace(/[€\s]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

export async function preiseSpeichern(f: FormData): Promise<void> {
  await nurInhaber();
  for (const a of await artikelListe(false)) {
    const vk = cent(text(f, `vk:${a.id}`, 20));
    const ek = cent(text(f, `ek:${a.id}`, 20));
    if (Number.isNaN(vk) || Number.isNaN(ek)) zurueck(`Der Preis bei ${a.name} ist keine Zahl.`, "#einrichtung");
    const aktiv = Boolean(f.get(`aktiv:${a.id}`));
    await db()`update wein_artikel set vk_cent = ${vk}, ek_cent = ${ek}, aktiv = ${aktiv} where id = ${a.id}`;
  }
  zurueck("Preise gespeichert. Sie gelten für neue Bestellungen.", "#einrichtung");
}

export async function meldenSpeichern(f: FormData): Promise<void> {
  await nurInhaber();
  const ids = f.getAll("melden").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  await db()`update wein_einstellung set melden_an = ${ids}::uuid[] where id = 1`;
  zurueck("Gespeichert.", "#einrichtung");
}

export async function freischalten(f: FormData): Promise<void> {
  await nurInhaber();
  const an = f.get("an") === "1";
  await db()`update wein_einstellung set freigegeben = ${an} where id = 1`;
  zurueck(an ? "Freigeschaltet. Die Gastro sieht jetzt „Bestellungen“." : "Wieder nur für dich sichtbar.", "#einrichtung");
}


export async function rechnungJetzt(f: FormData): Promise<void> {
  const b = await nurInhaber();
  const monat = text(f, "monat", 7);
  if (!/^\d{4}-\d{2}$/.test(monat)) zurueck("Unbekannter Monat.");
  // Erst das Ergebnis, dann umleiten: redirect() darf nicht in einem try stehen.
  let meldung: string;
  try {
    const r = await rechnungErstellenUndSenden(monat, b.name);
    meldung = `Rechnung ${r.nummer ?? ""} ist erstellt und an ${r.versendetAn.join(", ")} verschickt.`;
  } catch (fehler) {
    meldung = `Die Rechnung ging nicht: ${fehler instanceof Error ? fehler.message : String(fehler)}`;
  }
  zurueck(meldung, "#abrechnung");
}

export async function rechnungEinstellungSpeichern(f: FormData): Promise<void> {
  await nurInhaber();
  const empfaenger = {
    name: text(f, "name", 120),
    strasse: text(f, "strasse", 120),
    plz: text(f, "plz", 10),
    ort: text(f, "ort", 80),
  };
  const an = text(f, "an", 500)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s));
  const ziel = Math.max(0, Math.min(60, Math.round(Number(text(f, "ziel", 3)) || 14)));
  await db()`
    update wein_einstellung set rechnung_empfaenger = ${JSON.stringify(empfaenger)}::jsonb, rechnung_an = ${an},
           rechnung_automatisch = ${Boolean(f.get("automatisch"))}, zahlungsziel_tage = ${ziel}
     where id = 1
  `;
  zurueck("Gespeichert.", "#einrichtung");
}
