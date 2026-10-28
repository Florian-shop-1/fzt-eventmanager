"use client";

/**
 * Der Angebotsbereich im Vorgang: erzeugen, Link weitergeben, Öffnungen
 * verfolgen, Mailtext übernehmen.
 *
 * Das Öffnungs-Tracking läuft über den persönlichen Link, nicht über ein
 * Zählpixel in der Mail. Der Grund: Apple und Outlook laden Bilder
 * inzwischen selbst oder gar nicht, ein Pixel würde also falsche oder gar
 * keine Zahlen liefern. Ein Klick auf den Link ist eindeutig.
 */

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  angeboteErzeugen,
  angebotLoeschen,
  angebotVersendet,
  positionOptional,
  positionPreisSetzen,
  positionEntfernen,
  positionHinzufuegen,
  positionText,
} from "@/lib/angebot/speichern";
import { VARIANTEN, wochentagName, type Variante } from "@/lib/angebot/ablaufplan";
import { angebotPerMail } from "@/lib/angebot/mailversand";
import { rechnungErzeugen } from "@/lib/rechnung/mailversand";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import { eur } from "@/lib/domain/pricing";
import { artikelDerGruppe, THEATER_SITZPLAETZE } from "@/lib/domain/artikel";
import type { AngebotDetail } from "@/lib/angebot/lesen";

const TICKETS = artikelDerGruppe("ticket");
const GETRAENKE = artikelDerGruppe("getraenke");
const EXKLUSIV = artikelDerGruppe("exklusiv");
const WOCHENTAGE = [0, 1, 2, 3, 4, 5, 6].map(wochentagName);

/*
  Was zusaetzlich in ein Angebot kann: Technik, Effekte, Foyer,
  Highlights. Menues und Tickets stehen nicht dabei, die kommen aus der
  Fassung.
*/
const ZUSATZARTIKEL = [
  ...artikelDerGruppe("highlight"),
  ...artikelDerGruppe("technik"),
  ...artikelDerGruppe("foyer"),
  ...artikelDerGruppe("loge"),
  ...artikelDerGruppe("sonstiges"),
];

/** Der Satz, der die LED-Fassade sauber vom Ticketpreis trennt. */
const LED_TEXT =
  "Die LED-Fassade buchen Sie als eigenständige Werbeleistung mit eigenem Gegenwert. "
  + "Da wir Sie an diesem Abend ohnehin als Werbepartner begrüßen, kalkulieren wir das "
  + "Eventpaket mit unserem Partnerpreis, sodass Sie bei 110 Euro brutto je Person bleiben.";

/** Die drei Arten eines Angebots, wie sie in der Auswahl stehen. */
const ARTEN = [
  { wert: "einzelplaetze", text: "Einzelplätze mit Ticketkategorien", nummer: null, plaetze: 0 },
  { wert: "theater", text: "Exklusivevent: ganzes Theater", nummer: "EXKLTHEATER", plaetze: THEATER_SITZPLAETZE.gesamt },
  { wert: "parkett", text: "Exklusivevent: komplettes Parkett", nummer: "EXKLPARKETT", plaetze: THEATER_SITZPLAETZE.parkett },
] as const;

export function AngebotBereich({
  vorgangId,
  angebote,
  appUrl,
  kundeEmail,
  ansprechpartner,
  personen,
  terminDatum,
  terminZeit,
}: {
  vorgangId: string;
  angebote: AngebotDetail[];
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
  /** Gaeste laut Gruppen des Vorgangs. Vorbelegung der Stueckzahlen. */
  personen: number;
  /** Termin des Vorgangs, falls einer feststeht. */
  terminDatum?: string | null;
  terminZeit?: string | null;
}) {
  const [laeuft, starte] = useTransition();
  /*
    Stueckzahl je Ticketkategorie.

    Vorbelegt ist Kat. 2 mit allen Gaesten, das ist der haeufigste Fall.
    Wer aufteilen will, traegt zwei Zahlen ein, etwa 20 Karten Kat. 1
    fuer die Geschaeftsleitung und 15 Karten Kat. 2 fuer den Rest
    (Florian, 15.10.2026).
  */
  const [mengen, setMengen] = useState<Record<string, number>>({ TK2: personen });
  const [rabatt, setRabatt] = useState(0);
  /*
    Einheitspreis je Sitzplatz, als Text, damit das Feld leer bleiben
    kann. Leer heisst: Kategoriepreise aus dem Ticketshop
    (Florian, 15.10.2026).
  */
  const [ticketpreis, setTicketpreis] = useState("");
  /*
    Einzelplaetze oder das Haus fuer sich allein.

    "gib die Moeglichkeit auch fuer Exklusivevent, da ist dann kein
    Ticket oder Sitzplatzwahl erforderlich" (Florian, 15.10.2026).
  */
  const [art, setArt] = useState<"einzelplaetze" | "theater" | "parkett">("einzelplaetze");
  /*
    Welche Fassungen der Kunde bekommen soll.

    "es muss so sein, dass der Gast z.B. auch drei verschiedene Angebote
    bekommen kann" (Florian, 15.10.2026). Jede angekreuzte Kachel wird
    ein eigenes Angebot mit eigenem Link.
  */
  const [fassungen, setFassungen] = useState<Variante[]>(["menue"]);
  // Steht der Termin noch nicht fest, wird für einen Wochentag angeboten.
  const [terminOffen, setTerminOffen] = useState(!terminDatum);
  const [wochentag, setWochentag] = useState(5);
  const [zeitraum, setZeitraum] = useState("");
  const [tageszeit, setTageszeit] = useState<"nachmittag" | "abend">(
    terminZeit && terminZeit < "17:00" ? "nachmittag" : "abend",
  );
  const [getraenke, setGetraenke] = useState<string[]>([]);
  const [mitEmpfang, setMitEmpfang] = useState(false);
  /*
    Wo gegessen wird, und ob die Loge als Wahlmoeglichkeit mitlaeuft
    (Florian, 28.10.2026). Platz im Saal und Platz am Tisch sind zwei
    verschiedene Dinge: Aus der Loge sieht man die Show nicht.
  */
  const [essplatz, setEssplatz] = useState<"automatisch" | "galerie" | "loge">("automatisch");
  const [logeDazu, setLogeDazu] = useState(false);

  // Aus dem getippten Euro-Text werden Cent. Komma und Punkt gehen beide.
  const preisCent = Math.round((Number(ticketpreis.replace(",", ".")) || 0) * 100);

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="mb-3 text-sm font-semibold">Angebote</h2>

      {angebote.length === 0 ? (
        <p className="mb-4 text-sm text-leise">Noch kein Angebot erstellt.</p>
      ) : (
        <div className="mb-5 space-y-3">
          {angebote.map((a) => (
            <AngebotKarte
              key={a.id}
              angebot={a}
              vorgangId={vorgangId}
              appUrl={appUrl}
              kundeEmail={kundeEmail}
              ansprechpartner={ansprechpartner}
            />
          ))}
        </div>
      )}

      <details className="border-t border-linie pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          {angebote.length === 0 ? "Angebot erstellen" : "Weiteres Angebot erstellen"}
        </summary>

        <div className="mt-3 space-y-4">
          {/* ------------------------------------------------------------
              Schritt 1: Wann?
              ------------------------------------------------------------ */}
          <div className="rounded-md border border-linie p-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-leise">
              1. Wann
            </span>

            {terminDatum && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!terminOffen}
                  onChange={() => setTerminOffen(false)}
                  className="h-4 w-4"
                />
                Fester Termin: {terminDatum.split("-").reverse().join(".")}
                {terminZeit ? `, ${terminZeit} Uhr` : ""}
              </label>
            )}

            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={terminOffen}
                onChange={() => setTerminOffen(true)}
                className="h-4 w-4"
              />
              Termin steht noch nicht fest
            </label>

            {/*
              Für einen Wochentag anbieten: "so dass der Kunde sieht,
              dass es Donnerstag günstiger wäre als Freitag oder Samstag,
              Sonntag übrigens auch" (Florian, 15.10.2026).
            */}
            {terminOffen && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Für welchen Wochentag</span>
                  <select value={wochentag} onChange={(e) => setWochentag(Number(e.target.value))}>
                    {[4, 5, 6, 0].map((n) => (
                      <option key={n} value={n}>
                        {WOCHENTAGE[n]}
                        {(n === 4 || n === 0) && " (günstiger)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Zeitraum (freiwillig)</span>
                  <input
                    value={zeitraum}
                    onChange={(e) => setZeitraum(e.target.value)}
                    placeholder="im November oder Dezember 2026"
                  />
                </label>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {([
                ["abend", "Abendshow, 20 Uhr"],
                ["nachmittag", "Nachmittagsshow, 15 Uhr"],
              ] as const).map(([wert, text]) => (
                <label key={wert} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={tageszeit === wert}
                    onChange={() => setTageszeit(wert)}
                    className="h-4 w-4"
                  />
                  {text}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-leise">
              Danach richtet sich der Ablauf im Angebot. Bei der Nachmittagsshow kommen Empfang und
              Menü nach der Show.
            </p>
          </div>

          {/* ------------------------------------------------------------
              Schritt 2: Welche Fassungen?
              ------------------------------------------------------------ */}
          <div className="rounded-md border border-linie p-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-leise">
              2. Was soll angeboten werden
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {VARIANTEN.map((v) => {
                const an = fassungen.includes(v.wert);
                return (
                  <label
                    key={v.wert}
                    className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
                    style={{
                      borderColor: an ? "var(--gold)" : "var(--linie)",
                      background: an ? "var(--gold-hell)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={an}
                      onChange={() =>
                        setFassungen(
                          an
                            ? fassungen.filter((x) => x !== v.wert)
                            : [...fassungen, v.wert],
                        )
                      }
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">{v.titel}</span>
                      <span className="block text-xs text-leise">{v.enthaelt}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-leise">
              {fassungen.length > 1
                ? `Es entstehen ${fassungen.length} Angebote nebeneinander, jedes mit eigener Nummer und eigenem Link.`
                : "Mehrere ankreuzen heißt: Der Kunde bekommt mehrere Angebote zur Auswahl."}
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">
              Exklusivbuchung: welcher Teil des Hauses
            </span>
            <select value={art} onChange={(e) => setArt(e.target.value as typeof art)}>
              {ARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.text}
                </option>
              ))}
            </select>
          </label>

          {art === "einzelplaetze" ? (
            <div>
              <span className="mb-1 block text-xs text-leise">
                Ticketkategorien und Stückzahl
              </span>
              <Kategorienwahl mengen={mengen} setzen={setMengen} personen={personen} />
            </div>
          ) : (
            <Exklusivhinweis art={art} preisCent={preisCent} personen={personen} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {/*
              Der Einheitspreis. Steht neben dem Rabatt, weil beides
              dasselbe Ziel hat und man eines von beidem nimmt.
            */}
            <label className="block">
              <span className="mb-1 block text-xs text-leise">
                {art === "einzelplaetze"
                  ? "Eigener Preis je Ticket in Euro"
                  : "Eigener Preis für die Exklusivbuchung in Euro"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="z.B. 99"
                value={ticketpreis}
                onChange={(e) => setTicketpreis(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-leise">Rabatt auf Tickets in Prozent</span>
              <input
                type="number"
                min={0}
                max={50}
                value={rabatt}
                onChange={(e) => setRabatt(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>

          <p className="text-xs text-leise">
            {art !== "einzelplaetze" ? (
              <>Der Rabatt gilt nur für Tickets und bleibt bei einer Exklusivbuchung ohne Wirkung.</>
            ) : preisCent > 0 ? (
              <>
                Jeder Sitzplatz kostet {eur(preisCent)}, egal welche Kategorie. Die
                Kategoriebezeichnung bleibt im Angebot stehen.
                {rabatt > 0 && " Der Rabatt kommt zusätzlich darauf, das ist selten gewollt."}
              </>
            ) : (
              <>Ohne eigenen Preis gelten die Kategoriepreise dieser Vorstellung.</>
            )}
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">Getränkepauschale</span>
            <Getraenkewahl gewaehlt={getraenke} setzen={setGetraenke} />
          </label>

          {/*
            Wo gegessen wird. Steht neben den Ticketkategorien, weil es
            dieselbe Frage von der anderen Seite ist: Die Kategorie sagt,
            wo der Gast die Show sieht, das hier sagt, wo er isst.
          */}
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Wo gegessen wird</span>
            <select
              value={essplatz}
              onChange={(e) => setEssplatz(e.target.value as typeof essplatz)}
            >
              <option value="automatisch">Wie im Sitzplan hinterlegt</option>
              <option value="galerie">Alle auf der Eventgalerie</option>
              <option value="loge">Alle in einer Loge</option>
            </select>
            <span className="mt-1 block text-xs text-leise">
              Der Platz am Tisch hat mit der Ticketkategorie nichts zu tun: Aus der Loge sieht man
              die Show nicht, jeder Logengast hat zusätzlich seinen Sitzplatz im Saal. So lässt
              sich auch anbieten, in den Golden Seats zu sitzen und in der Loge zu essen.
            </span>
          </label>

          {essplatz !== "loge" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--gold-dunkel)]"
                checked={logeDazu}
                onChange={(e) => setLogeDazu(e.target.checked)}
              />
              <span>
                Loge zusätzlich als Wahlmöglichkeit anbieten
                <span className="block text-xs text-leise">
                  Steht im Angebot unter dem Menü, mit Preis in Klammern und nicht in der Summe.
                </span>
              </span>
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--gold-dunkel)]"
              checked={mitEmpfang}
              onChange={(e) => setMitEmpfang(e.target.checked)}
            />
            Magicuvée-Empfang berechnen
          </label>

          <button
            disabled={laeuft}
            onClick={() =>
              starte(() =>
                void angeboteErzeugen(
                  vorgangId,
                  {
                  art,
                  tageszeit,
                  wochentag: terminOffen ? wochentag : null,
                  zeitraum: terminOffen ? zeitraum : "",
                  showzeit: !terminOffen && terminZeit ? terminZeit : undefined,
                  ticket: "TK2",
                  kategorien:
                    art === "einzelplaetze"
                      ? TICKETS.map((t) => ({
                          nummer: t.nummer,
                          menge: mengen[t.nummer] ?? 0,
                        })).filter((k) => k.menge > 0)
                      : [],
                  ticketRabatt: rabatt,
                  ticketPreisCent: preisCent > 0 ? preisCent : undefined,
                  getraenkepauschalen: getraenke,
                  essplatz,
                  logeDazu: logeDazu && essplatz !== "loge",
                  mitEmpfang,
                  // Bei einer Exklusivbuchung ist der ganze Saal bezahlt,
                  // leere Logenplaetze werden nicht noch einmal berechnet.
                  mitUnterbelegung: art === "einzelplaetze",
                  },
                  fassungen,
                ),
              )
            }
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
          >
            {laeuft
              ? "wird erstellt..."
              : fassungen.length > 1
                ? `${fassungen.length} Angebote erstellen`
                : "Angebot erstellen"}
          </button>

          <p className="text-xs text-leise">
            Menüs und blockierte Logenplätze übernimmt das Programm aus den Gruppen des Vorgangs
            und dem Sitzplan. Die Zahl der Teilnehmer steht oben bei den Gruppen, von dort kommen
            die {personen} Gäste in dieser Vorbelegung. Menüs, Empfang und Getränke rechnen auch
            beim Exklusivevent je Gast.
          </p>
        </div>
      </details>
    </section>
  );
}

function AngebotKarte({
  angebot,
  vorgangId,
  appUrl,
  kundeEmail,
  ansprechpartner,
}: {
  angebot: AngebotDetail;
  vorgangId: string;
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
}) {
  const [laeuft, starte] = useTransition();
  const [kopiert, setKopiert] = useState<"" | "link" | "mail">("");

  const link = `${appUrl}/ihr-angebot/${angebot.trackingToken}`;
  const summe = angebotssumme(angebot.positionen);

  // Geduzt, wie im Angebot selbst. Zwei verschiedene Anreden in Mail und
  // Angebot fielen sofort auf.
  const mailtext = [
    ansprechpartner ? `Hallo ${ansprechpartner},` : "Hallo,",
    "",
    "vielen Dank für euer Interesse an einem Abend im Florian Zimmer Theater.",
    "",
    "Euer persönliches Angebot hängt an dieser Mail als PDF.",
    "",
    "Online ansehen und mit einem Klick zusagen könnt ihr es hier:",
    link,
    "",
    `Das Angebot gilt bis zum ${new Date(angebot.gueltigBis).toLocaleDateString("de-DE")}.`,
    "",
    "Bei Fragen sind wir gerne für euch da.",
    "",
    "Herzliche Grüße",
    "Florian Zimmer Theater",
  ].join(UMBRUCH);

  const betreff = `Euer Angebot ${angebot.nummer} für den Abend im Florian Zimmer Theater`;

  async function kopiere(was: "link" | "mail") {
    try {
      await navigator.clipboard.writeText(was === "link" ? link : mailtext);
      setKopiert(was);
      setTimeout(() => setKopiert(""), 2500);
    } catch {
      // Manche Browser erlauben das nur nach direkter Nutzeraktion.
      // Dann bleibt der Text im Feld zum Markieren.
    }
  }

  return (
    <div className="rounded-md border border-linie p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{angebot.nummer}</span>
          <span className="ml-2 text-sm text-leise">{eur(summe.bruttoCent)}</span>
        </div>
        <ZustandsAnzeige angebot={angebot} />
      </div>

      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-leise">
          {angebot.positionen.filter((p) => !p.istAlternativeZu).length} Positionen ansehen,
          Preise ändern, optional setzen
        </summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {angebot.positionen
              .filter((p) => !p.istAlternativeZu)
              .map((p) => (
                <tr key={p.id} className="border-b border-linie last:border-0">
                  <td className="py-1">
                    {p.optional && <span className="text-leise">Optional: </span>}
                    <span className={p.optional ? "text-leise" : ""}>{p.bezeichnung}</span>
                    {/*
                      Der Text, der im Angebot unter der Position steht.
                      Enter speichert (Florian, 15.10.2026).
                    */}
                    <form action={positionText.bind(null, p.id, vorgangId)} className="mt-0.5">
                      <input
                        name="text"
                        defaultValue={p.beschreibung ?? ""}
                        maxLength={600}
                        placeholder="Text unter der Position"
                        className="w-full rounded border border-linie px-1.5 py-0.5 text-xs"
                      />
                    </form>
                  </td>
                  <td className="py-1 text-right tabular-nums">{p.menge}x</td>

                  {/*
                    Der Einzelpreis zum Ueberschreiben. Enter genuegt,
                    der Knopf daneben ist fuer die Maus
                    (Florian, 15.10.2026).
                  */}
                  <td className="py-1 pl-2 text-right">
                    <form
                      action={positionPreisSetzen.bind(null, p.id, vorgangId)}
                      className="flex items-center justify-end gap-1"
                    >
                      <input
                        type="text"
                        name="preis"
                        inputMode="decimal"
                        defaultValue={(p.einzelBruttoCent / 100).toFixed(2).replace(".", ",")}
                        className="w-20 rounded border border-linie px-1.5 py-0.5 text-right text-xs tabular-nums"
                      />
                      <button type="submit" className="underline text-leise">
                        €
                      </button>
                    </form>
                  </td>

                  <td className={`py-1 pl-2 text-right tabular-nums ${p.optional ? "text-leise" : ""}`}>
                    {p.optional ? `(${eur(positionsSumme(p))})` : eur(positionsSumme(p))}
                  </td>
                  {/*
                    Der Schalter je Zeile. Optional heisst: steht im
                    Angebot mit Preis in Klammern und zaehlt nicht zur
                    Summe (Florian, 14.10.2026).
                  */}
                  <td className="py-1 pl-2 text-right">
                    <form action={positionOptional.bind(null, p.id, vorgangId, !p.optional)}>
                      <button type="submit" className="whitespace-nowrap underline text-leise">
                        {p.optional ? "zur Pflicht" : "optional"}
                      </button>
                    </form>
                    <form action={positionEntfernen.bind(null, p.id, vorgangId)}>
                      <button type="submit" className="whitespace-nowrap underline text-leise">
                        entfernen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-leise">
          Im Feld steht der Einzelpreis, rechts daneben die Zeilensumme. Optionale Positionen
          stehen im Angebot mit dem Preis in Klammern und sind im Gesamtbetrag nicht enthalten.
          Ein schon verschicktes PDF ändert sich durch Änderungen hier nicht, der Kundenlink
          schon.
        </p>

        {/* ------------------------------------------------------------
            Eine Position dazunehmen, wie bei lexoffice: Artikel wählen
            oder frei eintippen, Menge, Preis, Haken für optional, dazu
            ein eigener Text (Florian, 15.10.2026).
            ------------------------------------------------------------ */}
        <form
          action={positionHinzufuegen.bind(null, angebot.id, vorgangId)}
          className="mt-3 space-y-2 border-t border-linie pt-3"
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem]">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Position</span>
              <select name="artikel" defaultValue="" className="text-sm">
                <option value="">frei eintippen</option>
                {ZUSATZARTIKEL.map((x) => (
                  <option key={x.nummer} value={x.nummer}>
                    {x.bezeichnung} ({eur(x.bruttoCent)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Menge</span>
              <input name="menge" defaultValue="1" inputMode="decimal" className="text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Preis €</span>
              <input name="preis" inputMode="decimal" placeholder="wie Liste" className="text-sm" />
            </label>
          </div>

          <input
            name="bezeichnung"
            maxLength={200}
            placeholder="Eigene Bezeichnung, wenn oben frei eintippen gewählt ist"
            className="w-full text-sm"
          />

          <textarea
            name="text"
            rows={2}
            maxLength={600}
            placeholder="Text unter der Position, zum Beispiel der Hinweis zur LED-Fassade"
            className="w-full text-sm"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="optional" value="ja" defaultChecked className="h-4 w-4" />
              optional, Preis in Klammern und nicht im Gesamtbetrag
            </label>
            <button
              type="submit"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
            >
              Position hinzufügen
            </button>
          </div>

          {/*
            Der Satz zur LED-Fassade steht zum Kopieren da. Werbeleistung
            und Eventpaket bleiben darin getrennt, der Nachlass hängt an
            der Partnerschaft und nicht am Ticketpreis (Florian,
            15.10.2026).
          */}
          <details className="text-xs text-leise">
            <summary className="cursor-pointer">Textbaustein LED-Fassade</summary>
            <p className="mt-1 rounded border border-linie p-2 text-text">{LED_TEXT}</p>
          </details>
        </form>
      </details>

      <div className="mb-3 rounded bg-hintergrund p-2">
        <div className="mb-1 text-xs text-leise">Persönlicher Link für den Kunden</div>
        <div className="break-all font-mono text-xs">{link}</div>
      </div>

      {/*
        Das PDF, so wie der Kunde es bekommt. Vor dem Verschicken einmal
        selbst ansehen ist die beste Kontrolle (Florian, 25.09.2026).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <a
          href={`/api/angebot/pdf?id=${angebot.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-hintergrund"
        >
          Angebot als PDF ansehen
        </a>

        {/*
          Der Schritt danach: Man ist sich einig, die Rechnung geht raus.

          Der Knopf steht auch bei einem noch nicht zugesagten Angebot da,
          weil man sich oft am Telefon einig wird und niemand vorher auf
          den Zusageknopf im Kundenlink drückt. Eine zweite Rechnung legt
          er nicht an, er fuehrt dann zur vorhandenen
          (Florian, 25.09.2026).
        */}
        <form action={rechnungErzeugen.bind(null, angebot.id, vorgangId)}>
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold-hell/40 px-3 py-1.5 text-sm font-medium text-gold-dunkel"
          >
            {angebot.angenommenAm ? "Rechnung erstellen" : "Einig geworden? Rechnung erstellen"}
          </button>
        </form>
      </div>

      {/*
        Verschicken aus dem Programm heraus, ueber das Postfach
        tickets@florianzimmer.com. Der Text steht offen da und laesst sich
        vor dem Abschicken aendern: Kein Angebot ist wie das andere, und
        wer eben telefoniert hat, will darauf Bezug nehmen.
      */}
      <details className="mb-3 rounded border border-gold bg-gold-hell/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gold-dunkel">
          Angebot per Mail verschicken
        </summary>

        <form action={angebotPerMail.bind(null, angebot.id, vorgangId)} className="mt-3 space-y-2">
          <label className="block text-xs">
            <span className="text-leise">An</span>
            <input
              type="email"
              name="an"
              defaultValue={kundeEmail}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            <span className="text-leise">Betreff</span>
            <input
              type="text"
              name="betreff"
              defaultValue={betreff}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            <span className="text-leise">Text</span>
            <textarea
              name="text"
              rows={12}
              defaultValue={mailtext}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 font-sans text-sm"
            />
          </label>

          <Sendeknopf />
          <p className="text-xs text-leise">
            Geht von kevin.steele@florianzimmer.com hinaus und steht danach dort unter Gesendete
            Elemente. Antworten des Kunden landen bei Kevin. Das Angebot wird gleichzeitig als
            versendet vermerkt.
          </p>
        </form>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => kopiere("link")}
          className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
        >
          {kopiert === "link" ? "kopiert" : "Link kopieren"}
        </button>

        <button
          onClick={() => kopiere("mail")}
          className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
        >
          {kopiert === "mail" ? "kopiert" : "Mailtext kopieren"}
        </button>

        <a
          href={`mailto:${encodeURIComponent(kundeEmail)}?subject=${encodeURIComponent(
            `Ihr Angebot ${angebot.nummer} für Ihren Abend im Florian Zimmer Theater`,
          )}&body=${encodeURIComponent(mailtext)}`}
          className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-xs font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          In Outlook öffnen
        </a>

        {!angebot.versendetAm && (
          <button
            disabled={laeuft}
            onClick={() => starte(() => void angebotVersendet(angebot.id, vorgangId))}
            className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell disabled:opacity-50"
          >
            als versendet markieren
          </button>
        )}

        {angebot.oeffnungen.length === 0 && !angebot.angenommenAm && (
          <button
            disabled={laeuft}
            onClick={() => starte(() => void angebotLoeschen(angebot.id, vorgangId))}
            className="rounded-md px-3 py-1.5 text-xs text-leise hover:bg-blocker-hell hover:text-blocker disabled:opacity-50"
          >
            löschen
          </button>
        )}
      </div>

      {angebot.oeffnungen.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs" style={{ color: "var(--gold-dunkel)" }}>
            {angebot.oeffnungen.length}x geöffnet, alle Zeitpunkte ansehen
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-leise">
            {angebot.oeffnungen.map((o, i) => (
              <li key={i}>
                {new Date(o.zeitpunkt).toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {o.geraet && ` · ${o.geraet}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Wo steht das Angebot gerade, in einem Satz. */
function ZustandsAnzeige({ angebot }: { angebot: AngebotDetail }) {
  const stil = (farbe: string) => ({ color: farbe, background: "transparent" });

  if (angebot.angenommenAm) {
    return (
      <span className="text-xs font-medium" style={stil("var(--gut)")}>
        angenommen von {angebot.angenommenVon}
      </span>
    );
  }
  if (angebot.abgelehntAm) {
    return (
      <span className="text-xs font-medium" style={stil("var(--blocker)")}>
        abgelehnt{angebot.ablehnungsgrund ? `: ${angebot.ablehnungsgrund}` : ""}
      </span>
    );
  }
  if (angebot.oeffnungen.length > 0) {
    const letzte = angebot.oeffnungen[0];
    return (
      <span className="text-xs font-medium" style={stil("var(--gold-dunkel)")}>
        {angebot.oeffnungen.length}x geöffnet, zuletzt{" "}
        {new Date(letzte.zeitpunkt).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          dateStyle: "short",
          timeStyle: "short",
        })}
      </span>
    );
  }
  if (angebot.versendetAm) {
    return (
      <span className="text-xs text-leise">versendet, vom Kunden noch nicht geöffnet</span>
    );
  }
  return <span className="text-xs text-leise">erstellt, noch nicht versendet</span>;
}

/**
 * Auswahl der Getränkepauschalen.
 *
 * Bewusst Kästchen statt einer Liste: Softdrink-Flat zusammen mit Bier-
 * und Wein-Flat ist die beliebteste Buchung. Wer keinen Alkohol trinkt,
 * ist mit den Softdrinks versorgt, alle anderen mit beidem. Im Angebot
 * werden daraus zwei getrennte Positionen.
 */
function Getraenkewahl({
  gewaehlt,
  setzen,
}: {
  gewaehlt: string[];
  setzen: (nummern: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {GETRAENKE.map((g) => {
        const an = gewaehlt.includes(g.nummer);
        return (
          <label key={g.nummer} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={an}
              onChange={() =>
                setzen(
                  an ? gewaehlt.filter((n) => n !== g.nummer) : [...gewaehlt, g.nummer],
                )
              }
              className="mt-0.5 h-auto w-auto"
            />
            <span>
              {g.bezeichnung}
              <span className="text-leise"> ({eur(g.bruttoCent)})</span>
            </span>
          </label>
        );
      })}
      {gewaehlt.length === 0 && (
        <p className="text-xs text-leise">Keine Pauschale, Getränke werden einzeln abgerechnet.</p>
      )}
    </div>
  );
}

/**
 * Was eine Exklusivbuchung im Angebot bedeutet.
 *
 * Hier gibt es nichts auszuwählen: eine Zeile für das ganze Haus, keine
 * Kategorien, keine Sitzplatzwahl (Florian, 15.10.2026). Der Kasten
 * sagt, was im Angebot landen wird und was der Preis je Sitzplatz
 * ergibt, denn danach wird gerechnet.
 */
function Exklusivhinweis({
  art,
  preisCent,
  personen,
}: {
  art: "theater" | "parkett";
  preisCent: number;
  personen: number;
}) {
  const eintrag = ARTEN.find((a) => a.wert === art);
  const artikel = EXKLUSIV.find((a) => a.nummer === eintrag?.nummer);
  if (!eintrag || !artikel) return null;

  const gilt = preisCent > 0 ? preisCent : artikel.bruttoCent;
  const plaetze = eintrag.plaetze;

  return (
    <div className="rounded-md border border-linie bg-hintergrund p-3 text-xs">
      <p className="font-medium">{artikel.bezeichnung}</p>
      <p className="mt-1 text-leise">
        Keine Ticketkategorien und keine Sitzplatzwahl: Der Saal gehört an diesem Abend nur euch.
        Im Angebot steht eine Zeile über {eur(gilt)}
        {preisCent > 0 && <> statt der üblichen {eur(artikel.bruttoCent)}</>}.
      </p>
      <p className="mt-1 text-leise">
        Das sind {eur(Math.round(gilt / plaetze))} je Sitzplatz bei {plaetze} Plätzen
        {personen > 0 && <> und {eur(Math.round(gilt / personen))} je angemeldetem Gast</>}.
      </p>
    </div>
  );
}

/**
 * Stückzahl je Ticketkategorie.
 *
 * Mehrere Kategorien in einem Angebot waren der Wunsch: Bei Firmen sitzt
 * die Geschäftsleitung vorne, der Rest weiter hinten (Florian,
 * 15.10.2026). Jede Kategorie mit einer Zahl wird eine eigene Zeile im
 * Angebot und zählt zur Summe.
 *
 * Steht nur eine Kategorie da, erscheinen die anderen im Angebot wie
 * bisher als Wahlmöglichkeit ohne Preis in der Summe.
 */
function Kategorienwahl({
  mengen,
  setzen,
  personen,
}: {
  mengen: Record<string, number>;
  setzen: (m: Record<string, number>) => void;
  personen: number;
}) {
  const verteilt = TICKETS.reduce((s, t) => s + (mengen[t.nummer] ?? 0), 0);
  const benutzte = TICKETS.filter((t) => (mengen[t.nummer] ?? 0) > 0).length;

  return (
    <div className="space-y-1.5">
      {TICKETS.map((t) => (
        <div key={t.nummer} className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            value={mengen[t.nummer] ?? 0}
            onChange={(e) =>
              setzen({ ...mengen, [t.nummer]: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-20 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
          />
          <span>
            {t.bezeichnung}
            <span className="text-leise"> ({eur(t.bruttoCent)})</span>
          </span>
        </div>
      ))}

      {/*
        Die Kontrollzeile. Dass die Stückzahlen zur Gästezahl passen,
        merkt man sonst erst im fertigen PDF.
      */}
      <p className="pt-1 text-xs text-leise">
        {verteilt === 0 ? (
          <>Keine Stückzahl eingetragen: Dann bekommen alle {personen} Gäste Kat. 2.</>
        ) : (
          <>
            {verteilt} von {personen} Gästen verteilt
            {verteilt !== personen && (
              <span style={{ color: "var(--warnung)" }}>
                {" "}
                · stimmt nicht mit den Gruppen überein
              </span>
            )}
            {benutzte > 1 && " · mehrere Kategorien, alle zählen zur Summe"}
            {benutzte === 1 &&
              " · Golden Seats und Kat. 1 stehen als Wahlmöglichkeit darunter, in Klammern und nicht in der Summe"}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Der Umbruch als Konstante.
 *
 * Steht hier, damit im Mailtext oben kein Rueckstrich noetig ist. Der
 * ist auf dem Weg durch Werkzeuge schon zweimal verlorengegangen und hat
 * einmal ein Null-Byte in der Datei hinterlassen.
 */
const UMBRUCH = String.fromCharCode(10);

/**
 * Der Knopf zum Abschicken.
 *
 * Zwischen Klick und Antwort vergehen ein bis zwei Sekunden, in denen
 * der Server mit Microsoft spricht. Ohne Rueckmeldung sieht die Seite in
 * dieser Zeit aus, als sei nichts passiert, und man klickt noch einmal.
 * Bei einer Mail an einen Kunden waere das eine zweite Mail.
 */
function Sendeknopf() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird verschickt..." : "Jetzt verschicken"}
    </button>
  );
}
