import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { offenFuer, planLaden, tageBis } from "@/lib/dienstplan/laden";
import { istAbwesend, type Abwesenheit } from "@/lib/dienstplan/abwesend";
import { kommentareFuer, type Kommentar } from "@/lib/dienstplan/kommentar";
import { ShowKommentare } from "@/components/ShowKommentare";
import {
  BEZEICHNUNG,
  ERKLAERUNG,
  darfUebernehmen,
  istRookieFuer,
  schonImDienst,
  type FestePosition,
  type Person,
  type Schicht,
  type Slot,
} from "@/lib/dienstplan/plan";
import {
  anfrageAbbrechen,
  anfrageAbsagen,
  anfrageZusagen,
  anfrageZuruecknehmen,
  anfragen,
  einteilen,
  alleFragen,
  ersatzSuchen,
  mitlernen,
  nochmalFragen,
  uebernehmen,
  urlaubEintragen,
  urlaubLoeschen,
} from "./aktionen";

export const metadata = { title: "Dienstplan | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Dienstplan des Showteams: FOH, T1, T2 und Shadow je Show.
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
  const { schichten, personen, abwesend } = await planLaden();
  const ich = personen.find((p) => p.id === benutzer.id) ?? null;
  const planer = benutzer.rolle === "chef" || benutzer.rolle === "team";
  const hatPosition = Boolean(ich && ich.kann.size > 0);
  const nurMeine = nur === "meine" || (nur !== "alle" && hatPosition && !planer);

  const meine = ich ? schichten.filter((s) => s.slots.some((x) => x.person?.id === ich.id)) : [];
  const gesucht = ich ? offenFuer(schichten, ich, 70, abwesend) : [];
  const meineAbwesenheiten = ich ? abwesend.filter((a) => a.benutzerId === ich.id) : [];
  const offenGesamt = schichten.reduce((n, s) => n + s.slots.filter((x) => x.offen).length, 0);
  // Alle Kommentare der angezeigten Shows in einer Abfrage.
  const kommentare = await kommentareFuer(
    schichten.map((s) => s.termin.ditixEventId),
    benutzer.id,
  );
  // Anfragen an mich: Florian oder Kevin haben mich direkt gefragt.
  const gefragt = ich
    ? schichten.flatMap((s) =>
        s.slots
          .filter((x) => x.angefragt?.id === ich.id)
          .map((x) => ({ termin: s.termin, position: x.position, von: x.angefragtVon?.vorname ?? null })),
      )
    : [];
  const liste =
    nurMeine && ich
      ? schichten.filter((s) => s.slots.some((x) => x.person?.id === ich.id || x.angefragt?.id === ich.id))
      : schichten;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dienstplan</h1>
          <p className="mt-1 text-sm text-leise">
            FOH, T1 und T2 für jede Show. Offene Schichten übernimmst du mit einem Klick. Wenn du nicht
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
          Dir ist noch keine Position zugeordnet. Florian trägt ein, ob du FOH, T1 oder T2 machst. Bis
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

      {ich && gefragt.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
          <h2 className="font-semibold">Du bist gefragt worden</h2>
          <ul className="space-y-1 text-sm">
            {gefragt.map((g) => (
              <li key={`${g.termin.ditixEventId}${g.position}`}>
                {/*
                  Nicht nur eine Sprungmarke: Wer "Meine Schichten" sieht,
                  hat die Show gar nicht auf dem Schirm, und ein Klick lief
                  ins Leere. Roman konnte deshalb nichts anklicken
                  (Florian, 23.09.2026). Der Link wechselt jetzt auf alle
                  Shows und markiert die richtige.
                */}
                <Link
                  href={`/dienstplan?nur=alle&s=${g.termin.ditixEventId}#s-${g.termin.ditixEventId}`}
                  className="underline"
                >
                  {datumMitWochentag(g.termin.datum)}, {g.termin.uhrzeit} Uhr
                </Link>{" "}
                · {BEZEICHNUNG[g.position]} · {g.termin.name}
                {g.von && <span className="text-leise"> · gefragt von {g.von}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-leise">Sag unten bei der Show zu oder ab. Eingeteilt bist du erst mit deiner Zusage.</p>
        </section>
      )}

      {ich && gesucht.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <h2 className="font-semibold">Kannst du einspringen?</h2>
          <ul className="space-y-1 text-sm">
            {gesucht.slice(0, 6).map((g) => (
              <li key={`${g.termin.ditixEventId}${g.position}`}>
                {/*
                  Nicht nur eine Sprungmarke: Wer "Meine Schichten" sieht,
                  hat die Show gar nicht auf dem Schirm, und ein Klick lief
                  ins Leere. Roman konnte deshalb nichts anklicken
                  (Florian, 23.09.2026). Der Link wechselt jetzt auf alle
                  Shows und markiert die richtige.
                */}
                <Link
                  href={`/dienstplan?nur=alle&s=${g.termin.ditixEventId}#s-${g.termin.ditixEventId}`}
                  className="underline"
                >
                  {datumMitWochentag(g.termin.datum)}, {g.termin.uhrzeit} Uhr
                </Link>{" "}
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

      {ich && (
        <Urlaub meine={meineAbwesenheiten} alle={planer ? abwesend : []} planer={planer} />
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
              abgemeldet={new Set(personen.filter((p) => istAbwesend(abwesend, p.id, s.termin.datum)).map((p) => p.id))}
              markiert={markiert === s.termin.ditixEventId}
              kommentare={kommentare.get(s.termin.ditixEventId) ?? []}
              ichId={benutzer.id}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-leise">
        Rookie: kann die Position noch nicht allein. Steht ein Rookie im Plan, erscheint die Zeile
        Shadow: Dann geht jemand mit, der die Position allein kann. Wer neu dazukommt, ist erst einmal
        Rookie; Florian schaltet frei, sobald jemand es allein kann.
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
  abgemeldet,
  markiert,
  kommentare,
  ichId,
}: {
  schicht: Schicht;
  schichten: Schicht[];
  ich: Person | null;
  planer: boolean;
  personen: Person[];
  /** Wer sich für diesen Tag abgemeldet hat (Urlaub, privat). */
  abgemeldet: Set<string>;
  markiert: boolean;
  kommentare: Kommentar[];
  ichId: string;
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
            abgemeldet={abgemeldet}
            schonDabei={Boolean(ich && schonImDienst(schichten, ich.id, t))}
          />
        ))}
      </ul>

      {/* Reden über die Show, nicht über eine Zeile: wer später kommt, wer
          die Requisite mitbringt, was am Abend ansteht. */}
      <ShowKommentare
        eventId={t.ditixEventId}
        kommentare={kommentare}
        ichId={ichId}
        darfLoeschen={planer}
      />
    </li>
  );
}

function SlotZeile({
  slot,
  eventId,
  ich,
  planer,
  personen,
  abgemeldet,
  schonDabei,
}: {
  slot: Slot;
  eventId: string;
  ich: Person | null;
  planer: boolean;
  personen: Person[];
  abgemeldet: Set<string>;
  schonDabei: boolean;
}) {
  const meins = Boolean(ich && slot.person?.id === ich.id);
  const michGefragt = Boolean(ich && slot.angefragt?.id === ich.id);
  const kannUebernehmen =
    ich &&
    !meins &&
    darfUebernehmen(ich, slot.position, slot.fuer) &&
    slot.offen &&
    !schonDabei;
  /*
    Die Position ist besetzt, ich bin dort Rookie und will an dem Abend
    lernen. Geht nur, wenn der Bisherige die Position allein kann und
    noch kein Shadow mitgeht (Florian, 23.09.2026).
  */
  const kannMitlernen = Boolean(
    ich &&
      !meins &&
      !schonDabei &&
      slot.position !== "SHADOW" &&
      slot.person &&
      !slot.offen &&
      !slot.shadow &&
      istRookieFuer(ich, slot.position as FestePosition) &&
      !istRookieFuer(slot.person, slot.position),
  );
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
        {slot.position === "SHADOW" && slot.fuer && (
          <span className="block text-xs font-normal text-leise">für {BEZEICHNUNG[slot.fuer]}</span>
        )}
      </span>

      <span className="min-w-0 flex-1 text-sm">
        {slot.person ? (
          <>
            <strong>{meins ? "Du" : slot.person.name}</strong>
            {slot.position !== "SHADOW" && istRookieFuer(slot.person, slot.position) && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--info-hell)", color: "var(--info)" }}>
                {/* Beide Namen beieinander: wer lernt und wer mitgeht. */}
                Rookie{slot.shadow ? `, ${slot.shadow.vorname} geht als Shadow mit` : ", Shadow noch offen"}
              </span>
            )}
            {slot.fest && <span className="ml-2 rounded bg-gold-hell px-1.5 py-0.5 text-xs text-gold-dunkel">fester Tag</span>}
            {slot.suchtErsatz && (
              <>
                <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}>
                  sucht Ersatz{slot.grund ? `: ${slot.grund}` : ""}
                </span>
                {/* Damit man sieht, dass wirklich jemand gefragt wurde. */}
                {slot.ersatzGefragtAm && (
                  <span className="ml-2 text-xs text-leise">
                    {slot.ersatzGefragtAnzahl}{" "}
                    {slot.ersatzGefragtAnzahl === 1 ? "Kollege gefragt" : "Kollegen gefragt"},{" "}
                    {vorZeit(slot.ersatzGefragtAm)}
                  </span>
                )}
              </>
            )}
            {slot.angefragt && (planer || michGefragt) && (
              <span className="ml-2 rounded bg-gold-hell px-1.5 py-0.5 text-xs text-gold-dunkel">
                {michGefragt ? "du bist gefragt" : `angefragt: ${slot.angefragt.vorname}`}
              </span>
            )}
          </>
        ) : (
          <>
            <strong style={{ color: "var(--warnung)" }}>
              {slot.position === "SHADOW" ? "offen, der Rookie braucht einen Shadow" : "offen, jemand gesucht"}
            </strong>
            {/* Damit niemand zum zweiten Mal denselben Aufruf losschickt. */}
            {slot.ersatzGefragtAm && (
              <span className="ml-2 text-xs text-leise">
                {slot.ersatzGefragtAnzahl}{" "}
                {slot.ersatzGefragtAnzahl === 1 ? "Kollege gefragt" : "Kollegen gefragt"},{" "}
                {vorZeit(slot.ersatzGefragtAm)}
              </span>
            )}
            {slot.angefragt && (planer || michGefragt) && (
              <span className="ml-2 rounded bg-gold-hell px-1.5 py-0.5 text-xs text-gold-dunkel">
                {michGefragt ? "du bist gefragt" : `angefragt: ${slot.angefragt.vorname}`}
              </span>
            )}
          </>
        )}
      </span>

      <span className="flex flex-wrap items-center gap-2">
        {michGefragt && (
          <span className="flex flex-wrap items-center gap-2">
            <form action={anfrageZusagen}>
              {versteckt}
              <Absendeknopf text="Ja, ich mache das" laeuftText="Moment..." />
            </form>
            <details className="text-sm">
              <summary className="cursor-pointer text-leise underline">Leider nicht</summary>
              <form action={anfrageAbsagen} className="mt-2 flex flex-wrap gap-2">
                {versteckt}
                <input name="grund" placeholder="Grund, freiwillig" className="w-48 text-sm" maxLength={120} />
                <Absendeknopf text="Absagen" laeuftText="..." />
              </form>
            </details>
          </span>
        )}

        {/* Den Zuschauer kann jeder. Deshalb hier der Aufruf ans ganze Haus. */}
        {planer && slot.position === "ZUSCHAUER" && slot.offen && (
          <details className="text-sm">
            <summary className="cursor-pointer text-leise underline">
              {slot.ersatzGefragtAm ? "Nochmal alle fragen" : "Alle fragen"}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {/* Ein zweiter Aufruf am selben Tag liest sich wie Drängeln.
                  Deshalb steht hier, wann und an wie viele der letzte ging. */}
              {slot.ersatzGefragtAm && (
                <p className="max-w-sm text-xs" style={{ color: "var(--warnung)" }}>
                  Der Aufruf ging schon an {slot.ersatzGefragtAnzahl}{" "}
                  {slot.ersatzGefragtAnzahl === 1 ? "Kollegen" : "Kollegen"}, {vorZeit(slot.ersatzGefragtAm)}. Gib den
                  Leuten einen Tag Zeit, bevor du nochmal schickst.
                </p>
              )}
              <form action={alleFragen} className="flex flex-wrap gap-2">
                {versteckt}
                <input name="notiz" placeholder="Notiz, freiwillig" className="w-48 text-sm" maxLength={200} />
                <Absendeknopf
                  text={slot.ersatzGefragtAm ? "Trotzdem nochmal schicken" : "Aufruf schicken"}
                  laeuftText="Wird verschickt..."
                />
              </form>
            </div>
          </details>
        )}

        {planer && slot.suchtErsatz && (
          <form action={nochmalFragen}>
            {versteckt}
            <Absendeknopf text="Nochmal fragen" laeuftText="..." />
          </form>
        )}

        {kannUebernehmen && !michGefragt && (
          <form action={uebernehmen}>
            {versteckt}
            <Absendeknopf text="Ich übernehme" laeuftText="Moment..." />
          </form>
        )}

        {/* Besetzt, aber ein Rookie will hier lernen: Er geht auf die
            Position, der bisherige geht als Shadow mit. */}
        {kannMitlernen && (
          <form action={mitlernen}>
            {versteckt}
            <Absendeknopf text="Ich lerne mit" laeuftText="Moment..." />
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
                {/*
                  Beim Shadow zählt die Position, die er begleitet: Für
                  einen Rookie auf FOH kommt nur jemand infrage, der FOH
                  allein kann. Wer sich abgemeldet hat, steht mit Hinweis
                  trotzdem in der Liste: Das Büro darf ihn einteilen, es
                  weiß dann nur, was es tut (Florian, 22.09.2026).
                */}
                {personen
                  .filter((p) => darfUebernehmen(p, slot.position, slot.fuer) || p.id === slot.person?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {abgemeldet.has(p.id) ? " (abgemeldet)" : ""}
                    </option>
                  ))}
              </select>
              <input name="notiz" placeholder="Notiz für die Mail, freiwillig" className="w-56 text-sm" maxLength={300} />
              <Absendeknopf text="Einteilen" laeuftText="..." />
              <button formAction={anfragen} className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
                Nur anfragen
              </button>
            </form>
            <p className="mt-1 text-xs text-leise">
              „Einteilen“ trägt sofort ein. „Nur anfragen“ schickt die Mail an diese eine Person; eingeteilt ist sie
              erst, wenn sie zusagt.
            </p>
            {slot.angefragt && (
              <form action={anfrageAbbrechen} className="mt-1">
                {versteckt}
                <button type="submit" className="text-xs text-leise underline">
                  Anfrage an {slot.angefragt.vorname} zurücknehmen
                </button>
              </form>
            )}
          </details>
        )}
      </span>
    </li>
  );
}

/**
 * Urlaub und private Termine im Voraus eintragen.
 *
 * Florians Wunsch (21.09.2026): Die Nebenjobber wissen früh, wann sie weg
 * sind. Wer es hier einträgt, dessen Schichten schreiben wir sofort aus.
 */
function Urlaub({ meine, alle, planer }: { meine: Abwesenheit[]; alle: Abwesenheit[]; planer: boolean }) {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const tag = (d: string) => d.split("-").reverse().join(".");
  return (
    <details id="urlaub" className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Urlaub oder privat verplant? Hier eintragen</summary>
      <p className="mt-2 text-leise">
        Du weißt schon, wann du in Urlaub bist oder privat verplant? Schreib es einfach hier rein, dann schreiben
        wir den Ersatz für dich gleich aus. In der Zeit fragen wir dich auch nicht mehr.
      </p>
      <form action={urlaubEintragen} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Von</span>
          <input type="date" name="von" min={heute} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Bis</span>
          <input type="date" name="bis" min={heute} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Grund, freiwillig</span>
          <input name="grund" maxLength={120} placeholder="Urlaub, Prüfung, Hochzeit" className="w-56" />
        </label>
        <Absendeknopf text="Eintragen" laeuftText="Wird eingetragen..." />
      </form>

      {meine.length > 0 && (
        <ul className="mt-4 divide-y divide-linie border-t border-linie">
          {meine.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="flex-1">
                {tag(a.von)}
                {a.bis !== a.von && ` bis ${tag(a.bis)}`}
                {a.grund && <span className="text-leise"> · {a.grund}</span>}
              </span>
              <form action={urlaubLoeschen}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-xs text-leise underline">
                  löschen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {planer && alle.length > 0 && (
        <div className="mt-4 border-t border-linie pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-leise">Wer ist wann weg</p>
          <ul className="space-y-1">
            {alle.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  <strong>{a.name}</strong>: {tag(a.von)}
                  {a.bis !== a.von && ` bis ${tag(a.bis)}`}
                  {a.grund && <span className="text-leise"> · {a.grund}</span>}
                </span>
                <form action={urlaubLoeschen}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    löschen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
