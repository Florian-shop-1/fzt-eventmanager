"use server";

/**
 * Eine Show absagen: Gäste finden, Entschädigung festlegen, Mailentwurf
 * bauen. Nur Florian und Kevin dürfen das (Florian, 29.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { findeTermin, kommendeTermine } from "@/lib/ditix/spielplan";
import { buchungenFuerTag } from "@/lib/db/shop-buchungen";
import { naechstbessereKategorie } from "@/lib/absage/kategorie";
import { alternativenAufteilen, absageEntwurf } from "@/lib/absage/mailtext";
import {
  absageAnlegen,
  absageZuInformieren,
  alsVersendetMarkieren,
  entwurfSpeichern,
  gastAnlegen,
  gastLesen,
  gaesteFuerAbsage,
  rueckrufErledigt,
  umgebuchtMarkieren,
} from "@/lib/absage/db";
import { geschenkVersprechen } from "@/lib/abbrecher/geschenk";
import { mailVerschicken } from "@/lib/mail/versand";

const text = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

async function nurChefOderKevin() {
  const b = await angemeldeterBenutzer();
  if (!b || (b.rolle !== "chef" && !darfEinladen(b))) throw new Error("Das dürfen nur Florian und Kevin.");
  return b;
}

/**
 * Legt die Absage an und baut für jede bezahlte Buchung dieser Show einen
 * Gast-Eintrag mit Entschädigung und Mailentwurf. Schickt noch nichts,
 * das passiert erst, wenn jemand den Entwurf geprüft hat.
 */
export async function showAbsagen(f: FormData): Promise<void> {
  const benutzer = await nurChefOderKevin();
  const ditixEventId = text(f, "ditixEventId", 100);
  const grund = text(f, "grund", 300) || "aus produktionstechnischen Gründen";

  const termin = await findeTermin(ditixEventId);
  if (!termin) redirect(`/absagen?meldung=${encodeURIComponent("Diese Vorstellung gibt es nicht (mehr).")}`);

  const absage = await absageAnlegen({
    ditixEventId: termin.ditixEventId,
    datum: termin.datum,
    uhrzeit: termin.uhrzeit,
    show: termin.name,
    grund,
    von: benutzer.name,
  });

  const [buchungen, kommende] = await Promise.all([buchungenFuerTag(termin.datum), kommendeTermine(60)]);
  const betroffen = buchungen.filter((b) => b.ditixEventId === termin.ditixEventId && b.bestaetigt && b.email);
  const alternativen = alternativenAufteilen(termin, kommende);

  for (const buchung of betroffen) {
    const sitzplatzPosten = buchung.posten.find((p) => p.gruppe === "sitzplatz") ?? buchung.posten[0];
    const alteKategorie = sitzplatzPosten?.name || "unbekannt";
    const neueKategorie = naechstbessereKategorie(alteKategorie);
    const kompensationArt: "upgrade" | "glas" = neueKategorie ? "upgrade" : "glas";
    const plaetze = Math.max(1, buchung.plaetze ?? 1);

    // Erst anlegen, damit der Zugangs-Token feststeht, dann den Entwurf mit
    // dem persönlichen Link nachtragen.
    const gast = await gastAnlegen({
      absageId: absage.id,
      buchungId: buchung.id,
      name: buchung.name || "Gast",
      email: buchung.email,
      plaetze,
      alteKategorie,
      kompensationArt,
      neueKategorie,
      entwurfBetreff: "",
      entwurfText: "",
    });

    const link = `${APP}/alternative/${gast.zugangToken}`;
    const entwurf = absageEntwurf({
      vorname: (buchung.name || "Gast").split(" ")[0],
      abgesagt: termin,
      grund,
      alternativen,
      link,
      kompensationArt,
      neueKategorie,
      plaetze,
    });
    await entwurfSpeichern(gast.id, entwurf.betreff, entwurf.text);

    if (kompensationArt === "glas") {
      const giltBis = new Date();
      giltBis.setFullYear(giltBis.getFullYear() + 1);
      await geschenkVersprechen({
        buchungId: buchung.id,
        email: buchung.email,
        name: buchung.name || "Gast",
        art: "glas",
        anzahl: plaetze,
        giltBis,
      }).catch(() => undefined);
    }
  }

  revalidatePath("/absagen");
  redirect(`/absagen/${absage.id}`);
}

export async function entwurfAktualisieren(f: FormData): Promise<void> {
  await nurChefOderKevin();
  const id = text(f, "id", 40);
  const gast = await gastLesen(id);
  if (!gast) throw new Error("Diesen Gast-Eintrag gibt es nicht.");
  await entwurfSpeichern(id, text(f, "betreff", 300), text(f, "text", 8000));
  revalidatePath(`/absagen/${gast.absageId}`);
}

/** Schickt die geprüfte Mail an genau diesen Gast. */
export async function mailSenden(f: FormData): Promise<void> {
  await nurChefOderKevin();
  const id = text(f, "id", 40);
  const gast = await gastLesen(id);
  if (!gast) throw new Error("Diesen Gast-Eintrag gibt es nicht.");

  await mailVerschicken({ an: gast.email, betreff: gast.entwurfBetreff, text: gast.entwurfText });
  await alsVersendetMarkieren(id);

  revalidatePath(`/absagen/${gast.absageId}`);
}

/** Alle noch nicht verschickten Entwürfe dieser Absage in einem Rutsch. */
export async function alleSenden(f: FormData): Promise<void> {
  await nurChefOderKevin();
  const absageId = text(f, "absageId", 40);
  const gaeste = await gaesteFuerAbsage(absageId);
  for (const gast of gaeste.filter((g) => !g.versendetAm)) {
    try {
      await mailVerschicken({ an: gast.email, betreff: gast.entwurfBetreff, text: gast.entwurfText });
      await alsVersendetMarkieren(gast.id);
    } catch (f2) {
      console.error("[absagen] Mail an", gast.email, "fehlgeschlagen:", f2);
    }
  }
  revalidatePath(`/absagen/${absageId}`);
}

/** Büro hat die Umbuchung in Ditix von Hand erledigt. */
export async function umbuchungErledigt(f: FormData): Promise<void> {
  const benutzer = await nurChefOderKevin();
  const id = text(f, "id", 40);
  const gast = await gastLesen(id);
  if (!gast) throw new Error("Diesen Gast-Eintrag gibt es nicht.");
  await umgebuchtMarkieren(id, benutzer.name);
  revalidatePath(`/absagen/${gast.absageId}`);
}

/**
 * Der Gast hat auf der öffentlichen Seite einen Termin gewählt.
 *
 * Umgebucht wird im Haus, von Hand, und genau deshalb muss die Nachricht
 * ankommen: "wir buchen die selber um. wichtig ist aber, dass wir da eine
 * info kriegen (vor allem Kevin, dass die umgebucht werden müssen von
 * Hand!" (Florian, 01.10.2026). Die Mail geht an Florian und Kevin, und
 * in der Absage steht der Vorgang offen, bis jemand ihn abhakt.
 */
export async function alternativeGewaehltMelden(o: {
  gastName: string;
  gastEmail: string;
  plaetze: number;
  alteKategorie: string;
  kompensationArt: "upgrade" | "glas";
  neueKategorie: string | null;
  abgesagteShow: string;
  abgesagtesDatum: string;
  terminName: string;
}): Promise<void> {
  const an = await absageZuInformieren();
  if (an.length === 0) return;
  const zeilen = [
    `${o.gastName} (${o.gastEmail}) hat für die ausgefallene Show "${o.abgesagteShow}" am ${o.abgesagtesDatum} einen Ausweichtermin gewählt:`,
    "",
    `Neuer Termin: ${o.terminName}`,
    `Plätze: ${o.plaetze}`,
    o.kompensationArt === "upgrade"
      ? `Bitte beim Umbuchen auf ${o.neueKategorie} upgraden (bisher ${o.alteKategorie}), ohne Aufpreis.`
      : `Bitte in der bisherigen Kategorie (${o.alteKategorie}) umbuchen. Entschädigung: ${o.plaetze === 1 ? "ein Souvenirglas" : `${o.plaetze} Souvenirgläser`} (steht schon unter Abbrecher-Geschenke).`,
    "",
    "Das muss von Hand in Ditix umgebucht werden, eine direkte Anbindung gibt es nicht.",
    "",
    `Danach im Eventmanager abhaken: ${APP}/absagen`,
  ];
  for (const p of an) {
    await mailVerschicken({
      an: p.email,
      betreff: `Von Hand umbuchen: ${o.gastName}, ${o.terminName}`,
      text: zeilen.join("\n"),
    }).catch(() => undefined);
  }
}

/**
 * Ein Gast bittet um Rückruf: Florian und Kevin erfahren es sofort.
 */
export async function rueckrufMelden(o: {
  gastName: string;
  gastEmail: string;
  nummer: string;
  notiz: string;
  plaetze: number;
  abgesagteShow: string;
  abgesagtesDatum: string;
}): Promise<void> {
  const an = await absageZuInformieren();
  const zeilen = [
    `${o.gastName} (${o.gastEmail}) bittet um einen Rückruf.`,
    "",
    `Nummer: ${o.nummer}`,
    o.notiz ? `Anmerkung: ${o.notiz}` : "",
    `Plätze: ${o.plaetze}`,
    o.abgesagteShow ? `Ausgefallen: ${o.abgesagteShow} am ${o.abgesagtesDatum}` : "",
    "",
    "Die Bitte steht auch in der Absage im Eventmanager und bleibt dort, bis sie jemand abhakt.",
  ].filter(Boolean);
  for (const p of an) {
    await mailVerschicken({
      an: p.email,
      betreff: `Bitte zurückrufen: ${o.gastName}, ${o.nummer}`,
      text: zeilen.join("\n"),
    }).catch(() => undefined);
  }
}

/** Jemand hat zurückgerufen, der Zettel ist weg. */
export async function rueckrufAbhaken(f: FormData): Promise<void> {
  const benutzer = await nurChefOderKevin();
  const id = text(f, "id", 40);
  const gast = await gastLesen(id);
  if (!gast) throw new Error("Diesen Gast-Eintrag gibt es nicht.");
  await rueckrufErledigt(id, benutzer.name);
  revalidatePath(`/absagen/${gast.absageId}`);
}
