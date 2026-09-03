import Link from "next/link";
import {
  AMPEL_TEXT,
  ESSPLAETZE_GESAMT,
  belegungKommenderAbende,
  type AbendBelegung,
} from "@/lib/kueche/belegung";
import { kapazitaet } from "@/lib/domain/venue";
import { datumKurz } from "@/components/Status";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";

export const metadata = { title: "Belegung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

export default async function BelegungSeite() {
  // Die Gastronomie sieht die Belegung als Vorschau, kann aber keine
  // Vorgänge öffnen. Deshalb dort kein Link, der ins Leere führt.
  const benutzer = await angemeldeterBenutzer();
  const darfVorgaenge = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
  let abende: AbendBelegung[] = [];
  let fehler: string | null = null;

  try {
    abende = await belegungKommenderAbende();
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  // Gezeigt wird die ganze Saison, auch Abende ohne Buchung: Es geht
  // hier nicht nur darum, wo es eng wird, sondern auch darum, wo noch
  // Luft für eine Firmenanfrage ist.
  const kritisch = abende.filter(
    (a) => a.ampel === "eng" || a.ampel === "voll" || a.ampel === "ueberbucht",
  );

  // Nach Monaten gruppieren, sonst ist eine Liste über die ganze Saison
  // nicht mehr zu überblicken.
  const monate: Array<{ schluessel: string; abende: AbendBelegung[] }> = [];
  for (const a of abende) {
    const schluessel = a.datum.slice(0, 7);
    const letzter = monate[monate.length - 1];
    if (letzter && letzter.schluessel === schluessel) letzter.abende.push(a);
    else monate.push({ schluessel, abende: [a] });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Belegung der Essplätze
        </h1>
        <p className="mt-1 text-sm text-leise">
          Die Magicuisine hat {ESSPLAETZE_GESAMT} Plätze: {kapazitaet("logen")}{" "}
          in den Logen und {kapazitaet("eventgalerie")} auf der Eventgalerie.
          Der Ticketshop kennt diese Grenze nicht, deshalb wird hier gezählt.
        </p>
      </header>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>
            Zahlen unvollständig.
          </strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {kritisch.length > 0 && (
        <section
          className="rounded-lg border-2 p-5"
          style={{
            borderColor: "var(--warnung)",
            background: "var(--warnung-hell)",
          }}
        >
          <h2
            className="mb-2 font-semibold"
            style={{ color: "var(--warnung)" }}
          >
            {kritisch.length}{" "}
            {kritisch.length === 1 ? "Abend braucht" : "Abende brauchen"} deine
            Aufmerksamkeit
          </h2>
          <ul className="space-y-1 text-sm">
            {kritisch.map((a) => (
              <li key={a.ditixEventId}>
                <strong>{datumKurz(a.datum)}</strong>, {a.name}: {a.belegt} von{" "}
                {ESSPLAETZE_GESAMT} Plätzen belegt
                {a.ampel === "ueberbucht" && (
                  <strong style={{ color: "var(--blocker)" }}>
                    {" "}
                    ({a.belegt - ESSPLAETZE_GESAMT} zu viel)
                  </strong>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-leise">
            Wird ein Abend zu voll, hilft nur eines: die Menü-Artikel für diese
            Vorstellung im Ditix-Backend abschalten. Ein Kontingent kennt der
            Shop nicht.
          </p>
        </section>
      )}

      {abende.length === 0 && !fehler ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">Keine Vorstellungen gefunden</div>
          <p className="mt-1 text-leise">
            Der Spielplan aus dem Ticketshop ist gerade nicht erreichbar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Abend</th>
                <th className="px-4 py-2 text-right font-medium">aus Ditix</th>
                <th className="px-4 py-2 text-right font-medium">
                  aus Vorgängen
                </th>
                <th className="px-4 py-2 text-right font-medium">belegt</th>
                <th className="px-4 py-2 text-right font-medium">frei</th>
                <th className="w-48 px-4 py-2 font-medium">Auslastung</th>
              </tr>
            </thead>
            <tbody>
              {monate.map((m) => (
                <MonatsBlock
                  key={m.schluessel}
                  schluessel={m.schluessel}
                  abende={m.abende}
                  darfVorgaenge={darfVorgaenge}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ZahlenErklaerung />
    </div>
  );
}

/** Überschriftszeile eines Monats mit seiner Summe. */
function MonatsBlock({
  schluessel,
  abende,
  darfVorgaenge,
}: {
  schluessel: string;
  abende: AbendBelegung[];
  darfVorgaenge: boolean;
}) {
  const menues = abende.reduce((s, a) => s + a.belegt, 0);
  const mitGaesten = abende.filter((a) => a.belegt > 0).length;

  return (
    <>
      <tr className="border-b border-linie bg-hintergrund">
        <th
          colSpan={6}
          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide"
        >
          {monatsname(schluessel)}
          <span className="ml-3 font-normal normal-case tracking-normal text-leise">
            {abende.length}{" "}
            {abende.length === 1 ? "Vorstellung" : "Vorstellungen"}
            {menues > 0 && `, ${menues} Menüs an ${mitGaesten} Abenden`}
          </span>
        </th>
      </tr>
      {abende.map((a) => (
        <AbendZeile key={a.ditixEventId} a={a} darfVorgaenge={darfVorgaenge} />
      ))}
    </>
  );
}

/** "Dezember 2026" aus "2026-12". */
function monatsname(schluessel: string): string {
  const [jahr, monat] = schluessel.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, 15)).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    month: "long",
    year: "numeric",
  });
}

function AbendZeile({ a, darfVorgaenge }: { a: AbendBelegung; darfVorgaenge: boolean }) {
  const stil = AMPEL_TEXT[a.ampel];
  const leer = a.belegt === 0;

  return (
    <tr className={`border-b border-linie last:border-0 ${leer ? "opacity-55" : ""}`}>
      <td className="px-4 py-3">
        <div className="font-medium">{datumKurz(a.datum)}</div>
        <div className="text-xs text-leise">
          {a.uhrzeit} Uhr · {a.name}
        </div>
        {a.vorgaenge.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {a.vorgaenge.map((v) => {
              const inhalt = (
                <>
                  {v.kunde} ({v.personen})
                  {v.sicherheit === "reserviert" && (
                    <span style={{ color: "var(--warnung)" }}> · reserviert</span>
                  )}
                </>
              );
              const stil = "rounded bg-hintergrund px-1.5 py-0.5 text-xs text-leise";
              return darfVorgaenge ? (
                <Link key={v.id} href={`/vorgaenge/${v.id}`} className={`${stil} hover:text-gold-dunkel`}>
                  {inhalt}
                </Link>
              ) : (
                <span key={v.id} className={stil}>
                  {inhalt}
                </span>
              );
            })}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-leise">
        {a.ausDitix}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-leise">
        {a.ausVorgaengen > 0 ? a.ausVorgaengen : "-"}
        {a.reserviert > 0 && (
          <div className="text-xs" style={{ color: "var(--warnung)" }}>
            {a.reserviert} reserviert
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">
        {a.belegt}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{a.frei}</td>
      <td className="px-4 py-3">
        <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-hintergrund">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, a.prozent)}%`,
              background: stil.farbe,
            }}
          />
        </div>
        <span className="text-xs" style={{ color: stil.farbe }}>
          {a.prozent} % · {stil.text}
        </span>
      </td>
    </tr>
  );
}

/** Erklärt, woher die Zahlen kommen. Steht unter der Tabelle. */
function ZahlenErklaerung() {
  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
      <h2 className="mb-2 font-semibold">Woher die Zahlen kommen</h2>
      <ul className="space-y-1.5 text-leise">
        <li>
          <strong className="text-text">aus Ditix</strong>: Menüs aus der
          Menüliste des Shops. Das ist die führende Zahl.
        </li>
        <li>
          <strong className="text-text">aus Vorgängen</strong>: Firmenevents,
          die hier erfasst, aber in Ditix noch nicht eingebucht sind. Steht dort
          eine Zahl, fehlt sie in Ditix noch. Sobald Kevin sie einbucht, wandert
          sie nach links.
        </li>
        <li>
          Ist bei einem Vorgang noch keine Menüwahl erfasst, zählt die
          Gästezahl. Für die Platzfrage zählt der Gast, nicht seine Menüwahl.
        </li>
        <li>
          <strong className="text-text">reserviert</strong>: Anfragen und
          Angebote, die noch nicht bezahlt sind. Sie belegen den Platz, damit
          nichts doppelt verkauft wird. Sagt die Firma ab, gibst du die Plätze
          im Sitzplan wieder frei.
        </li>
      </ul>
    </section>
  );
}
