import { STATUS_TEXT, type Rechnung, type Status } from "@/lib/rechnung/db";

/**
 * Der Stand einer Rechnung als Schild.
 *
 * Farbe und Wort sagen dasselbe, damit auch jemand, der Farben schlecht
 * unterscheidet, den Stand lesen kann.
 */
const FARBEN: Record<Status, { rand: string; flaeche: string; schrift: string }> = {
  DRAFT: { rand: "var(--linie)", flaeche: "var(--flaeche)", schrift: "var(--text-leise)" },
  CREATED: { rand: "var(--linie)", flaeche: "var(--flaeche)", schrift: "var(--text)" },
  SENT: { rand: "var(--info)", flaeche: "var(--info-hell)", schrift: "var(--info)" },
  DUE: { rand: "var(--info)", flaeche: "var(--info-hell)", schrift: "var(--info)" },
  OVERDUE: { rand: "var(--blocker)", flaeche: "var(--blocker-hell)", schrift: "var(--blocker)" },
  PARTIALLY_PAID: { rand: "var(--warnung)", flaeche: "var(--warnung-hell)", schrift: "var(--warnung)" },
  PAID: { rand: "var(--gut)", flaeche: "var(--gut-hell)", schrift: "var(--gut)" },
  CANCELLED: { rand: "var(--linie)", flaeche: "var(--linie)", schrift: "var(--text-leise)" },
};

export function StatusSchild({ status }: { status: Status }) {
  const f = FARBEN[status];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{ borderColor: f.rand, background: f.flaeche, color: f.schrift }}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}

export const euro = (cent: number) =>
  (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export const tagKurz = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** "3 Tage überfällig" oder "fällig in 5 Tagen". */
export function faelligText(r: Rechnung): string {
  if (r.status === "PAID") return `bezahlt${r.bezahltAm ? ` am ${tagKurz(r.bezahltAm)}` : ""}`;
  if (r.status === "CANCELLED") return "storniert";
  const t = r.tageUeberfaellig;
  if (t > 0) return `${t} ${t === 1 ? "Tag" : "Tage"} überfällig`;
  if (t === 0) return "heute fällig";
  return `fällig in ${-t} ${t === -1 ? "Tag" : "Tagen"}`;
}
