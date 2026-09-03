import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { parkplaetzeDesTages, type Parkplatzbuchung } from "@/lib/shop/parkplaetze";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { datumLang } from "@/lib/zeit";

export const metadata = { title: "Parkplätze | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * VIP-Parkplätze und ihre Reservierungsschilder.
 *
 * Bisher lief das über eine Google-Tabelle: Zu jeder Buchung gehörte eine
 * eigene Präsentation, die einzeln geöffnet und gedruckt werden musste.
 * Bei fünf Parkplätzen an einem Abend sind das fünf Tabs und fünf
 * Druckvorgänge.
 *
 * Hier steht stattdessen die Liste des Tages, und ein Klick druckt alle
 * Schilder auf einmal. Jedes Schild ist eine eigene A4-Seite im
 * Querformat, damit es hinter die Windschutzscheibe oder auf den
 * Parkplatz passt und aus einigen Metern lesbar ist.
 */
export default async function ParkplaetzeSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
  const termine = await alleShowtage();
  // Welcher Abend gezeigt wird, entscheidet an einer Stelle für alle
  // Seiten: Adresse, dann der zuletzt angesehene Abend, dann heute.
  const { gewaehlt, monat: aufgeschlagenerMonat, heute } = await waehleAbend(termine, {
    abend,
    monat,
  });

  if (!gewaehlt) {
    return (
      <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
        <div className="font-medium">Keine Vorstellungen gefunden</div>
        <p className="mt-1 text-leise">
          Der Spielplan aus dem Ticketshop ist gerade nicht erreichbar.
        </p>
      </div>
    );
  }

  const termin = await findeTermin(gewaehlt);
  let buchungen: Parkplatzbuchung[] = [];
  let fehler: string | null = null;

  if (termin) {
    try {
      buchungen = await parkplaetzeDesTages(termin.datum);
    } catch (e) {
      fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
    }
  }

  // Ein Schild je Platz, nicht je Buchung: Wer zwei Plätze bucht, braucht
  // auch zwei Schilder.
  const schilder = buchungen.flatMap((b) =>
    Array.from({ length: b.anzahl }, (_, i) => ({ ...b, nummer: i + 1 })),
  );
  const plaetze = schilder.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VIP-Parkplätze</h1>
          <p className="mt-1 text-sm text-leise">
            Wer einen Platz gebucht hat, und die Schilder zum Ausdrucken.
          </p>
        </div>
        {plaetze > 0 && (
          <DruckKnopf
            text={`${plaetze} ${plaetze === 1 ? "Schild" : "Schilder"} drucken`}
            hinweis="Je eine A4-Seite, Querformat"
          />
        )}
      </header>

      <div className="print:hidden">
        <AbendAuswahl
          basisPfad="/parkplaetze"
          gewaehlt={gewaehlt}
          monat={aufgeschlagenerMonat}
        heute={heute}
          abende={termine.map((t) => ({
            ditixEventId: t.ditixEventId,
            datum: t.datum,
            uhrzeit: t.uhrzeit,
            uhrzeiten: t.uhrzeiten,
            name: t.name,
            hinweis: t.gaeste > 0 ? `${t.gaeste} am Tisch` : "keine Gäste am Tisch",
          }))}
        />
      </div>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {/* Die Übersicht am Bildschirm */}
      <section className="rounded-lg border border-linie bg-flaeche p-6 print:hidden">
        <h2 className="mb-1 font-semibold">
          {termin ? datumKurz(termin.datum) : "Abend"} ·{" "}
          {plaetze === 0
            ? "keine Parkplätze gebucht"
            : `${plaetze} ${plaetze === 1 ? "Platz" : "Plätze"}`}
        </h2>

        {plaetze === 0 ? (
          <p className="mt-2 text-sm text-leise">
            Für diesen Abend hat niemand einen VIP-Parkplatz gebucht. Es ist nichts
            vorzubereiten.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="pb-1 font-medium">Kunde</th>
                <th className="w-24 pb-1 text-right font-medium">Plätze</th>
                <th className="w-40 pb-1 font-medium">Bisheriges Schild</th>
              </tr>
            </thead>
            <tbody>
              {buchungen.map((b) => (
                <tr key={b.orderId + b.name} className="border-b border-linie last:border-0">
                  <td className="py-2">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-leise">{b.eventName}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{b.anzahl}</td>
                  <td className="py-2 text-xs">
                    {b.schildUrl ? (
                      <a
                        href={b.schildUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-leise underline hover:text-text"
                      >
                        in Google öffnen
                      </a>
                    ) : (
                      <span className="text-leise">keines hinterlegt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Die Schilder. Am Bildschirm unsichtbar, im Druck je eine Seite. */}
      <div className="parkschilder hidden print:block">
        {schilder.map((s, i) => (
          <Schild key={s.orderId + s.name + i} buchung={s} />
        ))}
      </div>
    </div>
  );
}

/**
 * Ein Reservierungsschild, eine A4-Seite quer.
 *
 * Die Gestaltung ist nicht nachgebaut, sondern die Originalvorlage aus der
 * bisherigen Google-Präsentation: Rahmen, Logo, Goldstaub, die Überschrift
 * "VIP-Parkplatz" und die Zeile "Reserviert für" sind Teil des Bildes.
 * Darüber liegen nur zwei Textzeilen, Name und Datum, genau wie in Slides.
 *
 * Auch die Maße stammen aus der Originaldatei, nicht aus dem Augenmaß:
 * Die Folie ist 29,7 x 21,0 cm, der Name sitzt bei 59,6 Prozent Höhe in
 * 55 pt, das Datum bei 78,6 Prozent in 16 pt. Deshalb ist das Schild in
 * Millimetern gesetzt statt in Bildschirmeinheiten: Auf Papier soll es
 * dasselbe sein wie bisher, nicht ungefähr dasselbe.
 */
function Schild({ buchung }: { buchung: Parkplatzbuchung }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: "297mm",
        height: "210mm",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
      {/* Als Bild, nicht als Hintergrund: Hintergründe lassen Browser beim
          Drucken standardmäßig weg, Bilder nicht. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bilder/parkschild.jpg"
        alt=""
        className="absolute inset-0"
        style={{ width: "297mm", height: "210mm" }}
      />

      <div
        className="absolute flex items-center justify-center text-center font-semibold leading-none"
        style={{
          left: "23.2mm",
          width: "250.6mm",
          top: "125.2mm",
          height: "35.1mm",
          fontSize: schriftgroesse(buchung.name),
        }}
      >
        {buchung.name}
      </div>

      <div
        className="absolute flex items-center justify-center text-center"
        style={{ left: "23.2mm", width: "250.6mm", top: "165.1mm", height: "13.2mm", fontSize: "16pt" }}
      >
        {datumLang(buchung.datum)}
      </div>
    </div>
  );
}

/**
 * Schriftgröße des Namens.
 *
 * Im Original stehen 55 pt, dafür ist der Kasten 250 mm breit, das reicht
 * für rund zwanzig Zeichen. Längere Namen werden kleiner gesetzt, sonst
 * laufen sie über den Zierrahmen. "Mohamed Khaireddine Ben Hafsa" ist ein
 * echter Gast von uns, keine erfundene Grenze.
 */
function schriftgroesse(name: string): string {
  const zeichen = name.trim().length;
  if (zeichen <= 20) return "55pt";
  if (zeichen <= 26) return "44pt";
  if (zeichen <= 34) return "34pt";
  return "28pt";
}
