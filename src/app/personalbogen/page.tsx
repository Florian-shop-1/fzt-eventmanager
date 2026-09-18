import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { PersonalbogenFormular } from "@/components/PersonalbogenFormular";

export const metadata = { title: "Personalbogen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Personalbogen für FZT-interne Mitarbeiter. Siehe lib/personal/personalbogen.ts.
 */
export default async function PersonalbogenSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  if (benutzer.art !== "intern") redirect("/");

  const [vorname, ...rest] = benutzer.name.split(" ");

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Personalbogen</h1>
        <p className="mt-1 text-sm text-leise">
          Einmal ausfüllen, dann weiß unser Lohnbüro alles für deine Abrechnung. Dauert etwa fünf
          Minuten. Leg dir am besten Krankenkassenkarte, Bankkarte und Steuer-ID bereit.
        </p>
      </header>

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
        <PersonalbogenFormular vorname={vorname ?? ""} nachname={rest.join(" ")} email={benutzer.email} />
      )}
    </div>
  );
}
