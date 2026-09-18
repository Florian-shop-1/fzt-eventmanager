import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { offenFuer, planLaden, tageBis } from "@/lib/dienstplan/laden";
import {
  BEZEICHNUNG,
  ERKLAERUNG,
  darfUebernehmen,
  istRookie,
  schonImDienst,
  type Person,
  type Schicht,
  type Slot,
} from "@/lib/dienstplan/plan";
import { anfrageZuruecknehmen, einteilen, ersatzSuchen, uebernehmen } from "./aktionen";

export const metadata = { title: "Dienstplan | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Dienstplan des Showteams: FOH, T2, T1 und Shadow je Show.
 *
 * So einfach wie möglich: Jeder sieht, wann er arbeitet. Offene Schichten
 * übernimmt man mit einem Klick. Wer nicht kann, fragt mit einem Klick
 * die Kollegen der gleichen Position, die bekommen eine Mail.
 */
export default async function DienstplanSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; nur?: string; s?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const { meldung, nur, s: markiert } = await searchParams;
  const { schichten, personen } = await planLaden();
  const ich = personen.find((p) => p.id === benutzer.id) ?? null;
  const planer = benutzer.rolle === "chef" || benutzer.rolle === "team";
  const hatPosition = Boolean(ich && ich.kann.size > 0);
  const nurMeine = nur === "meine" || (nur !== "alle" && hatPosition && !planer);

  const meine = ich ? schichten.filter((s) => s.slots.some((x) => x.person?.id === ich.id)) : [];
  const gesucht = ich ? offenFuer(schichten, ich, 70) : [];
  const offenGesamt = schichten.reduce((n, s) => n + s.slots.filter((x) => x.offen).length, 0);
  const liste = nurMeine && ich ? meine : schichten;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dienstplan</h1>
          <p className="mt-1 text-sm text-leise">
            FOH, T2 und T1 für jede Show. Offene Schichten übernimmst du mit einem Klick. Wenn du nicht
            kannst, fragst du hier, dann bekommen die anderen deiner Position eine Mail.
          </p>
        </div>
        {benutzer.rolle === "chef" && (
          <Link href="/dienstplan/einrichtung" className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
            Positionen und feste Tage
          </Link>
        )}
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {!hatPosition && !planer && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Dir ist noch keine Position zugeordnet. Florian trägt ein, ob du FOH, T2 oder T1 machst. Bis
          dahin kannst du den Plan nur ansehen.
        </div>
      )}

      {planer && offenGesamt > 0 && (
        <p className="text-sm">
          <strong style={{ color: "var(--warnung)" }}>
            {offenGesamt} {offenGesamt === 1 ? "Schicht ist" : "Schichten sind"} noch offen
          </strong>{" "}
          in den nächsten Wochen. Die Kollegen werden eine Woche, drei Tage und einen Tag vorher per
          Mail erinnert, am Vortag auch du.
        </p>
      )}

      {ich && gesucht.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <h2 className="font-semibold">Kannst du einspringen?</h2>
          <ul className="space-y-1 text-sm">
            {gesucht.slice(0, 6).map((g) => (
              <li key={`${g.termin.ditixEventId}${g.position}`}>
                <a href={`#s-${g.termin.ditixEventId}`} className="underline">
                  {datumMitWochentag(g.termin.datum)}, {g.termin.uhrzeit} Uhr
                </a>{" "}
                · {BEZEICHNUNG[g.position]} · {g.termin.name}
              </li>
            ))}
          </ul>
          {gesucht.length > 6 && <p className="text-xs text-leise">und {gesucht.length - 6} weitere, siehe unten unter „Alle Shows“</p>}
        </section>
      )}

      {ich && hatPosition && (
        <nav className="flex gap-1 text-sm">
          <Link
            href="/dienstplan?nur=meine"
            className={`rounded-md px-3 py-1.5 ${nurMeine ? "bg-text text-flaeche" : "border border-linie"}`}
          >
            Meine Schichten ({meine.length})
          </Link>
          <Link
            href="/dienstplan?nur=alle"
            className={`rounded-md px-3 py-1.5 ${!nurMeine ? "bg-text text-flaeche" : "border border-linie"}`}
          >
            Alle Shows
          </Link>
        </nav>
      )}

      {liste.length === 0 ? (
        <p className="text-sm text-leise">
          {nurMeine ? "In den nächsten Wochen bist du noch nicht eingeteilt." : "Keine Shows im Spielplan."}
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((s) => (
            <ShowKarte
              key={s.termin.ditixEventId}
              schicht={s}
              schichten={schichten}
              ich={ich}
              planer={planer}
              personen={personen}
              markiert={markiert === s.termin.ditixEventId}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-leise">
        Rookie: neu auf T2, kann die Show noch nicht allein. Macht ein Rookie T2, erscheint die Zeile
        Shadow: Dann geht jemand mit, der die Show kann (Mario oder Julian).
      </p>
    </div>
  );
}

function ShowKarte({
  schicht,
  schichten,
  ich,
  planer,
  personen,
  markiert,
}: {
  schicht: Schicht;
  schichten: Schicht[];
  ich: Person | null;
  planer: boolean;
  personen: Person[];
  markiert: boolean;
}) {
  const t = schicht.termin;
  const tage = tageBis(t.datum);
  const offen = schicht.slots.some((x) => x.offen);
  return (
    <li
      id={`s-${t.ditixEventId}`}
      className="scroll-mt-24 rounded-lg border bg-flaeche"
      style={{ borderColor: markiert ? "var(--gold)" : offen ? "var(--warnung)" : "var(--linie)", borderWidth: markiert ? 2 : 1 }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-linie px-4 py-2.5">
        <strong>{datumMitWochentag(t.datum)}</strong>
        <span className="tabular-nums">{t.uhrzeit} Uhr</span>
        <span className="text-sm text-leise">{t.name}</span>
        {tage <= 1 && <span className="ml-auto text-xs font-semibold" style={{ color: "var(--warnung)" }}>{tage === 0 ? "heute" : "morgen"}</span>}
      </div>
      <ul className="divide-y divide-linie">
        {schicht.slots.map((slot) => (
          <SlotZeile
            key={slot.position}
            slot={slot}
            eventId={t.ditixEventId}
            ich={ich}
            planer={planer}
            personen={personen}
            schonDabei={Boolean(ich && schonImDienst(schichten, ich.id, t))}
          />
        ))}
      </ul>
    </li>
  );
}

function SlotZeile({
  slot,
  eventId,
  ich,
  planer,
  personen,
  schonDabei,
}: {
  slot: Slot;
  eventId: string;
  ich: Person | null;
  planer: boolean;
  personen: Person[];
  schonDabei: boolean;
}) {
  const meins = Boolean(ich && slot.person?.id === ich.id);
  const kannUebernehmen =
    ich &&
    !meins &&
    darfUebernehmen(ich, slot.position) &&
    slot.offen &&
    !schonDabei;
  const versteckt = (
    <>
      <input type="hidden" name="vorstellung" value={eventId} />
      <input type="hidden" name="position" value={slot.position} />
    </>
  );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5" style={meins ? { background: "var(--gold-hell)" } : undefined}>
      <span
        className="w-16 shrink-0 text-sm font-semibold"
        title={ERKLAERUNG[slot.position]}
      >
        {BEZEICHNUNG[slot.position]}
      </span>

      <span className="min-w-0 flex-1 text-sm">
        {slot.person ? (
          <>
            <strong>{meins ? "Du" : slot.person.name}</strong>
            {slot.position === "T2" && istRookie(slot.person) && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--info-hell)", color: "var(--info)" }}>
                Rookie, mit Shadow
              </span>
            )}
            {slot.fest && <span className="ml-2 rounded bg-gold-hell px-1.5 py-0.5 text-xs text-gold-dunkel">fester Tag</span>}
            {slot.suchtErsatz && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}>
                sucht Ersatz{slot.grund ? `: ${slot.grund}` : ""}
              </span>
            )}
          </>
        ) : (
          <strong style={{ color: "var(--warnung)" }}>
            {slot.position === "SHADOW" ? "offen, der Rookie braucht einen Shadow" : "offen, jemand gesucht"}
          </strong>
        )}
      </span>

      <span className="flex flex-wrap items-center gap-2">
        {kannUebernehmen && (
          <form action={uebernehmen}>
            {versteckt}
            <Absendeknopf text="Ich übernehme" laeuftText="Moment..." />
          </form>
        )}

        {meins && !slot.suchtErsatz && (
          <details className="text-sm">
            <summary className="cursor-pointer text-leise underline">
              Ich kann nicht
            </summary>
            <form action={ersatzSuchen} className="mt-2 flex flex-wrap gap-2">
              {versteckt}
              <input name="grund" placeholder="Grund, freiwillig (krank, Urlaub, Tausch)" className="w-56 text-sm" maxLength={120} />
              <Absendeknopf text="Kollegen fragen" laeuftText="Wird verschickt..." />
            </form>
          </details>
        )}

        {meins && slot.suchtErsatz && (
          <form action={anfrageZuruecknehmen}>
            {versteckt}
            <button type="submit" className="text-sm text-leise underline">
              Anfrage zurücknehmen
            </button>
          </form>
        )}

        {planer && (
          <details className="text-sm">
            <summary className="cursor-pointer text-leise underline">einteilen</summary>
            <form action={einteilen} className="mt-2 flex flex-wrap gap-2">
              {versteckt}
              <select name="wert" defaultValue={slot.person?.id ?? "offen"} className="text-sm">
                <option value="fest">wie fester Plan</option>
                <option value="offen">offen, Kollegen fragen</option>
                {personen
                  .filter((p) => darfUebernehmen(p, slot.position) || p.id === slot.person?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input name="notiz" placeholder="Notiz für die Mail, freiwillig" className="w-56 text-sm" maxLength={300} />
              <Absendeknopf text="Einteilen" laeuftText="..." />
            </form>
          </details>
        )}
      </span>
    </li>
  );
}
