/**
 * Der Briefkopf für Ausdrucke.
 *
 * Erscheint ausschließlich auf Papier. Am Bildschirm wäre er verschenkter
 * Platz: dort steht die Marke schon oben in der Navigation, und darunter
 * wird gearbeitet.
 *
 * Auf einem Blatt, das in der Küche hängt oder am Einlass in der Hand
 * liegt, gehört sie dagegen hin. Deshalb hier das vollständige Logo mit
 * dem Claim, nicht nur die Wortmarke.
 */

import { Logo } from "./Logo";
import { zeitpunkt } from "@/lib/zeit";

export function Druckkopf({
  titel,
  untertitel,
}: {
  /** Was das Blatt ist, etwa "Küchenblatt". */
  titel: string;
  /** Um welchen Abend es geht. */
  untertitel?: string;
}) {
  return (
    <header className="mb-5 hidden border-b-2 border-text pb-3 print:block">
      <div className="flex items-end justify-between gap-4">
        <Logo hoehe={42} />
        <div className="text-right">
          <div className="text-xl font-semibold tracking-tight">{titel}</div>
          <div className="text-xs text-leise">Stand: {zeitpunkt(new Date())}</div>
        </div>
      </div>
      {untertitel && <div className="mt-2 text-lg">{untertitel}</div>}
    </header>
  );
}
