import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { StempelUhr } from "@/components/StempelUhr";
import {
  einstellungLesen,
  letzteStempel,
  standVon,
  stempelDesMonats,
  stunden,
  werIstDa,
  type Stempel,
} from "@/lib/stempel/db";
import { standortSpeichern } from "./aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

export const metadata = { title: "Stempeluhr | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const tag = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" });

const BEZEICHNUNG: Record<Stempel["art"], string> = {
  kommen: "gekommen",
  pause_start: "Pause begonnen",
  pause_ende: "Pause beendet",
  gehen: "gegangen",
};

/**
 * Stempeluhr: Kommen, Pause, Gehen. Für alle Mitarbeiter.
 * Chefs und Büro sehen zusätzlich, wer gerade da ist, und die Monatssummen.
 */
export default async function StempeluhrSeite({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  const { monat, meldung } = await searchParams;
  const chef = b.rolle === "chef";
  const buero = chef || b.rolle === "team";

  const [stand, meine, e] = await Promise.all([standVon(b.id), letzteStempel(b.id, 24), einstellungLesen()]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Stempeluhr</h1>
        <p className="mt-1 text-sm text-leise">
          Arbeitszeit und Pause stempeln. Das geht nur auf dem Gelände, dafür fragt das Programm deinen Standort ab.
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      <StempelUhr
        start={stand.zustand}
        arbeitszeit={stunden(stand.minutenHeute)}
        pausenzeit={stunden(stand.pausenMinutenHeute)}
      />

      {meine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Deine letzten Stempel</h2>
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
            {meine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="w-24 text-leise">{tag(s.zeitpunkt)}</span>
                <span className="w-14 tabular-nums">{uhr(s.zeitpunkt)}</span>
                <span className="flex-1">{BEZEICHNUNG[s.art]}</span>
                {!s.imHaus && (
                  <span className="text-xs" style={{ color: "var(--warnung)" }}>
                    außerhalb{s.entfernungM ? `, ${s.entfernungM} m` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {buero && <WerIstDa />}
      {buero && <Monatsuebersicht monat={monat} />}
      {chef && <Einrichtung lat={e.lat} lon={e.lon} radiusM={e.radiusM} maxStunden={e.maxStunden} aktiv={e.aktiv} />}
    </div>
  );
}

/** Wer gerade im Haus ist. Für Büro und Chefs. */
async function WerIstDa() {
  const da = await werIstDa();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Gerade eingestempelt</h2>
      {da.length === 0 ? (
        <p className="text-sm text-leise">Im Moment ist niemand eingestempelt.</p>
      ) : (
        <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
          {da.map((p) => (
            <li key={p.benutzerId} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="text-leise">
                seit {uhr(p.seit)}
                {p.zustand === "pause" && ", in der Pause"}
              </span>
              <span className="tabular-nums">{stunden(p.minuten)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Summen je Person für einen Monat, als Grundlage fürs Lohnbüro. */
async function Monatsuebersicht({ monat }: { monat?: string }) {
  const jetzt = new Date();
  const m = /^\d{4}-\d{2}$/.test(monat ?? "") ? monat! : `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
  const [j, mm] = m.split("-").map(Number);
  const vorher = `${mm === 1 ? j - 1 : j}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const danach = `${mm === 12 ? j + 1 : j}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
  const stempel = await stempelDesMonats(m);

  // Je Person Arbeitszeit und Pause zusammenzählen.
  const jePerson = new Map<string, { name: string; minuten: number; pause: number; tage: Set<string> }>();
  const nach = new Map<string, Stempel[]>();
  for (const s of stempel) nach.set(s.benutzerId, [...(nach.get(s.benutzerId) ?? []), s]);
  for (const [id, liste] of nach) {
    const e = { name: liste[0].name, minuten: 0, pause: 0, tage: new Set<string>() };
    let start: number | null = null;
    let pauseStart: number | null = null;
    for (const s of liste) {
      const t = Date.parse(s.zeitpunkt);
      e.tage.add(s.zeitpunkt.slice(0, 10));
      if (s.art === "kommen") start = t;
      if (s.art === "pause_start" && start !== null) {
        e.minuten += (t - start) / 60000;
        start = null;
        pauseStart = t;
      }
      if (s.art === "pause_ende") {
        if (pauseStart !== null) e.pause += (t - pauseStart) / 60000;
        pauseStart = null;
        start = t;
      }
      if (s.art === "gehen") {
        if (start !== null) e.minuten += (t - start) / 60000;
        if (pauseStart !== null) e.pause += (t - pauseStart) / 60000;
        start = null;
        pauseStart = null;
      }
    }
    jePerson.set(id, e);
  }
  const zeilen = [...jePerson.values()].sort((a, b) => b.minuten - a.minuten);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
          Zeiten {MONATE[mm - 1]} {j}
        </h2>
        <span className="flex gap-3 text-sm">
          <a href={`/stempeluhr?monat=${vorher}`} className="underline">
            Vormonat
          </a>
          <a href={`/stempeluhr?monat=${danach}`} className="underline">
            Folgemonat
          </a>
        </span>
      </div>
      {zeilen.length === 0 ? (
        <p className="text-sm text-leise">In diesem Monat wurde noch nicht gestempelt.</p>
      ) : (
        <table className="w-full rounded-lg border border-linie bg-flaeche text-sm">
          <thead className="border-b border-linie text-left text-xs text-leise">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 text-right font-normal">Tage</th>
              <th className="px-4 py-2 text-right font-normal">Pause</th>
              <th className="px-4 py-2 text-right font-normal">Arbeitszeit</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.name} className="border-b border-linie last:border-0">
                <td className="px-4 py-2">{z.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{z.tage.size}</td>
                <td className="px-4 py-2 text-right tabular-nums">{stunden(z.pause)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{stunden(z.minuten)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Wo das Haus steht und wie weit man sich entfernen darf. Nur Florian. */
function Einrichtung({
  lat,
  lon,
  radiusM,
  maxStunden,
  aktiv,
}: {
  lat: number;
  lon: number;
  radiusM: number;
  maxStunden: number;
  aktiv: boolean;
}) {
  return (
    <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Einrichtung der Stempeluhr</summary>
      <form action={standortSpeichern} className="mt-3 space-y-3">
        <p className="text-leise">
          Der Mittelpunkt ist die Grethe-Weiser-Straße 2. Wer weiter als der Umkreis entfernt ist, kann nicht
          stempeln. Steh am besten im Haus und übernimm deinen eigenen Standort, dann passt der Mittelpunkt genau.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Breitengrad</span>
            <input name="lat" defaultValue={String(lat)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Längengrad</span>
            <input name="lon" defaultValue={String(lon)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Umkreis in Metern</span>
            <input name="radius" type="number" min={30} max={2000} defaultValue={radiusM} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Meldung nach wie vielen Stunden</span>
            <input name="maxStunden" type="number" min={1} max={24} defaultValue={maxStunden} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aktiv" defaultChecked={aktiv} />
          Standort beim Stempeln prüfen (ausschalten nur im Notfall)
        </label>
        <Absendeknopf text="Speichern" laeuftText="..." />
      </form>
    </details>
  );
}
