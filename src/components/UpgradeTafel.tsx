"use client";

/**
 * Upgrades am Tablet: Gruppe antippen, neuen Platz antippen, fertig.
 *
 * So läuft es am Einlass (Florian, 21.09.2026): Die Gäste stehen vor der
 * Tür, der Mitarbeiter sagt "bei uns hat eine Gruppe abgesagt, ich kann
 * euch kostenfrei weiter nach vorne setzen", zeigt auf den Plan und hält
 * gleich fest, wo sie wirklich sitzen. Kein Zettel, kein Nachtragen.
 *
 * Bewusst zwei Tipper statt Ziehen: Auf einem Tablet ist Ziehen mit
 * Handschuhen, in Bewegung und bei Gegenlicht unzuverlässig. Antippen
 * trifft immer, und ein Fehlgriff ist mit "rückgängig" sofort zurück.
 *
 * Der Vorschlag bleibt sichtbar, ist aber nur ein Vorschlag: Am Ende
 * zählt, was hier eingetippt wird. Geändert wird dabei nichts in Ditix,
 * das ist unsere eigene Notiz für den Abend.
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
  /** "Reihe 9, Platz 5 bis 8" oder der Name des Gastes. */
  titel: string;
  /** Was darunter steht: Herkunft oder Notiz. */
  zusatz: string;
  personen: number;
  /** Die alten Plätze, damit sie im Plan zu sehen sind. */
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

/**
 * Platznamen eines Blocks als Ansage: "Platz 1 bis 7".
 *
 * Die Nummern laufen je nach Reihe von links nach rechts auf- oder
 * absteigend. Angesagt wird immer von der kleineren zur groesseren Zahl,
 * so wie es auf der Karte steht.
 */
function ansage(block: TafelSitz[]): string {
  if (block.length === 0) return "";
  const namen = [...block.map((s) => s.name)].sort((a, b) => {
    const za = Number(a);
    const zb = Number(b);
    return Number.isFinite(za) && Number.isFinite(zb) ? za - zb : a.localeCompare(b, "de");
  });
  return namen.length === 1 ? `Platz ${namen[0]}` : `Platz ${namen[0]} bis ${namen[namen.length - 1]}`;
}

export function UpgradeTafel({ eventId, sitze, gruppen, umsetzungen, zone }: Props) {
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [gesetzt, setGesetzt] = useState<TafelUmsetzung[]>(umsetzungen);
  const [hinweis, setHinweis] = useState<string>("");
  const [laeuft, setLaeuft] = useState(false);

  const gruppe = gruppen.find((g) => g.schluessel === gewaehlt) ?? null;
  const umsetzungVon = (schluessel: string) => gesetzt.find((u) => u.schluessel === schluessel) ?? null;

  // Reihen für die Zeichnung, von vorne nach hinten.
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

  // Welche Plätze schon vergeben sind: von einer anderen Gruppe belegt.
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

  const vorschlagVon = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of gruppen) {
      if (umsetzungVon(g.schluessel)) continue;
      for (const id of g.vorschlagIds) m.set(id, g.schluessel);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruppen, gesetzt]);

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

  /** Sucht ab einem angetippten Platz einen freien Block in derselben Reihe. */
  function blockAb(start: TafelSitz, anzahl: number): TafelSitz[] | null {
    const reihe = reihen.find((r) => r.schluessel === `${start.sektor}::${start.reihe}`);
    if (!reihe) return null;
    const frei = (s: TafelSitz) =>
      s.status === "frei" && (!belegt.has(s.id) || belegt.get(s.id) === gewaehlt);
    const i = reihe.sitze.findIndex((s) => s.id === start.id);
    if (i < 0 || !frei(start)) return null;

    const block: TafelSitz[] = [];
    for (let j = i; j < reihe.sitze.length && block.length < anzahl; j++) {
      if (!frei(reihe.sitze[j])) break;
      block.push(reihe.sitze[j]);
    }
    // Reicht es nach rechts nicht, nach links weitersuchen.
    for (let j = i - 1; j >= 0 && block.length < anzahl; j--) {
      if (!frei(reihe.sitze[j])) break;
      block.unshift(reihe.sitze[j]);
    }
    return block.length >= anzahl ? block.slice(0, anzahl) : null;
  }

  async function platzieren(start: TafelSitz) {
    if (!gruppe || laeuft) return;
    const block = blockAb(start, Math.max(1, gruppe.personen));
    if (!block) {
      setHinweis(
        `In Reihe ${start.reihe} sind ab hier keine ${gruppe.personen} Plätze am Stück frei. Tipp einen anderen Platz an.`,
      );
      return;
    }
    const zielText = `Reihe ${block[0].reihe}, ${ansage(block)} (${block[0].sektor})`;
    setLaeuft(true);
    setHinweis("");
    try {
      const antwort = await fetch("/upgrades/setzen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          schluessel: gruppe.schluessel,
          art: gruppe.art,
          gastId: gruppe.gastId,
          quelleText: gruppe.titel,
          zielText,
          zielIds: block.map((s) => s.id),
          personen: gruppe.personen,
        }),
      });
      const e = (await antwort.json()) as { ok: boolean; fehler?: string };
      if (!e.ok) {
        setHinweis(e.fehler ?? "Das ließ sich nicht speichern.");
        return;
      }
      setGesetzt((alt) => [
        ...alt.filter((u) => u.schluessel !== gruppe.schluessel),
        { schluessel: gruppe.schluessel, zielText, zielIds: block.map((s) => s.id), gesetztVon: null },
      ]);
      setGewaehlt(null);
      router.refresh();
    } catch {
      setHinweis("Keine Verbindung. Bitte noch einmal antippen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function zuruecknehmen(g: TafelGruppe) {
    setLaeuft(true);
    try {
      await fetch("/upgrades/setzen", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, schluessel: g.schluessel, art: g.art, gastId: g.gastId }),
      });
      setGesetzt((alt) => alt.filter((u) => u.schluessel !== g.schluessel));
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  const offen = gruppen.filter((g) => !umsetzungVon(g.schluessel));
  const fertig = gruppen.filter((g) => umsetzungVon(g.schluessel));
  const zielText = gruppe ? (umsetzungVon(gruppe.schluessel)?.zielText ?? gruppe.vorschlagText) : null;

  return (
    <section className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Am Einlass umsetzen</h2>
        <span className="text-sm text-leise">
          {fertig.length} von {gruppen.length} gesetzt
        </span>
      </div>

      {/* Das Wording: Was der Mitarbeiter sagt, wenn die Gäste vor ihm stehen. */}
      <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dunkel">So ansprechen</p>
        <p className="mt-1 text-base">
          „Guten Abend! Ich habe eine gute Nachricht: Bei uns hat heute eine Gruppe abgesagt.{" "}
          <strong>
            Deshalb kann ich euch kostenfrei weiter nach vorne setzen
            {zielText ? `, auf ${zielText}` : ""}.
          </strong>{" "}
          Von dort seht ihr die Show noch besser. Passt das für euch?“
        </p>
        <p className="mt-2 text-xs text-leise">
          Sagt jemand nein, ist das in Ordnung: „Kein Problem, dann bleibt ihr natürlich auf euren Plätzen.“ Dann
          die Gruppe einfach nicht setzen. Niemals sagen, dass hinten schlecht ist, nur dass vorne frei geworden ist.
        </p>
      </div>

      {hinweis && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          {hinweis}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Der Saal zum Antippen. */}
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
              strokeWidth={1.6}
              strokeDasharray="7 4"
            />

            {reihen.map((r) => (
              <g key={r.schluessel}>
                <text x={masse.links - KANTE} y={r.y + 3.5} textAnchor="end" fontSize={9} fill="var(--text-leise)">
                  {r.nummer}
                </text>
                {r.sitze.map((s) => {
                  const belegtVon = belegt.get(s.id);
                  const istZiel = Boolean(belegtVon);
                  const istQuelle = quelleVon.get(s.id);
                  const istVorschlag = vorschlagVon.get(s.id);
                  const waehlbar =
                    Boolean(gruppe) && s.status === "frei" && (!belegtVon || belegtVon === gewaehlt);

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
                    fuellung = istQuelle === gewaehlt ? "var(--gold)" : "var(--gold-hell)";
                    rahmen = "var(--gold-dunkel)";
                    schrift = istQuelle === gewaehlt ? "#fff" : "var(--gold-dunkel)";
                  } else if (istVorschlag) {
                    fuellung = "var(--flaeche)";
                    rahmen = "var(--gold)";
                    schrift = "var(--gold-dunkel)";
                  } else if (s.status === "verkauft") {
                    fuellung = "var(--text)";
                    rahmen = "var(--text)";
                    schrift = "#fff";
                  }

                  return (
                    <g
                      key={s.id}
                      onClick={() => {
                        if (waehlbar) void platzieren(s);
                        else if (istQuelle) setGewaehlt(istQuelle === gewaehlt ? null : istQuelle);
                      }}
                      style={{ cursor: waehlbar || istQuelle ? "pointer" : "default" }}
                    >
                      <rect
                        x={s.x - KANTE / 2}
                        y={s.y - KANTE / 2}
                        width={KANTE}
                        height={KANTE}
                        rx={3.5}
                        fill={fuellung}
                        stroke={waehlbar ? "var(--gut)" : rahmen}
                        strokeWidth={waehlbar ? 2 : 1}
                        strokeDasharray={waehlbar ? "3 2" : undefined}
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
          <figcaption className="mt-2 text-center text-xs text-leise">
            {gruppe
              ? `${gruppe.titel} ist ausgewählt: Tipp jetzt den ersten neuen Platz an, die Gruppe wird von dort aus zusammengesetzt.`
              : "Erst eine Gruppe rechts antippen, dann den neuen Platz im Saal."}
          </figcaption>
        </figure>

        {/* Die Gruppen zum Antippen. */}
        <div className="space-y-2">
          {offen.length === 0 && fertig.length === 0 && (
            <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
              Hier ist heute nichts umzusetzen.
            </p>
          )}

          {offen.map((g) => {
            const aktiv = g.schluessel === gewaehlt;
            return (
              <button
                key={g.schluessel}
                type="button"
                onClick={() => setGewaehlt(aktiv ? null : g.schluessel)}
                className="w-full rounded-lg border-2 px-3 py-3 text-left"
                style={{
                  borderColor: aktiv ? "var(--gold)" : "var(--linie)",
                  background: aktiv ? "var(--gold-hell)" : "var(--flaeche)",
                }}
              >
                <span className="block font-semibold">{g.titel}</span>
                <span className="block text-sm text-leise">
                  {g.personen} {g.personen === 1 ? "Gast" : "Gäste"}
                  {g.zusatz && ` · ${g.zusatz}`}
                </span>
                {g.vorschlagText && (
                  <span className="mt-1 block text-sm">
                    <span className="text-leise">Vorschlag:</span> {g.vorschlagText}
                  </span>
                )}
                {aktiv && <span className="mt-1 block text-xs text-gold-dunkel">Jetzt den neuen Platz antippen</span>}
              </button>
            );
          })}

          {fertig.map((g) => {
            const u = umsetzungVon(g.schluessel)!;
            return (
              <div
                key={g.schluessel}
                className="rounded-lg border-2 px-3 py-3"
                style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
              >
                <span className="block font-semibold">{g.titel}</span>
                <span className="block text-sm">
                  sitzt jetzt: <strong>{u.zielText}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => void zuruecknehmen(g)}
                  disabled={laeuft}
                  className="mt-1 text-xs underline text-leise"
                >
                  rückgängig
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
