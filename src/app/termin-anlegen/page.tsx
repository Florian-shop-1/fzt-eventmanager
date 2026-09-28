/**
 * Termine, die nicht über den Ticketshop laufen.
 *
 * Bis zum 28.09.2026 steckte das im Funktionsheet, aufklappbar, ganz
 * unten. Wer einen Termin anlegen wollte, musste wissen, dass er dort
 * liegt. Jetzt steht er als erster Punkt unter "Events": Man klickt auf
 * Events und sieht gleich, dass man selbst einen Abend aufmachen kann
 * (Florian, 28.09.2026).
 */

import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfTermineAnlegen } from "@/lib/auth/sitzung";
import { eigeneTermine } from "@/lib/db/eigenertermin";
import { EigeneTermine } from "@/components/EigeneTermine";

export const metadata = { title: "Termin anlegen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

export default async function TerminAnlegenSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  if (!darfTermineAnlegen(benutzer)) redirect("/");

  const termine = await eigeneTermine();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Termin anlegen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Für Abende, die nicht über den Ticketshop laufen: Das Haus ist exklusiv gebucht, die Firma
          bringt ihre Gäste selbst mit, es werden keine Tickets verkauft. Sobald der Termin hier
          steht, taucht der Tag überall auf, wo auch die anderen Vorstellungen stehen.
        </p>
      </header>

      <EigeneTermine termine={termine} zurueckZu="/termin-anlegen" offen />
    </div>
  );
}
