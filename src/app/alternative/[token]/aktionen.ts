"use server";

import { redirect } from "next/navigation";
import { absageLesen, alternativeWaehlen, gastPerToken, rueckrufBitten } from "@/lib/absage/db";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumLang } from "@/lib/zeit";
import { alternativeGewaehltMelden, rueckrufMelden } from "@/app/absagen/aktionen";

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

/**
 * Der Gast möchte lieber angerufen werden (Florian, 01.10.2026).
 *
 * Die Bitte landet sofort als Mail bei Florian und Kevin und bleibt in der
 * Absage stehen, bis jemand sie abhakt. Ein Rückruf, den niemand sieht,
 * ist kein Rückruf.
 */
export async function rueckrufErbitten(f: FormData): Promise<void> {
  const token = String(f.get("token") ?? "");
  const nummer = String(f.get("nummer") ?? "").trim().slice(0, 40);
  const notiz = String(f.get("notiz") ?? "").trim().slice(0, 300);
  if (!nummer) redirect(`/alternative/${token}`);

  const gast = await rueckrufBitten(token, nummer, notiz);
  if (gast) {
    const absage = await absageLesen(gast.absageId);
    await rueckrufMelden({
      gastName: gast.name,
      gastEmail: gast.email,
      nummer,
      notiz,
      plaetze: gast.plaetze,
      abgesagteShow: absage?.show ?? "",
      abgesagtesDatum: absage ? datumLang(absage.datum) : "",
    }).catch(() => undefined);
  }

  redirect(`/alternative/${token}`);
}
