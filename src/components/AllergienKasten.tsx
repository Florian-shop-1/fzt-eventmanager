import { allergienFuerTag } from "@/lib/flotix/allergien";

/**
 * Allergien und Unverträglichkeiten des Tages, groß und rot (Florian, 27.10.2026): "das muss sehr klar erkennbar sein".
 *
 * Steht für die Küche und das Funktionsheet ganz oben. Auch wenn nichts angegeben ist, steht es da, damit niemand
 * rätselt, ob die Angaben nur nicht geladen wurden. Konnte FloTix nicht gelesen werden, steht das ebenso deutlich.
 */
export async function AllergienKasten({ datum }: { datum: string }) {
  if (!datum) return null;
  const { gelesen, eintraege } = await allergienFuerTag(datum);

  if (!gelesen) {
    return (
      <section className="rounded-lg border-2 px-5 py-4 text-sm" style={{ borderColor: "#c0392b", background: "#3a1512" }}>
        <strong style={{ color: "#ff8a7a" }}>Allergien: konnten nicht geladen werden.</strong> Bitte vor dem Kochen bei den
        Bestellungen nachsehen oder das Büro fragen. „Keine Angaben“ heißt das hier nicht.
      </section>
    );
  }

  if (eintraege.length === 0) {
    return (
      <section className="rounded-lg border px-5 py-3 text-sm" style={{ borderColor: "#3f6b3a", background: "#14180f" }}>
        <strong>Allergien: keine Angaben</strong> bei den bezahlten FloTix-Bestellungen dieses Tages. Hinweise aus der Zeit
        vor dem Umschalten und Firmengruppen stehen weiter unten.
      </section>
    );
  }

  return (
    <section className="rounded-lg border-4 p-5" style={{ borderColor: "#e0382a", background: "#3a1512" }}>
      <h2 className="mb-3 text-lg font-bold uppercase tracking-wide" style={{ color: "#ff8a7a" }}>
        ⚠ Allergien und Unverträglichkeiten ({eintraege.length})
      </h2>
      <ul className="space-y-2.5 text-base">
        {eintraege.map((e, i) => (
          <li key={i} className="border-l-4 pl-3" style={{ borderColor: "#e0382a" }}>
            <div className="text-lg font-bold text-white">{e.text}</div>
            <div className="text-sm" style={{ color: "#f0d5d0" }}>
              {e.menue ? `${e.menue} · ` : "ganze Bestellung · "}
              {e.gast} · {e.uhrzeit} Uhr · Bestellung {e.bestellnummer}
              {e.telefon ? ` · ${e.telefon}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
