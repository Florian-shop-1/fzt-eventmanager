"use client";

/**
 * Der Saalplan zum Antippen: erst die Gruppe, dann ihr neuer Platz.
 *
 * Ziehen mit dem Finger war auf dem Tablet zu wacklig, deshalb bleibt es
 * beim Tippen (Florian, 21.09.2026): Ein Tipp nimmt die Gruppe in die
 * Hand, der nächste setzt sie. Nochmal antippen nimmt sie wieder auf,
 * beliebig oft, auch zurück.
 *
 * Damit man sieht, wer wohin gehört, hat jede Gruppe eine eigene Farbe
 * und einen Buchstaben. Die alten Plätze behalten sie gestrichelt, die
 * neuen ausgefüllt, und ein Pfeil dazwischen zeigt die Richtung. So ist
 * auch nach einer Stunde noch klar, wo eine Gruppe hergekommen ist.
 *
 * Wer da sitzt, steht nicht dabei: Ditix liefert über den öffentlichen
 * Weg nur, welcher Platz verkauft ist, nicht an wen. Sobald es einen
 * Zugang zum Ditix-Backend gibt, kommen die Namen dazu; bis dahin
 * erinnert der Merkzettel daran (siehe lib/db/merker.ts).
 *
 * In Ditix wird nichts geändert, das hier ist unsere Notiz für den Abend.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanHase } from "@/components/ScanHase";

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
  /** Sitzt hinten und soll nach vorne. Nur diese werden farbig. */
  umzusetzen?: boolean;
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

/**
 * Eine Farbe je Gruppe. Bewusst kräftige, gut unterscheidbare Töne, die
 * auch auf dem Tablet bei Hallenlicht noch auseinanderzuhalten sind. Rot
 * fehlt: Das gehört dem Platz, der frei bleiben muss.
 */
const FARBEN = [
  "#1d4ed8",
  "#0f766e",
  "#7c3aed",
  "#be185d",
  "#c2410c",
  "#4d7c0f",
  "#0e7490",
  "#78350f",
  "#334155",
  "#9b7f2f",
];

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
  const [inDerHand, setInDerHand] = useState<string | null>(null);
  const [gesetzt, setGesetzt] = useState<TafelUmsetzung[]>(umsetzungen);
  const [hinweis, setHinweis] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  /** Der Hase aus dem Zylinder, wenn eine Gruppe vorne sitzt. */
  const [lob, setLob] = useState<string | null>(null);

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
          ausPlan ? { ...ausPlan, umzusetzen: true } : {
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
    for (const g of gruppen) if (g.art === "gast") liste.push({ ...g, umzusetzen: true });
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
    const g = gruppe;
    if (!g) return treffer;
    for (const r of reihen) {
      for (const s of r.sitze) {
        const block = blockAb(s, Math.max(1, g.personen), g.schluessel);
        if (block) treffer.set(s.id, block);
      }
    }
    return treffer;
  }, [gruppe, reihen, blockAb]);

  /**
   * Jede Gruppe bekommt Buchstabe und Farbe, nicht nur die aus dem
   * Vorschlag: So sieht man auf einen Blick, welcher Block wohin gehört,
   * und findet nach dem Umsetzen den alten Platz wieder.
   */
  const mitVorschlag = useMemo(() => alleGruppen.filter((g) => g.vorschlagIds.length > 0), [alleGruppen]);

  /**
   * Bunt wird nur, was zu tun ist: Gruppen, die hinten sitzen, und die
   * schon umgesetzten. Wer ohnehin gut sitzt, bleibt schlicht schwarz,
   * sonst leuchtet der halbe Saal (Florian, 22.09.2026).
   */
  const bunte = useMemo(
    () => alleGruppen.filter((g) => g.umzusetzen || gesetzt.some((x) => x.schluessel === g.schluessel)),
    [alleGruppen, gesetzt],
  );

  const buchstabeVon = useMemo(() => {
    const m = new Map<string, string>();
    bunte.forEach((g, i) => m.set(g.schluessel, String.fromCharCode(65 + (i % 26))));
    return m;
  }, [bunte]);

  const farbeVon = useMemo(() => {
    const m = new Map<string, string>();
    bunte.forEach((g, i) => m.set(g.schluessel, FARBEN[i % FARBEN.length]));
    return m;
  }, [bunte]);

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
      // Nur loben, wenn es wirklich ein Upgrade war: nach vorne, in die
      // spielbare Zone. Ein Verschieben innerhalb der Zone ist Alltag.
      // Gelobt wird, was wirklich ein Upgrade ist: Die Gruppe sitzt
      // weiter vorne als vorher. Kleines y heißt nah an der Bühne.
      const alt = g.quelleIds
        .map((id) => sitze.find((y) => y.id === id))
        .filter((y): y is TafelSitz => Boolean(y));
      const mitte = (liste: TafelSitz[]) => liste.reduce((n, y) => n + y.y, 0) / Math.max(1, liste.length);
      const nachVorne = alt.length === 0 || mitte(block) < mitte(alt) - 1;
      if (nachVorne && g.umzusetzen) {
        setLob(
          `${g.personen} ${g.personen === 1 ? "Gast sitzt" : "Gäste sitzen"} jetzt auf ${blockText(block)}. Gut gemacht!`,
        );
      }
      router.refresh();
    } catch {
      setHinweis("Keine Verbindung. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  /** Alle Umsetzungen des Abends zurücknehmen, in einem Rutsch. */
  async function allesZurueck() {
    if (laeuft || gesetzt.length === 0) return;
    setLaeuft(true);
    setHinweis("");
    try {
      for (const x of [...gesetzt]) {
        const g = gruppeZu(x.schluessel);
        await fetch("/upgrades/setzen", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            schluessel: x.schluessel,
            art: g?.art ?? "gruppe",
            gastId: g?.gastId,
          }),
        });
      }
      setGesetzt([]);
      setInDerHand(null);
      router.refresh();
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

  /** Ein Tipp im Plan: aufnehmen, setzen oder die Empfehlung annehmen. */
  function tippen(s: TafelSitz) {
    setHinweis("");
    const start = starts.get(s.id);
    if (start && gruppe) {
      void setzen(gruppe, start);
      return;
    }
    const vorlage = vorlageVon.get(s.id);
    if (vorlage && !gruppe) {
      const block = vorschlagBlock(vorlage);
      if (block) {
        void setzen(vorlage, block);
        return;
      }
    }
    const daraufGesetzt = belegt.get(s.id);
    const naechste = gruppeZu(daraufGesetzt ?? null) ?? gruppeVonSitz.get(s.id) ?? null;
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
            <strong>Erst die Gruppe antippen, dann ihren neuen Platz.</strong> Jede Gruppe hat eine eigene Farbe und
            einen Buchstaben; nach dem Umsetzen zeigt ein Pfeil, wo sie hergekommen ist.
            {offeneVorschlaege.length > 0 &&
              " Das gestrichelte Feld in derselben Farbe ist die Empfehlung: ein Tipp darauf genügt."}
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
                {u
                  ? `Sitzt jetzt auf ${u.zielText}. Tipp einen anderen Platz an, oder setz sie zurück.`
                  : "Jetzt den neuen Platz antippen: Die grünen Felder sind frei."}
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

      {/*
        Rückgängig, ohne erst die Gruppe suchen zu müssen: das Letzte mit
        einem Tipp, und wenn alles durcheinandergeraten ist, der ganze
        Abend auf Anfang (Florian, 22.09.2026).
      */}
      {gesetzt.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-linie bg-flaeche px-4 py-2 text-sm">
          <span className="text-leise">
            Zuletzt: {gruppeZu(gesetzt[gesetzt.length - 1].schluessel)?.titel ?? "Gruppe"} →{" "}
            {gesetzt[gesetzt.length - 1].zielText}
          </span>
          <button
            type="button"
            onClick={() => {
              const letzte = gruppeZu(gesetzt[gesetzt.length - 1].schluessel);
              if (letzte) void zurueck(letzte);
            }}
            disabled={laeuft}
            className="rounded-md border border-linie px-3 py-1.5 font-medium"
          >
            Rückgängig
          </button>
          <button
            type="button"
            onClick={() => void allesZurueck()}
            disabled={laeuft}
            className="text-xs underline text-leise"
          >
            alle {gesetzt.length} Umsetzungen zurücknehmen
          </button>
        </div>
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
          viewBox={masse.viewBox}
          className="mx-auto block h-auto w-full select-none"
          role="img"
          aria-label="Saalplan zum Umsetzen"
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
                const empfohlen = Boolean(start && start.every((x) => x.inZone));
                const vorlage = vorlageVon.get(s.id) ?? null;
                const zielVon = belegt.get(s.id);
                const heimat = gruppeVonSitz.get(s.id) ?? null;
                const heimatUmsetzung = heimat ? umsetzungVon(heimat.schluessel) : null;
                const inDerHandHier = heimat?.schluessel === inDerHand || zielVon === inDerHand;
                const eigner = zielVon ?? heimat?.schluessel ?? vorlage?.schluessel ?? null;
                const farbe = eigner ? (farbeVon.get(eigner) ?? "var(--text)") : "var(--text)";
                const zeichen = eigner ? (buchstabeVon.get(eigner) ?? s.name) : s.name;

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
                  // Hier sitzt die Gruppe jetzt: ihre Farbe, ausgefüllt.
                  fuellung = farbe;
                  rahmen = farbe;
                  schrift = "#fff";
                  beschriftung = zeichen;
                } else if (heimat && heimatUmsetzung) {
                  // Der alte Platz: dieselbe Farbe, aber nur als Umriss.
                  fuellung = "var(--flaeche)";
                  rahmen = farbe;
                  schrift = farbe;
                  beschriftung = zeichen;
                } else if (heimat) {
                  fuellung = farbe;
                  rahmen = farbe;
                  schrift = "#fff";
                  beschriftung = zeichen;
                } else if (vorlage) {
                  // Die Empfehlung: gestrichelt, in der Farbe der Gruppe.
                  fuellung = "var(--flaeche)";
                  rahmen = farbe;
                  schrift = farbe;
                  beschriftung = zeichen;
                }

                const anfassbar = Boolean(heimat ?? zielVon) || Boolean(start) || Boolean(vorlage);

                return (
                  <g
                    key={s.id}
                    onClick={() => tippen(s)}
                    style={{ cursor: anfassbar ? "pointer" : "default" }}
                  >
                    <title>
                      {zielVon
                        ? `${gruppeZu(zielVon)?.titel ?? ""} sitzt jetzt hier`
                        : heimat
                          ? `${heimat.personen} Gäste, ${heimat.titel}`
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
                      fill={empfohlen ? "var(--gut-hell)" : fuellung}
                      stroke={empfohlen ? "var(--gut)" : inDerHandHier ? "var(--text)" : rahmen}
                      strokeWidth={empfohlen || inDerHandHier ? 2.4 : vorlage || heimatUmsetzung ? 1.8 : 1}
                      strokeDasharray={(vorlage || (heimat && heimatUmsetzung)) && !empfohlen ? "4 2" : undefined}
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

          {/*
            Der Weg jeder umgesetzten Gruppe: vom alten zum neuen Platz.
            Damit sieht man auch später noch, wer von wo nach vorne kam.
          */}
          {gesetzt.map((x) => {
            const g = gruppeZu(x.schluessel);
            if (!g || g.quelleIds.length === 0) return null;
            const alt = g.quelleIds
              .map((id) => sitze.find((y) => y.id === id))
              .filter((y): y is TafelSitz => Boolean(y));
            const neu = x.zielIds
              .map((id) => sitze.find((y) => y.id === id))
              .filter((y): y is TafelSitz => Boolean(y));
            if (alt.length === 0 || neu.length === 0) return null;
            const von = {
              x: alt.reduce((n, y) => n + y.x, 0) / alt.length,
              y: alt.reduce((n, y) => n + y.y, 0) / alt.length,
            };
            const nach = {
              x: neu.reduce((n, y) => n + y.x, 0) / neu.length,
              y: neu.reduce((n, y) => n + y.y, 0) / neu.length,
            };
            const farbe = farbeVon.get(x.schluessel) ?? "var(--text)";
            const aktiv = x.schluessel === inDerHand;
            return (
              <line
                key={x.schluessel}
                x1={von.x}
                y1={von.y}
                x2={nach.x}
                y2={nach.y}
                stroke={farbe}
                strokeWidth={aktiv ? 2.4 : 1.4}
                strokeDasharray="5 4"
                opacity={aktiv ? 0.95 : 0.45}
                pointerEvents="none"
              />
            );
          })}
        </svg>

        <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-leise">
          <span>Jede Gruppe hat eine Farbe und einen Buchstaben.</span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm align-middle"
              style={{ background: FARBEN[0] }}
            />
            sitzt hier
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border border-dashed align-middle"
              style={{ borderColor: FARBEN[0] }}
            />
            kam von hier, oder Empfehlung
          </span>
          <span>
            <span
              className="mr-1 inline-block h-3 w-3 rounded-sm border align-middle"
              style={{ background: "var(--gut-hell)", borderColor: "var(--gut)" }}
            />
            freier Platz für die gewählte Gruppe
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

      {lob && <ScanHase stimmung="lob" text={lob} dauer={4000} onWeg={() => setLob(null)} />}

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
