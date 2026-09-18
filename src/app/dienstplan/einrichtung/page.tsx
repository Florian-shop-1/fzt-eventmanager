import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  ERKLAERUNG,
  POSITIONEN,
  VORSCHLAG_FEST,
  VORSCHLAG_KANN,
  WOCHENTAGE,
  allePersonen,
  einstellungLesen,
  festeTage,
  type FestePosition,
  type Person,
} from "@/lib/dienstplan/plan";
import { festeTageSpeichern, positionenSpeichern } from "../aktionen";

export const metadata = { title: "Dienstplan einrichten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/** Montag zuerst, wie im Kalender. */
const TAGE = [1, 2, 3, 4, 5, 6, 0];

/**
 * Nur Florian: wer welche Position kann und welche Tage fest vergeben sind.
 *
 * Solange noch nichts gespeichert ist, sind die Felder mit dem vorbelegt,
 * was Florian am 18.09.2026 aufgeschrieben hat. Zugeordnet wird über den
 * Vornamen, deshalb erst die Zugänge anlegen, dann hier speichern.
 */
export default async function DienstplanEinrichtung({ searchParams }: { searchParams: Promise<{ meldung?: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || benutzer.rolle !== "chef") redirect("/dienstplan");
  const { meldung } = await searchParams;
  const [personen, fest, einstellung] = await Promise.all([allePersonen(), festeTage(), einstellungLesen()]);

  const nochNichts = personen.every((p) => p.kann.size === 0);
  const vor = (p: Person) => p.vorname.toLowerCase();
  const kann = (p: Person): Map<FestePosition, boolean> =>
    p.kann.size > 0 || !nochNichts || p.rolle !== "showteam" ? p.kann : new Map(VORSCHLAG_KANN[vor(p)] ?? []);

  const wichtig = personen.filter((p) => p.rolle === "showteam" || kann(p).size > 0);
  const weitere = personen.filter((p) => !wichtig.includes(p));

  const festWert = (pos: FestePosition, tag: number | null): string => {
    if (fest.length > 0) return fest.find((f) => f.position === pos && f.wochentag === tag)?.benutzerId ?? "";
    const v = VORSCHLAG_FEST.find((f) => f.position === pos && f.wochentag === tag);
    return (v && personen.find((p) => p.rolle === "showteam" && vor(p) === v.vorname)?.id) ?? "";
  };
  // Wer T2 noch lernt, bekommt keinen festen T2-Tag, er läuft ja nur mit.
  const fuer = (pos: FestePosition) => personen.filter((p) => kann(p).has(pos) && kann(p).get(pos) !== true);
  const fehlt = ["Leeven", "Sabah", "Levi", "Mario", "Julian", "Noel", "Sarah", "Chris", "Sammy", "Ben"].filter(
    (n) => !personen.some((p) => p.rolle === "showteam" && vor(p) === n.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Link href="/dienstplan" className="text-sm text-leise underline">
          zurück zum Dienstplan
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Positionen und feste Tage</h1>
        <p className="mt-1 text-sm text-leise">Nur für dich sichtbar.</p>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {fehlt.length > 0 && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Noch ohne Zugang: {fehlt.join(", ")}.{" "}
          <Link href="/einstellungen/benutzer" className="underline">
            Unter Zugänge anlegen
          </Link>{" "}
          (Rolle Showteam), danach sind sie hier schon vorausgefüllt. Einfach speichern. Wer eine
          andere Rolle hat und trotzdem im Showteam arbeitet, steht unten unter „Weitere Mitarbeiter“.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Wer macht was?</h2>
        <p className="text-sm text-leise">
          „lernt noch“ bei T2 heißt: kann die Show noch nicht allein und läuft als Shadow mit, wenn
          jemand T2 macht, der sie kann. Sobald jemand fertig ist, den Haken rausnehmen.
          {nochNichts && " Vorausgefüllt nach deiner Liste, bitte prüfen und speichern."}
        </p>
        <form action={positionenSpeichern} className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linie text-left text-xs text-leise">
                <th className="px-4 py-2 font-normal">Name</th>
                {POSITIONEN.map((pos) => (
                  <th key={pos} className="px-3 py-2 font-normal" title={ERKLAERUNG[pos]}>
                    {pos}
                  </th>
                ))}
                <th className="px-3 py-2 font-normal">T2 lernt noch</th>
              </tr>
            </thead>
            <tbody>
              {wichtig.map((p) => (
                <PersonZeile key={p.id} p={p} kann={kann(p)} />
              ))}
            </tbody>
          </table>
          {weitere.length > 0 && (
            <details className="border-t border-linie">
              <summary className="cursor-pointer px-4 py-2 text-sm text-leise">
                Weitere Mitarbeiter ({weitere.length})
              </summary>
              <table className="w-full text-sm">
                <tbody>
                  {weitere.map((p) => (
                    <PersonZeile key={p.id} p={p} kann={kann(p)} />
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <div className="border-t border-linie p-4">
            <Absendeknopf text="Positionen speichern" laeuftText="Wird gespeichert..." />
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Feste Tage</h2>
        <p className="text-sm text-leise">
          Wer an einem Wochentag immer arbeitet. Diese Schichten stehen im Plan automatisch fest und
          sind markiert. „Jeden Tag“ gilt, wenn für den Wochentag niemand eingetragen ist.
        </p>
        <form action={festeTageSpeichern} className="space-y-4 rounded-lg border border-linie bg-flaeche p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-leise">
                  <th className="py-2 pr-3 font-normal" />
                  <th className="px-1 py-2 font-normal">Jeden Tag</th>
                  {TAGE.map((t) => (
                    <th key={t} className="px-1 py-2 font-normal">
                      {WOCHENTAGE[t].slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONEN.map((pos) => (
                  <tr key={pos} className="border-t border-linie">
                    <td className="py-2 pr-3 font-semibold">{pos}</td>
                    {[null, ...TAGE].map((tag) => (
                      <td key={String(tag)} className="px-1 py-2">
                        <select
                          name={`fest:${pos}:${tag ?? "alle"}`}
                          defaultValue={festWert(pos, tag)}
                          className="min-w-24 text-xs"
                          aria-label={`${pos} ${tag === null ? "jeden Tag" : WOCHENTAGE[tag]}`}
                        >
                          <option value="">-</option>
                          {fuer(pos).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.vorname}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-leise">
            Zur Auswahl stehen nur Leute, die oben die Position haben. Erst die Positionen speichern.
          </p>
          {!einstellung.erledigt && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="erledigt" />
              Die festen Tage sind vollständig, du musst mich nicht mehr daran erinnern.
            </label>
          )}
          <Absendeknopf text="Feste Tage speichern" laeuftText="Wird gespeichert..." />
        </form>
      </section>
    </div>
  );
}

function PersonZeile({ p, kann }: { p: Person; kann: Map<FestePosition, boolean> }) {
  return (
    <tr className="border-b border-linie last:border-0">
      <td className="px-4 py-2">
        <input type="hidden" name="person" value={p.id} />
        {p.name}
        {p.rolle !== "showteam" && <span className="ml-2 text-xs text-leise">{p.rolle}</span>}
      </td>
      {POSITIONEN.map((pos) => (
        <td key={pos} className="px-3 py-2">
          <input type="checkbox" name={`kann:${p.id}:${pos}`} defaultChecked={kann.has(pos)} aria-label={`${p.name} ${pos}`} />
        </td>
      ))}
      <td className="px-3 py-2">
        <input type="checkbox" name={`lernt:${p.id}`} defaultChecked={kann.get("T2") === true} aria-label={`${p.name} lernt T2`} />
      </td>
    </tr>
  );
}
