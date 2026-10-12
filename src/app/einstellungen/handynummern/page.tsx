import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { erreichbarkeiten } from "@/lib/personal/handy";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { handySpeichern, whatsappUmschalten } from "./aktionen";

export const metadata = { title: "Handynummern | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Handynummern der Mitarbeiter, zum Nachtragen.
 *
 * Gebraucht für Dienstnachrichten per WhatsApp, etwa den Hinweis nach
 * der Pause im Foyer. Bisher stand keine einzige Nummer im Programm,
 * auch nicht in den Personalbögen (Florian, 12.10.2026).
 *
 * Die Grundlage steht im Arbeitsvertrag, deshalb wird hier nur noch die
 * Nummer gepflegt. Der Schalter daneben ist die Ausnahme: für alte
 * Verträge und für den Fall, dass jemand mit gutem Grund widerspricht.
 */
export default async function HandynummernSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; fehler?: string }>;
}) {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) redirect("/");

  const { meldung, fehler } = await searchParams;
  const leute = await erreichbarkeiten();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Handynummern</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Für kurze Dienstnachrichten per WhatsApp, zum Beispiel den Hinweis nach der Pause im Foyer.
          Dass die Abstimmung auch über WhatsApp läuft, steht im Arbeitsvertrag; hier pflegst du nur
          die Nummern. Wer keine hinterlegt hat, bekommt dieselben Hinweise per Mail. Mit dem
          Schalter rechts kannst du einzelne Leute ausnehmen, etwa bei einem alten Vertrag.
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}>
          {fehler}
        </p>
      )}

      <ul className="space-y-2">
        {leute.map((p) => (
          <li key={p.benutzerId} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-linie bg-flaeche px-4 py-3">
            <div className="min-w-48 flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-leise">{p.rolle}</div>
            </div>

            <form action={handySpeichern} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={p.benutzerId} />
              <input type="hidden" name="name" value={p.name} />
              <input
                name="handy"
                defaultValue={p.handyLesbar}
                placeholder="0176 1234567"
                maxLength={30}
                className="w-44 text-sm"
              />
              <Absendeknopf text="Speichern" laeuftText="..." />
            </form>

            {/* Ohne Eintrag gilt der Vertrag, also WhatsApp. */}
            <form action={whatsappUmschalten} className="min-w-32 text-xs">
              <input type="hidden" name="id" value={p.benutzerId} />
              <input type="hidden" name="an" value={p.whatsappOk === false ? "ja" : "nein"} />
              <button
                type="submit"
                className="rounded px-2 py-0.5"
                style={
                  p.whatsappOk === false
                    ? { background: "var(--hintergrund)", color: "var(--text-leise)" }
                    : { background: "var(--gut-hell)", color: "var(--gut)" }
                }
                title={p.whatsappOk === false ? "Wieder aufnehmen" : "Von WhatsApp ausnehmen"}
              >
                {p.whatsappOk === false ? "nur Mail" : "per WhatsApp"}
              </button>
              {p.whatsappOk === false && p.gefragtAm && (
                <span className="ml-1 text-leise">seit {vorZeit(p.gefragtAm)}</span>
              )}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
