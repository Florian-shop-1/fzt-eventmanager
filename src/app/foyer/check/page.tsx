import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { WaschtagKasten } from "@/components/Waschtag";
import { offeneHemdmeldungen, waschstand } from "@/lib/foyer/waschtag";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { ShowcheckListe } from "@/components/ShowcheckListe";
import { CheckVorschlag } from "@/components/CheckVorschlag";
import {
  abschnittTitel,
  bereicheVon,
  checkliste,
  offeneVorschlaege,
  type Bereich,
  type Punkt,
} from "@/lib/showcheck/db";
import { namenImDienst } from "@/lib/showcheck/namen";
import Link from "next/link";
import { geschenkeAmTag, type Geschenkstand } from "@/lib/abbrecher/geschenk-erinnerung";
import { punktDazu, punktEntfernen, punktUmbenennen, vorschlagAbhaken, vorschlagEinreichen, waschtagAbhaken } from "@/app/showcheck/aktionen";

export const metadata = { title: "Foyer-Check | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die To-do-Liste des Foyers, zum Abhaken.
 *
 * "wir machen das nun so wie in der show.. sie müssen abhaken und wir
 * kontrollieren es dann" (Florian, 05.10.2026). Die Punkte stammen aus
 * seiner Aufstellung "Foyer to do" und stehen in der Datenbank, siehe
 * migrations/137_foyer_checkliste.sql.
 *
 * Abgehakt wird je Tag, nicht je Vorstellung: Das Foyer arbeitet den
 * Abend durch, egal wie viele Shows laufen.
 */
export default async function FoyerCheckSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!["chef", "team", "foyer"].includes(b.rolle)) redirect("/");

  const { abend, monat, meldung } = await searchParams;

  /*
    Der Waschtag gehoert aufs Foyerblatt: Dort steht jemand, der die
    Maschine anwerfen kann (Florian, 18.10.2026).
  */
  const [wasch, hemdmeldungen] = await Promise.all([
    waschstand().catch(() => null),
    offeneHemdmeldungen().catch(() => []),
  ]);
  const termine = await alleShowtage();

  // Ein Link kann auf eine einzelne Vorstellung zeigen. Gemeint ist dann
  // ihr Tag, denn das Foyer hakt den Tag ab.
  const tagVonShow = abend
    ? termine.find((t) => t.shows.some((sh) => sh.ditixEventId === abend))
    : undefined;

  const { gewaehlt, monat: aufgeschlagen, heute } = await waehleAbend(termine, {
    abend: tagVonShow?.ditixEventId ?? abend,
    monat,
  });

  const tag = termine.find((t) => t.ditixEventId === gewaehlt) ?? null;
  const punkte = gewaehlt ? await checkliste(gewaehlt, "foyer") : [];

  /*
    Die Geschenke an der Magic-Bar, als Punkt in der Liste.

    "bitte in der foyer checkliste einen punkt auftauchen lassen, heute
    gibts geschenke, dann den link dahinter direkt in geschenke, dort
    wird dann abgehakt" (Florian, 12.10.2026).

    Deshalb kein Punkt in der Datenbank: Er steht nur an den Abenden da,
    an denen wirklich etwas bereitliegt, und sein Haken kommt von der
    Geschenkeliste selbst. Zweimal abhaken waere zweimal dieselbe
    Arbeit, und die zweite macht dann keiner.
  */
  const geschenkstand: Geschenkstand | null = tag ? await geschenkeAmTag(tag.datum) : null;

  const vorschlaege = b.rolle === "chef" ? await offeneVorschlaege("foyer") : [];

  /*
    Am geteilten Zugang fragen wir, wer abhakt, und bieten die
    Eingeteilten des Abends an (Florian, 05.10.2026).
  */
  const namen =
    b.geteilt && tag
      ? await namenImDienst({
          liste: "foyer",
          eventIds: tag.shows.map((sh) => sh.ditixEventId),
          datum: tag.datum,
        })
      : [];

  /*
    Der Flo-Zirkus hat keine Pause.

    An einem Tag mit Flo-Zirkus faengt die Liste bei dessen Anfangszeit
    an, weil das Foyer dann aufsperrt. Die Abschnitte Pause, erste und
    zweite Haelfte gehoeren aber zur ULMFASSBAR am Abend: "beim
    flo-zirkus gibts keine pause. die checkliste betrifft die show im
    anschluss ULMFASSBAR" (Florian, 07.10.2026).

    Deshalb steht es an diesen Abenden oben, mit der Uhrzeit der Show,
    um die es geht.
  */
  const zirkus = tag?.shows.find((sh) => /flo.?zirkus/i.test(sh.name)) ?? null;
  const danach = zirkus
    ? (tag?.shows.find((sh) => sh.uhrzeit > zirkus.uhrzeit && /ulmfassbar/i.test(sh.name)) ??
       tag?.shows.find((sh) => sh.uhrzeit > zirkus.uhrzeit) ??
       null)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Foyer-Check</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Die To-do-Liste des Abends, vom Einstempeln bis zum Ausstempeln. Jeder Haken zeigt den
          anderen, dass es erledigt ist.
        </p>
        <p className="mt-2 max-w-prose text-sm text-leise">
          Die Uhrzeiten rechnen sich aus der ersten Vorstellung des Tages: Beginnt sie früher, rückt
          alles mit.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {/*
        Der Schlüssel.

        Steht hier und nicht in einem Zettel an der Pinnwand: Wer abends
        allein aufsperrt, sucht ihn genau einmal (Florian, 05.10.2026).
      */}
      <p
        className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
      >
        <strong>Schlüssel:</strong> Der blaue Schlüssel für den Lagerraum und fürs Foyer liegt immer
        unter beziehungsweise hinter der Bar.
      </p>

      <AbendAuswahl
        basisPfad="/foyer/check"
        gewaehlt={gewaehlt}
        monat={aufgeschlagen}
        heute={heute}
        abende={termine.map((t) => ({
          ditixEventId: t.ditixEventId,
          abgesagt: t.abgesagt,
          datum: t.datum,
          uhrzeit: t.uhrzeit,
          uhrzeiten: t.uhrzeiten,
          name: t.name,
          hinweis: t.shows.length > 1 ? `${t.shows.length} Vorstellungen` : "",
        }))}
      />

      {wasch && (
        <WaschtagKasten stand={wasch} meldungen={hemdmeldungen} abhaken={waschtagAbhaken} />
      )}

      {!gewaehlt || !tag ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Wähle oben einen Abend.
        </p>
      ) : (
        <>
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
            <strong>
              {tag.datum.split("-").reverse().join(".")}
              {tag.uhrzeiten.length > 0 ? `, ${tag.uhrzeiten.join(" und ")} Uhr` : ""}
            </strong>{" "}
            <span className="text-leise">{tag.name}</span>
          </p>

          {zirkus && (
            <p
              className="rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
            >
              <strong>Der Flo-Zirkus hat keine Pause.</strong>{" "}
              {danach ? (
                <>
                  Die Abschnitte Pause, erste und zweite Hälfte gehören zur{" "}
                  <strong>{danach.name}</strong> um {danach.uhrzeit} Uhr im Anschluss. Beim Flo-Zirkus um{" "}
                  {zirkus.uhrzeit} Uhr läuft der Service durch.
                </>
              ) : (
                <>
                  Die Abschnitte Pause, erste und zweite Hälfte gehören zur ULMFASSBAR im Anschluss. Beim
                  Flo-Zirkus um {zirkus.uhrzeit} Uhr läuft der Service durch.
                </>
              )}
            </p>
          )}

          {bereicheVon("foyer").map((bereich) => (
            <Abschnitt
              key={bereich}
              bereich={bereich}
              punkte={punkte.filter((p) => p.bereich === bereich)}
              abend={gewaehlt}
              datum={tag.datum}
              chef={b.rolle === "chef"}
              showUhrzeit={tag.uhrzeit}
              pausenUhrzeit={danach?.uhrzeit ?? null}
              nameNoetig={b.geteilt}
              namen={namen}
              // Die Geschenke gehoeren zum Einlass: Dann stehen die
              // Gaeste an der Bar und fragen danach.
              geschenkeZeigen={bereich === "foyer_einlass"}
              geschenke={geschenkstand}
            />
          ))}

          <CheckVorschlag
            liste="foyer"
            abend={gewaehlt}
            vorschlaege={vorschlaege}
            chef={b.rolle === "chef"}
            einreichen={vorschlagEinreichen}
            abhaken={vorschlagAbhaken}
          />
        </>
      )}
    </div>
  );
}

function Abschnitt({
  bereich,
  punkte,
  abend,
  datum,
  chef,
  showUhrzeit,
  pausenUhrzeit,
  nameNoetig,
  namen,
  geschenke,
  geschenkeZeigen,
}: {
  bereich: Bereich;
  punkte: Punkt[];
  abend: string;
  datum: string;
  chef: boolean;
  /** Anfang der ersten Vorstellung: Daran haengen Vorbereiten und Einlass. */
  showUhrzeit: string;
  /** Die Show mit der Pause, wenn es nicht die erste ist (Flo-Zirkus-Tage). */
  pausenUhrzeit: string | null;
  nameNoetig: boolean;
  namen: string[];
  /** Was an diesem Abend an der Magic-Bar bereitliegt, oder nichts. */
  geschenke: Geschenkstand | null;
  /** Nur im Abschnitt Einlass: Dort steht die Zeile zu den Geschenken. */
  geschenkeZeigen: boolean;
}) {
  if (punkte.length === 0 && !chef && !geschenkeZeigen) return null;

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-leise">
        {abschnittTitel(bereich, showUhrzeit, pausenUhrzeit)}
      </h2>

      {/*
        Der Geschenkepunkt. Abgehakt wird er nicht hier, sondern auf der
        Geschenkeliste, wenn der Gast seines bekommen hat. Deshalb kein
        Kaestchen zum Tippen, sondern der Haken als Anzeige und ein
        Knopf, der direkt dorthin fuehrt.
      */}
      {/*
        Nichts hinterlegt? Dann steht das auch da. "bei der To-Do liste
        könntest du machen wenn keine drin sind: heute keine
        hinterlegten Geschenke" (Florian, 12.10.2026). Eine Zeile, die
        an leeren Abenden einfach fehlt, verwechselt man mit einer
        Zeile, die man übersehen hat.
      */}
      {geschenkeZeigen && !geschenke && (
        <p className="mb-3 rounded-lg border border-dashed border-linie px-3 py-2 text-sm text-leise">
          Heute keine hinterlegten Geschenke.
        </p>
      )}

      {geschenkeZeigen && geschenke && (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: geschenke.offeneGaeste === 0 ? "var(--gut)" : "var(--gold)",
            background: geschenke.offeneGaeste === 0 ? "var(--gut-hell)" : "var(--gold-hell)",
          }}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border text-base"
            style={{
              borderColor: geschenke.offeneGaeste === 0 ? "var(--gut)" : "var(--linie)",
              color: "var(--gut)",
            }}
          >
            {geschenke.offeneGaeste === 0 ? "✓" : ""}
          </span>
          <span className="min-w-0 flex-1">
            <strong>Heute gibt es Geschenke.</strong>{" "}
            {geschenke.offeneGaeste === 0 ? (
              <>Alle {geschenke.gaeste === 1 ? "ein Gast hat seines" : `${geschenke.gaeste} Gäste haben ihre`} bekommen.</>
            ) : (
              <>
                {geschenke.offeneGaeste === 1 ? "Ein Gast" : `${geschenke.offeneGaeste} Gäste`} holen sich an
                der Magic-Bar etwas ab
                {geschenke.offeneStueck !== geschenke.offeneGaeste
                  ? `, zusammen ${geschenke.offeneStueck} Stück`
                  : ""}
                . Abgehakt wird in der Geschenkeliste, sobald es ausgegeben ist.
              </>
            )}
          </span>
          <Link
            href="/geschenke"
            className="whitespace-nowrap rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm print:hidden"
          >
            Zur Geschenkeliste
          </Link>
        </div>
      )}

      <ShowcheckListe
        abend={abend}
        datum={datum}
        nameNoetig={nameNoetig}
        namen={namen}
        punkte={punkte.map((p) => ({
          id: p.id,
          text: p.text,
          erledigtVon: p.erledigtVon,
          erledigtAm: p.erledigtAm,
          videoUrl: p.videoUrl,
          videoTitel: p.videoTitel,
          linkUrl: p.linkUrl,
          linkTitel: p.linkTitel,
          hervorgehoben: p.hervorgehoben,
        }))}
      />

      {chef && (
        <form action={punktDazu} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="abend" value={abend} />
          <input type="hidden" name="bereich" value={bereich} />
          <input type="hidden" name="liste" value="foyer" />
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
                  <input type="hidden" name="liste" value="foyer" />
                  <input name="text" defaultValue={p.text} maxLength={300} className="min-w-[18rem] flex-1 text-sm" />
                  <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs">
                    Speichern
                  </button>
                </form>
                <form action={punktEntfernen}>
                  <input type="hidden" name="abend" value={abend} />
                  <input type="hidden" name="punkt" value={p.id} />
                  <input type="hidden" name="liste" value="foyer" />
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
