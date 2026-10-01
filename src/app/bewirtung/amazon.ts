"use server";

/**
 * Amazon Business von Hand anstoßen: verbinden prüfen, abgleichen.
 *
 * Der Abgleich läuft auch morgens von selbst mit; diese beiden Knöpfe
 * sind für den Fall, dass jemand nicht bis morgen warten will
 * (Florian, 01.10.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { amazonEingerichtet, amazonProbe } from "@/lib/amazon/api";
import { amazonLauf } from "@/lib/amazon/sync";

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Belege sehen nur Werner und Florian.");
  return b!;
}

function zurueck(meldung: string): never {
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?meldung=${encodeURIComponent(meldung)}`);
}

export async function amazonVerbindungPruefen(): Promise<void> {
  await zugang();
  const eingerichtet = amazonEingerichtet();
  if (!eingerichtet.bereit) {
    zurueck(
      "Amazon Business ist noch nicht verbunden. Bei Vercel fehlen diese Werte: " +
        `${eingerichtet.fehlt.join(", ")}. Sie kommen aus der Amazon-Business-Entwicklerkonsole.`,
    );
  }
  const probe = await amazonProbe();
  zurueck(probe.gut ? probe.meldung : `Die Verbindung steht nicht: ${probe.meldung}`);
}

export async function amazonAbgleichen(): Promise<void> {
  await zugang();
  if (!amazonEingerichtet().bereit) {
    zurueck("Amazon Business ist noch nicht verbunden, es wurde nichts geholt.");
  }

  const lauf = await amazonLauf();
  const teile = [
    `${lauf.gesehen} Umsätze bei Amazon angesehen`,
    `${lauf.gemerkt} neue Rechnungen gefunden`,
    `${lauf.importiert} als Beleg angelegt`,
    lauf.wartenAufPdf > 0 ? `${lauf.wartenAufPdf} warten noch auf ihr PDF bei Amazon` : "",
    lauf.fehler.length > 0 ? `Fehler: ${lauf.fehler.slice(0, 3).join(" | ")}` : "",
  ].filter(Boolean);
  zurueck(`${teile.join(", ")}.`);
}
