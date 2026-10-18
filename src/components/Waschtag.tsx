import { Absendeknopf } from "@/components/Absendeknopf";
import { WASCHREGELN, type Hemdmeldung, type Waschstand } from "@/lib/foyer/waschtag";

const de = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/**
 * Der Waschtag im Foyer: fällig, überfällig oder erledigt.
 *
 * Steht auf der Foyercheckliste, weil dort jemand steht, der die
 * Maschine anwerfen kann. Fällig ist der erste Sonntag im Monat, also
 * der Tag mit Flo-Zirkus (Florian, 18.10.2026).
 */
export function WaschtagKasten({
  stand,
  meldungen,
  abhaken,
}: {
  stand: Waschstand;
  meldungen: Hemdmeldung[];
  abhaken: (f: FormData) => void;
}) {
  const dran = stand.ueberfaellig || stand.heuteDran || meldungen.length > 0;

  return (
    <section
      className="rounded-lg border px-5 py-4"
      style={
        stand.ueberfaellig || meldungen.length > 0
          ? { borderColor: "var(--warnung)", background: "var(--warnung-hell)" }
          : { borderColor: "var(--linie)", background: "var(--flaeche)" }
      }
    >
      <h2 className="font-semibold">
        {stand.ueberfaellig
          ? "Waschtag ist überfällig"
          : stand.heuteDran
            ? "Heute ist Waschtag"
            : "Waschtag"}
      </h2>

      <p className="mt-1 text-sm">
        {stand.letzteAm ? (
          <>
            Zuletzt gewaschen am {de(stand.letzteAm)}
            {stand.letzteVon ? ` von ${stand.letzteVon}` : ""}
            {stand.tageHer !== null && stand.tageHer > 0 ? `, das sind ${stand.tageHer} Tage.` : "."}
          </>
        ) : (
          <>Es ist noch kein Waschtag vermerkt.</>
        )}{" "}
        Nächster Termin: {de(stand.naechsterAm)}, erster Sonntag im Monat.
      </p>

      {meldungen.length > 0 && (
        <p className="mt-2 text-sm font-medium" style={{ color: "var(--warnung)" }}>
          Das Showteam meldet leere Größen:{" "}
          {meldungen.map((m) => m.groesse).join(", ")}
        </p>
      )}

      {dran && (
        <ul className="mt-2 space-y-1 text-sm text-leise">
          {WASCHREGELN.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <form action={abhaken} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-leise">Notiz (freiwillig)</span>
          <input name="notiz" maxLength={200} placeholder="zum Beispiel: zwei Hemden fehlen" />
        </label>
        <Absendeknopf text="Heute gewaschen" laeuftText="Wird vermerkt..." />
      </form>
    </section>
  );
}

/**
 * Der Knopf fürs Showteam, wenn eine Größe leer ist.
 *
 * "bitte beim Showteam einen Button rein: gibt keine Hemden mehr in
 * Größe (?)" (Florian, 18.10.2026). Die Meldung geht ans Foyer und an
 * Florian, der nachkauft, wenn die Größe gar nicht da ist.
 */
export function HemdenMelden({
  groessen,
  melden,
}: {
  groessen: string[];
  melden: (f: FormData) => void;
}) {
  return (
    <details className="rounded-lg border border-linie bg-flaeche px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Keine Hemden mehr in meiner Größe
      </summary>

      <form action={melden} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs">
          <span className="mb-1 block text-leise">Größe</span>
          <select name="groesse" defaultValue="L">
            {groessen.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="nichtVorhanden" value="ja" className="h-4 w-4" />
          Diese Größe gibt es bei uns gar nicht
        </label>

        <Absendeknopf text="Ans Foyer melden" laeuftText="Wird gemeldet..." />
      </form>

      <p className="mt-2 text-xs text-leise">
        Geht ans Foyer und an Florian. Ist die Größe nur gerade in der Wäsche, wird gewaschen; gibt
        es sie bei uns gar nicht, kauft Florian sie nach.
      </p>
    </details>
  );
}
