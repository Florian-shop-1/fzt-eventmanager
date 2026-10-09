import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { allePost, empfaenger } from "@/lib/personal/hasenpost";
import { postAbschicken, postZurueckziehen } from "./aktionen";

export const metadata = { title: "Hasenpost | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Hasenpost: eine persoenliche Erinnerung, die der Hase ausrichtet.
 *
 * Der Empfaenger sieht nur den Hasen und den Satz, nie den Absender
 * (Florian, 04.10.2026). Hier steht beides, denn hier muss man wissen,
 * was man selbst losgeschickt hat.
 *
 * Gezeigt wird hoechstens einmal am Tag, so lange, bis der Mitarbeiter
 * "Mach ich!" klickt. Diese Seite sagt, wie oft der Hase schon da war.
 */
export default async function HasenpostSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (b.rolle !== "chef") redirect("/");

  const { meldung } = await searchParams;
  const [post, leute] = await Promise.all([allePost(), empfaenger()]);

  const offen = post.filter((p) => !p.erledigtAm);
  const erledigt = post.filter((p) => p.erledigtAm);

  const zeitpunkt = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hasenpost</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Eine persönliche Erinnerung an eine einzelne Person. Sie erscheint beim nächsten Öffnen des
          Eventmanagers als Hase aus dem Zylinder, so wie der Hase sonst auch. Dass sie von dir kommt,
          steht nirgends.
        </p>
        <p className="mt-2 max-w-prose text-sm text-leise">
          Der Hase fragt höchstens einmal am Tag und so lange, bis die Person &quot;Mach ich!&quot; klickt.
          Unten siehst du, wie oft er schon da war.
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

      <form action={postAbschicken} className="space-y-3 rounded-lg border border-linie bg-flaeche p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">An wen?</span>
          <select name="benutzer" defaultValue="" required className="text-sm">
            <option value="" disabled>
              Bitte auswählen
            </option>
            {leute.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/*
          Erinnern oder danken.

          Beim Dank schaut der Hase nicht fragend, und unter der Blase
          steht "Gern!" statt "Mach ich!": Es gibt nichts zuzusagen
          (Florian, 05.10.2026).
        */}
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-sm font-medium">Worum geht es?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="anlass" value="erinnern" defaultChecked />
            Erinnern
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="anlass" value="danke" />
            Danke sagen
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="anlass" value="gratulieren" />
            Gratulieren
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="anlass" value="sekt" />
            Anstoßen
          </label>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Was soll der Hase sagen?</span>
          <textarea
            name="text"
            rows={3}
            maxLength={400}
            required
            placeholder="Neuen Vertrag unterschreiben, sonst läuft der alte einfach weiter."
            className="w-full text-sm"
          />
          <span className="mt-1 block text-xs text-leise">
            Schreib es so, wie der Hase es sagen würde: kurz, freundlich, direkt an die Person. Der Vorname
            steht automatisch davor.
          </span>
        </label>

        <button type="submit" className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white">
          Hasen losschicken
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Unterwegs</h2>
        {offen.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linie px-4 py-6 text-center text-sm text-leise">
            Gerade ist der Hase mit nichts unterwegs.
          </p>
        ) : (
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
            {offen.map((p) => (
              <li key={p.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <strong>{p.name}</strong>
                  <span className="text-xs text-leise">
                    {p.gezeigtAnzahl === 0
                      ? "noch nicht gesehen"
                      : `${p.gezeigtAnzahl}× gezeigt, zuletzt ${zeitpunkt(p.zuletztGezeigtAm ?? p.angelegtAm)}`}
                  </span>
                  <form action={postZurueckziehen} className="ml-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-xs text-leise underline">
                      zurückziehen
                    </button>
                  </form>
                </div>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {erledigt.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Erledigt</h2>
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
            {erledigt.map((p) => (
              <li key={p.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <strong>{p.name}</strong>
                  <span className="text-xs" style={{ color: "var(--gut)" }}>
                    Mach ich, {zeitpunkt(p.erledigtAm!)}
                  </span>
                </div>
                <p className="text-leise">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
