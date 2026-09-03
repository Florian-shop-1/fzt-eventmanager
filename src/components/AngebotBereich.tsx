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
import { angebotErzeugen, angebotLoeschen, angebotVersendet } from "@/lib/angebot/speichern";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import { eur } from "@/lib/domain/pricing";
import { artikelDerGruppe } from "@/lib/domain/artikel";
import type { AngebotDetail } from "@/lib/angebot/lesen";

const TICKETS = artikelDerGruppe("ticket");
const GETRAENKE = artikelDerGruppe("getraenke");

export function AngebotBereich({
  vorgangId,
  angebote,
  appUrl,
  kundeEmail,
  ansprechpartner,
}: {
  vorgangId: string;
  angebote: AngebotDetail[];
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
}) {
  const [laeuft, starte] = useTransition();
  const [ticket, setTicket] = useState("TK2");
  const [rabatt, setRabatt] = useState(0);
  const [getraenke, setGetraenke] = useState<string[]>([]);
  const [mitEmpfang, setMitEmpfang] = useState(false);

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

        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Ticketkategorie</span>
              <select value={ticket} onChange={(e) => setTicket(e.target.value)}>
                {TICKETS.map((t) => (
                  <option key={t.nummer} value={t.nummer}>
                    {t.bezeichnung} ({eur(t.bruttoCent)})
                  </option>
                ))}
              </select>
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

          <label className="block">
            <span className="mb-1 block text-xs text-leise">Getränkepauschale</span>
            <Getraenkewahl gewaehlt={getraenke} setzen={setGetraenke} />
          </label>

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
                void angebotErzeugen(vorgangId, {
                  ticket,
                  ticketRabatt: rabatt,
                  getraenkepauschalen: getraenke,
                  mitEmpfang,
                  mitUnterbelegung: true,
                }),
              )
            }
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
          >
            {laeuft ? "wird erstellt..." : "Angebot erstellen"}
          </button>

          <p className="text-xs text-leise">
            Menüs, Personenzahl und blockierte Logenplätze übernimmt das Programm aus dem Vorgang
            und dem Sitzplan.
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

  const mailtext = [
    `Sehr geehrte${ansprechpartner?.startsWith("Herr") ? "r" : ""} ${ansprechpartner ?? "Damen und Herren"},`,
    "",
    "vielen Dank für Ihr Interesse an einem Abend im Florian Zimmer Theater.",
    "",
    "Ihr persönliches Angebot finden Sie hier:",
    link,
    "",
    "Dort können Sie es in Ruhe ansehen und mit einem Klick zusagen.",
    `Das Angebot gilt bis zum ${new Date(angebot.gueltigBis).toLocaleDateString("de-DE")}.`,
    "",
    "Bei Fragen sind wir gerne für Sie da.",
    "",
    "Herzliche Grüße",
    "Florian Zimmer Theater",
  ].join("\n");

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
          {angebot.positionen.filter((p) => !p.istAlternativeZu).length} Positionen ansehen
        </summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {angebot.positionen
              .filter((p) => !p.istAlternativeZu)
              .map((p) => (
                <tr key={p.id} className="border-b border-linie last:border-0">
                  <td className="py-1">{p.bezeichnung}</td>
                  <td className="py-1 text-right tabular-nums">{p.menge}x</td>
                  <td className="py-1 text-right tabular-nums">{eur(positionsSumme(p))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>

      <div className="mb-3 rounded bg-hintergrund p-2">
        <div className="mb-1 text-xs text-leise">Persönlicher Link für den Kunden</div>
        <div className="break-all font-mono text-xs">{link}</div>
      </div>

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
