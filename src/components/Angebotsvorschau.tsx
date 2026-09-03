"use client";

/**
 * Angebotsvorschau. Zeigt links die Stellschrauben, rechts das fertige
 * Angebot im Layout der bisherigen lexoffice-Angebote.
 */

import { useMemo, useState, useTransition } from "react";
import {
  SCHLUSSTEXT,
  angebotsnummer,
  angebotssumme,
  einleitungstext,
  erzeugePositionen,
  gueltigBis,
  positionsSumme,
} from "@/lib/angebot/erstellen";
import { artikelDerGruppe } from "@/lib/domain/artikel";
import { eur } from "@/lib/domain/pricing";
import { holeAngebotspreise } from "@/lib/angebot/preisaktion";
import type { Vorgang } from "@/lib/domain/vorgang";
import { planeSitzplaetze } from "@/lib/seating/planner";

const TICKETS = artikelDerGruppe("ticket");
const GETRAENKE = artikelDerGruppe("getraenke");

export interface VorstellungsWahl {
  id: string;
  datum: string;
  beschriftung: string;
}

export function Angebotsvorschau({
  vorstellungen = [],
  startPreise = {},
  startFehler = null,
}: {
  vorstellungen?: VorstellungsWahl[];
  /** Preise der ersten Vorstellung, schon auf dem Server geholt. */
  startPreise?: Record<string, number>;
  startFehler?: string | null;
}) {
  const [kunde, setKunde] = useState("Fluoron GmbH");
  const [ansprechpartner, setAnsprechpartner] = useState("Frau Schön");
  const [vorstellungId, setVorstellungId] = useState(vorstellungen[0]?.id ?? "");

  // Die gewählte Vorstellung, sonst ein Ersatzdatum für die Vorschau.
  const gewaehlteShow = vorstellungen.find((v) => v.id === vorstellungId);
  const datum = gewaehlteShow?.datum ?? "2026-11-13";
  const showName = gewaehlteShow?.beschriftung.split(", ").slice(2).join(", ") || "ULMFASSBAR";
  const [personen, setPersonen] = useState(20);
  const [inLoge, setInLoge] = useState(true);
  const [ticket, setTicket] = useState("TK2");
  const [rabatt, setRabatt] = useState(15);
  const [getraenke, setGetraenke] = useState<string[]>([]);
  const [mitEmpfang, setMitEmpfang] = useState(false);

  /*
    Preise der gewählten Vorstellung aus dem Ticketshop.

    Sie unterscheiden sich je Termin: An Silvester kostet das Menü 89 statt
    69 Euro. Die erste Vorstellung bringt ihre Preise schon vom Server mit,
    jeder Wechsel holt sie nach. Bewusst beim Wechsel und nicht in einem
    Effekt: So gibt es beim ersten Aufbau keinen Moment mit falschen Zahlen.
  */
  const [preise, setPreise] = useState<Map<string, number>>(
    new Map(Object.entries(startPreise)),
  );
  const [preisFehler, setPreisFehler] = useState<string | null>(startFehler);
  const [preiseLaden, starteLaden] = useTransition();

  function vorstellungWechseln(neueId: string) {
    setVorstellungId(neueId);
    starteLaden(async () => {
      const antwort = await holeAngebotspreise(neueId);
      setPreise(new Map(Object.entries(antwort.preise)));
      setPreisFehler(
        antwort.fehler ??
          (Object.keys(antwort.preise).length === 0
            ? "Für diese Vorstellung sind im Shop keine passenden Preise hinterlegt."
            : null),
      );
    });
  }

  const vorgang = useMemo<Vorgang>(() => {
    const jetzt = new Date().toISOString();
    return {
      id: "vorschau",
      nummer: "V-0826-001",
      status: "angebot_erstellt",
      kunde: { id: "k", name: kunde, ansprechpartner, email: "" },
      vorstellung: { datum, show: showName },
      gruppen: [
        {
          id: "g1",
          name: kunde,
          personen,
          herkunft: "firma",
          sicherheit: "gebucht",
          menues: { classic: personen },
          bereichFixiert: inLoge ? "logen" : "eventgalerie",
        },
      ],
      angebote: [],
      zahlungen: [],
      notizen: [],
      aufgaben: [],
      quelle: "Vorschau",
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    };
  }, [kunde, ansprechpartner, datum, showName, personen, inLoge]);

  const plan = useMemo(() => planeSitzplaetze(vorgang.gruppen)[0] ?? null, [vorgang]);

  const positionen = useMemo(
    () =>
      erzeugePositionen(vorgang, plan, {
        ticket,
        ticketRabatt: rabatt,
        getraenkepauschalen: getraenke,
        mitEmpfang,
        mitUnterbelegung: true,
        preise,
      }),
    [vorgang, plan, ticket, rabatt, getraenke, mitEmpfang, preise],
  );

  const summe = angebotssumme(positionen);
  const heute = new Date();
  const blockiert = plan?.logen[0]?.freiePlaetze ?? 0;

  /**
   * Positionsnummern wie im Original: Hauptpositionen fortlaufend,
   * Alternativen darunter als 2.A1, 2.A2 und so weiter.
   */
  const nummern = useMemo(() => {
    const ergebnis = new Map<string, string>();
    const haupt = positionen.filter((p) => !p.istAlternativeZu);
    haupt.forEach((p, i) => ergebnis.set(p.id, String(i + 1)));
    const zaehler = new Map<string, number>();
    for (const p of positionen) {
      if (!p.istAlternativeZu) continue;
      const n = (zaehler.get(p.istAlternativeZu) ?? 0) + 1;
      zaehler.set(p.istAlternativeZu, n);
      ergebnis.set(p.id, `${ergebnis.get(p.istAlternativeZu) ?? "?"}.A${n}`);
    }
    return ergebnis;
  }, [positionen]);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4 rounded-lg border border-linie bg-flaeche p-4">
        <h2 className="text-sm font-semibold">Angaben</h2>

        <Feld label="Kunde">
          <input type="text" value={kunde} onChange={(e) => setKunde(e.target.value)} />
        </Feld>
        <Feld label="Ansprechpartner">
          <input
            type="text"
            value={ansprechpartner}
            onChange={(e) => setAnsprechpartner(e.target.value)}
          />
        </Feld>
        <Feld label="Vorstellung">
          {vorstellungen.length > 0 ? (
            <select
              value={vorstellungId}
              onChange={(e) => vorstellungWechseln(e.target.value)}
            >
              {vorstellungen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.beschriftung}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-leise">
              Der Spielplan ist gerade nicht erreichbar, die Vorschau rechnet mit einem
              Beispieltermin.
            </p>
          )}
        </Feld>
        <Feld label="Personen">
          <input
            type="number"
            min={1}
            max={58}
            value={personen}
            onChange={(e) => setPersonen(Math.max(1, Number(e.target.value) || 1))}
          />
        </Feld>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--gold-dunkel)]"
            checked={inLoge}
            onChange={(e) => setInLoge(e.target.checked)}
          />
          In der Loge platzieren
        </label>

        <Feld label="Ticketkategorie">
          <select value={ticket} onChange={(e) => setTicket(e.target.value)}>
            {TICKETS.map((t) => (
              <option key={t.nummer} value={t.nummer}>
                {t.bezeichnung} ({eur(t.bruttoCent)})
              </option>
            ))}
          </select>
        </Feld>

        <Feld label="Rabatt auf Tickets in Prozent">
          <input
            type="number"
            min={0}
            max={50}
            value={rabatt}
            onChange={(e) => setRabatt(Math.max(0, Number(e.target.value) || 0))}
          />
        </Feld>

        {(preisFehler || preiseLaden) && (
          <p
            className="rounded border px-2 py-1.5 text-xs"
            style={{
              borderColor: preisFehler ? "var(--warnung)" : "var(--linie)",
              background: preisFehler ? "var(--warnung-hell)" : "transparent",
            }}
          >
            {preiseLaden
              ? "Preise werden aus dem Ticketshop geholt..."
              : `${preisFehler} Gerechnet wird mit den Preisen aus dem Artikelstamm.`}
          </p>
        )}

        <Feld label="Getränkepauschalen">
          <Getraenkewahl gewaehlt={getraenke} setzen={setGetraenke} />
        </Feld>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--gold-dunkel)]"
            checked={mitEmpfang}
            onChange={(e) => setMitEmpfang(e.target.checked)}
          />
          Magicuvée-Empfang berechnen
        </label>

        {blockiert > 0 && (
          <div className="rounded-md border border-warnung bg-warnung-hell px-3 py-2 text-xs">
            {blockiert} Logenplätze bleiben frei und werden als Exklusivnutzung berechnet.
            Über den Sitzplan lässt sich dafür eine Ausnahme hinterlegen.
          </div>
        )}
      </aside>

      <article className="rounded-lg border border-linie bg-flaeche p-8 text-sm shadow-sm">
        <header className="mb-6 flex justify-between gap-8 border-b border-linie pb-4">
          <div>
            <div className="mb-4 text-[10px] text-leise">
              Florian Zimmer Theater GmbH, Grethe-Weiser-Str. 2/1, 89231 Neu-Ulm
            </div>
            <div className="font-medium">{kunde}</div>
            {ansprechpartner && <div>z.Hd. {ansprechpartner}</div>}
          </div>
          <table className="h-fit text-xs">
            <tbody>
              <tr>
                <td className="pr-3 text-leise">Angebotsnr.:</td>
                <td className="text-right font-medium">{angebotsnummer(heute, 1169)}</td>
              </tr>
              <tr>
                <td className="pr-3 text-leise">Datum:</td>
                <td className="text-right">{heute.toLocaleDateString("de-DE")}</td>
              </tr>
              <tr>
                <td className="pr-3 text-leise">gültig bis:</td>
                <td className="text-right">
                  {new Date(gueltigBis(heute)).toLocaleDateString("de-DE")}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <h1 className="mb-4 text-base font-semibold">
          ANGEBOT: Abendessen und Show {angebotsnummer(heute, 1169)}
        </h1>

        <pre className="mb-6 whitespace-pre-wrap font-sans text-xs leading-relaxed text-leise">
          {einleitungstext(vorgang)}
        </pre>

        <table className="mb-4 w-full text-xs">
          <thead className="border-b border-linie text-left text-leise">
            <tr>
              <th className="w-8 py-1 font-medium">Pos.</th>
              <th className="py-1 font-medium">Bezeichnung</th>
              <th className="w-16 py-1 text-right font-medium">Menge</th>
              <th className="w-20 py-1 text-right font-medium">Einzel</th>
              <th className="w-16 py-1 text-right font-medium">Rabatt</th>
              <th className="w-24 py-1 text-right font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {positionen.map((p) => {
              const alternative = Boolean(p.istAlternativeZu);
              const nummer = nummern.get(p.id) ?? "";
              return (
                <tr key={p.id} className="border-b border-linie align-top last:border-0">
                  <td className={`py-2 ${alternative ? "text-leise" : ""}`}>{nummer}</td>
                  <td className="py-2">
                    <div className={alternative ? "text-leise" : "font-medium"}>
                      {alternative && "(Alternativposition) "}
                      {p.bezeichnung}
                    </div>
                    <div className="text-[10px] text-leise">Art.-Nr.: {p.artikelNummer}</div>
                    {p.beschreibung && (
                      <div className="mt-0.5 text-[10px] text-leise">{p.beschreibung}</div>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {p.menge} {p.einheit}
                  </td>
                  <td className="py-2 text-right">{eur(p.einzelBruttoCent)}</td>
                  <td className="py-2 text-right">{p.rabattProzent ? `${p.rabattProzent}%` : ""}</td>
                  <td className={`py-2 text-right ${alternative ? "text-leise" : "font-medium"}`}>
                    {alternative ? `(${eur(positionsSumme(p))})` : eur(positionsSumme(p))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mb-6 flex justify-end">
          <table className="text-xs">
            <tbody>
              <tr className="border-t-2 border-text">
                <td className="py-1 pr-6 font-semibold">Gesamtbetrag</td>
                <td className="py-1 text-right font-semibold">{eur(summe.bruttoCent)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-leise">darin netto</td>
                <td className="text-right text-leise">{eur(summe.nettoCent)}</td>
              </tr>
              {summe.ustNachSatz.map((e) => (
                <tr key={e.satz}>
                  <td className="pr-6 text-leise">
                    darin USt {(e.satz * 100).toFixed(0)} % auf {eur(e.nettoCent)}
                  </td>
                  <td className="text-right text-leise">{eur(e.ustCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <pre className="whitespace-pre-wrap border-t border-linie pt-4 font-sans text-[10px] leading-relaxed text-leise">
          {SCHLUSSTEXT}
        </pre>
      </article>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-leise">{label}</span>
      {children}
    </label>
  );
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
