import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfStempeln, darfZeitenAendern } from "@/lib/auth/sitzung";
import { StempelUhr } from "@/components/StempelUhr";
import {
  antraege,
  antraegeVon,
  einstellungLesen,
  minutenOhnePause,
  pausengrundHeute,
  standVon,
  stempelAmTag,
  stempelDesMonats,
  stempelnde,
  stunden,
  werIstDa,
  type Stempel,
} from "@/lib/stempel/db";
import { PAUSE_NACH_MINUTEN } from "@/lib/stempel/wache";
import {
  antragBeantworten,
  korrekturBeantragen,
  pausengrundSenden,
  standortSpeichern,
  stempelLoeschen,
  stempelNachtragen,
  zeitKorrigieren,
} from "./aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

export const metadata = { title: "Stempeluhr | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const heuteBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

const BEZEICHNUNG: Record<Stempel["art"], string> = {
  kommen: "EIN-gestempelt",
  pause_start: "Pause begonnen",
  pause_ende: "Pause beendet",
  gehen: "AUS-gestempelt",
};

/**
 * Stempeluhr: EIN-stempeln, Pause, AUS-stempeln. Für interne Mitarbeiter.
 *
 * Die Mitarbeiter sehen bewusst nur ihren Zustand, keine Stunden und keine
 * Summen (Florian, 21.09.2026). Ändern dürfen die Zeiten Werner, Kevin und
 * Florian; alle anderen stellen einen Änderungswunsch.
 */
export default async function StempeluhrSeite({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; meldung?: string; wer?: string; tag?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  const { monat, meldung, wer, tag } = await searchParams;
  const buero = darfZeitenAendern(b);
  const stempelt = darfStempeln(b);
  if (!stempelt && !buero) redirect("/");

  const stand = stempelt ? await standVon(b.id) : null;
  const pauseFaellig = stand ? minutenOhnePause(stand) >= PAUSE_NACH_MINUTEN : false;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Stempeluhr</h1>
        <p className="mt-1 text-sm text-leise">
          {stempelt
            ? "Arbeitszeit und Pause stempeln. Das geht nur auf dem Gelände, dafür fragt das Programm deinen Standort ab."
            : "Zeiten der Mitarbeiter ansehen und korrigieren."}
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {stempelt && stand && <StempelUhr start={stand.zustand} pauseFaellig={pauseFaellig} />}
      {stempelt && <PausenGrund benutzerId={b.id} offen={pauseFaellig} />}
      {stempelt && <MeineAntraege benutzerId={b.id} />}

      {buero && <WerIstDa />}
      {buero && <Antraege />}
      {buero && <Korrektur wer={wer} tag={tag} />}
      {buero && <Monatsuebersicht monat={monat} />}
      {b.rolle === "chef" && <Einrichtung />}
    </div>
  );
}

/** "Warum ist die Pause ausgefallen?" Der Mitarbeiter schreibt es selbst dazu. */
async function PausenGrund({ benutzerId, offen }: { benutzerId: string; offen: boolean }) {
  const schonGeschrieben = await pausengrundHeute(benutzerId);
  return (
    <details id="pause" open={offen && !schonGeschrieben} className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Pause ist heute ausgefallen? Kurz erklären</summary>
      <p className="mt-2 text-leise">
        Länger als sechs Stunden ohne Pause ist in Deutschland nicht erlaubt (§ 4 Arbeitszeitgesetz). Daran müssen wir
        uns als Betrieb halten. Wenn es trotzdem einmal nicht anders ging, schreib bitte kurz dazu, woran es lag.
      </p>
      {schonGeschrieben && <p className="mt-2 text-leise">Für heute hast du schon etwas eingetragen. Danke!</p>}
      <form action={pausengrundSenden} className="mt-3 space-y-2">
        <textarea name="text" rows={3} maxLength={1000} placeholder="Zum Beispiel: Aufbau für die Firmenfeier, wir waren zu zweit." />
        <Absendeknopf text="Abschicken" laeuftText="..." />
      </form>
    </details>
  );
}

/** Der Mitarbeiter bittet um eine Korrektur. Ändern darf er nichts selbst. */
async function MeineAntraege({ benutzerId }: { benutzerId: string }) {
  const meine = await antraegeVon(benutzerId, 6);
  const aenderungen = meine.filter((a) => a.art === "aenderung");
  return (
    <details id="antrag" className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Stimmt eine Zeit nicht? Änderung beantragen</summary>
      <p className="mt-2 text-leise">
        Schreib einfach, was nicht stimmt. Das Büro schaut es sich an und ändert es. Du bekommst eine Mail, sobald es
        erledigt ist.
      </p>
      <form action={korrekturBeantragen} className="mt-3 space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Um welchen Tag geht es?</span>
          <input type="date" name="tag" defaultValue={heuteBerlin()} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Was soll geändert werden?</span>
          <textarea
            name="text"
            rows={3}
            maxLength={1000}
            placeholder="Zum Beispiel: Ich habe um 23:30 Feierabend gemacht, das AUS-stempeln habe ich vergessen."
            required
          />
        </label>
        <Absendeknopf text="An das Büro schicken" laeuftText="Wird geschickt..." />
      </form>

      {aenderungen.length > 0 && (
        <ul className="mt-4 divide-y divide-linie border-t border-linie text-sm">
          {aenderungen.map((a) => (
            <li key={a.id} className="py-2">
              <span className="text-leise">{a.tag.split("-").reverse().join(".")}:</span> {a.text}
              <span className="block text-xs text-leise">
                {a.status === "offen"
                  ? "Liegt beim Büro."
                  : a.status === "angenommen"
                    ? `Angenommen${a.entschiedenVon ? ` von ${a.entschiedenVon}` : ""}.`
                    : `Abgelehnt${a.entschiedenVon ? ` von ${a.entschiedenVon}` : ""}.`}
                {a.antwort && ` ${a.antwort}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Wer gerade im Haus ist. Nur fürs Büro. */
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

/** Offene Änderungswünsche und die Begründungen zu fehlenden Pausen. */
async function Antraege() {
  const alle = await antraege();
  const offen = alle.filter((a) => a.status === "offen");
  const gruende = alle.filter((a) => a.art === "pausengrund").slice(0, 8);

  return (
    <section id="antraege" className="scroll-mt-24 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
        Änderungswünsche{offen.length > 0 && ` (${offen.length} offen)`}
      </h2>
      {offen.length === 0 ? (
        <p className="text-sm text-leise">Nichts offen.</p>
      ) : (
        <div className="space-y-3">
          {offen.map((a) => (
            <form key={a.id} action={antragBeantworten} className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
              <input type="hidden" name="id" value={a.id} />
              <p className="font-medium">
                {a.name} · {a.tag.split("-").reverse().join(".")}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{a.text}</p>
              <input name="antwort" maxLength={500} placeholder="Antwort (freiwillig)" className="mt-3" />
              <div className="mt-2 flex gap-2">
                <button name="status" value="angenommen" className="rounded-lg px-4 py-2 font-medium text-white" style={{ background: "var(--gut)" }}>
                  Annehmen
                </button>
                <button name="status" value="abgelehnt" className="rounded-lg border border-linie px-4 py-2 font-medium">
                  Ablehnen
                </button>
              </div>
              <p className="mt-2 text-xs text-leise">
                Nach dem Annehmen die Zeit unten unter „Zeiten korrigieren“ eintragen.
              </p>
            </form>
          ))}
        </div>
      )}

      {gruende.length > 0 && (
        <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <summary className="cursor-pointer font-medium">Gemeldete Gründe für fehlende Pausen</summary>
          <ul className="mt-2 divide-y divide-linie">
            {gruende.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-leise">
                  {a.tag.split("-").reverse().join(".")} · {a.name}:
                </span>{" "}
                {a.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Zeiten einer Person an einem Tag ändern, nachtragen oder löschen. */
async function Korrektur({ wer, tag }: { wer?: string; tag?: string }) {
  const leute = await stempelnde();
  const person = leute.find((p) => p.id === wer) ?? leute[0];
  const derTag = /^\d{4}-\d{2}-\d{2}$/.test(tag ?? "") ? tag! : heuteBerlin();
  const liste = person ? await stempelAmTag(person.id, derTag) : [];

  return (
    <section id="korrektur" className="scroll-mt-24 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Zeiten korrigieren</h2>

      <form method="get" action="/stempeluhr" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Wer</span>
          <select name="wer" defaultValue={person?.id}>
            {leute.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Tag</span>
          <input type="date" name="tag" defaultValue={derTag} />
        </label>
        <button className="rounded-lg border border-linie px-4 py-2 font-medium">Anzeigen</button>
      </form>

      {person && (
        <div className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          {liste.length === 0 ? (
            <p className="text-leise">
              {person.name} hat am {derTag.split("-").reverse().join(".")} nicht gestempelt.
            </p>
          ) : (
            <ul className="divide-y divide-linie">
              {liste.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-40">{BEZEICHNUNG[s.art]}</span>
                  <form action={zeitKorrigieren} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="tag" value={derTag} />
                    <input type="hidden" name="wer" value={person.id} />
                    <input type="time" name="uhrzeit" defaultValue={uhr(s.zeitpunkt)} className="w-28" />
                    <button className="rounded-lg border border-linie px-3 py-1.5">Ändern</button>
                  </form>
                  <form action={stempelLoeschen}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="tag" value={derTag} />
                    <input type="hidden" name="wer" value={person.id} />
                    <button className="rounded-lg border border-linie px-3 py-1.5" style={{ color: "var(--blocker)" }}>
                      Löschen
                    </button>
                  </form>
                  {!s.imHaus && (
                    <span className="text-xs" style={{ color: "var(--warnung)" }}>
                      außerhalb{s.entfernungM ? `, ${s.entfernungM} m` : ""}
                    </span>
                  )}
                  {s.geaendertVon && <span className="text-xs text-leise">geändert von {s.geaendertVon}</span>}
                </li>
              ))}
            </ul>
          )}

          <form action={stempelNachtragen} className="mt-4 flex flex-wrap items-end gap-2 border-t border-linie pt-4">
            <input type="hidden" name="benutzerId" value={person.id} />
            <input type="hidden" name="tag" value={derTag} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Nachtragen</span>
              <select name="art" defaultValue="kommen">
                <option value="kommen">EIN-stempeln</option>
                <option value="pause_start">Pause begonnen</option>
                <option value="pause_ende">Pause beendet</option>
                <option value="gehen">AUS-stempeln</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Uhrzeit</span>
              <input type="time" name="uhrzeit" className="w-28" required />
            </label>
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
          <p className="mt-2 text-xs text-leise">
            Jede Änderung wird mit Namen und Uhrzeit festgehalten, die ursprüngliche Zeit bleibt gespeichert.
          </p>
        </div>
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
async function Einrichtung() {
  const e = await einstellungLesen();
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
            <input name="lat" defaultValue={String(e.lat)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Längengrad</span>
            <input name="lon" defaultValue={String(e.lon)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Umkreis in Metern</span>
            <input name="radius" type="number" min={30} max={2000} defaultValue={e.radiusM} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Meldung nach wie vielen Stunden</span>
            <input name="maxStunden" type="number" min={1} max={24} defaultValue={e.maxStunden} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aktiv" defaultChecked={e.aktiv} />
          Standort beim Stempeln prüfen (ausschalten nur im Notfall)
        </label>
        <Absendeknopf text="Speichern" laeuftText="..." />
      </form>
    </details>
  );
}
