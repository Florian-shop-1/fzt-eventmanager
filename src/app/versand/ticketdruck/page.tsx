import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { TicketSeiten } from "@/components/TicketSeiten";
import { DruckKnopf } from "@/components/DruckKnopf";

export const metadata = { title: "Tickets drucken | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Tickets drucken wie ein Anschreiben.
 *
 * Bisher führte der Knopf auf die PDF-Datei. Die zeigt der Browser im
 * PDF-Betrachter an, und dort gibt es kein Druckfenster mit Drucker,
 * Format und Anzahl. Auf dem Handy heißt das: teilen, suchen, drucken.
 *
 * Diese Seite holt dieselbe Datei, zeichnet ihre Seiten im Browser und
 * gibt sie als gewöhnliche Seite aus. Danach ist es derselbe Fall wie
 * beim Anschreiben: ein Tipp, und das Druckfenster steht da.
 *
 * Die Datei selbst bleibt erreichbar, der Link steht unten. Wer sie
 * weiterschicken oder ablegen will, braucht sie weiterhin.
 */
export default async function TicketdruckSeite({
  searchParams,
}: {
  searchParams: Promise<{ nur?: string; sofort?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team", "foyer"].includes(benutzer.rolle)) redirect("/");

  const { nur, sofort } = await searchParams;
  const quelle = `/versand/tickets${nur ? `?nur=${encodeURIComponent(nur)}` : ""}`;

  return (
    <div className="space-y-5">
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Tickets drucken</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          {nur ? `Bestellung ${nur}. ` : "Alle offenen Ticketsendungen. "}
          Eine Seite je Ticket, ohne Preis. Lege das Ticketpapier ein und drucke in
          Originalgröße, also ohne Anpassen oder Verkleinern, sonst stimmt der Strichcode nicht
          mehr.
        </p>
      </header>

      <div className="print:hidden">
        <DruckKnopf text="Tickets drucken" hinweis="in Originalgröße, ohne Skalierung" />
      </div>

      <TicketSeiten quelle={quelle} sofort={sofort === "1"} />

      <p className="print:hidden">
        <Link href={quelle} target="_blank" rel="noreferrer" className="text-sm underline">
          Tickets als PDF-Datei öffnen
        </Link>
      </p>
    </div>
  );
}
