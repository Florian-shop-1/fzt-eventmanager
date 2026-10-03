import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { ShowcheckListe } from "@/components/ShowcheckListe";
import { BEREICHE, BEREICH_TITEL, checkliste, type Bereich, type Punkt } from "@/lib/showcheck/db";
import { punktDazu, punktEntfernen, punktUmbenennen } from "./aktionen";

export const metadata = { title: "Show-Check | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Checkliste für den Abend.
 *
 * Drei Listen, wie sie Florian am 03.10.2026 übergeben hat: vor der Show,
 * in der Pause, nach der Show. Abgehakt wird je Vorstellung; laufen zwei
 * Shows an einem Tag, hat jede ihre eigene Liste.
 *
 * Für das Showteam. Die Liste selbst ändert nur Florian: Was hier steht,
 * sind Handgriffe, an denen Tricks hängen.
 */
export default async function ShowcheckSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!["chef", "team", "showteam"].includes(b.rolle)) redirect("/");

  const { abend, monat } = await searchParams;
  const termine = await alleShowtage();
  const { gewaehlt, monat: aufgeschlagen, heute } = await waehleAbend(termine, { abend, monat });

  const tag = termine.find((t) => t.ditixEventId === gewaehlt) ?? null;
  const punkte = gewaehlt ? await checkliste(gewaehlt) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Show-Check</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Die drei Listen des Abends. Jeder Haken gilt für diese eine Vorstellung und zeigt den anderen,
          dass es erledigt ist.
        </p>
      </header>

      <AbendAuswahl
        basisPfad="/showcheck"
        gewaehlt={gewaehlt}
        monat={aufgeschlagen}
        heute={heute}
        abende={termine.map((t) => ({
          ditixEventId: t.ditixEventId,
          datum: t.datum,
          uhrzeit: t.uhrzeit,
          uhrzeiten: t.uhrzeiten,
          name: t.name,
          hinweis: t.shows.length > 1 ? `${t.shows.length} Vorstellungen` : "",
        }))}
      />

      {!gewaehlt || !tag ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Wähle oben einen Abend.
        </p>
      ) : (
        <>
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
            <strong>
              {tag.datum.split("-").reverse().join(".")}, {tag.uhrzeit} Uhr
            </strong>{" "}
            <span className="text-leise">{tag.name}</span>
          </p>

          {BEREICHE.map((bereich) => (
            <Liste
              key={bereich}
              bereich={bereich}
              punkte={punkte.filter((p) => p.bereich === bereich)}
              abend={gewaehlt}
              datum={tag.datum}
              chef={b.rolle === "chef"}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Liste({
  bereich,
  punkte,
  abend,
  datum,
  chef,
}: {
  bereich: Bereich;
  punkte: Punkt[];
  abend: string;
  datum: string;
  chef: boolean;
}) {
  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-leise">
        {BEREICH_TITEL[bereich]}
      </h2>

      {/*
        Abgehakt wird im Browser, ohne die Seite neu zu laden: Backstage
        wird im Halbdunkel schnell getippt (Florian, 03.10.2026).
      */}
      <ShowcheckListe
        abend={abend}
        datum={datum}
        punkte={punkte.map((p) => ({
          id: p.id,
          text: p.text,
          erledigtVon: p.erledigtVon,
          erledigtAm: p.erledigtAm,
        }))}
      />

      {chef && (
        <form action={punktDazu} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="abend" value={abend} />
          <input type="hidden" name="bereich" value={bereich} />
          <input name="text" maxLength={300} placeholder="Punkt ergänzen" className="min-w-[16rem] flex-1 text-sm" />
          <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
            Dazu
          </button>
        </form>
      )}

      {chef && punkte.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-leise">Liste bearbeiten</summary>
          <ul className="mt-2 space-y-1">
            {punkte.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <form action={punktUmbenennen} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="abend" value={abend} />
                  <input type="hidden" name="punkt" value={p.id} />
                  <input name="text" defaultValue={p.text} maxLength={300} className="min-w-[18rem] flex-1 text-sm" />
                  <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs">
                    Speichern
                  </button>
                </form>
                <form action={punktEntfernen}>
                  <input type="hidden" name="abend" value={abend} />
                  <input type="hidden" name="punkt" value={p.id} />
                  <button type="submit" className="text-xs underline text-leise">
                    raus
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
