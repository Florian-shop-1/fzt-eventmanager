import Link from "next/link";
import { Logo } from "@/components/Logo";
import { EinladungFormular } from "@/components/EinladungFormular";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { einladungGueltig } from "@/lib/dienstplan/einladung";

export const metadata = { title: "Willkommen im Showteam | FZT Eventmanager", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Einladung fürs Showteam. Florian verschickt diesen Link, jeder trägt sich
 * selbst ein und landet danach im Dienstplan.
 */
export default async function EinladungSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gueltig = await einladungGueltig(token);
  const schon = await angemeldeterBenutzer();

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <header className="mb-6 flex flex-col items-center text-center">
        <Logo hoehe={64} />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Willkommen im Showteam</h1>
        <p className="mt-2 text-sm text-leise">
          Trag dich einmal ein. Danach siehst du im Eventmanager, wann du arbeitest, kannst offene
          Schichten übernehmen und fragen, wenn du mal nicht kannst.
        </p>
      </header>

      {!gueltig ? (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Dieser Link gilt nicht mehr. Bitte frag Florian nach dem neuen.
        </p>
      ) : schon ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          Du bist schon als {schon.name} angemeldet.{" "}
          <Link href="/dienstplan" className="underline">
            Zum Dienstplan
          </Link>
        </p>
      ) : (
        <>
          <EinladungFormular token={token} />
          <p className="mt-6 text-center text-xs text-leise">
            Schon einen Zugang?{" "}
            <Link href="/anmelden?weiter=/dienstplan" className="underline">
              Hier anmelden
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
