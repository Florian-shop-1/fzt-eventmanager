/**
 * Anzeige des Vorgangsstatus. Die Farbe sagt auf einen Blick, ob etwas
 * liegen bleibt: grau steht für offen, gold für unterwegs, grün für
 * erledigt, rot für abgesagt.
 */

import { STATUS_LABEL, type VorgangStatus } from "@/lib/domain/vorgang";

const FARBEN: Record<VorgangStatus, { flaeche: string; text: string }> = {
  anfrage: { flaeche: "var(--hintergrund)", text: "var(--text-leise)" },
  in_klaerung: { flaeche: "var(--hintergrund)", text: "var(--text-leise)" },
  angebot_erstellt: { flaeche: "var(--info-hell)", text: "var(--info)" },
  angebot_versendet: { flaeche: "var(--info-hell)", text: "var(--info)" },
  angebot_geoeffnet: { flaeche: "var(--gold-hell)", text: "var(--gold-dunkel)" },
  angenommen: { flaeche: "var(--gold-hell)", text: "var(--gold-dunkel)" },
  teilzahlung: { flaeche: "var(--warnung-hell)", text: "var(--warnung)" },
  bezahlt: { flaeche: "var(--gut-hell)", text: "var(--gut)" },
  durchgefuehrt: { flaeche: "var(--gut-hell)", text: "var(--gut)" },
  abgesagt: { flaeche: "var(--blocker-hell)", text: "var(--blocker)" },
};

export function StatusBadge({ status }: { status: VorgangStatus }) {
  const farbe = FARBEN[status] ?? FARBEN.anfrage;
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium"
      style={{ background: farbe.flaeche, color: farbe.text }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Datum in deutscher Schreibweise, zum Beispiel "Fr., 13.11.2026". */
export { datumMitWochentag as datumKurz } from "@/lib/zeit";

/** Zeitpunkt als "vor 3 Stunden" oder "vor 2 Tagen". */
export function vorZeit(iso: string): string {
  const sekunden = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sekunden < 60) return "gerade eben";
  const minuten = Math.floor(sekunden / 60);
  if (minuten < 60) return `vor ${minuten} Minute${minuten === 1 ? "" : "n"}`;
  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `vor ${stunden} Stunde${stunden === 1 ? "" : "n"}`;
  const tage = Math.floor(stunden / 24);
  if (tage < 31) return `vor ${tage} Tag${tage === 1 ? "" : "en"}`;
  return new Date(iso).toLocaleDateString("de-DE");
}
