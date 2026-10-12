import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { erreichbarkeiten } from "@/lib/personal/handy";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { einwilligungZurueck, handySpeichern } from "./aktionen";

export const metadata = { title: "Handynummern | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Handynummern der Mitarbeiter, zum Nachtragen.
 *
 * Gebraucht für Dienstnachrichten per WhatsApp, etwa den Hinweis nach
 * der Pause im Foyer. Bisher stand keine einzige Nummer im Programm,
 * auch nicht in den Personalbögen (Florian, 12.10.2026).
 *
 * Zwei Dinge gehören dazu, und sie werden hier bewusst getrennt
 * gezeigt: die Nummer, die du nachtragen darfst, und die Einwilligung,
 * die nur die Person selbst geben kann.
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
          Die Nummer kannst du hier nachtragen. Das Ja dazu gibt jede Person selbst im Eventmanager,
          und sie kann es jederzeit wieder zurücknehmen. Ohne Ja geht nichts hinaus, dann bleibt es
          bei der Mail.
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

            {/*
              Der Stand der Einwilligung. Geben kann sie nur die Person
              selbst, hier steht nur, woran wir sind.
            */}
            <div className="min-w-40 text-xs">
              {p.whatsappOk === true ? (
                <span style={{ color: "var(--gut)" }}>
                  hat zugestimmt{p.gefragtAm ? `, ${vorZeit(p.gefragtAm)}` : ""}
                </span>
              ) : p.whatsappOk === false ? (
                <span className="text-leise">möchte lieber Mail</span>
              ) : (
                <span style={{ color: "var(--warnung)" }}>noch nicht gefragt</span>
              )}
              {p.whatsappOk === true && (
                <form action={einwilligungZurueck} className="mt-1">
                  <input type="hidden" name="id" value={p.benutzerId} />
                  <button type="submit" className="text-xs text-leise underline">
                    zurücknehmen
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
