/**
 * Ist diese Person heute überhaupt eingeteilt?
 *
 * Am 05.10.2026 stand im System ein Einstempeln an einem Tag, an dem das
 * Theater geschlossen hatte und niemand eingeteilt war. Aufgefallen ist
 * es nur, weil Florian zufällig hingesehen hat.
 *
 * Deshalb fragt die Stempeluhr seit dem 06.10.2026 nach dem Grund, wenn
 * jemand außerhalb seines Dienstes stempelt. Verboten ist es nicht:
 * Reparaturen, Proben, Aufbau und Büroarbeit stehen in keinem
 * Dienstplan, und wer dafür da ist, soll stempeln können. Aber es soll
 * dabeistehen, warum.
 *
 * Zwei Quellen, dieselben wie beim Abhaken der Checklisten: der
 * Dienstplan des Showteams und der Foyer-Dienstplan.
 */

import { db } from "@/lib/db/client";

export async function eingeteiltAm(benutzerId: string, datum: string): Promise<boolean> {
  try {
    const z = (await db()`
      select 1
        from dienst_einsatz
       where benutzer_id = ${benutzerId}::uuid and datum = ${datum}::date
       union all
      select 1
        from foyer_dienst
       where benutzer_id = ${benutzerId}::uuid and datum = ${datum}::date
       limit 1
    `) as unknown[];
    return z.length > 0;
  } catch (f) {
    /*
      Im Zweifel nicht nachfragen.

      Eine Störung in der Datenbank darf nicht dazu führen, dass alle
      beim Einstempeln nach einem Grund gefragt werden. Dann lieber keine
      Frage als eine falsche.
    */
    console.error("[stempel] Dienst nicht lesbar:", f);
    return true;
  }
}

/**
 * Der Grund, warum jemand außer der Reihe gestempelt hat.
 *
 * Er landet an dem Kommen-Stempel, zu dem er gehört, damit er im Büro
 * neben der Zeit steht und nicht in einer eigenen Liste, die niemand
 * aufmacht.
 */
export async function grundNachtragen(o: {
  stempelId: string;
  benutzerId: string;
  text: string;
}): Promise<boolean> {
  const z = (await db()`
    update stempel
       set notiz = case when notiz = '' then ${"Nicht eingeteilt: " + o.text}
                        else notiz || ' · ' || ${"Nicht eingeteilt: " + o.text} end
     where id = ${o.stempelId}::uuid
       and benutzer_id = ${o.benutzerId}::uuid
       and art = 'kommen'
       and zeitpunkt > now() - interval '12 hours'
    returning id
  `) as unknown[];
  return z.length > 0;
}
