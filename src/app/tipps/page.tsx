import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { alleReihen, alleTipps } from "@/lib/tipps/db";
import { TippsListe } from "@/components/TippsListe";

export const metadata = { title: "Tipps & Tricks | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Eine kleine Videosammlung mit Anleitungen fürs Showteam, zum Beispiel
 * wie eine 12-Volt-Batterie geladen wird. Jeder mit Zugang zu diesem
 * Bereich kann ein Video hochladen, löschen dürfen nur Florian und Team
 * (Florian, 28.09.2026).
 */
export default async function TippsSeite() {
  const benutzer = await angemeldeterBenutzer();
  const [tipps, reihen] = await Promise.all([alleTipps(), alleReihen()]);
  const buero = benutzer?.rolle === "chef" || benutzer?.rolle === "team";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tipps & Tricks</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Kurze Video-Anleitungen fürs Showteam. Wer etwas gelernt hat, das andere auch wissen sollten, lädt es
          hier hoch. Was sich nicht in einem Video erklären lässt, wird eine Anleitung in mehreren Schritten,
          die man der Reihe nach durchgeht.
        </p>
      </header>

      <TippsListe
        tipps={tipps}
        reihen={reihen}
        darfHochladen={Boolean(benutzer)}
        darfLoeschen={buero}
      />
    </div>
  );
}
