"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches, darfAnschreiben } from "@/lib/auth/sitzung";
import { abbrecher, abbruchSchalten } from "@/lib/abbrecher/db";
import { db } from "@/lib/db/client";
import {
  anrufVermerken,
  statusText,
  vertriebSetzen,
  type VertriebStatus,
} from "@/lib/abbrecher/vertrieb";
import { ANGEBOT_STUNDEN, einzelnSchicken } from "@/lib/abbrecher/lauf";
import { mailVerschicken } from "@/lib/mail/versand";
import { angebotMail, frageMail } from "@/lib/abbrecher/mails";
import type { Abbrecher } from "@/lib/abbrecher/db";
import type { GeschenkArt } from "@/lib/abbrecher/geschenk";

/** Eine der beiden Mails von Hand schicken, aus der Liste heraus. */
export async function mailSchicken(f: FormData): Promise<void> {
  /*
    Die Agentur sieht die Abbrüche, schreibt aber niemanden an.
    Eine Mail an einen Gast kommt vom Haus (Florian, 25.09.2026).
  */
  const wer = await angemeldeterBenutzer();
  if (!darfAnschreiben(wer)) {
    throw new Error("Mails an Gäste dürfen nur Mitarbeiter des Theaters auslösen.");
  }

  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Nicht erlaubt.");
  const id = String(f.get("id") ?? "");
  const art = String(f.get("art") ?? "") === "angebot" ? "angebot" : "frage";

  const alle = await abbrecher(365);
  const a = alle.find((x) => x.id === id);

  let meldung: string;
  if (!a) {
    meldung = "Diesen Eintrag gibt es nicht mehr.";
  } else if (a.spaeterGekauft) {
    // Wer inzwischen doch gebucht hat, bekommt nichts mehr: Weder die
    // Frage noch ein Geschenk (Florian, 23.09.2026).
    meldung = `${a.email} hat inzwischen doch gebucht. Da schicken wir nichts mehr.`;
  } else {
    try {
      await einzelnSchicken(a, art);
      meldung =
        art === "frage"
          ? `Frage an ${a.email} ist raus.`
          : `Angebot an ${a.email} ist raus, gültig 24 Stunden.`;
    } catch (e) {
      meldung = e instanceof Error ? e.message : "Der Versand hat nicht geklappt.";
    }
  }

  revalidatePath("/abbrueche");
  redirect(`/abbrueche?meldung=${encodeURIComponent(meldung)}`);
}

/** Den automatischen Versand ein- oder ausschalten. Nur der Inhaber. */
export async function automatikSchalten(f: FormData): Promise<void> {
  /*
    Die Agentur sieht die Abbrüche, schreibt aber niemanden an.
    Eine Mail an einen Gast kommt vom Haus (Florian, 25.09.2026).
  */
  const wer = await angemeldeterBenutzer();
  if (!darfAnschreiben(wer)) {
    throw new Error("Mails an Gäste dürfen nur Mitarbeiter des Theaters auslösen.");
  }

  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Das schaltet nur Florian.");
  const an = String(f.get("an") ?? "") === "an";
  await abbruchSchalten(an, b.name);
  revalidatePath("/abbrueche");
  redirect(
    `/abbrueche?meldung=${encodeURIComponent(
      an
        ? "Eingeschaltet. Ab dem nächsten Lauf gehen die Mails hinaus, höchstens 40 am Tag."
        : "Ausgeschaltet. Es geht nichts automatisch hinaus.",
    )}`,
  );
}

/**
 * Alle vier Fassungen als Probe an die eigene Adresse.
 *
 * Mit einem erfundenen Warenkorb und einem Schlüssel, den es in der
 * Datenbank nicht gibt: Ein Klick auf die Knöpfe in der Probemail
 * speichert deshalb nichts und berührt keinen Gast.
 */
export async function probeAnMich(): Promise<void> {
  /*
    Die Agentur sieht die Abbrüche, schreibt aber niemanden an.
    Eine Mail an einen Gast kommt vom Haus (Florian, 25.09.2026).
  */
  const wer = await angemeldeterBenutzer();
  if (!darfAnschreiben(wer)) {
    throw new Error("Mails an Gäste dürfen nur Mitarbeiter des Theaters auslösen.");
  }

  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Nicht erlaubt.");

  const beispiel: Abbrecher = {
    id: "probe",
    cartId: null,
    ditixEventId: "",
    datum: "2026-10-18",
    uhrzeit: "20:00",
    show: "ULMFASSBAR",
    name: b.name,
    email: b.email,
    telefon: "",
    plaetze: 4,
    gesamtCent: 31600,
    zugangToken: "probe0000probe0000probe0000probe",
    werbeOk: true,
    eingegangenAm: new Date(Date.now() - 3 * 86400000).toISOString(),
    frageAm: null,
    angebotAm: null,
    abbruchGrund: null,
    abbruchText: null,
    posten: [
      { name: "Kat. 2", anzahl: 4, gruppe: "sitzplatz" },
      { name: "4-Gang-Menü CLASSIC inkl. Welcome Drink", anzahl: 2, gruppe: "menue" },
    ],
    spaeterGekauft: false,
    status: "neu",
    bearbeiterId: null,
    bearbeiter: null,
    vertriebNotiz: "",
    vertriebAm: null,
    wiedervorlage: null,
  };

  const bis = new Date(Date.now() + ANGEBOT_STUNDEN * 3600000);
  const alle: Array<[string, { betreff: string; text: string; html: string }]> = [
    ["Frage", frageMail(beispiel)],
    ...(["baendchen", "glas", "zauberstab"] as GeschenkArt[]).map(
      (art) => [art, angebotMail(beispiel, art, bis)] as [string, ReturnType<typeof angebotMail>],
    ),
  ];

  const fehler: string[] = [];
  for (const [was, m] of alle) {
    try {
      await mailVerschicken({
        an: b.email,
        betreff: `[Probe] ${m.betreff}`,
        text: m.text,
        html: m.html,
        ueberBrevo: true,
        schlagwort: "probe",
      });
    } catch (e) {
      fehler.push(`${was}: ${e instanceof Error ? e.message : e}`);
    }
  }

  revalidatePath("/abbrueche");
  redirect(
    `/abbrueche?meldung=${encodeURIComponent(
      fehler.length === 0
        ? `Vier Probemails sind an ${b.email} unterwegs: die Frage und die drei Geschenke.`
        : `Nicht alles hat geklappt: ${fehler.join("; ")}`,
    )}`,
  );
}

/* ------------------------------------------------------------------ *
 * Vertrieb: Bearbeiter, Stufe, Wiedervorlage, Anrufe
 * ------------------------------------------------------------------ */

/** Stufe, Bearbeiter, Wiedervorlage und Notiz in einem Zug speichern. */
export async function vertriebSpeichern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Nicht erlaubt.");

  const id = String(f.get("id") ?? "");
  const status = String(f.get("status") ?? "neu") as VertriebStatus;
  const bearbeiterId = String(f.get("bearbeiter") ?? "") || null;
  const wiedervorlage = String(f.get("wiedervorlage") ?? "") || null;
  const notiz = String(f.get("notiz") ?? "");

  const alle = await abbrecher(365);
  const a = alle.find((x) => x.id === id);
  if (!a) redirect("/abbrueche?meldung=" + encodeURIComponent("Diesen Eintrag gibt es nicht mehr."));

  const leute = await vertriebsLeute();
  const bearbeiter = leute.find((p) => p.id === bearbeiterId) ?? null;

  await vertriebSetzen({
    buchungId: id,
    status,
    bearbeiterId,
    bearbeiterName: bearbeiter?.name ?? null,
    wiedervorlage,
    notiz,
    wer: b.name,
    vorher: { status: a.status, bearbeiter: a.bearbeiter },
  });

  revalidatePath("/abbrueche");
  redirect(`/abbrueche?meldung=${encodeURIComponent(`Gespeichert: ${a.name || a.email}, ${statusText(status)}.`)}`);
}

/** Ein Anruf, mit einem Klick festgehalten. */
export async function anrufNotieren(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Nicht erlaubt.");
  const id = String(f.get("id") ?? "");
  const ergebnis = String(f.get("ergebnis") ?? "nicht_erreicht") as VertriebStatus;
  await anrufVermerken(id, b.name, ergebnis, String(f.get("notiz") ?? ""));
  revalidatePath("/abbrueche");
  redirect(`/abbrueche?meldung=${encodeURIComponent(`Anruf vermerkt: ${statusText(ergebnis)}.`)}`);
}

/** Wer als Bearbeiter infrage kommt: Büro und Geschäftsführung. */
export async function vertriebsLeute(): Promise<Array<{ id: string; name: string }>> {
  const z = (await db()`
    select id, name from benutzer where aktiv and rolle in ('chef', 'team') order by name
  `) as Array<{ id: string; name: string }>;
  return z.map((r) => ({ id: String(r.id), name: r.name }));
}
