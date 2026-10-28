"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { optionZurueck } from "@/lib/flotix/option-aus-angebot";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";

/**
 * Der Kunde nimmt sein Angebot an.
 *
 * Bewusst ohne Anmeldung: Der Zufallsschlüssel im Link ist der Nachweis.
 * Der eingegebene Name wird mitgespeichert, damit später nachvollziehbar
 * ist, wer zugesagt hat.
 */
export async function angebotAnnehmen(token: string, formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const zeilen = (await db()`
    select id, vorgang_id, angenommen_am from angebot where tracking_token = ${token}
  `) as Array<{ id: string; vorgang_id: string; angenommen_am: string | null }>;

  if (zeilen.length === 0) return;
  const a = zeilen[0];
  if (a.angenommen_am) return; // schon angenommen, nicht überschreiben

  await db()`
    update angebot set angenommen_am = now(), angenommen_von = ${name} where id = ${a.id}
  `;
  await db()`
    update vorgang set status = 'angenommen', geaendert_am = now()
     where id = ${a.vorgang_id}
       and status in ('angebot_erstellt', 'angebot_versendet', 'angebot_geoeffnet')
  `;
  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${a.vorgang_id}, 'Kunde', ${'Angebot online angenommen von ' + name})
  `;

  revalidatePath(`/ihr-angebot/${token}`);
  revalidatePath(`/vorgaenge/${a.vorgang_id}`);
  revalidatePath("/vorgaenge");
}

/** Der Kunde meldet zurück, dass es nicht passt. */
export async function angebotAblehnen(token: string, formData: FormData): Promise<void> {
  const grund = String(formData.get("grund") ?? "").trim();

  const zeilen = (await db()`
    select id, vorgang_id from angebot where tracking_token = ${token}
  `) as Array<{ id: string; vorgang_id: string }>;
  if (zeilen.length === 0) return;

  await db()`
    update angebot set abgelehnt_am = now(), ablehnungsgrund = ${grund || null}
     where id = ${zeilen[0].id}
  `;
  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${zeilen[0].vorgang_id}, 'Kunde',
            ${'Angebot online abgelehnt.' + (grund ? ' Grund: ' + grund : '')})
  `;

  /*
    Und die Plaetze gehen zurueck in den Verkauf.

    Abgelaufene Optionen loest FloTix von selbst. Hier kommt die
    Antwort frueher als der Ablauf, und das ist der haeufigere Fall:
    Ein Nein am zweiten Tag soll nicht fuenf Tage Plaetze kosten
    (Florian, 26.10.2026).
  */
  await optionZurueck(zeilen[0].vorgang_id);

  revalidatePath(`/ihr-angebot/${token}`);
  revalidatePath(`/vorgaenge/${zeilen[0].vorgang_id}`);
}

/**
 * Der Kunde haette gern etwas anders.
 *
 * "wie aendern wir ein angebot, wenn der kunde aederungswuensch hat?
 * soll er auch gleich was klicken koennen dafuer in der mail / uns ne
 * info geben" (Florian, 28.10.2026).
 *
 * Der Unterschied zur Absage ist wichtig: Hier wird nichts abgelehnt
 * und nichts freigegeben. Das Angebot bleibt offen, die blockierten
 * Plaetze bleiben blockiert, und das Buero bekommt sofort eine Mail.
 * Wer zehn Leute mehr mitbringen will, soll dafuer nicht auf "passt
 * nicht" klicken muessen.
 */
export async function aenderungWuenschen(token: string, formData: FormData): Promise<void> {
  const wunsch = String(formData.get("wunsch") ?? "").trim();
  if (!wunsch) return;

  const zeilen = (await db()`
    select a.id, a.vorgang_id, a.nummer, k.name as firma,
           coalesce(k.ansprechpartner, '') as person,
           coalesce(k.telefon, '') as telefon, k.email
      from angebot a
      join vorgang v on v.id = a.vorgang_id
      join kunde k   on k.id = v.kunde_id
     where a.tracking_token = ${token}
  `) as Array<Record<string, string>>;
  if (zeilen.length === 0) return;
  const a = zeilen[0];

  // Auf 2000 Zeichen gekuerzt: Mehr tippt niemand in ein Feld, und was
  // laenger ist, kommt ohnehin als Mail hinterher.
  const text = wunsch.slice(0, 2000);

  await db()`
    update angebot set aenderung_wunsch = ${text}, aenderung_am = now() where id = ${a.id}::uuid
  `;
  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${a.vorgang_id}, 'Kunde', ${"Aenderungswunsch zum Angebot " + a.nummer + ": " + text})
  `;

  /*
    Die Mail ans Buero. Scheitert sie, bleibt der Wunsch trotzdem in der
    Datenbank stehen: Im Vorgang ist er dann zu sehen, nur eben ohne
    Anstupser. Andersherum waere es schlimmer.
  */
  const app = process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de";
  const an = (process.env.ANGEBOT_MELDEN_AN ?? "kevin.steele@florianzimmer.com,info@florianzimmer.com")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));

  const mailtext = [
    `${a.firma} hat zum Angebot ${a.nummer} einen Aenderungswunsch geschickt:`,
    "",
    text,
    "",
    a.person ? `Ansprechpartner: ${a.person}` : "",
    a.telefon ? `Telefon: ${a.telefon}` : "Telefonnummer fehlt im Vorgang.",
    `E-Mail: ${a.email}`,
    "",
    "Das Angebot ist weiter offen, die Plaetze bleiben blockiert.",
    "",
    `Vorgang oeffnen und Angebot anpassen: ${app}/vorgaenge/${a.vorgang_id}`,
  ]
    .filter((z) => z !== "")
    .join(String.fromCharCode(10));

  for (const empfaenger of an) {
    await mailVerschicken({
      an: empfaenger,
      absender: postfachPersonal(),
      antwortAn: antwortPersonal(),
      betreff: `Aenderungswunsch: ${a.firma} zum Angebot ${a.nummer}`,
      text: mailtext,
    }).catch((f) => console.error("[angebot] Aenderungswunsch-Mail fehlgeschlagen:", f));
  }

  revalidatePath(`/ihr-angebot/${token}`);
  revalidatePath(`/vorgaenge/${a.vorgang_id}`);
}
