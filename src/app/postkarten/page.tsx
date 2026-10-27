import Link from "next/link";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { karten, stand, type Postkarte } from "@/lib/postkarte/db";
import { lesenEingerichtet } from "@/lib/postkarte/lesen";
import { PostkartenScanner } from "@/components/PostkartenScanner";
import { PostkarteSchwaerzen } from "@/components/PostkarteSchwaerzen";
import { kartenHighlight, kartenSperren, kartenStand } from "./aktionen";
import { zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Postkarten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Gästepostkarten: scannen, lesen lassen, freigeben.
 *
 * "Tausende echte, handgeschriebene Reaktionen begeisterter Zuschauer.
 * Das muss digital zum Erlebnis werden" (Florian, 27.10.2026).
 *
 * Der Ablauf steht bewusst untereinander auf einer Seite: oben scannen,
 * darunter der Stand, darunter die Karten, die auf eine Entscheidung
 * warten. Wer im Foyer steht, soll nicht zwischen Reitern suchen.
 *
 * Zwei Dinge bleiben getrennt, und das sieht man auch:
 * die Bewertung der KI (ist die Karte gut genug?) und der Datenschutz
 * (darf sie überhaupt gezeigt werden?). Eine 10 ohne Schwärzung geht
 * nicht hinaus.
 */
export default async function PostkartenSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeigen?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return null;
  if (!["chef", "team", "foyer"].includes(benutzer.rolle)) {
    return (
      <div className="mx-auto max-w-prose rounded-lg border border-linie bg-flaeche p-6 text-sm">
        <h1 className="text-lg font-semibold">Postkarten</h1>
        <p className="mt-2 text-leise">
          Für die Gästepostkarten fehlt dir die Freigabe. Florian vergibt sie unter Zugänge.
        </p>
      </div>
    );
  }

  const { zeigen } = await searchParams;
  const darfEntscheiden = darfKaufmaennisches(benutzer.rolle);
  const z = await stand();

  /*
    Was die Liste zeigt. Vorgeschlagen wird, was die KI mit 9 oder
    besser bewertet hat: "Standardmässig nur Karten mit einer
    KI-Bewertung von mindestens 9/10 zur Veroeffentlichung
    vorschlagen" (Florian, 27.10.2026).
  */
  const sicht = zeigen ?? "vorschlag";
  const liste =
    sicht === "alle"
      ? await karten({ anzahl: 120 })
      : sicht === "veroeffentlicht"
        ? await karten({ status: "freigegeben", anzahl: 120 })
        : sicht === "zurueck"
          ? await karten({ status: "zurueck", anzahl: 120 })
          : (await karten({ status: "gelesen", anzahl: 200 })).filter((k) => k.bewertung >= 9);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Postkarten der Gäste</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Karten einscannen, lesen lassen und für die Gästewand freigeben. Öffentlich wird nur, was
          hier jemand freigibt, und nur als geschwärzte Fassung. Das Original bleibt im Haus.
        </p>
      </header>

      {!lesenEingerichtet() && (
        <p
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>Noch kein Schlüssel.</strong> Ohne ANTHROPIC_API_KEY kann niemand die Handschrift
          lesen. Die Karten lassen sich dann nicht scannen.
        </p>
      )}

      <PostkartenScanner />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Zahl wert={z.gesamt} text="Karten gescannt" />
        <Zahl wert={z.geeignet} text="mit 9 oder 10 bewertet" />
        <Zahl wert={z.veroeffentlicht} text="auf der Wand" />
        <Zahl wert={z.gelesen} text="warten auf Entscheidung" />
        <Zahl wert={z.gesperrt} text="wegen Persönlichem gesperrt" />
        <Zahl wert={z.schnitt} text="Schnitt der Bewertungen" />
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {[
          ["vorschlag", "Vorschläge für die Wand"],
          ["alle", "Alle Karten"],
          ["veroeffentlicht", "Auf der Wand"],
          ["zurueck", "Zurückgehalten"],
        ].map(([wert, text]) => (
          <Link
            key={wert}
            href={`/postkarten?zeigen=${wert}`}
            className="rounded-md border px-3 py-1"
            style={
              sicht === wert
                ? { borderColor: "var(--gold)", background: "var(--gold-hell)" }
                : { borderColor: "var(--linie)" }
            }
          >
            {text}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie p-8 text-center text-sm text-leise">
          {sicht === "vorschlag"
            ? "Gerade schlägt die KI nichts vor. Alles mit 9 oder 10 ist entschieden."
            : "Hier ist noch nichts."}
        </p>
      ) : (
        <div className="space-y-3">
          {liste.map((k) => (
            <Karte key={k.id} k={k} darfEntscheiden={darfEntscheiden} />
          ))}
        </div>
      )}
    </div>
  );
}

function Zahl({ wert, text }: { wert: number; text: string }) {
  return (
    <div className="rounded-lg border border-linie bg-flaeche px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{wert}</div>
      <div className="text-xs text-leise">{text}</div>
    </div>
  );
}

function Karte({ k, darfEntscheiden }: { k: Postkarte; darfEntscheiden: boolean }) {
  const offenerDatenschutz = k.datenschutz !== "frei";

  return (
    <article className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded px-2 py-0.5 font-semibold"
              style={{
                background: k.bewertung >= 9 ? "var(--gut-hell)" : "var(--hintergrund)",
                border: `1px solid ${k.bewertung >= 9 ? "var(--gut)" : "var(--linie)"}`,
              }}
            >
              {k.bewertung}/10
            </span>
            <span className="text-leise">{k.stimmung}</span>
            {k.themen.map((t) => (
              <span key={t} className="rounded bg-hintergrund px-2 py-0.5 text-leise">
                {t}
              </span>
            ))}
            {k.highlight && (
              <span className="rounded px-2 py-0.5" style={{ background: "var(--gold-hell)" }}>
                Highlight
              </span>
            )}
            <span
              className="rounded px-2 py-0.5"
              style={{
                background: offenerDatenschutz ? "var(--warnung-hell)" : "var(--gut-hell)",
                color: offenerDatenschutz ? "var(--warnung)" : "var(--gut)",
              }}
            >
              {k.datenschutz === "frei"
                ? "geschwärzt und frei"
                : k.datenschutz === "gesperrt"
                  ? `${k.personenbezug.length} Stellen mit Persönlichem`
                  : "Datenschutz offen"}
            </span>
            <span className="text-leise">
              {k.einwilligung === "erteilt" ? "Einwilligung liegt vor" : "ohne Einwilligung"}
            </span>
          </div>

          {k.zitat && <p className="mt-2 text-lg italic">„{k.zitat}“</p>}
          <p className="mt-1 text-sm text-leise">{k.zusammenfassung}</p>
          {k.begruendung && <p className="mt-1 text-xs text-leise">KI: {k.begruendung}</p>}

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-leise">
              Ganzer Text und Original
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm">{k.transkript}</p>
            {k.hatBild && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/postkarte/bild/${k.id}`}
                alt="Original der Postkarte, nur intern"
                className="mt-2 max-h-96 rounded border border-linie"
              />
            )}
          </details>

          {darfEntscheiden && k.status !== "freigegeben" && (
            <PostkarteSchwaerzen
              id={k.id}
              fundstellen={k.personenbezug}
              einwilligung={k.einwilligung}
            />
          )}

          {k.bildOeffentlich && (
            <p className="mt-2 text-xs text-leise">
              Öffentlich seit {k.veroeffentlichtAm ? zeitpunkt(new Date(k.veroeffentlichtAm)) : "heute"}.{" "}
              <a href={k.bildOeffentlich} target="_blank" rel="noreferrer" className="underline">
                geschwärzte Fassung ansehen
              </a>
            </p>
          )}
          {k.notiz && <p className="mt-1 text-xs text-leise">{k.notiz}</p>}
        </div>

        {darfEntscheiden && (
          <div className="flex shrink-0 flex-col gap-1">
            <form action={kartenHighlight.bind(null, k.id, !k.highlight)}>
              <button type="submit" className="w-full rounded-md border border-linie px-3 py-1 text-xs">
                {k.highlight ? "kein Highlight" : "als Highlight"}
              </button>
            </form>
            {k.status !== "zurueck" && (
              <form action={kartenStand.bind(null, k.id, "zurueck", "")}>
                <button type="submit" className="w-full rounded-md border border-linie px-3 py-1 text-xs">
                  zurückhalten
                </button>
              </form>
            )}
            {k.status === "freigegeben" && (
              <form action={kartenSperren.bind(null, k.id, "Wieder von der Wand genommen.")}>
                <button type="submit" className="w-full rounded-md border border-linie px-3 py-1 text-xs">
                  von der Wand nehmen
                </button>
              </form>
            )}
            <form action={kartenStand.bind(null, k.id, "verworfen", "")}>
              <button type="submit" className="w-full rounded-md border border-linie px-3 py-1 text-xs">
                verwerfen
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
