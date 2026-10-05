import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { alleReihen, alleTipps, bereicheFuer, darfLoeschen } from "@/lib/tipps/db";
import { TippsListe } from "@/components/TippsListe";

export const metadata = { title: "Tipps & Tricks | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Eine kleine Videosammlung mit Anleitungen fürs Showteam, zum Beispiel
 * wie eine 12-Volt-Batterie geladen wird. Jeder mit Zugang zu diesem
 * Bereich kann ein Video hochladen. Loeschen darf, wer es hochgeladen
 * hat, und das nur am selben Tag; Florian darf immer alles
 * (Florian, 05.10.2026).
 */
export default async function TippsSeite() {
  const benutzer = await angemeldeterBenutzer();
  const [alle, alleR] = await Promise.all([alleTipps(), alleReihen()]);

  /*
    Jeder sieht die Anleitungen seines Bereichs.

    "Foyer Mitarbeiter sollen nur in die Tipp Tricks des Foyers. und Show
    nur in Show" (Florian, 05.10.2026). Buero und Chef sehen beides.
  */
  const bereiche = bereicheFuer(benutzer?.rolle);
  const tipps = alle.filter((t) => bereiche.includes(t.bereich ?? "show"));
  const reihen = alleR.filter((r) => bereiche.includes(r.bereich));
  /*
    Loeschen je Eintrag, nicht pauschal.

    Wer etwas hochgeladen hat, soll es am selben Tag wieder wegnehmen
    koennen, wenn es schiefging. Danach steht es fuer alle, und dann
    raeumt nur Florian auf (Florian, 05.10.2026).
  */
  const loeschbar = (e: { erstelltVon: string; erstelltAm: string }) => darfLoeschen(benutzer, e);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tipps & Tricks</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Kurze Video-Anleitungen für den Abend. Wer etwas gelernt hat, das andere auch wissen sollten, lädt es
          hier hoch. Was sich nicht in einem Video erklären lässt, wird eine Anleitung in mehreren Schritten,
          die man der Reihe nach durchgeht.
          {bereiche.length === 1
            ? bereiche[0] === "foyer"
              ? " Hier stehen die Anleitungen fürs Foyer."
              : " Hier stehen die Anleitungen für die Show."
            : " Beim Hochladen wählst du, ob es zur Show oder ins Foyer gehört."}
        </p>
      </header>

      <TippsListe
        tipps={tipps}
        reihen={reihen}
        darfHochladen={Boolean(benutzer)}
        loeschbar={loeschbar}
        bereiche={bereiche}
      />
    </div>
  );
}
