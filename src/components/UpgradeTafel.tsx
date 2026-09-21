"use client";

/**
 * Der Saalplan als Werkzeug: Gruppe antippen, neuen Platz antippen.
 *
 * Dritter Anlauf, und diesmal ohne Umweg über Karten (Florian,
 * 21.09.2026): Man arbeitet im Plan. Jede zusammenhängende Reihe
 * verkaufter Plätze ist eine Gruppe. Tippt man sie an, liegt sie „in der
 * Hand“, oben steht groß, wer gerade bewegt wird, und jeder Platz, auf
 * den die Gruppe am Stück passt, ist grün umrandet. Der zweite Tipp
 * setzt sie. Ein dritter Tipp auf „zurück“ macht es rückgängig.
 *
 * Hin und her geht also mit zwei Tippern, in beide Richtungen, auch
 * mehrfach.
 *
 * Wer da sitzt, steht nicht dabei: Ditix liefert über den öffentlichen
 * Weg nur, welcher Platz verkauft ist, nicht an wen. Sobald es einen
 * Zugang zum Ditix-Backend gibt, kommen die Namen von selbst dazu; bis
 * dahin erinnert der Merkzettel daran (siehe lib/db/merker.ts).
 *
 * In Ditix wird nichts geändert, das hier ist unsere Notiz für den Abend.
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
  gastName?: string;
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

function nummer(name: string): number {
  const n = Number(name);
  return Number.isFinite(n) ? n : 0;
}

/** "Platz 5 bis 8", immer von der kleineren Nummer aus. */
function ansage(block: TafelSitz[]): string {
  const namen = [...block.map((s) => s.name)].sort((a, b) => nummer(a) - nummer(b) || a.localeCompare(b, "de"));
  if (namen.length === 0) return "";
  return namen.length === 1 ? `Platz ${namen[0]}` : `Platz ${namen[0]} bis ${namen[namen.length - 1]}`;
}

function blockText(block: TafelSitz[]): string {
  return block.length === 0 ? "" : `Reihe ${block[0].reihe}, ${ansage(block)}`;
}

/** Der Schlüssel einer Gruppe: ihre ursprünglichen Plätze. */
function schluesselVon(ids: number[]): string {
  return `g:${[...ids].sort((a, b) => a - b).join("-")}`;
}

export function UpgradeTafel({ eventId, sitze, gruppen, umsetzungen, zone }: Props) {
  const router = useRouter();
  const [inDerHand, setInDerHand] = useState<string | null>(null);
  const [gesetzt, setGesetzt] = useState<TafelUmsetzung[]>(umsetzungen);
  const [name, setName] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const umsetzungVon = (k: string) => gesetzt.find((u) => u.schluessel === k) ?? null;

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

  /**
   * Alle Gruppen im Saal: jede zusammenhängende Kette verkaufter Plätze.
   * So lässt sich jeder bewegen, nicht nur die aus dem Vorschlag.
   */
  const alleGruppen = useMemo(() => {
    const liste: TafelGruppe[] = [];
    for (const r of reihen) {
      let lauf: TafelSitz[] = [];
      const schliessen = () => {
        if (lauf.length === 0) return;
        const ids = lauf.map((s) => s.id);
        const k = schluesselVon(ids);
        const ausPlan = gruppen.find((g) => g.schluessel === k);
        liste.push(
          ausPlan ?? {
            schluessel: k,
            art: "gruppe",
            titel: blockText(lauf),
            zusatz: lauf[0].sektor,
            personen: lauf.length,
            quelleIds: ids,
            vorschlagText: null,
            vorschlagIds: [],
          },
        );
        lauf = [];
      };
      for (const s of r.sitze) {
        if (s.status === "verkauft") lauf.push(s);
        else schliessen();
      }
      schliessen();
    }
    // Gäste von der Gästeliste haben keine Plätze im Saal, sie kommen dazu.
    for (const g of gruppen) if (g.art === "gast") liste.push(g);
    return liste;
  }, [reihen, gruppen]);

  const gruppeVonSitz = useMemo(() => {
    const m = new Map<number, TafelGruppe>();
    for (const g of alleGruppen) for (const id of g.quelleIds) m.set(id, g);
    return m;
  }, [alleGruppen]);

  const belegt = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of gesetzt) for (const id of u.zielIds) m.set(id, u.schluessel);
    return m;
  }, [gesetzt]);

  const gruppe = alleGruppen.find((g) => g.schluessel === inDerHand) ?? null;

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

  /** Plätze, auf die die Gruppe in der Hand passt: Start eines freien Blocks. */
  const starts = useMemo(() => {
    const treffer = new Map<number, TafelSitz[]>();
    if (!gruppe) return treffer;
    const anzahl = Math.max(1, gruppe.personen);
    for (const r of reihen) {
      for (let i = 0; i < r.sitze.length; i++) {
        const block: TafelSitz[] = [];
        for (let j = i; j < r.sitze.length && block.length < anzahl; j++) {
          if (!istFrei(r.sitze[j], gruppe.schluessel)) break;
          block.push(r.sitze[j]);
        }
        if (block.length === anzahl) treffer.set(r.sitze[i].id, block);
      }
    }
    return treffer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruppe, reihen, gesetzt]);

  async function setzen(g: TafelGruppe, block: TafelSitz[]) {
    if (laeuft) return;
    setLaeuft(true);
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
          gastName: name.trim() || umsetzungVon(g.schluessel)?.gastName || "",
        }),
      });
      const e = (await antwort.json()) as { ok: boolean; fehler?: string };
      if (!e.ok) {
        setHinweis(e.fehler ?? "Das ließ sich nicht speichern.");
        return;
      }
      setGesetzt((alt) => [
        ...alt.filter((u) => u.schluessel !== g.schluessel),
        {
          schluessel: g.schluessel,
          zielText,
          zielIds: block.map((s) => s.id),
          gastName: name.trim() || umsetzungVon(g.schluessel)?.gastName || "",
          gesetztVon: null,
        },
      ]);
      setInDerHand(null);
      setName("");
      router.refresh();
    } catch {
      setHinweis("Keine Verbindung. Bitte noch einmal tippen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function zurueck(g: TafelGruppe) {
    setLaeuft(true);
    try {
      await fetch("/upgrades/setzen", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, schluessel: g.schluessel, art: g.art, gastId: g.gastId }),
      });
      setGesetzt((alt) => alt.filter((u) => u.schluessel !== g.schluessel));
      setInDerHand(null);
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  function vorschlagBlock(g: TafelGruppe): TafelSitz[] | null {
    if (g.vorschlagIds.length === 0) return null;
    const block = g.vorschlagIds
      .map((id) => sitze.find((s) => s.id === id))
      .filter((s): s is TafelSitz => Boolean(s));
    if (block.length !== g.vorschlagIds.length) return null;
    if (!block.every((s) => istFrei(s, g.schluessel))) return null;
    return [...block].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  const u = gruppe ? umsetzungVon(gruppe.schluessel) : null;
  const vorschlag = gruppe && !u ? vorschlagBlock(gruppe) : null;
  const offeneVorschlaege = alleGruppen.filter((g) => g.vorschlagText && !umsetzungVon(g.schluessel));

  /**
   * Die Empfehlung liegt als Vorlage im Plan: Jede vorgeschlagene Gruppe
   * bekommt einen Buchstaben, der an ihren jetzigen Plätzen und an den
   * vorgeschlagenen steht. Ein Tipp auf die Vorlage setzt sie dorthin
   * (Florian, 21.09.2026).
   */
  const mitVorschlag = useMemo(
    () => alleGruppen.filter((g) => g.vorschlagIds.length > 0),
    [alleGruppen],
  );

  const buchstabeVon = useMemo(() => {
    const m = new Map<string, string>();
    mitVorschlag.forEach((g, i) => m.set(g.schluessel, String.fromCharCode(65 + (i % 26))));
    return m;
  }, [mitVorschlag]);

  /** Sitz -> Gruppe, deren Vorschlag hier liegt (nur solange sie nicht sitzt). */
  const vorlageVon = useMemo(() => {
    const m = new Map<number, TafelGruppe>();
    for (const g of mitVorschlag) {
      if (umsetzungVon(g.schluessel)) continue;
      for (const id of g.vorschlagIds) m.set(id, g);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mitVorschlag, gesetzt]);

  return (
    <section className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Saalplan: umsetzen</h2>
        <span className="text-sm text-leise">
          {gesetzt.length} umgesetzt
          {offeneVorschlaege.length > 0 && `, ${offeneVorschlaege.length} noch vorgeschlagen`}
        </span>
      </div>

      {/* Die Leiste: Sie sagt jederzeit, was als Nächstes zu tun ist. */}
      <div
        className="sticky top-0 z-10 rounded-xl border-2 px-4 py-3"
        style={{
          borderColor: gruppe ? "var(--gold)" : "var(--linie)",
          background: gruppe ? "var(--gold-hell)" : "var(--flaeche)",
        }}
      >
        {!gruppe ? (
          <p className="text-sm">
            {offeneVorschlaege.length > 0 ? (
              <>
                <strong>Die Buchstaben zeigen, wohin welche Gruppe soll.</strong> Sind die Gäste da, tipp auf ihr
                helles Feld vorne, dann sitzen sie dort. Willst du sie woanders hinsetzen: erst die Gruppe antippen,
                dann den Platz.
              </>
            ) : (
              <>
                <strong>Tipp eine Gruppe im Saal an</strong> (die dunklen Plätze). Danach tippst du ihren neuen Platz
                an.
              </>
            )}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-base font-semibold">
                {u ? `${gruppe.titel} → ${u.zielText}` : gruppe.titel}
                <span className="font-normal text-leise">
                  {" "}
                  · {gruppe.personen} {gruppe.personen === 1 ? "Gast" : "Gäste"}
                </span>
              </p>
              <p className="text-sm">
                {u ? "Tipp einen anderen Platz an, oder setz sie zurück." : "Jetzt den neuen Platz antippen."}
              </p>
            </div>

            {vorschlag && (
              <button
                type="button"
                onClick={() => void setzen(gruppe, vorschlag)}
                disabled={laeuft}
                className="rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--gut)" }}
              >
                Auf {blockText(vorschlag)}
              </button>
            )}

            {u && (
              <button
                type="button"
                onClick={() => void zurueck(gruppe)}
                disabled={laeuft}
                className="rounded-lg border border-linie bg-flaeche px-4 py-2 font-medium"
              >
                Zurück auf {gruppe.titel}
              </button>
            )}

            <button type="button" onClick={() => setInDerHand(null)} className="text-sm underline text-leise">
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {hinweis && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          {hinweis}
        </p>
      )}

      <figure className="overflow-x-auto rounded-lg border border-linie bg-flaeche p-3">
        <svg viewBox={masse.viewBox} className="mx-auto block h-auto w-full" role="img" aria-label="Saalplan zum Umsetzen">
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
                const vorlage = vorlageVon.get(s.id) ?? null;
                // Markiert wird nur, was in der spielbaren Zone liegt. Weiter
                // hinten geht auch, wird aber nicht vorgeschlagen.
                const empfohlen = Boolean(start && start.every((x) => x.inZone));
                const zielVon = belegt.get(s.id);
                const heimat = gruppeVonSitz.get(s.id) ?? null;
                const heimatUmsetzung = heimat ? umsetzungVon(heimat.schluessel) : null;
                const inDerHandHier = heimat?.schluessel === inDerHand || zielVon === inDerHand;

                let fuellung = "var(--flaeche)";
                let rahmen = "var(--linie)";
                let schrift = "var(--text-leise)";
                let beschriftung = s.name;

                if (s.status === "gesperrt") {
                  fuellung = "var(--linie)";
                } else if (zielVon) {
                  // Hier sitzt jetzt eine umgesetzte Gruppe.
                  fuellung = "var(--gut)";
                  rahmen = "var(--gut)";
                  schrift = "#fff";
                } else if (heimat && heimatUmsetzung) {
                  // Alter Platz einer Gruppe, die schon vorne sitzt.
                  fuellung = "var(--flaeche)";
                  rahmen = "var(--gut)";
                  schrift = "var(--gut)";
                  beschriftung = "→";
                } else if (heimat) {
                  const gold = Boolean(heimat.vorschlagText);
                  fuellung = gold ? "var(--gold-hell)" : "var(--text)";
                  rahmen = gold ? "var(--gold-dunkel)" : "var(--text)";
                  schrift = gold ? "var(--gold-dunkel)" : "#fff";
                  const bu = buchstabeVon.get(heimat.schluessel);
                  if (gold && bu) beschriftung = bu;
                } else if (vorlage) {
                  // Die Vorlage: hier soll die Gruppe hin.
                  fuellung = "var(--flaeche)";
                  rahmen = "var(--gold)";
                  schrift = "var(--gold-dunkel)";
                  beschriftung = buchstabeVon.get(vorlage.schluessel) ?? s.name;
                }

                const klickbar = Boolean(start) || Boolean(heimat) || Boolean(zielVon) || Boolean(vorlage);

                return (
                  <g
                    key={s.id}
                    onClick={() => {
                      setHinweis("");
                      if (start && gruppe) {
                        void setzen(gruppe, start);
                        return;
                      }
                      // Tipp auf die Vorlage: Die Gruppe setzt sich genau dorthin.
                      if (vorlage) {
                        const block = vorschlagBlock(vorlage);
                        if (block) {
                          void setzen(vorlage, block);
                          return;
                        }
                      }
                      const ziel = zielVon ? alleGruppen.find((g) => g.schluessel === zielVon) : null;
                      const naechste = ziel ?? heimat;
                      if (naechste) {
                        setInDerHand(naechste.schluessel === inDerHand ? null : naechste.schluessel);
                        setName("");
                      }
                    }}
                    style={{ cursor: klickbar ? "pointer" : "default" }}
                  >
                    <title>
                      {heimat || zielVon
                        ? `${(zielVon ? umsetzungVon(zielVon)?.gastName : heimatUmsetzung?.gastName) || "Gruppe"}, ${
                            (zielVon ? alleGruppen.find((g) => g.schluessel === zielVon)?.personen : heimat?.personen) ?? 0
                          } Gäste`
                        : `Reihe ${s.reihe}, Platz ${s.name}`}
                    </title>
                    <rect
                      x={s.x - KANTE / 2}
                      y={s.y - KANTE / 2}
                      width={KANTE}
                      height={KANTE}
                      rx={3.5}
                      fill={empfohlen ? "var(--gut-hell)" : fuellung}
                      stroke={empfohlen ? "var(--gut)" : inDerHandHier ? "var(--gold)" : rahmen}
                      strokeWidth={empfohlen || inDerHandHier ? 2.4 : vorlage ? 1.8 : 1}
                      strokeDasharray={vorlage && !empfohlen ? "4 2" : undefined}
                    />
                    <text
                      x={s.x}
                      y={s.y + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      fill={empfohlen ? "var(--gut)" : schrift}
                    >
                      {empfohlen ? "＋" : beschriftung}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Die Namen an den Gruppen, damit man sie wiederfindet. */}
          {gesetzt.map((x) => {
            const block = x.zielIds
              .map((id) => sitze.find((s) => s.id === id))
              .filter((s): s is TafelSitz => Boolean(s));
            if (block.length === 0 || !x.gastName) return null;
            const mitte = block.reduce((n, s) => n + s.x, 0) / block.length;
            return (
              <text
                key={x.schluessel}
                x={mitte}
                y={block[0].y + KANTE / 2 + 9}
                textAnchor="middle"
                fontSize={8}
                fill="var(--gut)"
              >
                {x.gastName}
              </text>
            );
          })}
        </svg>

        <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-leise">
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "var(--text)" }} />
            verkauft
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border align-middle"
              style={{ background: "var(--gold-hell)", borderColor: "var(--gold-dunkel)" }}
            />
            sitzt hinten, sollte nach vorne
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "var(--gut)" }} />
            umgesetzt
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border border-dashed align-middle"
              style={{ borderColor: "var(--gold)" }}
            />
            Empfehlung: A gehört zu A
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border align-middle"
              style={{ background: "var(--gut-hell)", borderColor: "var(--gut)" }}
            />
            hierhin möglich
          </span>
        </figcaption>
      </figure>

      <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dunkel">Das sagst du</p>
        <p className="mt-1">
          „Guten Abend! Gute Nachricht: Bei uns hat heute eine Gruppe abgesagt.{" "}
          <strong>Ich kann euch kostenfrei weiter nach vorne setzen.</strong> Von dort seht ihr die Show noch besser.
          Passt das für euch?“
        </p>
        <p className="mt-2 text-xs text-leise">
          Sagt jemand nein: „Kein Problem, dann bleibt ihr natürlich auf euren Plätzen.“ Nie sagen, dass hinten
          schlecht ist, nur dass vorne etwas frei geworden ist.
        </p>
      </div>
    </section>
  );
}
