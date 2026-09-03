import { Angebotsvorschau } from "@/components/Angebotsvorschau";
import { kommendeTermine, terminBeschriftung } from "@/lib/ditix/spielplan";
import { holeAngebotspreise } from "@/lib/angebot/preisaktion";

export const metadata = { title: "Angebot | FZT Eventmanager" };
export const dynamic = "force-dynamic";

export default async function AngebotSeite() {
  // Der echte Spielplan statt eines freien Datumsfeldes. An Tagen mit
  // zwei Vorstellungen muss auswählbar sein, welche gemeint ist: Davon
  // hängt ab, ob die Gäste vor oder nach der Show essen.
  let vorstellungen: Array<{ id: string; datum: string; beschriftung: string }> = [];
  let fehler: string | null = null;

  try {
    vorstellungen = (await kommendeTermine(400)).map((t) => ({
      id: t.ditixEventId,
      datum: t.datum,
      beschriftung: terminBeschriftung(t),
    }));
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  // Preise der ersten Vorstellung gleich mitliefern, damit die Vorschau
  // nicht kurz mit den Preisen aus dem Artikelstamm rechnet.
  const startPreise = vorstellungen[0]
    ? await holeAngebotspreise(vorstellungen[0].id)
    : { preise: {}, abweichungen: [], fehler: null };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Angebot</h1>
        <p className="mt-1 text-sm text-leise">
          Aufgebaut wie eure bisherigen Angebote aus lexoffice. Links die Angaben, rechts das
          Ergebnis.
        </p>
      </header>

      {fehler && (
        <div className="rounded-lg border border-warnung bg-warnung-hell px-4 py-3 text-sm">
          Der Spielplan konnte nicht geladen werden, deshalb lässt sich keine Vorstellung
          auswählen. <span className="text-leise">{fehler}</span>
        </div>
      )}

      <Angebotsvorschau
        vorstellungen={vorstellungen}
        startPreise={startPreise.preise}
        startFehler={startPreise.fehler}
      />
    </div>
  );
}
