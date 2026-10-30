import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import { holeAngebotFuerKunden } from "@/lib/angebot/lesen";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import { ablaufAusEinleitung, einleitungOhneAblauf } from "@/lib/angebot/ablauf";
import { einheitZu } from "@/lib/angebot/einheit";
import { eur } from "@/lib/domain/pricing";
import { datumMitWochentag } from "@/lib/zeit";
import { Logo } from "@/components/Logo";
import { Bild } from "@/components/Bild";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Restzeit } from "@/components/Restzeit";
import { aenderungWuenschen, angebotAblehnen, angebotAnnehmen } from "./actions";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";

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

export const metadata = { title: "Ihr Angebot | Florian Zimmer Theater" };
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ vorschau?: string }>;
}) {
  const { token } = await params;

  /*
    Vorschau fuers Buero.

    "mit einer blossen auflistung kann man sich den abend nicht so toll
    vorstellen" (Florian, 29.10.2026). Richtig, der Abend mit Bildern
    steht auf dieser Seite und nicht im PDF. Deshalb schaut das Buero
    jetzt hier hinein statt in die Zahlenliste.

    Zwei Dinge muessen dabei anders sein als beim Kunden. Der Besuch
    darf nicht als Oeffnung gezaehlt werden, sonst steht in der
    Oeffnungsliste ein Kunde, der nie da war. Und die Knoepfe zum
    Zusagen, Absagen und Aendern bleiben weg: Ein Fehlklick im Buero
    wuerde das Angebot im Namen des Kunden annehmen.

    Beides gilt nur fuer angemeldete Mitarbeiter. Ein Kunde hat keine
    Sitzung, fuer ihn aendert der Anhang an der Adresse nichts.
  */
  const vorschau =
    (await searchParams).vorschau === "1" && Boolean(await angemeldeterBenutzer());

  // Grobe Geräteangabe für die Öffnungsliste. Bewusst nur "Handy" oder
  // "Rechner", keine IP-Adresse und keine Kennung, die den Kunden über
  // Seiten hinweg wiedererkennbar macht.
  const kennung = (await headers()).get("user-agent") ?? "";
  const geraet = /Mobile|Android|iPhone|iPad/i.test(kennung) ? "Handy" : "Rechner";

  const angebot = await holeAngebotFuerKunden(token, geraet, !vorschau);
  if (!angebot) notFound();

  const summe = angebotssumme(angebot.positionen);
  const haupt = angebot.positionen.filter((p) => !p.istAlternativeZu);
  const abgelaufen = new Date(angebot.gueltigBis) < new Date(new Date().toDateString());

  /*
    Sind für dieses Angebot Plätze festgehalten, und laufen sie noch?

    Abgelaufenes wird nicht mehr erwähnt: Dann sind die Plätze längst
    zurück im Verkauf, und ein "reserviert bis gestern" wäre schlicht
    falsch (Florian, 28.10.2026).
  */
  const gehalten =
    angebot.plaetzeGehalten > 0 &&
    angebot.plaetzeBis !== null &&
    new Date(angebot.plaetzeBis) > new Date();
  const haltedatum = angebot.plaetzeBis
    ? new Date(angebot.plaetzeBis).toLocaleString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      }) + " Uhr"
    : "";
  const anrede = angebot.kunde.ansprechpartner || angebot.kunde.name;
  const gruss = einleitungOhneAblauf(angebot.einleitung);
  /*
    Der Ablauf dieses Angebots, genau der, der auch im PDF steht.
    Findet sich in der Einleitung keiner, etwa bei sehr alten
    Angeboten, greift die Vorlage aus ablauf.ts.
  */
  const stationen = ablaufAusEinleitung(angebot.einleitung);
  /* Beginnt der Tag vor 16 Uhr, ist es keine Abendveranstaltung. */
  const nachmittags = (() => {
    const erste = stationen[0]?.zeit;
    if (!erste) return false;
    const [h] = erste.split(":").map(Number);
    return Number.isFinite(h) && h < 16;
  })();

  // Wie viele Gaeste? Steht in der Menge der Menue- oder Ticketposition.
  // Danach richtet sich, ob wir eine Loge versprechen duerfen: unter zehn
  // Personen waere das falsch, so klein wird eine Loge nicht vergeben.
  const gaeste = Math.max(0, ...haupt.map((p) => p.menge));
  const inLoge = gaeste >= 10;

  /*
    Fotos vom Essen, wenn ein Menue dabei ist.

    Dieselbe Regel wie im PDF (siehe lib/angebot/pdfdaten.ts): Beim
    Fingerfood waere eine Galerie mit Gaengen irrefuehrend. Die Bilder
    sollen Lust auf den Abend machen, nicht etwas versprechen, das nicht
    gebucht ist (Florian, 05.10.2026).
  */
  const mitMenue = !angebot.positionen.some((p) => p.artikelNummer === "FINGERFOOD");
  /* Steht die LED-Fassade im Angebot, fest oder als Wahlmöglichkeit? */
  const mitFassade = angebot.positionen.some((p) => p.artikelNummer === "LEDFASSADE");

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
            Ihr Firmenevent
          </p>
          <h1 className="mt-4 text-4xl font-light sm:text-6xl" style={SCHRIFT_ANZEIGE}>
            {angebot.kunde.name}
          </h1>
          <p className="mt-5 text-lg text-white/70" style={SCHRIFT_ANZEIGE}>
            {angebot.vorstellung
              ? `${datumMitWochentag(angebot.vorstellung.datum)} · ${angebot.vorstellung.show}`
              : "Termin nach Ihren Wünschen"}
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
              Vielen Dank, wir haben Ihre Zusage.
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
            Dieses Angebot ist am {datumMitWochentag(angebot.gueltigBis)} abgelaufen. Melden
            Sie sich gern bei uns, wir prüfen die Verfügbarkeit erneut.
          </div>
        )}

        {/* Ansprache */}
        <section className="text-center">
          <p className="text-lg text-leise" style={SCHRIFT_ANZEIGE}>
            Guten Tag {anrede},
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

        {/*
          Der Ablauf dieses Angebots, Station für Station.

          Hier stand bis zum 30.10.2026 eine feste Liste: immer 17:20
          Empfang, 17:50 Menü, 20:00 Show, 22:30 Ausklang. Der echte
          Ablauf aus dem Angebot wurde abgeschnitten und weggeworfen.
          Bei einer Nachmittagsshow las der Kunde damit etwas anderes,
          als im PDF stand (Florian: "Er bekommt den FALSCHEN
          Ablaufplan.").
        */}
        <section>
          <Ueberschrift
            oben={nachmittags ? "Ihr Tag" : "Ihr Abend"}
            unten="Wie er bei uns abläuft"
          />

          <div className="mt-10 space-y-12">
            {stationen.map((s, i) => (
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

        {/* Das Essen, Gang für Gang */}
        {mitMenue && (
          <section>
            <Ueberschrift oben="Ihr Menü" unten="Vier Gänge, frisch im Haus gekocht" />
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ["suppe.webp", "Der Auftakt"],
                ["salat.webp", "Frisch aus der Küche"],
                ["classic.webp", "Magic Menü Classic"],
                ["fish.webp", "Magic Menü Sea"],
                ["veggy.webp", "Magic Menü Veggy"],
                ["nachtisch.webp", "Zum Schluss"],
              ].map(([datei, titel]) => (
                <figure key={datei} className="overflow-hidden rounded-lg border border-linie bg-flaeche">
                  <Bild datei={datei} alt={titel} hoehe="h-40" />
                  <figcaption className="px-3 py-2 text-xs text-leise">{titel}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-leise">
              Jeder an Ihrem Tisch wählt sein Menü selbst, auch vegetarisch oder ohne Fleisch und Fisch.
              Was jemand nicht verträgt, sagen Sie uns vorher, dann kocht die Küche dafür.
            </p>
          </section>
        )}

        {/* Der Platz im Saal */}
        <section>
          <Ueberschrift
            oben="Ihr Platz"
            unten={inLoge ? "Eine Loge für Sie allein" : "Ihr Tisch auf der Eventgalerie"}
          />
          <div className="mt-8 overflow-hidden rounded-lg border border-linie bg-flaeche">
            <Bild
              datei={inLoge ? "loge-tisch.jpg" : "magicuisine-hero.jpg"}
              alt={inLoge ? "Eine Loge mit langem Tisch, Gaeste stossen an" : "Die Magicuisine mit ihren Tischen"}
              hoehe="h-72"
            />
            <div className="relative p-6 text-sm leading-relaxed text-leise">
              {inLoge ? (
                <>
                  <p>
                    Im Showroom gibt es fünf Logen, jede mit einem langen Tisch für zehn bis zwölf
                    Personen. Zwischen den Logen hängen Vorhänge, die sich öffnen lassen: So wird
                    aus zwei Logen ein Tisch für vierundzwanzig, ohne dass Ihre Gruppe
                    auseinandergerissen wird.
                  </p>
                  <p className="mt-3">
                    Ihre Loge gehört an diesem Abend Ihnen allein, wir setzen niemand Fremdes dazu.
                  </p>
                  {/*
                    Der eigentliche Reiz der Loge (Florian, 28.10.2026):
                    "der gag ist bei der Loge, dass man idR in der Loge
                    ist und dann die show von der vip empore anschaut.
                    diese ist unmittelbar vor den Logen. man hat besten
                    blick zur bühne mit einem abstand von nur 7 metern."
                  */}
                  <p className="mt-3">
                    Für die Show sind es ein paar Schritte: Direkt vor Ihren Logen liegt die
                    VIP-Empore, und von dort schauen Sie zu. Sieben Meter bis zur Bühne, nichts
                    dazwischen, der beste Blick im Haus. Danach ist die Loge wieder Ihre.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Für eine Gruppe Ihrer Größe ist die Eventgalerie der schönere Platz: eigene
                    Tische, direkt über dem Geschehen, mit freiem Blick zur Bühne. Sie sitzen
                    zusammen an einem Tisch, nicht verteilt.
                  </p>
                  {/*
                    Der Störer mit dem Logenfoto.

                    "hier wäre doch klein, vielleicht schräg unten rechts
                    als störer bei dem text 'lieber loge' das logenfoto
                    cool" (Florian, 30.10.2026).

                    Das große Bild oben zeigt die Eventgalerie, also das,
                    was angeboten ist. Die Loge steht nur als Satz
                    daneben, und ein Satz verkauft keinen Raum. Deshalb
                    hier klein und schräg: Man sieht, wovon die Rede ist,
                    ohne dass es dem Hauptbild die Schau stiehlt.

                    Auf dem Handy steht es über dem Text statt daneben,
                    sonst bliebe für beides zu wenig Platz.
                  */}
                  <div className="mt-3 sm:flex sm:items-start sm:gap-5">
                    <p className="sm:flex-1">
                      Möchten Sie lieber eine eigene Loge im Showroom, sagen Sie uns Bescheid. Eine
                      Loge fasst zehn bis zwölf Personen und wird als Ganzes vergeben.
                    </p>
                    <figure className="mx-auto mt-4 w-44 shrink-0 -rotate-3 sm:mx-0 sm:mt-0">
                      <div className="overflow-hidden rounded-md border border-linie bg-flaeche shadow-lg">
                        <Bild
                          datei="loge-tisch.jpg"
                          alt="Eine Loge im Showroom mit langem Tisch"
                          hoehe="h-28"
                        />
                      </div>
                      <figcaption className="mt-1 text-center text-xs text-leise">
                        So sieht eine Loge aus
                      </figcaption>
                    </figure>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/*
          Ihr Logo auf der Fassade.

          "pack auf jeden fall auch ins angebot rein die LED fassade. da
          nimmst du das foto, wo ich vor dem gebäude stehe" (Florian,
          28.10.2026). Steht da, sobald die Fassade im Angebot steht,
          fest oder als Wahlmöglichkeit. Die Zahlen dazu stehen unten in
          der Tabelle, hier geht es um das Bild im Kopf.
        */}
        {mitFassade && (
          <section>
            <Ueberschrift oben="Ihre Marke" unten="Das Logo auf unserer LED-Fassade" />
            <div className="mt-8 overflow-hidden rounded-lg border border-linie bg-flaeche">
              <Bild
                datei="led-fassade.jpg"
                alt="Die LED-Fassade des Florian Zimmer Theaters mit einem Firmenlogo"
                ganz
              />
              <div className="p-6 text-sm leading-relaxed text-leise">
                <p>
                  {/*
                    "sag nicht Strasse, sag nur ist nicht zu uebersehen,
                    auch nicht kaum" (Florian, 29.10.2026). "Kaum zu
                    uebersehen" laesst offen, dass man es eben doch
                    uebersieht, und die Strasse zieht den Blick auf die
                    Lage statt auf die Wirkung.
                  */}
                  Unsere Fassade ist über zwanzig Meter breit und nicht zu übersehen. Ihr Logo
                  läuft dort an Ihrem Abend, sichtbar für alle, die kommen, und für jeden, der
                  vorbeifährt. Das Foto davon macht in der Regel jemand aus Ihrer Gruppe, bevor
                  der erste Gang auf dem Tisch steht.
                </p>
                <p className="mt-3">
                  Wir brauchen dafür nur Ihre Bilddatei als JPG oder PNG, spätestens eine Woche
                  vorher. Alles Weitere machen wir.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Die Zahlen */}
        <section>
          <Ueberschrift oben="Ihr Angebot" unten={`${angebot.nummer}`} />

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
                    /* Alternativen und Optionen stehen beide grau und in
                       Klammern: Beides kostet erst, wenn der Kunde es
                       dazunimmt (Florian, 14.10.2026). */
                    const alternative = Boolean(p.istAlternativeZu) || Boolean(p.optional);
                    return (
                      <tr key={p.id} className="border-b border-linie align-top last:border-0">
                        <td className="py-2.5">
                          <div className={alternative ? "text-leise" : "font-medium"}>
                            {p.istAlternativeZu ? "Wahlweise: " : p.optional ? "Optional: " : ""}
                            {p.bezeichnung}
                          </div>
                          {p.beschreibung && (
                            <div className="mt-0.5 text-xs text-leise">{p.beschreibung}</div>
                          )}
                        </td>
                        {/*
                          Die Einheit gehoert dazu, wenn sie nicht
                          "Stueck" ist.

                          "forsche mal nach. haben wir das nicht pro
                          stunde gerechnet gehabt" (Florian, 30.10.2026),
                          zur LED-Fassade. Gerechnet wurde richtig, je
                          Stunde zu 350 Euro. In der Zeile stand aber nur
                          eine nackte 1, und damit sah es nach einer
                          Pauschale aus. Wer das Angebot liest, soll
                          sehen, wofuer der Betrag gilt.
                        */}
                        <td className="py-2.5 text-right tabular-nums">
                          {p.menge}
                          {einheitZu(p.menge, p.einheit) !== "Stück" && (
                            <span className="text-leise"> {einheitZu(p.menge, p.einheit)}</span>
                          )}
                        </td>
                        {/*
                          Der Nachlass soll man sehen.

                          "dann auf dem angebot den ursprünglichen preis
                          durchstreichen. einfach so darstellen, dass man
                          sich gehypt fühlt dass man einen besseren preis
                          hat" (Florian, 30.10.2026).

                          Vorher stand dort nur eine graue Zeile
                          "abzüglich 20%", und die Zahl rechts war schon
                          der Endpreis: Man sah also nie, was der Abend
                          regulär kostet. Jetzt steht der Listenpreis
                          durchgestrichen daneben und der Nachlass als
                          Schild darunter.
                        */}
                        <td className="py-2.5 text-right tabular-nums">
                          {p.rabattProzent ? (
                            <>
                              <span className="text-leise line-through">
                                {eur(p.einzelBruttoCent)}
                              </span>{" "}
                              <span style={{ color: "var(--gut)", fontWeight: 600 }}>
                                {eur(Math.round((p.einzelBruttoCent * (100 - p.rabattProzent)) / 100))}
                              </span>
                            </>
                          ) : (
                            eur(p.einzelBruttoCent)
                          )}
                        </td>
                        <td
                          className={`py-2.5 text-right tabular-nums ${
                            alternative ? "text-leise" : "font-medium"
                          }`}
                        >
                          {p.rabattProzent ? (
                            <>
                              <span className="block text-xs text-leise line-through">
                                {eur(p.einzelBruttoCent * p.menge)}
                              </span>
                              <span style={{ color: "var(--gut)" }}>
                                {alternative ? `(${eur(positionsSumme(p))})` : eur(positionsSumme(p))}
                              </span>
                              <span
                                className="mt-0.5 block rounded px-1.5 py-0.5 text-xs font-semibold"
                                style={{ background: "var(--gut-hell)", color: "var(--gut)" }}
                              >
                                Sie sparen {eur(p.einzelBruttoCent * p.menge - positionsSumme(p))}
                              </span>
                            </>
                          ) : alternative ? (
                            `(${eur(positionsSumme(p))})`
                          ) : (
                            eur(positionsSumme(p))
                          )}
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
                Bei den Showtickets können Sie zwischen den aufgeführten Kategorien wählen. Sagen
                Sie uns einfach, welche Sie möchten.
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
        {!angebot.angenommenAm && vorschau && (
          <section className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm text-leise">
            Vorschau fuer das Buero. Hier stehen beim Kunden die Knoepfe zum Zusagen,
            Aendern und Absagen. Dieser Besuch zaehlt nicht als Oeffnung.
          </section>
        )}

        {!angebot.angenommenAm && !vorschau && (
          <section
            className="zusage-block rounded-lg px-6 py-10 text-center text-white sm:px-10"
            style={{ background: "#17140f" }}
          >
            <h2 className="text-3xl font-light" style={SCHRIFT_ANZEIGE}>
              Sollen wir den Abend für Sie reservieren?
            </h2>
            {/*
              Stehen die Plätze schon, sagen wir das hier (Florian,
              28.10.2026). Nicht als Werbebanner, sondern als Satz: Wir
              halten sie, und zwar bis dann. Die Restzeit steht klein
              daneben; ein Countdown auf die Sekunde wäre ein
              Verkaufstrick und passt nicht zu einem Angebot an eine
              Firma.
            */}
            {gehalten ? (
              <p className="mx-auto mt-3 max-w-md text-sm text-white/70">
                {angebot.plaetzeGehalten}{" "}
                {angebot.plaetzeGehalten === 1 ? "Platz ist" : "Plätze sind"} für Sie
                reserviert, bis zum {haltedatum}.{" "}
                <span className="text-white/45">
                  <Restzeit bis={angebot.plaetzeBis!} />
                </span>{" "}
                Danach gehen sie zurück in den freien Verkauf. Verbindlich wird die Buchung mit dem
                Zahlungseingang, danach melden wir uns mit allen Einzelheiten.
              </p>
            ) : (
              <p className="mx-auto mt-3 max-w-md text-sm text-white/70">
                Mit Ihrer Zusage halten wir die Plätze fest. Verbindlich wird die Buchung mit dem
                Zahlungseingang, danach melden wir uns mit allen Einzelheiten.
              </p>
            )}

            <form
              action={angebotAnnehmen.bind(null, token)}
              className="mx-auto mt-7 flex max-w-md flex-wrap items-end justify-center gap-3"
            >
              <label className="min-w-48 flex-1 text-left">
                <span className="mb-1 block text-xs text-white/60">Ihr Name</span>
                {/*
                  Vorbelegt mit dem, den wir kennen (Florian,
                  28.10.2026: "hier dann gleich den namen übernehmen").
                  Wer zusagt, soll nicht abtippen müssen, was im Angebot
                  ohnehin oben steht. Überschreiben geht trotzdem: Oft
                  sagt jemand anderes zu als der, mit dem wir gesprochen
                  haben.
                */}
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={angebot.kunde.ansprechpartner ?? ""}
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

            {/*
              Zwischen Zusage und Absage liegt der haeufigste Fall
              (Florian, 28.10.2026): Es passt fast. Wer dafuer bisher
              "Passt so nicht" anklicken musste, hat bei uns abgesagt,
              obwohl er kaufen wollte, und die blockierten Plaetze waren
              weg. Deshalb steht der Aenderungswunsch jetzt vorn und die
              Absage leise darunter.

              Die Kennung aenderung ist die Sprungmarke aus der Mail.
            */}
            <div id="aenderung" className="mx-auto mt-8 max-w-md scroll-mt-8 text-left">
              {angebot.aenderungWunsch ? (
                <div className="rounded-md border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/80">
                  <strong className="font-medium text-white">
                    Ihr Änderungswunsch ist bei uns.
                  </strong>
                  <p className="mt-1 text-xs text-white/55">
                    Wir melden uns mit einer angepassten Fassung. Bis dahin bleiben die
                    Plätze für Sie stehen.
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-white/45">
                    {angebot.aenderungWunsch}
                  </p>
                </div>
              ) : (
                <details className="rounded-md border border-white/15 px-4 py-3">
                  <summary className="cursor-pointer text-sm text-white/80">
                    Passt fast? Änderungswunsch schicken
                  </summary>
                  <p className="mt-2 text-xs text-white/50">
                    Anderer Termin, mehr oder weniger Personen, eine andere Kategorie:
                    Schreiben Sie kurz, was anders sein soll. Wir melden uns mit einer neuen
                    Fassung, und die reservierten Plätze bleiben dabei für Sie stehen.
                  </p>
                  <form
                    action={aenderungWuenschen.bind(null, token)}
                    className="mt-3 space-y-2"
                  >
                    <textarea
                      name="wunsch"
                      rows={3}
                      required
                      placeholder="Zum Beispiel: Wir wären 45 Personen statt 30, und ein Freitag wäre uns lieber."
                      className="w-full text-text"
                    />
                    <button
                      type="submit"
                      className="rounded-md px-4 py-2 text-sm font-medium text-white"
                      style={{ background: "var(--gold)" }}
                    >
                      Änderungswunsch senden
                    </button>
                  </form>
                </details>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-center text-xs text-white/40">
                  Passt gar nicht? Kurz absagen
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
            </div>
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
