"use server";

/**
 * Arbeitsverträge anlegen, freigeben, zurückziehen.
 *
 * Der Weg ist bewusst zweistufig: Erst entsteht ein Entwurf, den nur das
 * Büro sieht, und erst mit der Freigabe erscheint er beim Mitarbeiter
 * (Florian, 30.09.2026: "dass ich den vorher auch nochmal sehe, bevor er
 * ihm angeboten wird zur unterschrift").
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import {
  freigabeZurueck,
  vertragAnlegen,
  vertragFreigeben,
  vertragLesen,
  vertragZurueckziehen,
} from "@/lib/db/arbeitsvertrag";
import { mailVerschicken } from "@/lib/mail/versand";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
import { SPIELZEIT_ENDE, type Vertragsart } from "@/lib/personal/arbeitsvertrag";
import { angabenVon } from "@/lib/db/personal";

const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) throw new Error("Arbeitsverträge sehen nur Werner, Kevin und Florian.");
  return b!;
}

function zurueck(meldung: string, ziel = "/vertraege"): never {
  revalidatePath("/vertraege");
  revalidatePath("/vertrag");
  redirect(`${ziel}?meldung=${encodeURIComponent(meldung)}`);
}

/** Euro-Text wie "14,50" in Cent. */
function cent(wert: string): number {
  const n = Number(wert.replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function vertragErstellen(f: FormData): Promise<void> {
  const b = await zugang();

  const benutzerId = text(f, "benutzerId", 40);
  const art = (text(f, "art", 20) === "teilzeit" ? "teilzeit" : "kurzfristig") as Vertragsart;
  const beginn = text(f, "beginn", 10);
  const ende = text(f, "ende", 10) || SPIELZEIT_ENDE;

  if (!benutzerId) zurueck("Bitte eine Person wählen.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginn)) zurueck("Bitte den Vertragsbeginn eintragen.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ende)) zurueck("Bitte das Vertragsende eintragen.");
  if (ende <= beginn) zurueck("Das Vertragsende muss nach dem Beginn liegen.");

  /*
    Die Personalien kommen aus dem Personalbogen.

    Abgetippt wird nichts: Was der Mitarbeiter dort eingetragen hat, ist
    die verlaesslichste Quelle, und ein Tippfehler in der Anschrift steht
    sonst in einem unterschriebenen Vertrag (Florian, 30.09.2026).
  */
  const angaben = await angabenVon(benutzerId).catch(() => null);
  const person = (await db()`select name from benutzer where id = ${benutzerId}`) as Array<{ name: string }>;
  if (!person[0]) zurueck("Diese Person gibt es nicht.");

  /*
    Anschrift und Geburtsdatum stehen in der Geheimhaltung: Dort hat sie
    die Person selbst eingetragen. Fehlen sie, traegt das Buero sie hier
    ein; leer bleibt keine Luecke, sie faellt im Entwurf sofort auf.
  */
  const name = text(f, "name", 120) || angaben?.name || person[0].name;
  const anschrift =
    text(f, "anschrift", 200) ||
    (angaben ? [angaben.strasse, [angaben.plz, angaben.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
  const geburtsdatum = text(f, "geburtsdatum", 10) || angaben?.geburtsdatum || "";

  const personalien: Record<string, string> = { name, anschrift, geburtsdatum };

  const teilzeit = art === "teilzeit";
  const monatsstunden = Number(text(f, "monatsstunden", 8).replace(",", "."));
  const stundenlohnCent = cent(text(f, "stundenlohn", 12));
  const festgehaltCent = cent(text(f, "festgehalt", 12));

  if (teilzeit && !(monatsstunden > 0)) zurueck("Bitte die Monatsstunden eintragen.");
  if (teilzeit && !(festgehaltCent > 0)) zurueck("Bitte das monatliche Bruttogehalt eintragen.");
  if (!teilzeit && !(stundenlohnCent > 0)) zurueck("Bitte den Stundenlohn eintragen.");

  const id = await vertragAnlegen({
    benutzerId,
    art,
    taetigkeit: text(f, "taetigkeit", 120),
    aufgaben: text(f, "aufgaben", 600),
    position: text(f, "position", 60),
    beginn,
    ende,
    stundenlohnCent: teilzeit ? null : stundenlohnCent,
    monatsstunden: teilzeit ? monatsstunden : null,
    // Vier Arbeitstage die Woche sind der Regelfall im Haus, also gut vier
    // Wochen im Monat. Die Wochenstunden folgen daraus.
    wochenstunden: teilzeit ? Math.round((monatsstunden / 4.33) * 100) / 100 : null,
    festgehaltCent: teilzeit ? festgehaltCent : null,
    probezeitMonate: teilzeit ? Math.round(Number(text(f, "probezeit", 3)) || 0) || null : null,
    personalien,
    angelegtVon: b.name,
  }).catch((fehler) => {
    const m = fehler instanceof Error ? fehler.message : "";
    if (m.includes("arbeitsvertrag_einer_je_person")) {
      zurueck("Für diese Person gibt es schon einen Vertrag.");
    }
    throw fehler;
  });

  zurueck("Entwurf angelegt. Sieh ihn dir an, bevor du ihn freigibst.", `/vertraege/${id}`);
}

export async function vertragFreigabe(f: FormData): Promise<void> {
  const b = await zugang();
  const id = text(f, "id", 40);
  await vertragFreigeben(id, b.name);

  /*
    Der Mitarbeiter bekommt Bescheid.

    Im Programm steht der Hinweisbalken, aber darauf allein kann man sich
    nicht verlassen: Wer gerade keinen Dienst hat, oeffnet den
    Eventmanager tagelang nicht (Florian, 01.10.2026). Scheitert die Mail,
    bleibt die Freigabe trotzdem bestehen; der Vertrag liegt ja da.
  */
  const v = await vertragLesen(id);
  let hinweis = "";
  if (v?.email) {
    const freude = v.erhoehung
      ? "Dein Stundensatz liegt darin höher als bisher. Wir freuen uns, dass du dabei bist."
      : "";
    const text = [
      `Hallo ${v.personalien?.name?.split(" ")[0] ?? v.name},`,
      "",
      "dein Arbeitsvertrag liegt im Eventmanager für dich bereit.",
      freude,
      "",
      "Lies ihn in Ruhe durch. Unterschreiben kannst du direkt am Bildschirm, mit dem Finger oder",
      "der Maus. Danach kannst du ihn jederzeit wieder aufrufen und ausdrucken.",
      "",
      `${APP}/vertrag`,
      "",
      "Wenn etwas nicht stimmt oder du Fragen hast, melde dich einfach bei uns, bevor du",
      "unterschreibst.",
      "",
      "Herzliche Grüße",
      "Florian Zimmer Theater",
    ]
      .filter((z) => z !== "")
      .join(String.fromCharCode(10));

    try {
      await mailVerschicken({
        an: v.email,
        betreff: "Dein Arbeitsvertrag liegt zur Unterschrift bereit",
        text,
        html: text
          .split(String.fromCharCode(10))
          .map((z) =>
            z.startsWith("http")
              ? `<p style="margin:0 0 12px"><a href="${z}" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">Vertrag ansehen und unterschreiben</a></p>`
              : `<p style="margin:0 0 10px">${z}</p>`,
          )
          .join(""),
      });
      hinweis = ` ${v.name} hat eine Mail an ${v.email} bekommen.`;
    } catch (fehler) {
      console.error("[vertrag] Mail nicht zugestellt:", fehler);
      hinweis = " Die Mail ließ sich nicht verschicken, der Vertrag liegt aber bereit.";
    }
  }

  zurueck(`Freigegeben. Der Mitarbeiter sieht den Vertrag jetzt und kann unterschreiben.${hinweis}`, `/vertraege/${id}`);
}

export async function vertragFreigabeZurueck(f: FormData): Promise<void> {
  await zugang();
  const id = text(f, "id", 40);
  await freigabeZurueck(id);
  zurueck("Die Freigabe ist zurückgenommen. Der Vertrag ist wieder nur für euch sichtbar.", `/vertraege/${id}`);
}

export async function vertragWeg(f: FormData): Promise<void> {
  const b = await zugang();
  await vertragZurueckziehen(text(f, "id", 40), b.name);
  zurueck("Der Vertrag ist zurückgezogen. Du kannst jetzt einen neuen anlegen.");
}
