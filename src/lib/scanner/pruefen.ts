/**
 * Prüfungen für gelesene Kartenfelder.
 *
 * Die E-Mail ist das Einzige, was wirklich stimmen muss: Ein falsch gelesener
 * Name ist ein Schönheitsfehler, eine falsch gelesene Adresse schickt den
 * Newsletter an einen Fremden. Deshalb wird sie mehrfach geprüft, und jede
 * Prüfung, die nicht eindeutig besteht, macht die Karte "unklar".
 */

import { resolveMx, resolve4 } from "node:dns/promises";

/** Häufige Anbieter. Liegt eine Domain knapp daneben, ist es fast immer ein Lesefehler. */
const BEKANNTE_DOMAINS = [
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de",
  "t-online.de", "yahoo.com", "yahoo.de", "icloud.com", "me.com", "mac.com",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.de", "live.com",
  "msn.com", "freenet.de", "aol.com", "aol.de", "posteo.de", "mail.de", "arcor.de",
  "online.de", "email.de", "bluewin.ch", "kabelbw.de", "vodafone.de", "florianzimmer.com",
];

export function emailNormalisieren(roh: string): string {
  return roh
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[„“"'`´,;]/g, "")
    .replace(/\(at\)|\[at\]/g, "@")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

const FORM = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9_-])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function emailFormOk(email: string): boolean {
  return FORM.test(email) && !email.includes("..");
}

function abstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** "gmial.com" -> "gmail.com". Null, wenn die Domain bekannt ist oder nichts Bekanntes nahe liegt. */
export function domainVorschlag(domain: string): string | null {
  if (BEKANNTE_DOMAINS.includes(domain)) return null;
  let beste: { d: string; a: number } | null = null;
  for (const d of BEKANNTE_DOMAINS) {
    const a = abstand(domain, d);
    if (a <= 2 && (!beste || a < beste.a)) beste = { d, a };
  }
  return beste?.d ?? null;
}

const domainCache = new Map<string, boolean>();

/**
 * Fragt per DNS-over-HTTPS nach, falls der Namensdienst des Servers nicht
 * antwortet. Übermittelt wird nur die Domain, nie die ganze Adresse.
 */
async function perHttps(domain: string, typ: "MX" | "A"): Promise<boolean | null> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${typ}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { Status: number; Answer?: unknown[] };
    if (d.Status === 3) return false;
    if (d.Status !== 0) return null;
    return (d.Answer ?? []).length > 0;
  } catch {
    return null;
  }
}

/**
 * Nimmt die Domain überhaupt Mails an? Ohne MX-Eintrag zählt notfalls eine
 * Adresse. Null heißt: Es ließ sich gerade nicht prüfen.
 */
export async function domainErreichbar(domain: string): Promise<boolean | null> {
  if (domainCache.has(domain)) return domainCache.get(domain)!;
  let gut: boolean | null = null;
  try {
    gut = (await resolveMx(domain)).length > 0 || null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") gut = false;
  }
  if (!gut) {
    try {
      if ((await resolve4(domain)).length > 0) gut = true;
    } catch {
      // bleibt, wie es ist
    }
  }
  if (gut === null) {
    gut = await perHttps(domain, "MX");
    if (gut === false || gut === null) gut = (await perHttps(domain, "A")) ?? gut;
  }
  if (gut !== null) domainCache.set(domain, gut);
  return gut;
}

export interface EmailBefund {
  email: string;
  ok: boolean;
  /** Was nicht passt, für die Anzeige. */
  maengel: string[];
  /** Eine korrigierte Adresse, wenn die Domain nach Tippfehler aussieht. */
  vorschlag: string | null;
}

export async function emailPruefen(roh: string | null | undefined): Promise<EmailBefund> {
  const email = emailNormalisieren(roh ?? "");
  const maengel: string[] = [];
  if (!email) return { email, ok: false, maengel: ["Keine E-Mail gelesen"], vorschlag: null };
  if (!emailFormOk(email)) {
    return { email, ok: false, maengel: ["Die Adresse hat keine gültige Form"], vorschlag: null };
  }
  const domain = email.split("@")[1];
  const nah = domainVorschlag(domain);
  let vorschlag: string | null = null;
  if (nah) {
    maengel.push(`„${domain}“ sieht nach Lesefehler für „${nah}“ aus`);
    vorschlag = `${email.split("@")[0]}@${nah}`;
  }
  const erreichbar = await domainErreichbar(domain);
  if (erreichbar === false) maengel.push(`Die Domain „${domain}“ nimmt keine Mails an`);
  if (erreichbar === null) maengel.push(`Die Domain „${domain}“ ließ sich gerade nicht prüfen`);
  return { email, ok: maengel.length === 0, maengel, vorschlag };
}

const KLEIN = new Set(["von", "van", "de", "der", "den", "zu", "zum", "zur", "di", "da", "del", "la", "le", "und"]);

/** "anna-lena MÜLLER" -> "Anna-Lena Müller", "von der heide" bleibt klein. */
export function nameSchoen(roh: string | null | undefined): string {
  const text = (roh ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text
    .split(" ")
    .map((wort, i) => {
      const klein = wort.toLocaleLowerCase("de-DE");
      if (i > 0 && KLEIN.has(klein)) return klein;
      return klein.replace(/(^|[-'’])(\p{L})/gu, (_, vor: string, b: string) => vor + b.toLocaleUpperCase("de-DE"));
    })
    .join(" ");
}

/** "0171 / 123 45 67" -> "+491711234567". Leer bleibt leer, Unsinn bleibt erkennbar. */
export function telefonSchoen(roh: string | null | undefined): { telefon: string; ok: boolean } {
  const text = (roh ?? "").trim();
  if (!text) return { telefon: "", ok: true };
  let ziffern = text.replace(/[^\d+]/g, "");
  if (ziffern.startsWith("00")) ziffern = "+" + ziffern.slice(2);
  else if (ziffern.startsWith("0")) ziffern = "+49" + ziffern.slice(1);
  else if (!ziffern.startsWith("+")) ziffern = "+49" + ziffern;
  const ok = /^\+\d{8,15}$/.test(ziffern);
  return { telefon: ziffern, ok };
}
