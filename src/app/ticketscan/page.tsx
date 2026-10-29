import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { TicketScanner } from "@/components/TicketScanner";

export const metadata = { title: "Tickets scannen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Ticketscan, hier im Eventmanager.
 *
 * "wir müssen es so machen, dass für den mitarbeiter die anmeldung über
 * eventmanager ausreicht. wir wollen die nicht in flotix reinlassen"
 * (Florian, 29.10.2026).
 *
 * Wer am Eingang steht, ist hier angemeldet und braucht keinen zweiten
 * Zugang. Die Kamera laeuft im Browser, geprueft und entwertet wird bei
 * FloTix: Dort liegen die Tickets, und dort entscheidet ein einziger
 * Schreibvorgang, wer durchkommt. Dazwischen liegt /api/ticketscan, das
 * den Mitarbeiter prueft und erst dann weiterreicht.
 */
export default async function TicketscanSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");

  return (
    <div className="max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets scannen</h1>
        <p className="mt-1 text-sm text-leise">
          Station und Vorstellung wählen, dann den QR-Code vor die Kamera halten. Jedes Ticket gilt
          einmal.
        </p>
      </header>

      <TicketScanner />

      <details className="text-sm text-leise">
        <summary className="cursor-pointer underline">Was die Farben bedeuten</summary>
        <div className="mt-2 space-y-2">
          <p>
            Grün heißt durchlassen. Orange heißt: gültig, aber lies den Hinweis, zum Beispiel Abriss
            einsammeln oder Kinderticket. Rot heißt nicht durchlassen, dann steht da auch warum.
          </p>
          <p>
            Showtickets gehören an den Einlass, das Menü ins Restaurant, Souvenir und Stehtisch an
            die Theke. Hältst du ein Ticket an die falsche Station, sagt dir der Bildschirm, wohin es
            gehört, und es bleibt gültig.
          </p>
          <p>
            Hast du dich vertan, drückst du im Ergebnis auf &quot;Entwerten zurücknehmen&quot;. Dann
            ist das Ticket wieder gültig.
          </p>
          <p>Parkplätze werden nicht gescannt. Der Gast fährt einfach herein.</p>
        </div>
      </details>
    </div>
  );
}
