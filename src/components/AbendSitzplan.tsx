"use client";

/**
 * Zeigt die Platzierungsvorschläge eines Abends und lässt einen davon
 * festlegen. Ist bereits ein Plan festgelegt, wird dieser gezeigt, und die
 * Vorschläge stehen daneben, falls sich etwas geändert hat.
 */

import { useState, useTransition } from "react";
import { GalerieGrafik, LogenGrafik, SicherheitSchild, gruppenFarbe } from "./SaalGrafik";
import { eur } from "@/lib/domain/pricing";
import type { Plan } from "@/lib/seating/types";

export function AbendSitzplan({
  ditixEventId,
  varianten,
  festgelegt,
  festlegen,
}: {
  ditixEventId: string;
  varianten: Plan[];
  festgelegt: Plan | null;
  festlegen: (ditixEventId: string, plan: unknown) => Promise<void>;
}) {
  const [gewaehlt, setGewaehlt] = useState(0);
  const [laeuft, starte] = useTransition();

  // Ein festgelegter Plan hat Vorrang: nach ihm arbeiten Service und Küche.
  const angezeigt = festgelegt ?? varianten[gewaehlt];
  if (!angezeigt) return null;

  const gleichWieFestgelegt =
    festgelegt !== null && varianten.length > 0 && signatur(festgelegt) === signatur(varianten[0]);

  return (
    <div className="space-y-6">
      {!festgelegt && varianten.length > 1 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Vorschläge</h3>
          <div className="flex flex-wrap gap-2">
            {varianten.map((v, i) => (
              <button
                key={i}
                onClick={() => setGewaehlt(i)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  i === gewaehlt
                    ? "border-gold bg-gold-hell"
                    : "border-linie bg-flaeche hover:border-gold"
                }`}
              >
                <div className="font-medium">{i === 0 ? "Empfehlung" : `Alternative ${i}`}</div>
                <div className="mt-0.5 max-w-72 text-xs text-leise">{kurzfassung(v)}</div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--gold-dunkel)" }}>
                  {v.differenzGesamtCent > 0
                    ? `Differenz ${eur(v.differenzGesamtCent)}`
                    : "keine Differenz"}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {festgelegt && !gleichWieFestgelegt && varianten.length > 0 && (
        <div className="rounded-lg border border-warnung bg-warnung-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--warnung)" }}>
            Seit dem Festlegen hat sich etwas geändert.
          </strong>
          <p className="mt-1 text-leise">
            Es sind Gäste dazugekommen oder weggefallen. Der festgelegte Plan gilt weiter. Willst
            du neu planen, öffne ihn oben wieder.
          </p>
        </div>
      )}

      <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-linie bg-flaeche px-4 py-3 text-xs">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full border-2"
            style={{ background: "var(--text)", borderColor: "var(--text)" }}
          />
          <span>
            <strong className="tabular-nums">{angezeigt.sicherheit.gebucht}</strong> gebucht, bezahlt
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full border-2"
            style={{ background: "transparent", borderColor: "var(--text)" }}
          />
          <span>
            <strong className="tabular-nums">{angezeigt.sicherheit.reserviert}</strong> reserviert,
            noch nicht bezahlt
          </span>
        </span>
        <span className="text-leise">
          Gestrichelt umrandet heißt: kann noch wegfallen.
        </span>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Logenbereich{" "}
          <span className="font-normal text-leise">
            ({angezeigt.auslastung.logen.belegt} von {angezeigt.auslastung.logen.kapazitaet}{" "}
            Plätzen)
          </span>
        </h3>
        <LogenGrafik plan={angezeigt} />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Eventgalerie{" "}
          <span className="font-normal text-leise">
            ({angezeigt.auslastung.eventgalerie.belegt} von{" "}
            {angezeigt.auslastung.eventgalerie.kapazitaet} Plätzen)
          </span>
        </h3>
        <GalerieGrafik plan={angezeigt} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Platzierung im Klartext</h3>
        <ul className="space-y-1.5 rounded-lg border border-linie bg-flaeche p-4 text-sm">
          {angezeigt.begruendung.map((zeile, i) => {
            // Die Begründungen stehen in derselben Reihenfolge wie die
            // Zuteilungen: erst die Logen, dann die Galerie.
            const zuteilung = [...angezeigt.logen, ...angezeigt.galerie][i];
            return (
              <li key={i} className="flex gap-2">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: gruppenFarbe(i) }}
                />
                <span>
                  {zeile}
                  {zuteilung?.sicherheit === "reserviert" && (
                    <>
                      {" "}
                      <SicherheitSchild sicherheit="reserviert" />
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {angezeigt.hinweise.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Was zu beachten ist</h3>
          <div className="space-y-2">
            {angezeigt.hinweise.map((h, i) => (
              <div
                key={i}
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  borderColor:
                    h.schwere === "blocker"
                      ? "var(--blocker)"
                      : h.schwere === "warnung"
                        ? "var(--warnung)"
                        : "var(--info)",
                  background:
                    h.schwere === "blocker"
                      ? "var(--blocker-hell)"
                      : h.schwere === "warnung"
                        ? "var(--warnung-hell)"
                        : "var(--info-hell)",
                }}
              >
                {h.text}
              </div>
            ))}
          </div>
          {angezeigt.differenzGesamtCent > 0 && (
            <div className="mt-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm">
              <strong>Summe der Differenzen: {eur(angezeigt.differenzGesamtCent)}</strong>
              <div className="text-leise">
                Für Plätze, die durch die Belegung blockiert sind. Ausnahmen setzt du im jeweiligen
                Vorgang.
              </div>
            </div>
          )}
        </section>
      )}

      {!festgelegt && (
        <div className="flex items-center gap-3 border-t border-linie pt-4">
          <button
            disabled={laeuft}
            onClick={() => starte(() => void festlegen(ditixEventId, angezeigt))}
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
          >
            {laeuft ? "wird gespeichert..." : "Diesen Plan festlegen"}
          </button>
          <span className="text-xs text-leise">
            Danach arbeiten Service und Küche nach diesem Plan.
          </span>
        </div>
      )}
    </div>
  );
}

function kurzfassung(plan: Plan): string {
  if (plan.logen.length === 0) return "alle Gruppen in der Eventgalerie";
  const logen = plan.logen
    .map((z) => `${z.gruppeName}: Loge ${z.logenNummern.join("+")}`)
    .join(" · ");
  const inGalerie = plan.galerie.length;
  return inGalerie > 0
    ? `${logen} · ${inGalerie} ${inGalerie === 1 ? "Gruppe" : "Gruppen"} auf der Galerie`
    : logen;
}

/** Kennung einer Belegung, um Änderungen zu erkennen. */
function signatur(p: Plan): string {
  return p.logen
    .map((z) => `${z.gruppeId}:${z.logenNummern.join("-")}`)
    .sort()
    .join("|");
}
