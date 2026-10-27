import { allergienFuerTag, type AllergieEintrag } from "@/lib/flotix/allergien";
import { VarianteSchild } from "@/components/Unvertraeglich";

/**
 * Allergien und Unverträglichkeiten des Tages, groß und rot (Florian, 27.10.2026): "das muss sehr klar erkennbar sein".
 *
 * Steht für die Küche und das Funktionsheet ganz oben. Auch wenn nichts angegeben ist, steht es da, damit niemand
 * rätselt, ob die Angaben nur nicht geladen wurden. Konnte FloTix nicht gelesen werden, steht das ebenso deutlich.
 *
 * Sortiert ist nach Bestellung, nicht nach Hinweis: Eine Runde, die zusammen am Tisch sitzt, soll zusammen dastehen,
 * und darunter Zeile für Zeile, worauf bei welchem Menü zu achten ist. Wo der Tisch schon feststeht, steht er dabei.
 */

/** Wo die Gruppe sitzt, nach Gruppenkennung. Kommt aus dem Sitzplan, fehlt also an Abenden ohne Verteilung. */
export type Sitzplaetze = Record<string, string>;

function nachBestellung(eintraege: AllergieEintrag[]): AllergieEintrag[][] {
  const karte = new Map<string, AllergieEintrag[]>();
  for (const e of eintraege) {
    const liste = karte.get(e.gruppeId);
    if (liste) liste.push(e);
    else karte.set(e.gruppeId, [e]);
  }
  return [...karte.values()];
}

export async function AllergienKasten({
  datum,
  plaetze = {},
}: {
  datum: string;
  plaetze?: Sitzplaetze;
}) {
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
        <strong>Allergien: keine Angaben</strong> bei den FloTix-Bestellungen dieses Tages. Hinweise aus der Zeit
        vor dem Umschalten und Firmengruppen stehen weiter unten.
      </section>
    );
  }

  const gruppen = nachBestellung(eintraege);

  return (
    <section className="rounded-lg border-4 p-5" style={{ borderColor: "#e0382a", background: "#3a1512" }}>
      <h2 className="mb-1 text-lg font-bold uppercase tracking-wide" style={{ color: "#ff8a7a" }}>
        Allergien und Unverträglichkeiten ({eintraege.length})
      </h2>
      <p className="mb-4 text-sm" style={{ color: "#f0d5d0" }}>
        Jede Zeile nennt das Menü, für das sie gilt. Im Funktionsheet stehen dieselben Hinweise noch einmal unten am
        Tisch des Gastes.
      </p>
      <ul className="space-y-4">
        {gruppen.map((g) => {
          const kopf = g[0];
          const platz = plaetze[kopf.gruppeId];
          return (
            <li key={kopf.gruppeId} className="border-l-4 pl-3" style={{ borderColor: "#e0382a" }}>
              <div className="text-base font-bold text-white">
                {kopf.gast}
                {platz && <span style={{ color: "#ff8a7a" }}> · {platz}</span>}
              </div>
              <div className="mb-1.5 text-xs" style={{ color: "#f0d5d0" }}>
                {kopf.uhrzeit} Uhr · Bestellung {kopf.bestellnummer}
                {kopf.telefon ? ` · ${kopf.telefon}` : ""}
              </div>
              <ul className="space-y-1.5">
                {g.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-lg font-bold text-white">{e.text}</span>
                    <VarianteSchild variante={e.variante} auf="dunkel" />
                    <span className="text-xs" style={{ color: "#f0d5d0" }}>
                      {e.menue ?? "Angabe zur ganzen Bestellung"}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
