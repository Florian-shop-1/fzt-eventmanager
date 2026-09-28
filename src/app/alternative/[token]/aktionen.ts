"use server";

import { redirect } from "next/navigation";
import { absageLesen, alternativeWaehlen, gastPerToken } from "@/lib/absage/db";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumLang } from "@/lib/zeit";
import { alternativeGewaehltMelden } from "@/app/absagen/aktionen";

/** Der Gast wählt seinen Ausweichtermin. Ohne Anmeldung erreichbar. */
export async function terminWaehlen(f: FormData): Promise<void> {
  const token = String(f.get("token") ?? "");
  const ditixEventId = String(f.get("ditixEventId") ?? "");
  const terminName = String(f.get("terminName") ?? "");

  const gast = await gastPerToken(token);
  if (!gast) redirect(`/alternative/${token}?fehler=1`);

  const termin = await findeTermin(ditixEventId);
  const angezeigt = termin ? `${datumLang(termin.datum)}, ${termin.uhrzeit} Uhr – ${termin.name}` : terminName;

  const gewaehlt = await alternativeWaehlen(token, ditixEventId, angezeigt);
  if (gewaehlt) {
    const absage = await absageLesen(gewaehlt.absageId);
    if (absage) {
      await alternativeGewaehltMelden({
        gastName: gewaehlt.name,
        gastEmail: gewaehlt.email,
        plaetze: gewaehlt.plaetze,
        alteKategorie: gewaehlt.alteKategorie,
        kompensationArt: gewaehlt.kompensationArt,
        neueKategorie: gewaehlt.neueKategorie,
        abgesagteShow: absage.show,
        abgesagtesDatum: datumLang(absage.datum),
        terminName: angezeigt,
      }).catch(() => undefined);
    }
  }

  redirect(`/alternative/${token}`);
}
