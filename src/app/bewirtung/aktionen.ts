"use server";

import { revalidatePath } from "next/cache";
import { darfGesellschaftWaehlen, istGesellschaft } from "@/lib/bewirtung/gesellschaft";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import {
  bewirtungLesen,
  bewirtungenDesJahres,
  hinterlegteUnterschrift,
  unterschriftHinterlegen,
  moeglicheDubletten,
  unterschriftSetzen,
  entwurfSpeichern,
  entwurfVerwerfen,
  festschreiben,
  stornieren,
  type Angaben,
} from "@/lib/bewirtung/db";
import { postAbholen } from "@/lib/bewirtung/posteingang";
import { automatischZuordnen } from "@/lib/bewirtung/abgleich";

const text = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

/** "12,50" oder "12.50" oder "1.234,50" in Cent. */
function cent(roh: string): number {
  const s = roh.replace(/[€\s]/g, "");
  if (!s) return 0;
  const zahl = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(zahl) ? Math.round(zahl * 100) : NaN;
}

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Nur für die Buchhaltung.");
  return b!;
}

function zurueck(id: string, meldung: string): never {
  revalidatePath("/bewirtung");
  redirect(`/bewirtung/${id}?meldung=${encodeURIComponent(meldung)}`);
}

function angabenAus(f: FormData, darfFirma: boolean): Angaben | string {
  const gewaehlt = f.get("gesellschaft");
  const a: Angaben = {
    /*
      Die Firma nur uebernehmen, wenn diese Person sie aendern darf.
      Sonst bleibt sie so, wie sie beim Scannen gesetzt wurde
      (Florian, 28.09.2026).
    */
    gesellschaft: darfFirma && istGesellschaft(gewaehlt) ? gewaehlt : undefined,
    datum: text(f, "datum", 10),
    restaurant: text(f, "restaurant", 150),
    anschrift: text(f, "anschrift", 200),
    bruttoCent: cent(text(f, "brutto", 20)),
    mwst7Cent: cent(text(f, "mwst7", 20)),
    mwst19Cent: cent(text(f, "mwst19", 20)),
    trinkgeldCent: cent(text(f, "trinkgeld", 20)),
    zahlart: text(f, "zahlart", 50),
    art: text(f, "art") === "einkauf" ? "einkauf" : "bewirtung",
    kategorie: text(f, "kategorie", 60),
    zweck: text(f, "zweck", 300),
    zahlweg: (["karte", "bar"].includes(text(f, "zahlweg")) ? text(f, "zahlweg") : "") as Angaben["zahlweg"],
    privatAusgelegt: Boolean(f.get("privat")),
    anlass: text(f, "anlass", 500),
    teilnehmer: text(f, "teilnehmer", 1000),
    bewirtender: text(f, "bewirtender", 100) || "Florian Zimmer",
    ortDerBewirtung: text(f, "ort", 200),
    notiz: text(f, "notiz", 500),
  };
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === "number" && Number.isNaN(v)) return `Der Betrag bei „${k.replace("Cent", "")}“ ist keine Zahl.`;
  }
  return a;
}

/** Zwischenspeichern, oder mit "fertig=1" festschreiben. */
export async function belegSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  const id = text(f, "id", 40);
  const alt = await bewirtungLesen(id);
  if (!alt || alt.status !== "entwurf") zurueck(id, "Dieser Beleg ist schon festgeschrieben.");

  const a = angabenAus(f, darfGesellschaftWaehlen(b));
  if (typeof a === "string") zurueck(id, a);
  await entwurfSpeichern(id, a);
  const png = String(f.get("unterschrift") ?? "");
  const hatUnterschrift = png.startsWith("data:image/png;base64,") && png.length > 1200 && png.length < 400000;
  if (hatUnterschrift) await unterschriftSetzen(id, png);

  if (!f.get("fertig")) zurueck(id, "Gespeichert. Noch nicht festgeschrieben.");

  // Pflichtangaben. Beim Bewirtungsbeleg verlangt sie das Finanzamt, sonst wird er nicht anerkannt.
  const fehlt: string[] = [];
  if (!a.datum) fehlt.push("Datum");
  if (!a.restaurant) fehlt.push(a.art === "bewirtung" ? "Restaurant" : "Geschäft");
  if (!(a.bruttoCent > 0)) fehlt.push("Betrag");
  if (!a.zahlweg) fehlt.push("Karte oder bar");
  if (a.art === "bewirtung") {
    if (!a.anlass) fehlt.push("Anlass");
    if (!a.teilnehmer) fehlt.push("Teilnehmer");
  } else {
    if (!a.zweck) fehlt.push("wofür");
  }
  if (fehlt.length) zurueck(id, `Zum Festschreiben fehlt noch: ${fehlt.join(", ")}.`);

  // Gleiches Datum, gleicher Betrag: vermutlich zweimal gescannt.
  const gleich = await moeglicheDubletten({ id, datum: a.datum, bruttoCent: a.bruttoCent });
  if (gleich.length && !f.get("keine_dublette")) {
    zurueck(
      id,
      `Es gibt schon einen Beleg mit gleichem Datum und Betrag (${gleich[0].nummer ?? "Entwurf"}, ${gleich[0].restaurant}). ` +
        "Ist es derselbe, bitte verwerfen. Ist es wirklich ein anderer, den Haken „Das ist ein anderer Beleg“ setzen.",
    );
  }

  // Keine eigene Unterschrift an diesem Beleg? Dann die hinterlegte nehmen.
  // Ist auch keine hinterlegt, bleibt die digitale Freigabe: Wer erfasst und
  // festgeschrieben hat, steht ohnehin auf dem Blatt.
  if (a.art === "bewirtung" && !hatUnterschrift && !alt.unterschrift) {
    const hinterlegt = await hinterlegteUnterschrift();
    if (hinterlegt.png) await unterschriftSetzen(id, hinterlegt.png);
  }

  const nummer = await festschreiben(id, b.name);

  /*
    Gleich nachsehen, ob die Abbuchung dazu schon auf dem Konto steht.

    Erst ein festgeschriebener Beleg kommt fuer die Zuordnung infrage,
    vorher ist er ein Entwurf. Frueher musste man danach zum Abgleich
    gehen und klicken; wenn es eindeutig passt, ist das ein Klick zu viel
    (Florian, 30.09.2026: "du hast ja die abbuchung am konto auch = passt
    ohne dass ich was tun sollte").
  */
  const auto = await automatischZuordnen().catch(() => ({ zugeordnet: 0, namen: [] }));
  const dazu =
    auto.zugeordnet > 0
      ? ` Die Abbuchung dazu ist auf dem Konto gefunden und abgehakt.`
      : "";

  revalidatePath("/bewirtung");
  revalidatePath("/bewirtung/abgleich");
  redirect(`/bewirtung?meldung=${encodeURIComponent(`Beleg ${nummer} ist festgeschrieben.${dazu}`)}`);
}

/**
 * Alle Entwuerfe festschreiben, denen nichts mehr fehlt.
 *
 * Aus dem Postfach kommen an einem Morgen dreissig Rechnungen. Jede
 * einzeln zu oeffnen und festzuschreiben ist eine halbe Stunde Klicken,
 * und solange sie Entwuerfe sind, findet der Abgleich sie nicht: "warum
 * werden die rechnungen nicht automatisch abgeglichen" (Florian,
 * 30.09.2026).
 *
 * Festgeschrieben wird nur, wo alle Pflichtangaben stehen. Alles andere
 * bleibt liegen, und ein moeglicher Doppelgaenger auch: Zwei gleiche
 * Belege sind ein Fall fuer einen Menschen, nicht fuer einen Stapel.
 *
 * Eine Rechnung, die per Mail hereinkam, wird per Ueberweisung oder
 * Lastschrift bezahlt; hat die Erkennung den Zahlweg nicht gefunden,
 * wird er hier auf "konto" gesetzt. Bar bezahlt man keine Rechnung, die
 * im Postfach liegt.
 */
export async function alleBereitenFestschreiben(): Promise<void> {
  const b = await zugang();
  const alle = await bewirtungenDesJahres(new Date().getFullYear());
  const entwuerfe = alle.filter((x) => x.status === "entwurf");

  const ausDemPostfach = new Set(
    (
      (await db()`select beleg_id from rechnungspost where beleg_id is not null`.catch(() => [])) as Array<{
        beleg_id: string;
      }>
    ).map((r) => String(r.beleg_id)),
  );

  let fertig = 0;
  let uebrig = 0;
  let dubletten = 0;

  for (const x of entwuerfe) {
    const zahlweg = x.zahlweg || (ausDemPostfach.has(x.id) ? "konto" : "");
    const vollstaendig =
      Boolean(x.datum) &&
      Boolean(x.restaurant) &&
      x.bruttoCent !== null &&
      x.bruttoCent > 0 &&
      Boolean(zahlweg) &&
      (x.art === "bewirtung" ? Boolean(x.anlass) && Boolean(x.teilnehmer) : Boolean(x.zweck));

    if (!vollstaendig) {
      uebrig++;
      continue;
    }

    const gleich = await moeglicheDubletten({ id: x.id, datum: x.datum, bruttoCent: x.bruttoCent });
    if (gleich.length) {
      dubletten++;
      continue;
    }

    if (zahlweg !== x.zahlweg) {
      await db()`update bewirtung set zahlweg = ${zahlweg} where id = ${x.id} and status = 'entwurf'`;
    }
    await festschreiben(x.id, b.name);
    fertig++;
  }

  const auto = fertig > 0 ? await automatischZuordnen().catch(() => ({ zugeordnet: 0, namen: [] })) : { zugeordnet: 0 };

  const teile = [
    `${fertig} ${fertig === 1 ? "Beleg" : "Belege"} festgeschrieben`,
    auto.zugeordnet > 0 ? `${auto.zugeordnet} davon gleich einer Abbuchung zugeordnet` : "",
    uebrig > 0 ? `${uebrig} brauchen noch Angaben` : "",
    dubletten > 0 ? `${dubletten} sehen nach Doppelgängern aus und warten auf dich` : "",
  ].filter(Boolean);

  revalidatePath("/bewirtung");
  revalidatePath("/bewirtung/abgleich");
  redirect(`/bewirtung?meldung=${encodeURIComponent(teile.join(", ") + ".")}`);
}

export async function belegVerwerfen(f: FormData): Promise<void> {
  await zugang();
  await entwurfVerwerfen(text(f, "id", 40));
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?meldung=${encodeURIComponent("Entwurf verworfen.")}`);
}

export async function belegStornieren(f: FormData): Promise<void> {
  const b = await zugang();
  const id = text(f, "id", 40);
  const grund = text(f, "grund", 300);
  if (!grund) zurueck(id, "Bitte einen Grund für das Storno angeben.");
  await stornieren(id, b.name, grund);
  zurueck(id, "Storniert. Der Beleg bleibt zur Nachvollziehbarkeit erhalten, zählt aber nicht mehr mit.");
}

/** Unterschrift einmal hinterlegen, sie kommt dann auf jeden Bewirtungsbeleg. */
export async function unterschriftSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  const png = String(f.get("unterschrift") ?? "");
  if (f.get("loeschen")) {
    await unterschriftHinterlegen(null, b.name);
    redirect(`/bewirtung?meldung=${encodeURIComponent("Hinterlegte Unterschrift gelöscht.")}`);
  }
  if (!(png.startsWith("data:image/png;base64,") && png.length > 1200 && png.length < 400000)) {
    redirect(`/bewirtung?meldung=${encodeURIComponent("Da war noch nichts gezeichnet.")}`);
  }
  await unterschriftHinterlegen(png, b.name);
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?meldung=${encodeURIComponent("Unterschrift hinterlegt. Sie kommt ab jetzt automatisch auf jede Bewirtung.")}`);
}

/**
 * Die Rechnungen aus dem Postfach holen, auf Knopfdruck.
 *
 * Taeglich passiert das von selbst. Der Knopf ist fuer den Fall, dass
 * gerade etwas angekommen ist und nicht bis morgen warten soll.
 */
export async function postHolen(f?: FormData): Promise<void> {
  const b = await zugang();
  /*
    Wie weit zurueck geschaut wird.

    Bis zum 30.09.2026 waren es immer 14 Tage, und genau daran lag es,
    dass Rechnungen fehlten: Die Lastschrift von Huss Licht + Ton stand
    laengst auf dem Konto, die Rechnung dazu lag im Postfach, aber sie
    war aelter als zwei Wochen und wurde nie geholt (Florian). Von Hand
    laesst sich deshalb jetzt weiter zurueckgreifen, bis zu einem Jahr.
  */
  const gewuenscht = Math.round(Number(f?.get("tage") ?? 0));
  const tage = gewuenscht >= 1 && gewuenscht <= 365 ? gewuenscht : 30;
  try {
    const lauf = await postAbholen({ tage, hoechstens: 50, wer: b.name });
    /*
      Was eindeutig passt, gleich abhaken.

      Die Rechnung kommt per Mail, die Lastschrift steht auf dem Konto,
      und beides stimmt auf den Cent. Dafuer muss niemand klicken
      (Florian, 30.09.2026).
    */
    const auto = await automatischZuordnen().catch(() => ({ zugeordnet: 0, namen: [] }));
    const teile = [
      auto.zugeordnet > 0
        ? `${auto.zugeordnet} ${auto.zugeordnet === 1 ? "Abbuchung" : "Abbuchungen"} automatisch abgehakt`
        : "",
      `${lauf.neu} ${lauf.neu === 1 ? "neuer Beleg" : "neue Belege"} aus dem Postfach der letzten ${tage} Tage`,
      lauf.ohneAnhang > 0 ? `${lauf.ohneAnhang} Mails ohne Rechnung im Anhang` : "",
      lauf.fehler > 0 ? `${lauf.fehler} konnten nicht gelesen werden` : "",
    ].filter(Boolean);
    revalidatePath("/bewirtung");
    redirect(`/bewirtung?meldung=${encodeURIComponent(teile.join(", ") + ".")}`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    const meldung = f instanceof Error ? f.message : "Das hat nicht geklappt.";
    redirect(`/bewirtung?meldung=${encodeURIComponent(meldung)}`);
  }
}
