"use client";

import { useState } from "react";

/**
 * Der Saalplan zum Aussuchen: Wo sollen die Gäste der Firma sitzen?
 *
 * "wichtig ist, dass kevin auch gleich entscheiden kann im eventmanager
 * wo die sitzen sollen. mach doch so ein Feld, wo sollen deine Gäste
 * sitzen" (Florian, 26.10.2026).
 *
 * Bewusst schlicht gehalten: Plätze antippen, ausgewählte werden gold,
 * fertig. Kein Zoomen, kein Verschieben. Wer viele Plätze braucht,
 * klickt den ersten und den letzten einer Reihe, dazwischen wird
 * ausgefüllt.
 *
 * Verkaufte und gesperrte Plätze lassen sich nicht wählen. Was schon
 * für diesen Vorgang optioniert ist, ist gold und bleibt es.
 */

export interface Platz {
  reihe: string;
  platz: string;
  kategorie: string;
  x: number;
  y: number;
  status: "frei" | "verkauft" | "gesperrt";
  /** Für genau diesen Vorgang schon gehalten. */
  meins?: boolean;
}

const schluesselVon = (p: { reihe: string; platz: string }) => `${p.reihe}|${p.platz}`;

export function PlaetzeWaehlen({
  plaetze,
  vorschlag,
}: {
  plaetze: Platz[];
  /** So viele Gäste stehen im Vorgang. Nur als Hinweis. */
  vorschlag: number;
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>(
    plaetze.filter((p) => p.meins).map(schluesselVon),
  );
  const [zuletzt, setZuletzt] = useState<string | null>(null);

  if (plaetze.length === 0) {
    return <p className="text-sm text-leise">Für diesen Abend gibt es keinen Saalplan.</p>;
  }

  const breite = Math.max(...plaetze.map((p) => p.x)) + 20;
  const hoehe = Math.max(...plaetze.map((p) => p.y)) + 20;

  /*
    Zwei Klicks in derselben Reihe füllen alles dazwischen.

    Eine Firma sitzt am Stück. Vierzig Plätze einzeln anzutippen wäre
    eine Zumutung, und genau da entstehen Lücken.
  */
  function tippen(p: Platz) {
    if (p.status !== "frei" && !p.meins) return;
    const schluessel = schluesselVon(p);

    if (gewaehlt.includes(schluessel)) {
      setGewaehlt((alt) => alt.filter((s) => s !== schluessel));
      setZuletzt(null);
      return;
    }

    const vorige = zuletzt ? plaetze.find((x) => schluesselVon(x) === zuletzt) : null;
    if (vorige && vorige.reihe === p.reihe) {
      const inReihe = plaetze
        .filter((x) => x.reihe === p.reihe && (x.status === "frei" || x.meins))
        .sort((a, b) => a.x - b.x);
      const von = inReihe.findIndex((x) => schluesselVon(x) === zuletzt);
      const bis = inReihe.findIndex((x) => schluesselVon(x) === schluessel);
      if (von >= 0 && bis >= 0) {
        const spanne = inReihe.slice(Math.min(von, bis), Math.max(von, bis) + 1).map(schluesselVon);
        setGewaehlt((alt) => [...new Set([...alt, ...spanne])]);
        setZuletzt(schluessel);
        return;
      }
    }

    setGewaehlt((alt) => [...alt, schluessel]);
    setZuletzt(schluessel);
  }

  const farbe = (p: Platz) => {
    if (gewaehlt.includes(schluesselVon(p))) return "var(--gold)";
    if (p.status === "verkauft") return "var(--text)";
    if (p.status === "gesperrt") return "var(--linie)";
    return "var(--flaeche)";
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name="plaetze" value={gewaehlt.join(",")} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <strong>
          {gewaehlt.length} {gewaehlt.length === 1 ? "Platz" : "Plätze"} gewählt
        </strong>
        {vorschlag > 0 && (
          <span className="text-leise">
            {gewaehlt.length === vorschlag
              ? "genau so viele wie Gäste im Vorgang"
              : `im Vorgang stehen ${vorschlag} Gäste`}
          </span>
        )}
        {gewaehlt.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setGewaehlt([]);
              setZuletzt(null);
            }}
            className="text-xs text-leise underline"
          >
            Auswahl leeren
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-linie bg-flaeche p-2">
        <svg viewBox={`0 0 ${breite} ${hoehe}`} className="w-full" style={{ maxHeight: "60vh" }}>
          <rect
            x={breite / 2 - 60}
            y={2}
            width={120}
            height={10}
            rx={3}
            fill="var(--gold-hell)"
            stroke="var(--gold)"
            strokeWidth={0.5}
          />
          <text x={breite / 2} y={10} textAnchor="middle" fontSize={6} fill="var(--gold-dunkel)">
            BÜHNE
          </text>

          {plaetze.map((p) => (
            <g key={schluesselVon(p)} onClick={() => tippen(p)}>
              <title>
                Reihe {p.reihe}, Platz {p.platz}
                {p.kategorie ? ` · ${p.kategorie}` : ""}
                {p.status === "verkauft" ? " · verkauft" : p.status === "gesperrt" ? " · gesperrt" : ""}
              </title>
              <rect
                x={p.x - 5}
                y={p.y - 5}
                width={10}
                height={10}
                rx={2}
                fill={farbe(p)}
                stroke={gewaehlt.includes(schluesselVon(p)) ? "var(--gold-dunkel)" : "var(--linie)"}
                strokeWidth={gewaehlt.includes(schluesselVon(p)) ? 1.2 : 0.5}
                style={{ cursor: p.status === "frei" || p.meins ? "pointer" : "default" }}
              />
            </g>
          ))}
        </svg>
      </div>

      <p className="text-xs text-leise">
        Platz antippen zum Wählen. Zwei Klicks in derselben Reihe füllen alles dazwischen.
        Schwarz ist verkauft, grau gesperrt, gold ist deine Auswahl. Wählst du nichts, sucht
        FloTix die besten freien Plätze von vorne aus.
      </p>
    </div>
  );
}
