import Link from "next/link";

import { Logo } from "@/components/Logo";
import { linkAnfordern } from "./aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

export const metadata = { title: "Passwort vergessen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Passwort vergessen, Schritt eins: Adresse eintragen.
 *
 * Die Antwort ist immer dieselbe, auch wenn es den Zugang nicht gibt.
 * Sonst könnte jeder durchprobieren, wer bei uns arbeitet.
 */
export default async function PasswortVergessenSeite({
  searchParams,
}: {
  searchParams: Promise<{ gesendet?: string }>;
}) {
  const { gesendet } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-12">
      <header className="mb-8 flex flex-col items-center text-center">
        <Logo hoehe={78} />
        <p className="mt-5 text-sm text-leise">Passwort vergessen</p>
      </header>

      {gesendet === "ja" ? (
        <div className="space-y-4 rounded-lg border border-linie bg-flaeche p-6 text-sm">
          <p>
            <strong>Wenn es diesen Zugang gibt, ist die Mail unterwegs.</strong> Darin steht ein
            Link, über den du dir selbst ein neues Passwort setzen kannst.
          </p>
          <p className="text-leise">
            Der Link gilt eine Stunde. Schau auch im Spam nach, wenn nach ein paar Minuten nichts da
            ist.
          </p>
          <p className="text-leise">
            Die Tablets im Foyer und hinter der Bühne haben kein eigenes Postfach. Für die hilft nur
            das Büro.
          </p>
          <Link href="/anmelden" className="inline-block underline">
            Zurück zum Anmelden
          </Link>
        </div>
      ) : (
        <form action={linkAnfordern} className="space-y-4 rounded-lg border border-linie bg-flaeche p-6">
          <p className="text-sm text-leise">
            Trag deine E-Mail-Adresse ein. Du bekommst einen Link, über den du dir selbst ein neues
            Passwort setzt.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">E-Mail oder Benutzername</span>
            <input type="text" name="email" required autoFocus autoComplete="username" />
          </label>

          <Absendeknopf text="Link schicken" laeuftText="einen Moment..." />

          <p className="text-center text-xs text-leise">
            <Link href="/anmelden" className="underline">
              Zurück zum Anmelden
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
