import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { PasswortFormular } from "@/components/PasswortFormular";

export const metadata = { title: "Mein Zugang | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ROLLE_TEXT: Record<string, string> = {
  chef: "Geschäftsführung, darf alles, auch Zugänge verwalten",
  team: "Team, darf alles außer Zugänge verwalten",
  gastro: "Gastronomie, sieht Funktionsheet und Küchenblatt",
};

export default async function KontoSeite() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mein Zugang</h1>
      </header>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between gap-3">
            <dt className="text-leise">Name</dt>
            <dd>{benutzer.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-leise">E-Mail</dt>
            <dd>{benutzer.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-leise">Berechtigung</dt>
            <dd className="text-right">{ROLLE_TEXT[benutzer.rolle] ?? benutzer.rolle}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="mb-3 text-sm font-semibold">Passwort ändern</h2>
        {benutzer.mussPasswortAendern && (
          <p className="mb-3 rounded border px-3 py-2 text-sm"
             style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
            Du arbeitest noch mit dem Startpasswort. Bitte vergib ein eigenes.
          </p>
        )}
        <PasswortFormular />
      </section>
    </div>
  );
}
