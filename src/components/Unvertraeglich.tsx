import { VARIANTE_LABEL, type AllergieEintrag } from "@/lib/flotix/allergien";
import type { MenueVariante } from "@/lib/domain/types";

/**
 * Unverträglichkeiten dort, wo der Gast sitzt (Florian, 27.10.2026).
 *
 * "man muss checken, wenn z.B. maria müller gebucht hat, dass beim tisch mit maria müller eins (oder mehrere) mit den
 * unverträglichkeiten dabei ist. es muss sichbar sein im funktionsheet, auf welches menü sich das genau bezieht."
 *
 * Deshalb steht hier beides nebeneinander: der Hinweis selbst und das Menü, für das er gilt. Ohne die Variante ist die
 * Angabe für die Küche nicht umsetzbar, und am Tisch weiß der Service nicht, welchen Teller er anders stellen muss.
 */

/**
 * Das Menü, auf das sich eine Angabe bezieht. Klein, aber nicht zu übersehen.
 *
 * `auf` sagt, worauf das Schild liegt: Das Funktionsheet wird auf Papier gedruckt und ist hell, der Kasten oben ist
 * dunkelrot. Dasselbe Rot wäre auf einem der beiden Gründe kaum zu lesen.
 */
export function VarianteSchild({
  variante,
  auf = "hell",
}: {
  variante: MenueVariante | null;
  auf?: "hell" | "dunkel";
}) {
  const farbe = variante ? (auf === "dunkel" ? "#ff8a7a" : "#c0392b") : "var(--warnung)";
  return (
    <span
      className="rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ borderColor: farbe, color: farbe }}
    >
      {variante ? VARIANTE_LABEL[variante] : "Menü unklar"}
    </span>
  );
}

/** Eine Zeile am Tisch: was zu beachten ist, für welches Menü, für wen. */
export interface TischHinweis {
  text: string;
  variante: MenueVariante | null;
  /** Wer es angegeben hat. Entfällt, wenn die ganze Gruppe gemeint ist. */
  gast?: string;
  /** Ersatz für die Variante, wenn die Angabe für die ganze Gruppe gilt. */
  stattVariante?: string;
}

export function hinweiseAusEintraegen(eintraege: AllergieEintrag[]): TischHinweis[] {
  return eintraege.map((e) => ({ text: e.text, variante: e.variante, gast: e.gast }));
}

/**
 * Der rote Kasten unter einem Tisch oder einer Loge.
 *
 * Bewusst nicht nur ein Ausrufezeichen: Wer das Blatt in der Hand hat, soll am Tisch lesen können, worum es geht,
 * ohne oben im großen Kasten nachschlagen zu müssen.
 */
export function AllergieAmTisch({ hinweise }: { hinweise: TischHinweis[] }) {
  if (hinweise.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {hinweise.map((h, i) => (
        <li
          key={i}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 py-0.5 pl-2 text-sm"
          style={{ borderColor: "#c0392b" }}
        >
          <strong style={{ color: "#c0392b" }}>{h.text}</strong>
          {h.stattVariante ? (
            <span className="text-xs text-leise">{h.stattVariante}</span>
          ) : (
            <VarianteSchild variante={h.variante} />
          )}
          {h.gast && <span className="text-xs text-leise">{h.gast}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Die Menüs einer Gruppe als Text, z.B. "4x Classic, 2x Veggy". */
export function menueMix(menues: Partial<Record<MenueVariante, number>>): string {
  const teile = (Object.keys(VARIANTE_LABEL) as MenueVariante[])
    .filter((v) => (menues[v] ?? 0) > 0)
    .map((v) => `${menues[v]}x ${VARIANTE_LABEL[v]}`);
  return teile.join(", ");
}
