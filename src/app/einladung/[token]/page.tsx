import Link from "next/link";
import { Logo } from "@/components/Logo";
import { EinladungFormular } from "@/components/EinladungFormular";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { einladungLesen } from "@/lib/dienstplan/einladung";

export const metadata = { title: "Einladung | FZT Eventmanager", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Einladung fürs Showteam. Florian verschickt diesen Link, jeder trägt sich
 * selbst ein und landet danach im Dienstplan.
 */
export default async function EinladungSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const einladung = await einladungLesen(token);
  const gueltig = einladung !== null;
  const showteam = (einladung?.rolle ?? "showteam") === "showteam";
  const schon = await angemeldeterBenutzer();

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <header className="mb-6 flex flex-col items-center text-center">
        <Logo hoehe={64} />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {showteam ? "Willkommen im Showteam" : "Willkommen im Eventmanager"}
        </h1>
        <p className="mt-2 text-sm text-leise">
          {showteam
            ? "Trag dich einmal ein. Danach siehst du im Eventmanager, wann du arbeitest, kannst offene Schichten übernehmen und fragen, wenn du mal nicht kannst."
            : "Trag dich einmal ein und wähl ein Passwort. Danach bist du angemeldet und siehst alles, was du für deinen Dienst im Florian Zimmer Theater brauchst."}
        </p>
      </header>

      {!gueltig ? (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Dieser Link gilt nicht mehr. Bitte frag Florian nach dem neuen.
        </p>
      ) : schon ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          Du bist schon als {schon.name} angemeldet.{" "}
          <Link href={showteam ? "/dienstplan" : "/"} className="underline">
            {showteam ? "Zum Dienstplan" : "Zur Übersicht"}
          </Link>
        </p>
      ) : (
        <>
          <EinladungFormular token={token} email={einladung?.email} mitPosition={showteam} />
          <p className="mt-6 text-center text-xs text-leise">
            Schon einen Zugang?{" "}
            <Link href={showteam ? "/anmelden?weiter=/dienstplan" : "/anmelden"} className="underline">
              Hier anmelden
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
