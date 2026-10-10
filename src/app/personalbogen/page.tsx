import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { PersonalbogenFormular } from "@/components/PersonalbogenFormular";
import { Absendeknopf } from "@/components/Absendeknopf";
import { db } from "@/lib/db/client";
import { bogenVon } from "@/lib/db/personalbogen";
import { svNummerNachtragen } from "./aktionen";

export const metadata = { title: "Personalbogen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Personalbogen für FZT-interne Mitarbeiter. Siehe lib/personal/personalbogen.ts.
 */
export default async function PersonalbogenSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");

  /*
    Nur wer ausdruecklich extern ist, hat hier nichts verloren.

    Vorher musste "intern" dastehen, sonst ging es wortlos zurueck zur
    Uebersicht. Bei Florian und Werner steht gar nichts, weil ihre
    Zugaenge aelter sind als das Feld, und beide landeten deshalb beim
    Klick auf "Personalbogen" wieder auf der Startseite (Florian,
    10.10.2026). Der Menuepunkt stand trotzdem da.

    Externe bekommen jetzt einen Satz statt einer stummen Umleitung: Wer
    irgendwo landet, wo er nicht hinwollte, soll wenigstens lesen koennen,
    warum.
  */
  if (benutzer.art === "extern") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Personalbogen</h1>
        <p className="rounded-lg border border-linie bg-flaeche px-5 py-4 text-sm">
          Der Personalbogen ist für Angestellte des Florian Zimmer Theaters. Dein Zugang ist als extern
          hinterlegt, deshalb brauchst du ihn nicht. Wenn das nicht stimmt, sag Florian Bescheid.
        </p>
        <Link href="/" className="text-sm underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const [vorname, ...rest] = benutzer.name.split(" ");

  /*
    Die eine Ausnahme: Personalbogen ohne Versicherungsnummer.

    Wer zum ersten Mal arbeitet, bekommt sie erst mit der ersten Meldung.
    Ihn deshalb gar nicht anfangen zu lassen, hilft niemandem
    (Florian, 01.10.2026). Nachgetragen wird sie hier, und das Programm
    erinnert alle paar Tage daran.
  */
  const z = (await db()`
    select sv_nummer_spaeter from benutzer where id = ${benutzer.id}
  `.catch(() => [])) as Array<{ sv_nummer_spaeter: boolean }>;
  const ohneSvNummer = Boolean(z[0]?.sv_nummer_spaeter);
  const bogen = ohneSvNummer ? await bogenVon(benutzer.id).catch(() => null) : null;
  const svFehlt = ohneSvNummer && !bogen?.daten.svNummer;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Personalbogen</h1>
        <p className="mt-1 text-sm text-leise">
          Einmal ausfüllen, dann weiß unser Lohnbüro alles für deine Abrechnung. Dauert etwa fünf
          Minuten. Leg dir am besten Krankenkassenkarte, Bankkarte und Steuer-ID bereit.
        </p>
      </header>

      {/*
        Die Nummer fehlt noch: ein kurzes Feld, mehr nicht.
      */}
      {benutzer.personalbogenAm && svFehlt && (
        <form
          action={svNummerNachtragen}
          className="space-y-3 rounded-lg border px-5 py-4"
          style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
        >
          <div className="font-semibold">Deine Sozialversicherungsnummer fehlt noch</div>
          <p className="text-sm">
            Sobald du sie hast, trag sie hier ein. Sie steht auf dem Sozialversicherungsausweis oder hinten
            auf der Karte der Krankenkasse.
          </p>
          <input name="svNummer" maxLength={20} placeholder="65 170839 J 003" autoCapitalize="characters" />
          <Absendeknopf text="Nummer nachtragen" laeuftText="Wird gespeichert..." />
        </form>
      )}

      {benutzer.personalbogenAm ? (
        <div className="rounded-lg border px-5 py-6 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          <p>
            <strong>Erledigt.</strong> Dein Personalbogen ging am{" "}
            {new Date(benutzer.personalbogenAm).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} an das
            Lohnbüro. Hat sich etwas geändert? Dann sag im Büro Bescheid, Florian kann ihn neu anfordern.
          </p>
          <Link href="/" className="mt-3 inline-block underline">Zurück</Link>
        </div>
      ) : (
        <PersonalbogenFormular
          vorname={vorname ?? ""}
          nachname={rest.join(" ")}
          email={benutzer.email}
          ohneSvNummer={ohneSvNummer}
        />
      )}
    </div>
  );
}
