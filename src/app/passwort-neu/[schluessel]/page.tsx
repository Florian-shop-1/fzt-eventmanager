import Link from "next/link";

import { Logo } from "@/components/Logo";
import { Absendeknopf } from "@/components/Absendeknopf";
import { tokenPruefen } from "@/lib/auth/vergessen";
import { neuesPasswortSetzen } from "./aktionen";

export const metadata = { title: "Neues Passwort | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Passwort vergessen, Schritt zwei: neues Passwort setzen.
 *
 * Der Link aus der Mail führt hierher. Gilt er nicht mehr, steht hier,
 * warum, und der Weg zurück zum Anfordern.
 */
export default async function PasswortNeuSeite({
  params,
  searchParams,
}: {
  params: Promise<{ schluessel: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { schluessel } = await params;
  const { fehler } = await searchParams;
  const stand = await tokenPruefen(schluessel);

  return (
    <div className="mx-auto max-w-sm py-12">
      <header className="mb-8 flex flex-col items-center text-center">
        <Logo hoehe={78} />
        <p className="mt-5 text-sm text-leise">Neues Passwort</p>
      </header>

      {!stand.gueltig ? (
        <div className="space-y-4 rounded-lg border border-linie bg-flaeche p-6 text-sm">
          <p style={{ color: "var(--blocker)" }}>
            <strong>{stand.grund}</strong>
          </p>
          <Link href="/passwort-vergessen" className="inline-block underline">
            Neuen Link anfordern
          </Link>
        </div>
      ) : (
        <form
          action={neuesPasswortSetzen}
          className="space-y-4 rounded-lg border border-linie bg-flaeche p-6"
        >
          <input type="hidden" name="schluessel" value={schluessel} />

          <p className="text-sm text-leise">
            Hallo {stand.name?.split(" ")[0]}, such dir ein neues Passwort aus. Mindestens zehn
            Zeichen.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">Neues Passwort</span>
            <input type="password" name="passwort" required autoFocus autoComplete="new-password" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">Noch einmal zur Sicherheit</span>
            <input type="password" name="wiederholung" required autoComplete="new-password" />
          </label>

          {fehler && (
            <p
              className="rounded border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--blocker)",
                background: "var(--blocker-hell)",
                color: "var(--blocker)",
              }}
            >
              {fehler}
            </p>
          )}

          <Absendeknopf text="Passwort speichern" laeuftText="einen Moment..." />
        </form>
      )}
    </div>
  );
}
