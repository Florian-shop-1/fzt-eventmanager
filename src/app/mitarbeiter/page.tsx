import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { akten } from "@/lib/personal/akte";

export const metadata = { title: "Mitarbeiter | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ROLLE: Record<string, string> = {
  chef: "Geschäftsführung",
  team: "Büro",
  gastro: "Gastronomie",
  foyer: "Foyer",
  showteam: "Showteam",
  buchhaltung: "Buchhaltung",
  nebenjob: "Nebenjob",
  content: "Content Creator",
};

/**
 * Die Liste der Leute, von hier geht es in die Personalakte.
 *
 * "ich möchte bitte auf Mitarbeiter klicken können, Mitarbeiter
 * auswählen und wie so eine Personalakte auf einen Blick haben"
 * (Florian, 14.10.2026).
 */
export default async function MitarbeiterSeite() {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");

  const liste = await akten();
  const aktive = liste.filter((p) => p.aktiv);
  const gesperrt = liste.filter((p) => !p.aktiv);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mitarbeiter</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Eine Akte je Person: Zugang, Personalbogen, Vertrag, Geheimhaltung, Stunden. Von dort lässt
          sich auch der Personalbogen noch einmal anfordern. Wer bei uns keinen Arbeitsvertrag hat,
          sondern von außen kommt, steht hier nicht, sondern nur unter Zugänge. Sichtbar nur für
          Werner, Kevin und Florian.
        </p>
      </header>

      <Tafel titel={`Aktiv (${aktive.length})`} leute={aktive} />
      {gesperrt.length > 0 && <Tafel titel={`Gesperrt (${gesperrt.length})`} leute={gesperrt} />}
    </div>
  );
}

function Tafel({ titel, leute }: { titel: string; leute: Awaited<ReturnType<typeof akten>> }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">{titel}</h2>
      <ul className="overflow-hidden rounded-lg border border-linie bg-flaeche">
        {leute.map((p) => (
          <li key={p.id} className="border-b border-linie last:border-0">
            <Link href={`/mitarbeiter/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gold-hell">
              <span className="min-w-48 flex-1 font-medium">{p.name}</span>
              <span className="text-xs text-leise">{ROLLE[p.rolle] ?? p.rolle}</span>
              {/*
                Zwei Dinge, die man auf der Liste sehen will, ohne zu
                klicken: fehlt der Bogen, und war die Person je drin.
              */}
              {!p.personalbogenAm && p.art !== "extern" && (
                <span
                  className="rounded px-2 py-0.5 text-xs"
                  style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}
                >
                  Personalbogen fehlt
                </span>
              )}
              {!p.letzterLogin && (
                <span className="rounded px-2 py-0.5 text-xs text-leise" style={{ background: "var(--hintergrund)" }}>
                  nie angemeldet
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
