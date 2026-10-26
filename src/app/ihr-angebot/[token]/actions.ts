"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { optionZurueck } from "@/lib/flotix/option-aus-angebot";

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
