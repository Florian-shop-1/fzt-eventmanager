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
import { holeShopGruppen, type ShopGruppe } from "@/lib/shop/rohdaten";
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

  /*
    Angeschrieben wird jeder, der an dem Abend eine Karte hat.

    Vorher kam die Liste aus unserer eigenen Buchungstabelle, und die
    kennt nur, was durch die neue Kasse im Shop lief. Am 17.10.2026
    standen dort 5 Parteien, in der Verkaufsliste aber 13: Freikarten,
    telefonisch Gebuchtes und von Hand Angelegtes fehlten alle, und
    Kevin musste sie einzeln nachtelefonieren (13.10.2026).

    Quelle ist deshalb die Verkaufsliste aus Ditix. Unsere Tabelle
    liefert nur noch das Zusatzwissen, wo es sie gibt: die Buchungsnummer
    fuer das Geschenk und die Adresse aus der Kasse.
  */
  const [buchungen, kommende, verkauft] = await Promise.all([
    buchungenFuerTag(termin.datum),
    kommendeTermine(60),
    holeShopGruppen().catch(() => [] as ShopGruppe[]),
  ]);
  const alternativen = alternativenAufteilen(termin, kommende);

  const eigene = buchungen.filter((b) => b.ditixEventId === termin.ditixEventId && b.bestaetigt);
  const betroffen = parteienDesAbends(verkauft, termin.ditixEventId, eigene);

  for (const buchung of betroffen) {
    const alteKategorie = buchung.kategorie;
    const neueKategorie = naechstbessereKategorie(alteKategorie);
    const kompensationArt: "upgrade" | "glas" = neueKategorie ? "upgrade" : "glas";
    const plaetze = Math.max(1, buchung.plaetze);

    // Erst anlegen, damit der Zugangs-Token feststeht, dann den Entwurf mit
    // dem persönlichen Link nachtragen.
    const gast = await gastAnlegen({
      absageId: absage.id,
      buchungId: buchung.buchungId,
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
      mitMenue: buchung.mitMenue,
    });
    await entwurfSpeichern(gast.id, entwurf.betreff, entwurf.text);

    if (kompensationArt === "glas") {
      const giltBis = new Date();
      giltBis.setFullYear(giltBis.getFullYear() + 1);
      await geschenkVersprechen({
        buchungId: buchung.buchungId,
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

/** Eine Partei des Abends, so wie sie angeschrieben wird. */
interface Partei {
  buchungId: string | null;
  name: string;
  email: string;
  plaetze: number;
  kategorie: string;
  /** Hatte diese Partei ein Menü gebucht? Dann zählt der Sonntagshinweis. */
  mitMenue: boolean;
}

/**
 * Alle Parteien einer Vorstellung, aus der Verkaufsliste.
 *
 * Zusammengefasst wird je Adresse: Wer zweimal bestellt hat, ist ein
 * Mensch und bekommt eine Mail. Wer keine Adresse hinterlassen hat,
 * steht trotzdem in der Liste, mit leerer Adresse: Dann sieht das Büro,
 * dass dort jemand anzurufen ist, statt ihn gar nicht zu bemerken.
 */
function parteienDesAbends(
  verkauft: ShopGruppe[],
  ditixEventId: string,
  eigene: Array<{ id: string; email: string; name: string; posten: Array<{ name: string; gruppe: string }> }>,
): Partei[] {
  const zuAdresse = new Map<string, { id: string; name: string }>();
  for (const b of eigene) {
    if (b.email) zuAdresse.set(b.email.trim().toLowerCase(), { id: b.id, name: b.name });
  }

  const parteien = new Map<string, Partei>();
  for (const g of verkauft.filter((x) => x.ditixEventId === ditixEventId)) {
    const adresse = g.email.trim().toLowerCase();
    // Ohne Adresse wird je Bestellung eine eigene Zeile daraus: Zwei
    // namenlose Bestellungen sind zwei verschiedene Leute.
    const schluessel = adresse || `ohne:${g.orderId}`;
    const vorhanden = parteien.get(schluessel);

    // Die groesste Ticketart bestimmt die Kategorie fuer das Upgrade.
    const groesste = [...g.ticketArten].sort((a, b) => b.menge - a.menge)[0];
    const kategorie = groesste?.bezeichnung || "unbekannt";

    if (vorhanden) {
      vorhanden.plaetze += g.tickets;
      vorhanden.mitMenue = vorhanden.mitMenue || g.menuesGesamt > 0;
      if (vorhanden.kategorie === "unbekannt") vorhanden.kategorie = kategorie;
      continue;
    }
    parteien.set(schluessel, {
      buchungId: zuAdresse.get(adresse)?.id ?? null,
      name: g.name || zuAdresse.get(adresse)?.name || "Gast",
      email: g.email,
      plaetze: g.tickets,
      kategorie,
      mitMenue: g.menuesGesamt > 0,
    });
  }

  // Wer keine einzige Karte hat, hat an dem Abend auch nichts verloren.
  return [...parteien.values()].filter((p) => p.plaetze > 0);
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
      : `Bitte in der bisherigen Kategorie (${o.alteKategorie}) umbuchen. Entschädigung: ${o.plaetze === 1 ? "ein Souvenirglas" : `${o.plaetze} Souvenirgläser`} (steht schon unter Geschenke).`,
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
