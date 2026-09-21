"use client";

/**
 * Der Saalplan zum Anfassen: Gruppe aufnehmen, hinschieben, loslassen.
 *
 * Am Einlass steht der Mitarbeiter mit dem Tablet vor den Gästen. Er
 * nimmt die Gruppe mit dem Finger auf und zieht sie dorthin, wo sie
 * sitzen soll; unter dem Finger zeigt der Plan, welche Plätze sie belegen
 * würde. Loslassen setzt sie. Aufnehmen geht immer wieder, auch aus dem
 * neuen Platz heraus, beliebig oft (Florian, 21.09.2026).
 *
 * Wer lieber tippt, tippt: Ein kurzer Tipp nimmt die Gruppe in die Hand,
 * der nächste setzt sie. Beides läuft über dieselben Zeigerereignisse,
 * damit Finger, Maus und Stift gleich behandelt werden.
 *
 * Die Empfehlung liegt als Vorlage im Plan: derselbe Buchstabe hinten wie
 * vorne, ein Tipp auf das gestrichelte Feld reicht.
 *
 * Wer da sitzt, steht nicht dabei: Ditix liefert über den öffentlichen
 * Weg nur, welcher Platz verkauft ist, nicht an wen. Sobald es einen
 * Zugang zum Ditix-Backend gibt, kommen die Namen dazu; bis dahin
 * erinnert der Merkzettel daran (siehe lib/db/merker.ts).
 *
 * In Ditix wird nichts geändert, das hier ist unsere Notiz für den Abend.
 */

import { useCallback, useMemo, useRef, useState } from "react";
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
  /** Darf jemand draufgesetzt werden? Gesperrte Plätze meist schon. */
  nutzbar: boolean;
  /** Der eine Platz, der wirklich leer bleibt: Reihe 4, Platz 3. */
  freiLassen: boolean;
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
/** Ab so vielen Pixeln gilt es als Ziehen und nicht mehr als Tippen. */
const ZIEH_SCHWELLE = 8;

function zahl(name: string): number {
  const n = Number(name);
  return Number.isFinite(n) ? n : 0;
}

/** "Platz 5 bis 8", immer von der kleineren Nummer aus. */
function ansage(block: TafelSitz[]): string {
  const namen = [...block.map((s) => s.name)].sort((a, b) => zahl(a) - zahl(b) || a.localeCompare(b, "de"));
  if (namen.length === 0) return "";
  return namen.length === 1 ? `Platz ${namen[0]}` : `Platz ${namen[0]} bis ${namen[namen.length - 1]}`;
}

function blockText(block: TafelSitz[]): string {
  return block.length === 0 ? "" : `Reihe ${block[0].reihe}, ${ansage(block)}`;
}

function schluesselVon(ids: number[]): string {
  return `g:${[...ids].sort((a, b) => a - b).join("-")}`;
}

export function UpgradeTafel({ eventId, sitze, gruppen, umsetzungen, zone }: Props) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement | null>(null);
  const [inDerHand, setInDerHand] = useState<string | null>(null);
  const [gesetzt, setGesetzt] = useState<TafelUmsetzung[]>(umsetzungen);
  const [hinweis, setHinweis] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  /** Was gerade am Finger hängt, solange gezogen wird. */
  const [zieht, setZieht] = useState<{ schluessel: string; x: number; y: number } | null>(null);
  const griff = useRef<{ schluessel: string; startX: number; startY: number; bewegt: boolean } | null>(null);

  const umsetzungVon = useCallback(
    (k: string) => gesetzt.find((x) => x.schluessel === k) ?? null,
    [gesetzt],
  );

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

  /** Jede zusammenhängende Kette verkaufter Plätze ist eine Gruppe. */
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
    for (const x of gesetzt) for (const id of x.zielIds) m.set(id, x.schluessel);
    return m;
  }, [gesetzt]);

  const gruppeZu = useCallback(
    (schluessel: string | null) => alleGruppen.find((g) => g.schluessel === schluessel) ?? null,
    [alleGruppen],
  );

  const gruppe = gruppeZu(inDerHand);
  const gezogene = gruppeZu(zieht?.schluessel ?? null);

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

  const istFrei = useCallback(
    (s: TafelSitz, fuer: string | null) => s.nutzbar && (!belegt.has(s.id) || belegt.get(s.id) === fuer),
    [belegt],
  );

  /** Der Block, der ab diesem Platz für so viele Leute frei ist. */
  const blockAb = useCallback(
    (start: TafelSitz, anzahl: number, fuer: string | null): TafelSitz[] | null => {
      const reihe = reihen.find((r) => r.schluessel === `${start.sektor}::${start.reihe}`);
      if (!reihe) return null;
      const i = reihe.sitze.findIndex((s) => s.id === start.id);
      if (i < 0 || !istFrei(start, fuer)) return null;
      const block: TafelSitz[] = [];
      for (let j = i; j < reihe.sitze.length && block.length < anzahl; j++) {
        if (!istFrei(reihe.sitze[j], fuer)) break;
        block.push(reihe.sitze[j]);
      }
      for (let j = i - 1; j >= 0 && block.length < anzahl; j--) {
        if (!istFrei(reihe.sitze[j], fuer)) break;
        block.unshift(reihe.sitze[j]);
      }
      return block.length >= anzahl ? block.slice(0, anzahl) : null;
    },
    [reihen, istFrei],
  );

  /** Alle Plätze, an denen die Gruppe in der Hand anfangen könnte. */
  const starts = useMemo(() => {
    const treffer = new Map<number, TafelSitz[]>();
    const g = gruppe ?? gezogene;
    if (!g) return treffer;
    for (const r of reihen) {
      for (const s of r.sitze) {
        const block = blockAb(s, Math.max(1, g.personen), g.schluessel);
        if (block) treffer.set(s.id, block);
      }
    }
    return treffer;
  }, [gruppe, gezogene, reihen, blockAb]);

  /** Die Empfehlung als Vorlage: gleicher Buchstabe hinten wie vorne. */
  const mitVorschlag = useMemo(() => alleGruppen.filter((g) => g.vorschlagIds.length > 0), [alleGruppen]);

  const buchstabeVon = useMemo(() => {
    const m = new Map<string, string>();
    mitVorschlag.forEach((g, i) => m.set(g.schluessel, String.fromCharCode(65 + (i % 26))));
    return m;
  }, [mitVorschlag]);

  const vorlageVon = useMemo(() => {
    const m = new Map<number, TafelGruppe>();
    for (const g of mitVorschlag) {
      if (gesetzt.some((x) => x.schluessel === g.schluessel)) continue;
      for (const id of g.vorschlagIds) m.set(id, g);
    }
    return m;
  }, [mitVorschlag, gesetzt]);

  const vorschlagBlock = useCallback(
    (g: TafelGruppe): TafelSitz[] | null => {
      if (g.vorschlagIds.length === 0) return null;
      const block = g.vorschlagIds
        .map((id) => sitze.find((s) => s.id === id))
        .filter((s): s is TafelSitz => Boolean(s));
      if (block.length !== g.vorschlagIds.length) return null;
      if (!block.every((s) => istFrei(s, g.schluessel))) return null;
      return [...block].sort((a, b) => a.y - b.y || a.x - b.x);
    },
    [sitze, istFrei],
  );

  /* ---------------------------------------------------------------- *
   * Ziehen: Der Finger führt die Gruppe, der Plan schnappt ein.
   * ---------------------------------------------------------------- */

  /** Bildschirmpunkt in die Koordinaten der Zeichnung umrechnen. */
  function punkt(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  /** Der Platz unter dem Finger, wenn er nah genug ist. */
  const sitzBei = useCallback(
    (p: { x: number; y: number }): TafelSitz | null => {
      let beste: TafelSitz | null = null;
      let abstand = KANTE * 1.2;
      for (const s of sitze) {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < abstand) {
          abstand = d;
          beste = s;
        }
      }
      return beste;
    },
    [sitze],
  );

  /** Wo die gezogene Gruppe gerade landen würde. */
  const ziel = useMemo(() => {
    if (!zieht || !gezogene) return null;
    const s = sitzBei({ x: zieht.x, y: zieht.y });
    if (!s) return null;
    return blockAb(s, Math.max(1, gezogene.personen), gezogene.schluessel);
  }, [zieht, gezogene, blockAb, sitzBei]);

  const zielIds = useMemo(() => new Set((ziel ?? []).map((s) => s.id)), [ziel]);

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
        }),
      });
      const e = (await antwort.json()) as { ok: boolean; fehler?: string };
      if (!e.ok) {
        setHinweis(e.fehler ?? "Das ließ sich nicht speichern.");
        return;
      }
      setGesetzt((alt) => [
        ...alt.filter((x) => x.schluessel !== g.schluessel),
        { schluessel: g.schluessel, zielText, zielIds: block.map((s) => s.id), gesetztVon: null },
      ]);
      setInDerHand(null);
      router.refresh();
    } catch {
      setHinweis("Keine Verbindung. Bitte noch einmal versuchen.");
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
      setGesetzt((alt) => alt.filter((x) => x.schluessel !== g.schluessel));
      setInDerHand(null);
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  function aufnehmen(e: React.PointerEvent, g: TafelGruppe) {
    griff.current = { schluessel: g.schluessel, startX: e.clientX, startY: e.clientY, bewegt: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function bewegen(e: React.PointerEvent) {
    const g = griff.current;
    if (!g) return;
    if (!g.bewegt) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) <= ZIEH_SCHWELLE) return;
      g.bewegt = true;
      setInDerHand(g.schluessel);
    }
    const p = punkt(e);
    if (p) setZieht({ schluessel: g.schluessel, x: p.x, y: p.y });
  }

  function loslassen(aufSitz: TafelSitz | null) {
    const g = griff.current;
    griff.current = null;

    // Gezogen: dort ablegen, wo der Finger ist.
    if (g?.bewegt) {
      const gez = gruppeZu(g.schluessel);
      const block = ziel;
      setZieht(null);
      if (gez && block) void setzen(gez, block);
      else setHinweis("Dort passt die Gruppe nicht am Stück hin. Nimm sie noch einmal auf.");
      return;
    }
    setZieht(null);

    // Nur getippt: je nachdem, worauf.
    if (!aufSitz) return;
    setHinweis("");
    const start = starts.get(aufSitz.id);
    if (start && gruppe) {
      void setzen(gruppe, start);
      return;
    }
    const vorlage = vorlageVon.get(aufSitz.id);
    if (vorlage) {
      const block = vorschlagBlock(vorlage);
      if (block) {
        void setzen(vorlage, block);
        return;
      }
    }
    const daraufGesetzt = belegt.get(aufSitz.id);
    const naechste = gruppeZu(daraufGesetzt ?? null) ?? gruppeVonSitz.get(aufSitz.id) ?? null;
    if (naechste) setInDerHand(naechste.schluessel === inDerHand ? null : naechste.schluessel);
  }

  const u = gruppe ? umsetzungVon(gruppe.schluessel) : null;
  const vorschlag = gruppe && !u ? vorschlagBlock(gruppe) : null;
  const offeneVorschlaege = alleGruppen.filter((g) => g.vorschlagText && !umsetzungVon(g.schluessel));
  const gaeste = alleGruppen.filter((g) => g.art === "gast");

  return (
    <section className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Saalplan: umsetzen</h2>
        <span className="text-sm text-leise">
          {gesetzt.length} umgesetzt
          {offeneVorschlaege.length > 0 && `, ${offeneVorschlaege.length} noch vorgeschlagen`}
        </span>
      </div>

      <div
        className="sticky top-0 z-10 rounded-xl border-2 px-4 py-3"
        style={{
          borderColor: gruppe ? "var(--gold)" : "var(--linie)",
          background: gruppe ? "var(--gold-hell)" : "var(--flaeche)",
        }}
      >
        {!gruppe ? (
          <p className="text-sm">
            <strong>Gruppe mit dem Finger nehmen und dorthin schieben, wo sie sitzen soll.</strong> Loslassen setzt
            sie, aufnehmen geht immer wieder.
            {offeneVorschlaege.length > 0 &&
              " Die Buchstaben zeigen die Empfehlung: A gehört zu A. Ein Tipp auf das gestrichelte Feld reicht auch."}
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
                {zieht
                  ? ziel
                    ? `Loslassen: ${blockText(ziel)}`
                    : "Hier passt sie nicht am Stück hin."
                  : u
                    ? "Zieh sie weiter, oder setz sie zurück."
                    : "Hinschieben und loslassen, oder den neuen Platz antippen."}
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

      {/* Gäste von der Gästeliste haben keinen Platz im Saal: hier aufnehmen. */}
      {gaeste.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-leise">Gästeliste:</span>
          {gaeste.map((g) => {
            const gesetztG = umsetzungVon(g.schluessel);
            return (
              <button
                key={g.schluessel}
                type="button"
                onClick={() => setInDerHand(g.schluessel === inDerHand ? null : g.schluessel)}
                className="rounded-full border-2 px-3 py-1.5"
                style={{
                  borderColor: gesetztG ? "var(--gut)" : g.schluessel === inDerHand ? "var(--gold)" : "var(--linie)",
                  background: gesetztG
                    ? "var(--gut-hell)"
                    : g.schluessel === inDerHand
                      ? "var(--gold-hell)"
                      : "var(--flaeche)",
                }}
              >
                {g.titel} ({g.personen})
                {gesetztG && <span className="text-leise"> · {gesetztG.zielText}</span>}
              </button>
            );
          })}
        </div>
      )}

      <figure className="overflow-x-auto rounded-lg border border-linie bg-flaeche p-3">
        <svg
          ref={svg}
          viewBox={masse.viewBox}
          className="mx-auto block h-auto w-full select-none"
          role="img"
          aria-label="Saalplan zum Umsetzen"
          onPointerMove={bewegen}
          onPointerUp={() => loslassen(null)}
          onPointerCancel={() => {
            griff.current = null;
            setZieht(null);
          }}
        >
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
                const empfohlen = Boolean(start && start.every((x) => x.inZone)) && !zieht;
                const unterFinger = zielIds.has(s.id);
                const vorlage = vorlageVon.get(s.id) ?? null;
                const zielVon = belegt.get(s.id);
                const heimat = gruppeVonSitz.get(s.id) ?? null;
                const heimatUmsetzung = heimat ? umsetzungVon(heimat.schluessel) : null;
                const inDerHandHier = heimat?.schluessel === inDerHand || zielVon === inDerHand;

                let fuellung = "var(--flaeche)";
                let rahmen = "var(--linie)";
                let schrift = "var(--text-leise)";
                let beschriftung = s.name;

                if (s.freiLassen) {
                  fuellung = "var(--blocker-hell)";
                  rahmen = "var(--blocker)";
                  schrift = "var(--blocker)";
                  beschriftung = "×";
                } else if (s.status === "gesperrt" && !zielVon) {
                  fuellung = "var(--linie)";
                  schrift = "var(--flaeche)";
                } else if (zielVon) {
                  fuellung = "var(--gut)";
                  rahmen = "var(--gut)";
                  schrift = "#fff";
                } else if (heimat && heimatUmsetzung) {
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
                  fuellung = "var(--flaeche)";
                  rahmen = "var(--gold)";
                  schrift = "var(--gold-dunkel)";
                  beschriftung = buchstabeVon.get(vorlage.schluessel) ?? s.name;
                }

                const greifbar = Boolean(heimat ?? zielVon);

                return (
                  <g
                    key={s.id}
                    onPointerDown={(e) => {
                      const g = zielVon ? gruppeZu(zielVon) : heimat;
                      if (g) aufnehmen(e, g);
                    }}
                    onPointerUp={() => loslassen(s)}
                    style={{
                      cursor: greifbar ? "grab" : start || vorlage ? "pointer" : "default",
                      touchAction: greifbar ? "none" : undefined,
                    }}
                  >
                    <title>
                      {greifbar
                        ? `${(zielVon ? gruppeZu(zielVon)?.personen : heimat?.personen) ?? 0} Gäste, zum Verschieben ziehen`
                        : s.freiLassen
                          ? "Reihe 4, Platz 3 bleibt frei"
                          : `Reihe ${s.reihe}, Platz ${s.name}`}
                    </title>
                    <rect
                      x={s.x - KANTE / 2}
                      y={s.y - KANTE / 2}
                      width={KANTE}
                      height={KANTE}
                      rx={3.5}
                      fill={unterFinger ? "var(--gold)" : empfohlen ? "var(--gut-hell)" : fuellung}
                      stroke={
                        unterFinger
                          ? "var(--gold-dunkel)"
                          : empfohlen
                            ? "var(--gut)"
                            : inDerHandHier
                              ? "var(--gold)"
                              : rahmen
                      }
                      strokeWidth={unterFinger || empfohlen || inDerHandHier ? 2.4 : vorlage ? 1.8 : 1}
                      strokeDasharray={vorlage && !empfohlen && !unterFinger ? "4 2" : undefined}
                    />
                    <text
                      x={s.x}
                      y={s.y + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      fill={unterFinger ? "#fff" : empfohlen ? "var(--gut)" : schrift}
                    >
                      {unterFinger ? "●" : empfohlen ? "＋" : beschriftung}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Was am Finger hängt: die Gruppe als Schild über dem Plan. */}
          {zieht && gezogene && (
            <g pointerEvents="none">
              <rect
                x={zieht.x - 34}
                y={zieht.y - KANTE - 10}
                width={68}
                height={18}
                rx={4}
                fill="var(--gold-dunkel)"
                opacity={0.92}
              />
              <text x={zieht.x} y={zieht.y - KANTE + 3} textAnchor="middle" fontSize={10} fill="#fff">
                {gezogene.personen} {gezogene.personen === 1 ? "Gast" : "Gäste"}
              </text>
            </g>
          )}
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
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border border-dashed align-middle"
              style={{ borderColor: "var(--gold)" }}
            />
            Empfehlung: A gehört zu A
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "var(--gut)" }} />
            umgesetzt
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "var(--linie)" }} />
            im Shop gesperrt, hier trotzdem belegbar
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border align-middle"
              style={{ background: "var(--blocker-hell)", borderColor: "var(--blocker)" }}
            />
            Reihe 4, Platz 3 bleibt frei
          </span>
        </figcaption>
      </figure>

      <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dunkel">Das sagst du</p>
        <p className="mt-1">
          „Guten Abend! Gute Nachricht: Bei uns hat heute eine Gruppe abgesagt.{" "}
          <strong>Ich setze euch kostenfrei weiter nach vorne.</strong> Von dort seht ihr die Show noch besser, kommt
          einfach mit.“
        </p>
        <p className="mt-2 text-xs text-leise">
          Nicht nachfragen, ob es recht ist: Das wird angeboten, nicht erbeten. Wer lieber sitzen bleiben will, sagt
          es von selbst, und dann heißt es: „Kein Problem, dann bleibt ihr natürlich auf euren Plätzen.“ Nie sagen,
          dass hinten schlecht ist, nur dass vorne etwas frei geworden ist.
        </p>
      </div>
    </section>
  );
}
