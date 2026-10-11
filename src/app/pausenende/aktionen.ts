"use server";

/**
 * Der Knopf "Pause ist zu Ende". Nur Florian.
 *
 * Er ist die Uhr für alles, was danach kommt: Das Programm lernt daraus,
 * wann die Pause üblicherweise endet, und fünf Minuten später fragt es
 * die Foyerkräfte, die noch eingestempelt sind.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { heuteBerlin, pausenendeMerken } from "@/lib/foyer/pause";
import { termineDesTages } from "@/lib/ditix/spielplan";

export async function pauseIstVorbei(): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (b.rolle !== "chef") redirect("/");

  const datum = heuteBerlin();

  /*
    Die Show des Abends, um den Abstand zum Beginn zu rechnen.
    Laufen zwei, zählt die spätere: Die Pause gehört zu der, die
    gerade läuft.
  */
  const termine = await termineDesTages(datum).catch(() => []);
  const jetzt = Date.now();
  const laufend = [...termine]
    .filter((t) => t.beginn.getTime() <= jetzt)
    .sort((a, b) => b.beginn.getTime() - a.beginn.getTime())[0];

  await pausenendeMerken({
    datum,
    ditixEventId: laufend?.ditixEventId ?? "",
    von: b.name,
    nachBeginnMin: laufend ? Math.round((jetzt - laufend.beginn.getTime()) / 60000) : null,
  });

  revalidatePath("/");
  redirect("/?meldung=" + encodeURIComponent("Pause-Ende notiert. Das Foyer wird gleich erinnert."));
}
