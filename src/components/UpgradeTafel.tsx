"use client";

/**
 * Upgrades am Einlass, mit einem Tipper.
 *
 * Der erste Entwurf ließ den Mitarbeiter im ganzen Saalplan suchen. Das
 * war zu viel: "muss ultra leicht sein" (Florian, 21.09.2026). Jetzt
 * steht auf jeder Karte ein großer Knopf mit dem fertigen Platz. Ein
 * Tipp, die Gruppe sitzt, und daneben steht der Satz, den man sagt.
 *
 * Nur wenn es anders kommt, weil die Gruppe größer ist oder woanders
 * sitzen will, geht es über "anderer Platz" in den Saalplan. Dann sind
 * ausschließlich die Plätze angetippt, an denen die Gruppe wirklich am
 * Stück sitzen kann, und nur innerhalb der spielbaren Zone.
 *
 * Geändert wird dabei nichts in Ditix. Das hier ist unsere Notiz für den
 * Abend, sichtbar auf jedem Tablet.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface TafelSitz {
  id: number;
  name: string;
  reihe: string;
  sektor: string;
  x: number;
  y: number;
  status: "frei" | "verkauft" | "gesperrt";
  inZone: boolean;
}

export interface TafelGruppe {
  schluessel: string;
  art: "gruppe" | "gast";
  titel: string;
  zusatz: string;
  personen: number;
  quelleIds: number[];
  vorschlagText: string | null;
  vorschlagIds: number[];
  gastId?: string;
}

export interface TafelUmsetzung {
  schluessel: string;
  zielText: string;
  zielIds: number[];
  gesetztVon: string | null;
}

interface Props {
  eventId: string;
  sitze: TafelSitz[];
  gruppen: TafelGruppe[];
  umsetzungen: TafelUmsetzung[];
  zone: { links: number; rechts: number; oben: number; unten: number };
}

const KANTE = 22;

/** Platznamen eines Blocks als Ansage, immer von der kleineren Zahl aus. */
function ansage(block: TafelSitz[]): string {
  const namen = [...block.map((s) => s.name)].sort((a, b) => {
    const za = Number(a);
    const zb = Number(b);
    return Number.isFinite(za) && Number.isFinite(zb) ? za - zb : a.localeCompare(b, "de");
  });
  if (namen.length === 0) return "";
  return namen.length === 1 ? `Platz ${namen[0]}` : `Platz ${namen[0]} bis ${namen[namen.length - 1]}`;
}

function blockText(block: TafelSitz[]): string {
  return block.length === 0 ? "" : `Reihe ${block[0].reihe}, ${ansage(block)}`;
}

export function UpgradeTafel({ eventId, sitze, gruppen, umsetzungen, zone }: Props) {
  const router = useRouter();
  /** Für welche Gruppe gerade ein Platz im Plan gesucht wird. */
  const [sucht, setSucht] = useState<string | null>(null);
  const [gesetzt, setGesetzt] = useState<TafelUmsetzung[]>(umsetzungen);
  const [hinweis, setHinweis] = useState("");
  const [laeuft, setLaeuft] = useState("");

  const umsetzungVon = (schluessel: string) => gesetzt.find((u) => u.schluessel === schluessel) ?? null;
  const gruppe = gruppen.find((g) => g.schluessel === sucht) ?? null;

  const reihen = useMemo(() => {
    const nach = new Map<string, TafelSitz[]>();
    for (const s of sitze) {
      const k = `${s.sektor}::${s.reihe}`;
      nach.set(k, [...(nach.get(k) ?? []), s]);
    }
    return [...nach.entries()]
      .map(([k, liste]) => ({
        schluessel: k,
        nummer: liste[0].reihe,
        y: liste[0].y,
        sitze: [...liste].sort((a, b) => a.x - b.x),
      }))
      .sort((a, b) => a.y - b.y);
  }, [sitze]);

  const belegt = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of gesetzt) for (const id of u.zielIds) m.set(id, u.schluessel);
    return m;
  }, [gesetzt]);

  const quelleVon = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of gruppen) for (const id of g.quelleIds) m.set(id, g.schluessel);
    return m;
  }, [gruppen]);

  /** Sitze, die zu einer bereits gesetzten Gruppe gehören. */
  const zielSitze = useMemo(() => new Set([...belegt.keys()]), [belegt]);

  const masse = useMemo(() => {
    const xs = sitze.map((s) => s.x);
    const ys = sitze.map((s) => s.y);
    const links = Math.min(...xs);
    const rechts = Math.max(...xs);
    const oben = Math.min(...ys);
    const unten = Math.max(...ys);
    const rand = 34;
    return {
      links,
      rechts,
      oben,
      unten,
      viewBox: `${links - KANTE / 2 - rand} ${oben - KANTE / 2 - rand - 26} ${
        rechts - links + KANTE + rand * 2
      } ${unten - oben + KANTE + rand * 2 + 26}`,
    };
  }, [sitze]);

  const istFrei = (s: TafelSitz, fuer: string | null) =>
    s.status === "frei" && (!belegt.has(s.id) || belegt.get(s.id) === fuer);

  /**
   * Alle Plätze, auf die man für diese Gruppe tippen darf: Von hier aus
   * geht ein Block am Stück auf, und er liegt in der spielbaren Zone.
   */
  function moeglicheStarts(g: TafelGruppe): Map<number, TafelSitz[]> {
    const treffer = new Map<number, TafelSitz[]>();
    const anzahl = Math.max(1, g.personen);
    for (const r of reihen) {
      for (let i = 0; i < r.sitze.length; i++) {
        const block: TafelSitz[] = [];
        for (let j = i; j < r.sitze.length && block.length < anzahl; j++) {
          if (!istFrei(r.sitze[j], g.schluessel)) break;
          block.push(r.sitze[j]);
        }
        if (block.length < anzahl) continue;
        if (!block.every((s) => s.inZone)) continue;
        treffer.set(r.sitze[i].id, block);
      }
    }
    return treffer;
  }

  const starts = useMemo(
    () => (gruppe ? moeglicheStarts(gruppe) : new Map<number, TafelSitz[]>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gruppe, gesetzt, reihen],
  );

  async function setzen(g: TafelGruppe, block: TafelSitz[]) {
    if (laeuft) return;
    setLaeuft(g.schluessel);
    setHinweis("");
    const zielText = `${blockText(block)} (${block[0].sektor})`;
    try {
      const antwort = await fetch("/upgrades/setzen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          schluessel: g.schluessel,
          art: g.art,
          gastId: g.gastId,
          quelleText: g.titel,
          zielText,
          zielIds: block.map((s) => s.id),
          personen: g.personen,
        }),
      });
      const e = (await antwort.json()) as { ok: boolean; fehler?: string };
      if (!e.ok) {
        setHinweis(e.fehler ?? "Das ließ sich nicht speichern.");
        return;
      }
      setGesetzt((alt) => [
        ...alt.filter((u) => u.schluessel !== g.schluessel),
        { schluessel: g.schluessel, zielText, zielIds: block.map((s) => s.id), gesetztVon: null },
      ]);
      setSucht(null);
      router.refresh();
    } catch {
      setHinweis("Keine Verbindung. Bitte noch einmal tippen.");
    } finally {
      setLaeuft("");
    }
  }

  /** Der Vorschlag als Block, sofern er noch frei ist. */
  function vorschlagBlock(g: TafelGruppe): TafelSitz[] | null {
    if (g.vorschlagIds.length === 0) return null;
    const block = g.vorschlagIds
      .map((id) => sitze.find((s) => s.id === id))
      .filter((s): s is TafelSitz => Boolean(s));
    if (block.length !== g.vorschlagIds.length) return null;
    if (!block.every((s) => istFrei(s, g.schluessel))) return null;
    return [...block].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  async function zuruecknehmen(g: TafelGruppe) {
    setLaeuft(g.schluessel);
    try {
      await fetch("/upgrades/setzen", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, schluessel: g.schluessel, art: g.art, gastId: g.gastId }),
      });
      setGesetzt((alt) => alt.filter((u) => u.schluessel !== g.schluessel));
      router.refresh();
    } finally {
      setLaeuft("");
    }
  }

  const fertig = gruppen.filter((g) => umsetzungVon(g.schluessel));

  return (
    <section className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Am Einlass umsetzen</h2>
        <span className="text-sm text-leise">
          {fertig.length} von {gruppen.length} gesetzt
        </span>
      </div>

      <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dunkel">Das sagst du</p>
        <p className="mt-1 text-base">
          „Guten Abend! Gute Nachricht: Bei uns hat heute eine Gruppe abgesagt.{" "}
          <strong>Ich kann euch kostenfrei weiter nach vorne setzen.</strong> Von dort seht ihr die Show noch besser.
          Passt das für euch?“
        </p>
        <p className="mt-2 text-xs text-leise">
          Sagt jemand nein: „Kein Problem, dann bleibt ihr natürlich auf euren Plätzen.“ Nie sagen, dass hinten
          schlecht ist, nur dass vorne etwas frei geworden ist.
        </p>
      </div>

      {hinweis && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          {hinweis}
        </p>
      )}

      {/* Die Karten: eine je Gruppe, ein großer Knopf. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {gruppen.map((g) => {
          const u = umsetzungVon(g.schluessel);
          const block = vorschlagBlock(g);
          const suchtHier = sucht === g.schluessel;

          if (u) {
            return (
              <div
                key={g.schluessel}
                className="rounded-xl border-2 px-4 py-3"
                style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
              >
                <p className="text-sm text-leise">{g.titel}</p>
                <p className="text-lg font-semibold">sitzt jetzt: {u.zielText}</p>
                <p className="mt-1 text-sm">
                  „Ihr sitzt jetzt auf <strong>{u.zielText}</strong>, viel Spaß!“
                </p>
                <button
                  type="button"
                  onClick={() => void zuruecknehmen(g)}
                  disabled={laeuft === g.schluessel}
                  className="mt-2 text-xs underline text-leise"
                >
                  doch nicht, rückgängig
                </button>
              </div>
            );
          }

          return (
            <div
              key={g.schluessel}
              className="rounded-xl border-2 px-4 py-3"
              style={{
                borderColor: suchtHier ? "var(--gold)" : "var(--linie)",
                background: suchtHier ? "var(--gold-hell)" : "var(--flaeche)",
              }}
            >
              <p className="text-lg font-semibold">{g.titel}</p>
              <p className="text-sm text-leise">
                {g.personen} {g.personen === 1 ? "Gast" : "Gäste"}
                {g.zusatz && ` · ${g.zusatz}`}
              </p>

              {block ? (
                <button
                  type="button"
                  onClick={() => void setzen(g, block)}
                  disabled={Boolean(laeuft)}
                  className="mt-3 w-full rounded-xl px-4 py-4 text-left text-white disabled:opacity-60"
                  style={{ background: "var(--gut)" }}
                >
                  <span className="block text-xs uppercase tracking-wide opacity-80">hierhin setzen</span>
                  <span className="block text-lg font-semibold">{blockText(block)}</span>
                </button>
              ) : (
                <p className="mt-3 text-sm" style={{ color: "var(--warnung)" }}>
                  Kein freier Block am Stück. Bitte einen Platz im Saalplan aussuchen.
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  setSucht(suchtHier ? null : g.schluessel);
                  setHinweis("");
                }}
                className="mt-2 text-sm underline text-leise"
              >
                {suchtHier ? "Abbrechen" : block ? "anderer Platz" : "Platz im Saalplan aussuchen"}
              </button>

              {suchtHier && (
                <p className="mt-1 text-sm font-medium text-gold-dunkel">
                  Tipp unten im Saal auf einen der markierten Plätze.
                </p>
              )}
            </div>
          );
        })}

        {gruppen.length === 0 && (
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
            Hier ist heute nichts umzusetzen.
          </p>
        )}
      </div>

      {/* Der Saal. Ohne gewählte Gruppe nur zum Anschauen. */}
      <figure className="overflow-x-auto rounded-lg border border-linie bg-flaeche p-3">
        <svg viewBox={masse.viewBox} className="mx-auto block h-auto w-full" role="img" aria-label="Saalplan">
          <rect
            x={masse.links - KANTE}
            y={masse.oben - KANTE / 2 - 50}
            width={masse.rechts - masse.links + KANTE * 2}
            height={17}
            rx={4}
            fill="var(--gold-hell)"
            stroke="var(--gold)"
            strokeWidth={0.8}
          />
          <text
            x={(masse.links + masse.rechts) / 2}
            y={masse.oben - KANTE / 2 - 38}
            textAnchor="middle"
            fontSize={11}
            letterSpacing={2}
            fill="var(--gold-dunkel)"
          >
            BÜHNE
          </text>

          <rect
            x={zone.links - KANTE / 2 - 5}
            y={zone.oben - KANTE / 2 - 5}
            width={zone.rechts - zone.links + KANTE + 10}
            height={zone.unten - zone.oben + KANTE + 10}
            rx={6}
            fill="none"
            stroke="var(--gold-dunkel)"
            strokeWidth={1.2}
            strokeDasharray="7 4"
          />

          {reihen.map((r) => (
            <g key={r.schluessel}>
              <text x={masse.links - KANTE} y={r.y + 3.5} textAnchor="end" fontSize={9} fill="var(--text-leise)">
                {r.nummer}
              </text>
              {r.sitze.map((s) => {
                const start = starts.get(s.id);
                const istZiel = zielSitze.has(s.id);
                const istQuelle = quelleVon.get(s.id);

                let fuellung = "var(--flaeche)";
                let rahmen = "var(--linie)";
                let schrift = "var(--text-leise)";
                if (s.status === "gesperrt") {
                  fuellung = "var(--linie)";
                } else if (istZiel) {
                  fuellung = "var(--gut)";
                  rahmen = "var(--gut)";
                  schrift = "#fff";
                } else if (istQuelle) {
                  fuellung = istQuelle === sucht ? "var(--gold)" : "var(--gold-hell)";
                  rahmen = "var(--gold-dunkel)";
                  schrift = istQuelle === sucht ? "#fff" : "var(--gold-dunkel)";
                } else if (s.status === "verkauft") {
                  fuellung = "var(--text)";
                  rahmen = "var(--text)";
                  schrift = "#fff";
                } else if (start) {
                  // Hier kann die gewählte Gruppe am Stück sitzen.
                  fuellung = "var(--gut-hell)";
                  rahmen = "var(--gut)";
                  schrift = "var(--gut)";
                }

                return (
                  <g
                    key={s.id}
                    onClick={() => {
                      if (start && gruppe) void setzen(gruppe, start);
                    }}
                    style={{ cursor: start ? "pointer" : "default" }}
                  >
                    <rect
                      x={s.x - KANTE / 2}
                      y={s.y - KANTE / 2}
                      width={KANTE}
                      height={KANTE}
                      rx={3.5}
                      fill={fuellung}
                      stroke={rahmen}
                      strokeWidth={start ? 2 : 1}
                    />
                    <text x={s.x} y={s.y + 3.2} textAnchor="middle" fontSize={9} fill={schrift}>
                      {s.name}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        <figcaption className="mt-2 text-center text-sm">
          {gruppe ? (
            <span className="font-medium">
              {gruppe.titel}: Tipp auf einen grün umrandeten Platz, dort beginnt die Gruppe.
            </span>
          ) : (
            <span className="text-leise">
              Grün: schon umgesetzt. Gold: sitzt hinten und wird angesprochen. Schwarz: verkauft.
            </span>
          )}
        </figcaption>
      </figure>
    </section>
  );
}
