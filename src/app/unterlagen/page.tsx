import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { alleUnterlagen, type Unterlage } from "@/lib/db/unterlagen";
import { alleBoegen, type BogenAblage } from "@/lib/db/personalbogen";
import { fuerVertrag } from "@/lib/db/arbeitsvertrag";
import { zeilen } from "@/lib/personal/personalbogen";
import { unterlageHochladen, unterlageWeg } from "./aktionen";

export const metadata = { title: "Personalunterlagen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Alles, was zu einer Person im Ordner liegt, an einem Ort.
 *
 * Die alten Papierverträge und Papierbögen sind hier nachzulesen, so wie
 * sie hereinkamen: "bitte wenn man auf mitarbeiter klickt auch möglich
 * machen, dass man diese alten verträge angucken kann, die ich dir
 * gegeben hab" (Florian, 01.10.2026).
 *
 * Daneben stehen die Angaben aus dem Personalbogen. Sie liegen seit dem
 * 01.10.2026 im Haus, damit niemand den Mitarbeiter ein zweites Mal
 * danach fragen muss.
 */
export default async function UnterlagenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");
  const { meldung } = await searchParams;

  const [dateien, boegen, leute] = await Promise.all([alleUnterlagen(), alleBoegen(), fuerVertrag()]);

  const proPerson = leute
    .map((p) => ({
      person: p,
      dateien: dateien.filter((d) => d.benutzerId === p.id),
      bogen: boegen.find((x) => x.benutzerId === p.id) ?? null,
    }))
    .filter((e) => e.dateien.length > 0 || e.bogen);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Personalunterlagen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Die alten Verträge und Fragebögen auf Papier, dazu die Angaben aus dem Personalbogen. Sichtbar
          nur für Werner, Kevin und Florian.
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

      {proPerson.length === 0 && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Hier liegt noch nichts.
        </p>
      )}

      <ul className="space-y-3">
        {proPerson.map((e) => (
          <li key={e.person.id} className="rounded-lg border border-linie bg-flaeche p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong>{e.person.name}</strong>
              <span className="text-xs text-leise">
                {e.dateien.length === 0
                  ? "keine Datei"
                  : `${e.dateien.length} ${e.dateien.length === 1 ? "Datei" : "Dateien"}`}
              </span>
            </div>

            {e.dateien.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {e.dateien.map((d) => (
                  <Dateizeile key={d.id} d={d} />
                ))}
              </ul>
            )}

            {e.bogen && <Bogenkasten bogen={e.bogen} />}
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold">Unterlage ablegen</h2>
        <p className="text-sm text-leise">
          PDF, Foto oder Word-Datei, bis 20 MB. Dieselbe Datei noch einmal abgelegt ersetzt die ältere.
        </p>
        <form action={unterlageHochladen} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Für wen</span>
              <select name="benutzerId" defaultValue="" required>
                <option value="" disabled>
                  bitte wählen
                </option>
                {leute.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Was ist das</span>
              <select name="art" defaultValue="vertrag">
                <option value="vertrag">Arbeitsvertrag</option>
                <option value="bogen">Personalbogen</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Titel (freiwillig)</span>
              <input name="titel" maxLength={120} placeholder="Vertrag 2026" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Notiz (freiwillig)</span>
            <input name="notiz" maxLength={300} />
          </label>
          <input type="file" name="datei" required accept=".pdf,.jpg,.jpeg,.png,.heic,.docx,.xlsx" />
          <Absendeknopf text="Ablegen" laeuftText="Wird abgelegt..." />
        </form>
      </section>
    </div>
  );
}

function Dateizeile({ d }: { d: Unterlage }) {
  const kb = Math.round(d.groesse / 1024);
  return (
    <li className="flex flex-wrap items-center gap-3">
      <a href={`/unterlagen/datei/${d.id}`} target="_blank" rel="noreferrer" className="underline">
        {d.titel || d.dateiname}
      </a>
      <span className="text-xs text-leise">
        {d.art === "bogen" ? "Personalbogen" : "Arbeitsvertrag"} · {kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`} ·
        abgelegt von {d.hochgeladenVon} am {new Date(d.hochgeladenAm).toLocaleDateString("de-DE")}
        {d.notiz ? ` · ${d.notiz}` : ""}
      </span>
      <form action={unterlageWeg}>
        <input type="hidden" name="id" value={d.id} />
        <button type="submit" className="text-xs underline text-leise">
          entfernen
        </button>
      </form>
    </li>
  );
}

/**
 * Die Angaben aus dem Personalbogen, zugeklappt.
 *
 * Sie stehen hier, damit das Büro nachschlagen kann, statt zu fragen.
 */
function Bogenkasten({ bogen }: { bogen: BogenAblage }) {
  const gruppen = zeilen(bogen.daten).map((g) => ({
    ...g,
    felder: g.felder.filter(([, w]) => w),
  }));

  return (
    <details className="mt-3 rounded-lg border border-linie px-3 py-2 text-sm">
      <summary className="cursor-pointer text-leise">
        Angaben aus dem Personalbogen {bogen.quelle ? `(${bogen.quelle})` : ""}
      </summary>
      <div className="mt-2 space-y-3">
        {gruppen
          .filter((g) => g.felder.length > 0)
          .map((g) => (
            <div key={g.gruppe}>
              <div className="text-xs font-semibold uppercase tracking-wide text-leise">{g.gruppe}</div>
              <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {g.felder.map(([k, w]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-leise">{k}</dt>
                    <dd className="text-right">{w}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
      </div>
    </details>
  );
}
