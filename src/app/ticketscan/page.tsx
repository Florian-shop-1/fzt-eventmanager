import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { FLOTIX_URL } from "@/lib/flotix/tuer";

export const metadata = { title: "Tickets scannen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Weg vom Eventmanager zum Ticketscanner.
 *
 * "du musst einen button machen im eventmanager, der den mitarbeiter dort
 * hinbringt. der soll sonst nichts im backend sehen können.. nur die scans
 * bei flotix machen" (Florian, 29.10.2026).
 *
 * Gescannt wird nicht hier, sondern bei FloTix: Dort liegen die Tickets,
 * und dort wird entwertet. Diese Seite ist nur die Tür dahin. Wer sie
 * benutzt, braucht einen FloTix-Zugang mit der Rolle "Einlass"; die sieht
 * ausschließlich den Scanner, keine Bestellungen, keine Zahlen.
 *
 * Der Zugang ist ein eigener, das lässt sich nicht umgehen: Es sind zwei
 * Programme mit zwei Anmeldungen. Auf dem Handy bleibt die Anmeldung
 * stehen, in der Regel also einmal im Leben.
 */
export default async function TicketscanSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");

  return (
    <div className="max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets scannen</h1>
        <p className="mt-1 text-sm text-leise">
          Der Scanner läuft bei FloTix, dort liegen die Tickets. Dieser Knopf bringt dich hin.
        </p>
      </header>

      <a
        href={`${FLOTIX_URL}/einlass`}
        target="_blank"
        rel="noreferrer"
        className="block rounded-lg px-5 py-4 text-center text-lg font-semibold"
        style={{ background: "var(--gold)", color: "#fff" }}
      >
        Scanner öffnen
      </a>

      <div className="space-y-3 rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
        <p>
          Beim ersten Mal meldest du dich dort an. Danach bleibt die Anmeldung auf deinem Handy
          stehen, du landest also gleich beim Scanner. Wenn du keinen Zugang hast, sag Kevin oder
          Florian Bescheid.
        </p>
        <p>
          Oben wählst du die Station und die Vorstellung. Showtickets gehören an den Einlass, das
          Menü ins Restaurant, Souvenir und Stehtisch an die Theke. Hältst du ein Ticket an die
          falsche Station, sagt dir der Bildschirm, wohin es gehört, und es bleibt gültig.
        </p>
        <p>
          Jedes Ticket gilt einmal. Beim zweiten Scan steht da, wann es schon benutzt wurde. Hast du
          dich vertan, nimmst du das Entwerten gleich im Ergebnis wieder zurück.
        </p>
        <p className="text-leise">
          Parkplätze werden nicht gescannt. Der Gast fährt einfach herein.
        </p>
      </div>
    </div>
  );
}
