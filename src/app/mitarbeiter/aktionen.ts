"use server";

/**
 * Was sich von der Mitarbeiterliste aus auslösen lässt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { anwaltspostHolen } from "@/lib/personal/anwaltspost";

/**
 * Die Post der Arbeitsrechtlerin holen, auf Knopfdruck.
 *
 * Nachts passiert das von selbst. Der Knopf ist für den Fall, dass
 * gerade etwas angekommen ist und nicht bis morgen warten soll
 * (Florian, 15.10.2026).
 */
export async function anwaltspostJetztHolen(): Promise<void> {
  if (!darfVertraege(await angemeldeterBenutzer())) redirect("/");

  let meldung: string;
  try {
    const lauf = await anwaltspostHolen();
    meldung =
      lauf.gesehen === 0
        ? "Keine neue Post von der Kanzlei."
        : `${lauf.gesehen} neue Mails: ${lauf.abgelegt} abgelegt`
          + (lauf.ohneZuordnung > 0 ? `, ${lauf.ohneZuordnung} ohne Zuordnung` : "")
          + (lauf.fehler > 0 ? `, ${lauf.fehler} mit Fehler` : "")
          + ".";
    if (lauf.meldungen.length > 0) meldung += ` ${lauf.meldungen.join(" ")}`;
  } catch (e) {
    meldung = `Das ging schief: ${e instanceof Error ? e.message : "unbekannter Fehler"}`;
  }

  revalidatePath("/mitarbeiter");
  redirect(`/mitarbeiter?meldung=${encodeURIComponent(meldung)}`);
}

/**
 * Die alten Personalbögen aus dem Postfach zurückholen.
 *
 * "der Eventmanager ist doch connected, warum kannst du es dir nicht
 * darüber holen?" (Florian, 15.10.2026). Genau so: Das Programm liest
 * die alten Mails ans Lohnbüro und legt die Angaben ab, wo sie fehlen.
 */
export async function boegenJetztHolen(): Promise<void> {
  if (!darfVertraege(await angemeldeterBenutzer())) redirect("/");

  let meldung: string;
  try {
    const { boegenAusPostfach } = await import("@/lib/personal/bogen-post");
    const lauf = await boegenAusPostfach();
    meldung =
      lauf.gesehen === 0
        ? "Im Postfach stand keine Bogenmail."
        : `${lauf.gesehen} Mails angesehen, ${lauf.uebernommen} Bögen übernommen`
          + (lauf.schonDa > 0 ? `, ${lauf.schonDa} lagen schon vor` : "")
          + (lauf.ohneZuordnung > 0 ? `, ${lauf.ohneZuordnung} ohne Zuordnung` : "")
          + ".";
    if (lauf.meldungen.length > 0) meldung += ` ${lauf.meldungen.slice(0, 8).join(" ")}`;
  } catch (e) {
    meldung = `Das ging schief: ${e instanceof Error ? e.message : "unbekannter Fehler"}`;
  }

  revalidatePath("/mitarbeiter");
  redirect(`/mitarbeiter?meldung=${encodeURIComponent(meldung)}`);
}
