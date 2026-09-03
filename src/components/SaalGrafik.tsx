"use client";

/**
 * Bildliche Darstellung der Magicuisine.
 *
 * Logen: jede Loge ist ein langer Tisch. Die Gäste sitzen sich an den
 * Längsseiten gegenüber, deshalb wird oben und unten je eine Reihe
 * Plätze gezeichnet. Belegte Plätze sind ausgefüllt, freie bleiben leer.
 * Zwischen Loge 1 und Loge 2 ist der bauliche Abstand sichtbar.
 *
 * Zwei Sorten Gäste werden unterschieden: gebuchte Plätze sind ausgefüllt
 * und durchgezogen umrandet, reservierte sind nur umrandet und gestrichelt.
 * Das reicht auch im Schwarzweißausdruck, weil es nicht an der Farbe hängt.
 */

import { LOGEN, EVENTGALERIE_TISCHE, LOGEN_LUECKE_ZWISCHEN } from "@/lib/domain/venue";
import type { Plan } from "@/lib/seating/types";
import type { Sicherheit } from "@/lib/domain/types";

/** Farben zur Unterscheidung der Gruppen. Bewusst gedeckt gehalten. */
const GRUPPENFARBEN = [
  "#c9a84c",
  "#3f5b8b",
  "#2f6b46",
  "#8b4a3f",
  "#6b4a8b",
  "#3f7f8b",
  "#8b6b3f",
  "#5b5b5b",
];

export function gruppenFarbe(index: number): string {
  return GRUPPENFARBEN[index % GRUPPENFARBEN.length];
}

/**
 * Ein einzelner Sitzplatz als Punkt.
 *
 * Drei Zustände: gebucht (voll), reserviert (Ring in der Gruppenfarbe)
 * und frei (blasser gestrichelter Ring).
 */
function Platz({
  belegt,
  farbe,
  sicherheit = "gebucht",
}: {
  belegt: boolean;
  farbe: string;
  sicherheit?: Sicherheit;
}) {
  const reserviert = belegt && sicherheit === "reserviert";
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border-2"
      style={{
        background: belegt && !reserviert ? farbe : "transparent",
        borderColor: belegt ? farbe : "var(--linie)",
        borderStyle: belegt ? "solid" : "dashed",
      }}
    />
  );
}

/** Kleines Schild, das reservierte Gruppen kennzeichnet. */
export function SicherheitSchild({ sicherheit }: { sicherheit: Sicherheit }) {
  const reserviert = sicherheit === "reserviert";
  return (
    <span
      className="rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide"
      style={{
        color: reserviert ? "var(--warnung)" : "var(--gut)",
        borderColor: reserviert ? "var(--warnung)" : "var(--gut)",
        background: reserviert ? "var(--warnung-hell)" : "var(--gut-hell)",
        borderStyle: reserviert ? "dashed" : "solid",
      }}
    >
      {reserviert ? "reserviert" : "gebucht"}
    </span>
  );
}

/** Zeichnet einen langen Tisch mit Plätzen an beiden Längsseiten. */
function LangerTisch({
  proSeite,
  belegtOben,
  belegtUnten,
  notstuhl,
  farbe,
  sicherheit,
}: {
  proSeite: number;
  belegtOben: number;
  belegtUnten: number;
  notstuhl: number;
  farbe: string;
  sicherheit: Sicherheit;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-1">
          {Array.from({ length: proSeite }, (_, i) => (
            <Platz key={`o${i}`} belegt={i < belegtOben} farbe={farbe} sicherheit={sicherheit} />
          ))}
        </div>
        <div className="h-4 w-full rounded-sm border border-linie bg-hintergrund" />
        <div className="flex gap-1">
          {Array.from({ length: proSeite }, (_, i) => (
            <Platz key={`u${i}`} belegt={i < belegtUnten} farbe={farbe} sicherheit={sicherheit} />
          ))}
        </div>
      </div>
      {notstuhl > 0 && (
        <div className="flex flex-col items-center" title="Zusatzstuhl an der Stirnseite">
          <Platz belegt farbe={farbe} sicherheit={sicherheit} />
        </div>
      )}
    </div>
  );
}

export function LogenGrafik({ plan }: { plan: Plan }) {
  // Nachschlagen, welche Gruppe in welcher Loge sitzt.
  const belegung = new Map<
    number,
    { name: string; farbeIndex: number; anteil: number; notstuhl: number; sicherheit: Sicherheit }
  >();

  plan.logen.forEach((z, gruppenIndex) => {
    // Personen der Gruppe gleichmäßig auf die belegten Logen verteilen,
    // volle Logen zuerst. So entsteht das Bild, das der Service später sieht.
    let rest = z.personen;
    let restNotstuehle = z.notstuehle;
    for (const nummer of z.logenNummern) {
      const loge = LOGEN.find((l) => l.nummer === nummer)!;
      const hier = Math.min(rest, loge.plaetze);
      rest -= hier;
      const notstuhlHier = rest > 0 && restNotstuehle > 0 ? 1 : 0;
      restNotstuehle -= notstuhlHier;
      if (notstuhlHier) rest -= 1;
      belegung.set(nummer, {
        name: z.gruppeName,
        farbeIndex: gruppenIndex,
        anteil: hier,
        notstuhl: notstuhlHier,
        sicherheit: z.sicherheit,
      });
    }
  });

  return (
    <div className="druckt-farbe flex flex-wrap items-start gap-3">
      {LOGEN.map((loge) => {
        const b = belegung.get(loge.nummer);
        const farbe = b ? gruppenFarbe(b.farbeIndex) : "var(--linie)";
        const belegtOben = b ? Math.ceil(b.anteil / 2) : 0;
        const belegtUnten = b ? Math.floor(b.anteil / 2) : 0;
        const luecke = LOGEN_LUECKE_ZWISCHEN.some(([a]) => a === loge.nummer);

        return (
          <div key={loge.id} className="flex items-start">
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: b ? farbe : "var(--linie)",
                background: b ? "var(--flaeche)" : "transparent",
                borderStyle: b?.sicherheit === "reserviert" ? "dashed" : "solid",
              }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{loge.name}</span>
                <span className="text-xs text-leise">
                  {b ? `${b.anteil} von ${loge.plaetze}` : `${loge.plaetze} frei`}
                </span>
              </div>
              <LangerTisch
                proSeite={loge.proSeite}
                belegtOben={belegtOben}
                belegtUnten={belegtUnten}
                notstuhl={b?.notstuhl ?? 0}
                farbe={farbe}
                sicherheit={b?.sicherheit ?? "gebucht"}
              />
              <div className="mt-2 flex h-5 items-center gap-1.5 text-xs">
                <span className="truncate" style={{ color: b ? farbe : undefined }}>
                  {b?.name ?? ""}
                </span>
                {b?.sicherheit === "reserviert" && <SicherheitSchild sicherheit="reserviert" />}
              </div>
            </div>
            {luecke && (
              <div
                className="mx-1 self-stretch border-l-2 border-dashed border-linie"
                title="Baulicher Abstand zwischen Loge 1 und Loge 2"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GalerieGrafik({ plan }: { plan: Plan }) {
  const belegtVon = new Map<
    string,
    { name: string; farbeIndex: number; personen: number; sicherheit: Sicherheit }
  >();
  plan.galerie.forEach((z, i) => {
    let rest = z.personen;
    for (const tischId of z.tischIds) {
      const tisch = EVENTGALERIE_TISCHE.find((t) => t.id === tischId)!;
      const hier = Math.min(rest, tisch.plaetze);
      rest -= hier;
      belegtVon.set(tischId, {
        name: z.gruppeName,
        farbeIndex: plan.logen.length + i,
        personen: hier,
        sicherheit: z.sicherheit,
      });
    }
  });

  return (
    <div className="druckt-farbe flex flex-wrap gap-2">
      {EVENTGALERIE_TISCHE.map((tisch) => {
        const b = belegtVon.get(tisch.id);
        const farbe = b ? gruppenFarbe(b.farbeIndex) : "var(--linie)";
        return (
          <div
            key={tisch.id}
            className="rounded-lg border px-3 py-2"
            style={{
              borderColor: b ? farbe : "var(--linie)",
              background: b ? "var(--flaeche)" : "transparent",
              borderStyle: b?.sicherheit === "reserviert" ? "dashed" : "solid",
            }}
          >
            <div className="mb-1 text-xs text-leise">{tisch.plaetze}er</div>
            <div className="flex gap-1">
              {Array.from({ length: tisch.plaetze }, (_, i) => (
                <Platz
                  key={i}
                  belegt={i < (b?.personen ?? 0)}
                  farbe={farbe}
                  sicherheit={b?.sicherheit ?? "gebucht"}
                />
              ))}
            </div>
            <div
              className="mt-1 h-4 max-w-24 truncate text-xs"
              style={{ color: b ? farbe : undefined }}
            >
              {b?.name ?? ""}
            </div>
            {b?.sicherheit === "reserviert" && (
              <div className="mt-1">
                <SicherheitSchild sicherheit="reserviert" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
