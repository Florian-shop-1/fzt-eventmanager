import { gastKlickMerken } from "@/lib/db/gaesteliste";
import { widerspruchEintragen } from "@/lib/db/werbewiderspruch";

/**
 * Die Bewertungsseite für eingeladene Gäste.
 *
 * Offen ohne Anmeldung, wie die Angebotsseite: Der Schlüssel in der
 * Adresse ist der Ausweis.
 *
 * Sie tut zwei Dinge. Sie merkt sich den Klick, damit die Erinnerung am
 * nächsten Tag nur an die geht, die noch nicht da waren. Und sie zeigt
 * die beiden Plattformen, auf denen wir Bewertungen sammeln.
 *
 * Bewusst keine Sternefrage wie bei den zahlenden Gästen: Der Gast ist
 * eingeladen worden und schon gebeten, öffentlich zu schreiben. Ihn hier
 * noch einmal zu sortieren wäre ein Umweg (Florian, 04.11.2026).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Bewertung | Florian Zimmer Theater" };

const GOOGLE = "https://search.google.com/local/writereview?placeid=ChIJM7SUXk3fm0cRLDoip8t0DRQ";
const TRIPADVISOR =
  "https://www.tripadvisor.de/UserReviewEdit-g198468-d24151397-Florian_Zimmer_Theater-Neu_Ulm_Swabia_Bavaria.html";

export default async function BewertenSeite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ abmelden?: string }>;
}) {
  const { token } = await params;
  const { abmelden } = await searchParams;

  const gast = await gastKlickMerken(token).catch(() => null);

  /*
    Abmelden geht über denselben Schlüssel.

    Der Eintrag landet im Werbewiderspruch, den auch die Vorfreude- und
    die Bewertungsmail lesen. So gilt die Abmeldung überall und nicht nur
    für diese eine Liste.
  */
  if (abmelden === "1" && gast?.email) {
    await widerspruchEintragen(gast.email, "Gästeliste, Bewertungsmail").catch(() => undefined);
  }

  const abgemeldet = abmelden === "1";
  const vn = (gast?.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Home of Magic</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {abgemeldet ? "Abgemeldet" : vn ? `Danke, ${vn}!` : "Danke!"}
        </h1>
      </header>

      {abgemeldet ? (
        <p className="text-center text-sm">
          Du bekommst von uns keine Hinweise dieser Art mehr. Hat sich das Formular vertan,
          schreib uns einfach an{" "}
          <a href="mailto:tickets@florianzimmer.com" className="underline">
            tickets@florianzimmer.com
          </a>
          .
        </p>
      ) : !gast ? (
        <p className="text-center text-sm">
          Diesen Link kennen wir nicht. Vielleicht ist er beim Kopieren abgeschnitten worden.
          Schreib uns gerne an{" "}
          <a href="mailto:tickets@florianzimmer.com" className="underline">
            tickets@florianzimmer.com
          </a>
          , dann klären wir das.
        </p>
      ) : (
        <>
          <p className="text-center text-sm">
            {gast.eingeladenVon
              ? `${gast.eingeladenVon} hat dich eingeladen, und wir haben dich sehr gerne bei uns begrüßt.`
              : "Wir haben dich sehr gerne bei uns begrüßt."}{" "}
            Such dir eine Plattform aus, beide dauern keine Minute.
          </p>

          <div className="space-y-3">
            <a
              href={GOOGLE}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border px-4 py-4 text-center font-medium"
              style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
            >
              Bei Google bewerten
            </a>
            <a
              href={TRIPADVISOR}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-linie px-4 py-4 text-center font-medium"
            >
              Bei Tripadvisor bewerten
            </a>
          </div>

          <p className="text-center text-xs text-leise">
            Schreib bitte kurz dazu, dass du als Gast eingeladen warst. Das gehört zur
            Ehrlichkeit und ist bei Bewertungen so vorgeschrieben.
          </p>
        </>
      )}
    </main>
  );
}
