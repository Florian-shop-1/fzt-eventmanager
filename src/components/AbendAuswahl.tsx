/**
 * Auswahl eines Abends, nach Monaten sortiert.
 *
 * Der Spielplan reicht rund ein Jahr in die Zukunft, das sind knapp
 * zweihundert Termine. Als eine lange Reihe Kacheln ist das unbrauchbar,
 * deshalb erst der Monat, dann der Tag.
 *
 * Der Monat steckt in der Adresse, damit ein Link auf einen Abend im
 * März auch im März aufgeht und nicht wieder im ersten Monat landet.
 */

import Link from "next/link";
import { datumKurz } from "./Status";
import { ZEITZONE } from "@/lib/zeit";

export interface AbendKachel {
  ditixEventId: string;
  datum: string;
  /** Alle Anfangszeiten des Tages. Bei zwei Shows stehen beide da. */
  uhrzeit: string;
  uhrzeiten?: string[];
  name: string;
  /** Kurze Zeile unter dem Datum, je Seite verschieden. */
  hinweis: string;
  /** Hebt den Abend hervor, etwa weil dort eine Firma sitzt. */
  betont?: boolean;
}

/** Monatsschlüssel JJJJ-MM aus einem ISO-Datum. */
export function monatVon(iso: string): string {
  return iso.slice(0, 7);
}

/** "Dezember 2026" aus "2026-12". */
function monatsname(schluessel: string): string {
  const [jahr, monat] = schluessel.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, 15)).toLocaleDateString("de-DE", {
    timeZone: ZEITZONE,
    month: "long",
    year: "numeric",
  });
}

/** Kurzform für die Monatsleiste, etwa "Dez 26". */
function monatKurz(schluessel: string): string {
  const [jahr, monat] = schluessel.split("-").map(Number);
  const name = new Date(Date.UTC(jahr, monat - 1, 15)).toLocaleDateString("de-DE", {
    timeZone: ZEITZONE,
    month: "short",
  });
  return `${name} ${String(jahr).slice(2)}`;
}

export function AbendAuswahl({
  abende,
  gewaehlt,
  monat,
  basisPfad,
  heute,
}: {
  abende: AbendKachel[];
  gewaehlt: string | undefined;
  /** Angezeigter Monat als JJJJ-MM. Fehlt er, wird er aus dem Abend abgeleitet. */
  monat: string | undefined;
  /** Zum Beispiel "/funktionsheet". */
  basisPfad: string;
  /** Heutiges Datum, JJJJ-MM-TT. Der Tag wird hervorgehoben. */
  heute?: string;
}) {
  if (abende.length === 0) return null;

  const monate = [...new Set(abende.map((a) => monatVon(a.datum)))].sort();

  // Welcher Monat ist gemeint? Der aus der Adresse, sonst der des gewählten
  // Abends, sonst der erste, in dem überhaupt etwas stattfindet.
  const abendMonat = abende.find((a) => a.ditixEventId === gewaehlt)?.datum;
  const aktiverMonat =
    (monat && monate.includes(monat) ? monat : null) ??
    (abendMonat ? monatVon(abendMonat) : null) ??
    (heute && monate.includes(monatVon(heute)) ? monatVon(heute) : null) ??
    monate[0];

  const sichtbar = abende.filter((a) => monatVon(a.datum) === aktiverMonat);

  return (
    <div className="space-y-3 print:hidden">
      <nav className="flex flex-wrap gap-1.5">
        {monate.map((m) => {
          const anzahl = abende.filter((a) => monatVon(a.datum) === m).length;
          const jetzt = m === aktiverMonat;
          return (
            <Link
              key={m}
              href={`${basisPfad}?monat=${m}`}
              title={`${monatsname(m)}, ${anzahl} ${anzahl === 1 ? "Vorstellung" : "Vorstellungen"}`}
              className="rounded-md border px-2.5 py-1 text-xs"
              style={{
                borderColor: jetzt ? "var(--gold)" : "var(--linie)",
                background: jetzt ? "var(--gold-hell)" : "transparent",
                color: jetzt ? "var(--gold-dunkel)" : "var(--text-leise)",
                fontWeight: jetzt ? 600 : 400,
              }}
            >
              {monatKurz(m)}{" "}
              <span className="tabular-nums opacity-70">{anzahl}</span>
              {heute && monatVon(heute) === m && (
                <span className="ml-1" title="In diesem Monat sind wir gerade">
                  ·
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap gap-2">
        {sichtbar.map((a) => (
          <Link
            key={a.ditixEventId}
            href={`${basisPfad}?abend=${a.ditixEventId}&monat=${aktiverMonat}`}
            className={`rounded-md border px-3 py-2 text-sm ${
              a.ditixEventId === gewaehlt
                ? "border-gold bg-gold-hell"
                : "border-linie bg-flaeche hover:border-gold"
            }`}
            style={
              // Heute bekommt einen kräftigen Rahmen, auch wenn gerade ein
              // anderer Tag geöffnet ist. Man soll sofort sehen, wo man ist.
              a.datum === heute
                ? { borderColor: "var(--gold-dunkel)", borderWidth: 2 }
                : undefined
            }
          >
            <div className="font-medium">
              {a.datum === heute && (
                <span
                  className="mr-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                  style={{ background: "var(--gold-dunkel)" }}
                >
                  Heute
                </span>
              )}
              {datumKurz(a.datum)}
              {a.betont && (
                <span className="ml-1.5 text-xs" style={{ color: "var(--gold-dunkel)" }}>
                  ●
                </span>
              )}
            </div>
            <div className="text-xs text-leise">
              {(a.uhrzeiten ?? [a.uhrzeit]).join(" und ")} Uhr · {a.hinweis}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
