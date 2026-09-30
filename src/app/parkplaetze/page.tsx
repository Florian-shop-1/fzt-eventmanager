import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { parkplaetzeDesTages, type Parkplatzbuchung } from "@/lib/shop/parkplaetze";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import Link from "next/link";
import { DruckKnopf } from "@/components/DruckKnopf";
import { SofortDrucken } from "@/components/SofortDrucken";
import { datumLang } from "@/lib/zeit";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  alsBuchung,
  darfParkplatzEintragen,
  handParkplaetzeAmTag,
  type HandParkplatz,
} from "@/lib/shop/parkplatz-hand";
import { parkplatzEintragen, parkplatzLoeschen } from "./aktionen";

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
  searchParams: Promise<{
    abend?: string;
    monat?: string;
    meldung?: string;
    nur?: string;
    sofort?: string;
  }>;
}) {
  const { abend, monat, meldung, nur, sofort } = await searchParams;
  const ich = await angemeldeterBenutzer();
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
  let vonHand: HandParkplatz[] = [];
  let fehler: string | null = null;

  if (termin) {
    try {
      buchungen = await parkplaetzeDesTages(termin.datum);
    } catch (e) {
      // Faellt die Google-Tabelle aus, sollen wenigstens die eigenen
      // Eintraege noch dastehen: Sie liegen in unserer Datenbank.
      fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
    }
    /*
      Was wir selbst vergeben haben, kommt dazu: telefonisch gebucht oder
      verschenkt (Florian, 29.09.2026). Auf dem Parkplatz sieht man dem
      Auto nicht an, wie es gebucht wurde, deshalb landen beide Quellen in
      derselben Liste und im selben Druck.
    */
    vonHand = await handParkplaetzeAmTag(termin.datum).catch(() => []);
    buchungen = [
      ...buchungen,
      ...vonHand.map((h) => alsBuchung(h, termin.name, termin.uhrzeit ?? "")),
    ].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // Ein Schild je Platz, nicht je Buchung: Wer zwei Plätze bucht, braucht
  // auch zwei Schilder.
  const alleSchilder = buchungen.flatMap((b) =>
    Array.from({ length: b.anzahl }, (_, i) => ({ ...b, nummer: i + 1 })),
  );

  /*
    Ein einzelnes Schild nachdrucken.

    Der Normalfall bleibt der Stapel am Nachmittag. Aber es kommt jemand
    nach, ein Blatt verknittert, ein Name wird korrigiert: Dann soll nicht
    der ganze Abend noch einmal aus dem Drucker kommen (Florian,
    30.09.2026). Gedruckt werden alle Schilder dieser einen Buchung, denn
    wer zwei Plaetze hat, braucht auch zwei.
  */
  const schilder = nur ? alleSchilder.filter((x) => x.orderId === nur) : alleSchilder;
  const plaetze = schilder.length;
  const einzeln = Boolean(nur) && plaetze > 0;
  const einzelName = einzeln ? schilder[0].name : "";

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

      {sofort === "1" && <SofortDrucken bereit={plaetze > 0} bereich=".parkschilder" />}

      {einzeln && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm print:hidden">
          <span>
            Nur {plaetze === 1 ? "das Schild" : `die ${plaetze} Schilder`} für <strong>{einzelName}</strong>.
          </span>
          <Link href={`/parkplaetze?abend=${encodeURIComponent(gewaehlt)}`} className="underline">
            Zurück zur ganzen Liste
          </Link>
        </div>
      )}

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

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

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
                <th className="w-36 pb-1 font-medium">Schild</th>
                <th className="w-32 pb-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {buchungen.map((b) => (
                <tr key={b.orderId + b.name} className="border-b border-linie last:border-0">
                  <td className="py-2">
                    <div className="font-medium">
                      {b.name}
                      {b.orderId.startsWith("hand:") && (
                        <span
                          className="ml-2 rounded px-1.5 py-0.5 text-[11px]"
                          style={{ background: "var(--gold-hell)" }}
                        >
                          von Hand
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-leise">
                      {b.eventName}
                      {(() => {
                        const h = vonHand.find((x) => `hand:${x.id}` === b.orderId);
                        if (!h) return null;
                        return (
                          <>
                            {h.notiz ? ` · ${h.notiz}` : ""}
                            {h.erfasstVon ? ` · eingetragen von ${h.erfasstVon}` : ""}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{b.anzahl}</td>
                  <td className="py-2 text-xs">
                    {/*
                      Das Schild dieser einen Buchung, ohne den ganzen
                      Stapel. Der Weg fuehrt ueber die Adresse, damit auch
                      der zweite Rechner im Buero denselben Druck bekommt.
                    */}
                    <Link
                      href={`/parkplaetze?abend=${encodeURIComponent(gewaehlt)}&nur=${encodeURIComponent(b.orderId)}&sofort=1`}
                      className="rounded-md border border-linie px-2.5 py-1 hover:bg-gold-hell"
                    >
                      Schild drucken
                    </Link>
                  </td>
                  <td className="py-2 text-xs">
                    {b.orderId.startsWith("hand:") ? (
                      darfParkplatzEintragen(ich) ? (
                        <form action={parkplatzLoeschen}>
                          <input type="hidden" name="id" value={b.orderId.slice(5)} />
                          <input type="hidden" name="abend" value={gewaehlt} />
                          <button type="submit" className="text-leise underline hover:text-text">
                            wieder entfernen
                          </button>
                        </form>
                      ) : (
                        <span className="text-leise">von Hand vergeben</span>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Einen Platz selbst vergeben: telefonisch gebucht oder geschenkt.
          --------------------------------------------------------------- */}
      {darfParkplatzEintragen(ich) && termin && (
        <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm print:hidden">
          <summary className="cursor-pointer font-medium">Parkplatz von Hand eintragen</summary>
          <p className="mt-2 max-w-prose text-xs text-leise">
            Für Gäste ohne Buchung im Shop: telefonisch gebucht, oder weil wir jemandem einen Platz
            schenken. Das Schild wird genauso gedruckt wie für eine Buchung.
          </p>
          <form action={parkplatzEintragen} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="abend" value={gewaehlt} />
            <input type="hidden" name="datum" value={termin.datum} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Name (so steht er auf dem Schild)</span>
              <input name="name" required className="w-64" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">E-Mail (falls bekannt)</span>
              <input name="email" type="email" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Plätze</span>
              <input name="anzahl" type="number" min={1} max={20} defaultValue={1} className="w-20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Warum (nur intern)</span>
              <input name="notiz" placeholder="telefonisch gebucht" className="w-64" />
            </label>
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
          <p className="mt-3 text-xs text-leise">
            Gilt für den {termin ? datumKurz(termin.datum) : "gewählten Abend"}. Für einen anderen Abend
            oben umschalten.
          </p>
        </details>
      )}

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
