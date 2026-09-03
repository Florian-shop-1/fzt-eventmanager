import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import { holeAngebotFuerKunden } from "@/lib/angebot/lesen";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import { ABLAUF, einleitungOhneAblauf } from "@/lib/angebot/ablauf";
import { eur } from "@/lib/domain/pricing";
import { datumMitWochentag } from "@/lib/zeit";
import { Logo } from "@/components/Logo";
import { Bild } from "@/components/Bild";
import { DruckKnopf } from "@/components/DruckKnopf";
import { angebotAblehnen, angebotAnnehmen } from "./actions";

/**
 * Eine Schrift mit Charakter, nur für diese Seite.
 *
 * Das Programm selbst ist bewusst nüchtern, dort wird gearbeitet. Das
 * Angebot dagegen ist das Schaufenster: der Kunde sieht hier zum ersten
 * Mal, wie ein Abend bei uns aussieht. Deshalb eine Renaissance-Antiqua
 * für die Überschriften, die zum Haus passt, und die ruhige Grotesk des
 * Programms für alles, was gelesen und gerechnet wird.
 */
const anzeige = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-anzeige",
});

const SCHRIFT_ANZEIGE = { fontFamily: "var(--font-anzeige), Georgia, serif" } as const;

export const metadata = { title: "Euer Angebot | Florian Zimmer Theater" };
export const dynamic = "force-dynamic";

/**
 * Das Angebot, wie der Kunde es sieht.
 *
 * Diese Seite ist ohne Anmeldung erreichbar, der lange Zufallsschlüssel im
 * Link ist der Nachweis. Deshalb steht hier nur, was der Kunde ohnehin per
 * Mail bekäme: sein eigenes Angebot. Keine anderen Vorgänge, keine internen
 * Notizen, keine Sitzplanung.
 *
 * Aufbau: erst der Abend als Erlebnis, dann die Zahlen. In dieser
 * Reihenfolge, weil niemand eine Preisliste kauft, sondern einen Abend.
 */
export default async function KundenAngebot({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Grobe Geräteangabe für die Öffnungsliste. Bewusst nur "Handy" oder
  // "Rechner", keine IP-Adresse und keine Kennung, die den Kunden über
  // Seiten hinweg wiedererkennbar macht.
  const kennung = (await headers()).get("user-agent") ?? "";
  const geraet = /Mobile|Android|iPhone|iPad/i.test(kennung) ? "Handy" : "Rechner";

  const angebot = await holeAngebotFuerKunden(token, geraet);
  if (!angebot) notFound();

  const summe = angebotssumme(angebot.positionen);
  const haupt = angebot.positionen.filter((p) => !p.istAlternativeZu);
  const abgelaufen = new Date(angebot.gueltigBis) < new Date(new Date().toDateString());
  const anrede = angebot.kunde.ansprechpartner || angebot.kunde.name;
  const gruss = einleitungOhneAblauf(angebot.einleitung);

  // Wie viele Gaeste? Steht in der Menge der Menue- oder Ticketposition.
  // Danach richtet sich, ob wir eine Loge versprechen duerfen: unter zehn
  // Personen waere das falsch, so klein wird eine Loge nicht vergeben.
  const gaeste = Math.max(0, ...haupt.map((p) => p.menge));
  const inLoge = gaeste >= 10;

  return (
    <div className={`${anzeige.variable} angebot-druck`}>
      {/* Bühne: das Erste, was der Kunde sieht. Dunkel, wie der Saal. */}
      <header className="relative isolate overflow-hidden bg-[#17140f] text-white">
        <div className="bild-hintergrund absolute inset-0 -z-10 opacity-45">
          <Bild datei="hero-theater_2.jpeg" alt="" hoehe="h-full" />
        </div>
        <div
          className="bild-hintergrund absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(23,20,15,0.55) 0%, rgba(23,20,15,0.8) 60%, #17140f 100%)",
          }}
        />

        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          <Logo hoehe={92} className="mx-auto" />

          <p
            className="mt-14 text-sm uppercase tracking-[0.35em]"
            style={{ color: "var(--gold)" }}
          >
            Euer Firmenevent
          </p>
          <h1 className="mt-4 text-4xl font-light sm:text-6xl" style={SCHRIFT_ANZEIGE}>
            {angebot.kunde.name}
          </h1>
          <p className="mt-5 text-lg text-white/70" style={SCHRIFT_ANZEIGE}>
            {angebot.vorstellung
              ? `${datumMitWochentag(angebot.vorstellung.datum)} · ${angebot.vorstellung.show}`
              : "Termin nach euren Wünschen"}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-16 px-6 py-14">
        {angebot.angenommenAm && (
          <div
            className="rounded-lg border-2 p-6 text-center"
            style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
          >
            <div className="text-2xl" style={{ ...SCHRIFT_ANZEIGE, color: "var(--gut)" }}>
              Vielen Dank, wir haben eure Zusage.
            </div>
            <p className="mt-2 text-sm text-leise">
              Angenommen von {angebot.angenommenVon}. Wir melden uns mit allen weiteren Schritten.
            </p>
          </div>
        )}

        {!angebot.angenommenAm && abgelaufen && (
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
          >
            Dieses Angebot ist am {datumMitWochentag(angebot.gueltigBis)} abgelaufen. Meldet
            euch gern bei uns, wir prüfen die Verfügbarkeit erneut.
          </div>
        )}

        {/* Ansprache */}
        <section className="text-center">
          <p className="text-lg text-leise" style={SCHRIFT_ANZEIGE}>
            Hallo {anrede},
          </p>
          {gruss && (
            <p
              className="mx-auto mt-4 max-w-xl text-xl leading-relaxed"
              style={SCHRIFT_ANZEIGE}
            >
              {gruss}
            </p>
          )}
        </section>

        {/* Der Abend, Station für Station */}
        <section>
          <Ueberschrift oben="Der Abend" unten="Wie er bei uns abläuft" />

          <div className="mt-10 space-y-12">
            {ABLAUF.map((s, i) => (
              <article
                key={s.zeit}
                className={`flex flex-col gap-6 sm:flex-row sm:items-center ${
                  i % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
              >
                <Bild
                  datei={s.bild}
                  alt={s.titel}
                  hoehe="h-52"
                  className="w-full rounded-lg sm:w-1/2"
                />
                <div className="sm:w-1/2">
                  <div
                    className="text-3xl leading-none"
                    style={{ ...SCHRIFT_ANZEIGE, color: "var(--gold-dunkel)" }}
                  >
                    {s.zeit}
                  </div>
                  <h3 className="mt-2 text-xl" style={SCHRIFT_ANZEIGE}>
                    {s.titel}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-leise">{s.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Der Platz im Saal */}
        <section>
          <Ueberschrift
            oben="Euer Platz"
            unten={inLoge ? "Eine Loge für euch allein" : "Euer Tisch auf der Eventgalerie"}
          />
          <div className="mt-8 overflow-hidden rounded-lg border border-linie bg-flaeche">
            <Bild
              datei="magicuisine-hero.jpg"
              alt="Die Magicuisine mit ihren Tischen"
              hoehe="h-72"
            />
            <div className="p-6 text-sm leading-relaxed text-leise">
              {inLoge ? (
                <>
                  <p>
                    Im Showroom gibt es fünf Logen, jede mit einem langen Tisch für zehn bis zwölf
                    Personen. Zwischen den Logen hängen Vorhänge, die sich öffnen lassen: So wird
                    aus zwei Logen ein Tisch für vierundzwanzig, ohne dass eure Gruppe
                    auseinandergerissen wird.
                  </p>
                  <p className="mt-3">
                    Eure Loge gehört an diesem Abend euch allein. Wir setzen niemand Fremdes
                    dazu. Gegessen wird dort, wo später auch die Show läuft, ihr müsst den Platz
                    also zwischendurch nicht wechseln.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Für eine Gruppe eurer Größe ist die Eventgalerie der schönere Platz: eigene
                    Tische, direkt über dem Geschehen, mit freiem Blick zur Bühne. Ihr sitzt
                    zusammen an einem Tisch, nicht verteilt.
                  </p>
                  <p className="mt-3">
                    Wollt ihr lieber eine eigene Loge im Showroom, sagt uns Bescheid. Eine Loge
                    fasst zehn bis zwölf Personen und wird als Ganzes vergeben.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Die Zahlen */}
        <section>
          <Ueberschrift oben="Euer Angebot" unten={`${angebot.nummer}`} />

          <div className="mt-8 rounded-lg border border-linie bg-flaeche p-6 sm:p-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                  <tr>
                    <th className="py-2 font-medium">Leistung</th>
                    <th className="w-20 py-2 text-right font-medium">Menge</th>
                    <th className="w-24 py-2 text-right font-medium">Einzel</th>
                    <th className="w-28 py-2 text-right font-medium">Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {angebot.positionen.map((p) => {
                    const alternative = Boolean(p.istAlternativeZu);
                    return (
                      <tr key={p.id} className="border-b border-linie align-top last:border-0">
                        <td className="py-2.5">
                          <div className={alternative ? "text-leise" : "font-medium"}>
                            {alternative && "Wahlweise: "}
                            {p.bezeichnung}
                          </div>
                          {p.beschreibung && (
                            <div className="mt-0.5 text-xs text-leise">{p.beschreibung}</div>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{p.menge}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {eur(p.einzelBruttoCent)}
                          {p.rabattProzent ? (
                            <div className="text-xs text-leise">abzüglich {p.rabattProzent}%</div>
                          ) : null}
                        </td>
                        <td
                          className={`py-2.5 text-right tabular-nums ${
                            alternative ? "text-leise" : "font-medium"
                          }`}
                        >
                          {alternative ? `(${eur(positionsSumme(p))})` : eur(positionsSumme(p))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <table className="text-sm">
                <tbody>
                  <tr className="border-t-2 border-text">
                    <td className="py-1 pr-8 font-semibold">Gesamtbetrag</td>
                    <td className="py-1 text-right text-2xl font-semibold tabular-nums">
                      {eur(summe.bruttoCent)}
                    </td>
                  </tr>
                  {summe.ustNachSatz.map((e) => (
                    <tr key={e.satz}>
                      <td className="pr-8 text-xs text-leise">
                        darin {(e.satz * 100).toFixed(0)} % MwSt.
                      </td>
                      <td className="text-right text-xs text-leise tabular-nums">
                        {eur(e.ustCent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {haupt.some((p) => p.artikelNummer.startsWith("TK") || p.artikelNummer === "TGS") && (
              <p className="mt-4 text-xs text-leise">
                Bei den Showtickets könnt ihr zwischen den aufgeführten Kategorien wählen. Sagt
                uns einfach, welche ihr möchtet.
              </p>
            )}

            <p className="mt-4 text-xs text-leise">
              Gültig bis {datumMitWochentag(angebot.gueltigBis)}.
            </p>

            <div className="mt-5 border-t border-linie pt-4">
              <DruckKnopf
                text="Angebot drucken"
                hinweis="oder im Druckfenster als PDF speichern"
              />
            </div>
          </div>
        </section>

        {/* Die Zusage */}
        {!angebot.angenommenAm && (
          <section
            className="zusage-block rounded-lg px-6 py-10 text-center text-white sm:px-10"
            style={{ background: "#17140f" }}
          >
            <h2 className="text-3xl font-light" style={SCHRIFT_ANZEIGE}>
              Sollen wir den Abend für euch reservieren?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/70">
              Mit eurer Zusage halten wir die Plätze fest. Verbindlich wird die Buchung mit dem
              Zahlungseingang, danach melden wir uns mit allen Einzelheiten.
            </p>

            <form
              action={angebotAnnehmen.bind(null, token)}
              className="mx-auto mt-7 flex max-w-md flex-wrap items-end justify-center gap-3"
            >
              <label className="min-w-48 flex-1 text-left">
                <span className="mb-1 block text-xs text-white/60">Dein Name</span>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Vor- und Nachname"
                  className="text-text"
                />
              </label>
              <button
                type="submit"
                className="rounded-md px-6 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: "var(--gold)" }}
              >
                Zusagen
              </button>
            </form>

            <details className="mx-auto mt-6 max-w-md text-left">
              <summary className="cursor-pointer text-center text-xs text-white/50">
                Passt so nicht? Kurz Bescheid geben
              </summary>
              <form
                action={angebotAblehnen.bind(null, token)}
                className="mt-3 flex flex-wrap gap-2"
              >
                <input
                  type="text"
                  name="grund"
                  placeholder="Was passt nicht? Termin, Preis, Personenzahl?"
                  className="min-w-48 flex-1 text-text"
                />
                <button
                  type="submit"
                  className="rounded-md border border-white/30 px-4 py-2 text-sm text-white/80"
                >
                  Absenden
                </button>
              </form>
            </details>
          </section>
        )}

        {/* Das Kleingedruckte, bewusst am Ende und ruhig gesetzt */}
        <section className="border-t border-linie pt-8">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-leise">
            {angebot.schlusstext}
          </p>
        </section>

        <footer className="pb-4 text-center text-xs text-leise">
          Florian Zimmer Theater GmbH · Grethe-Weiser-Str. 2/1 · 89231 Neu-Ulm
          <br />
          Tel. 0731 7906 110 · tickets@florianzimmer.com
        </footer>
      </div>
    </div>
  );
}

/** Abschnittsüberschrift: kleine goldene Zeile, darunter der Titel. */
function Ueberschrift({ oben, unten }: { oben: string; unten: string }) {
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-[0.3em]" style={{ color: "var(--gold-dunkel)" }}>
        {oben}
      </div>
      <h2 className="mt-3 text-3xl font-light" style={SCHRIFT_ANZEIGE}>
        {unten}
      </h2>
      <div className="mx-auto mt-4 h-px w-16" style={{ background: "var(--gold)" }} />
    </div>
  );
}
