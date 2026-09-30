"use client";

import { useFormStatus } from "react-dom";

/**
 * Der Absendeknopf auf der Gästeseite.
 *
 * Wie der Absendeknopf im Programm, aber in den Farben der Gästeseite: Sie
 * ist dunkel und benutzt keine Klassen aus dem Eventmanager.
 *
 * Er sperrt sich beim ersten Klick. Am 30.09.2026 hat ein Gast fünfmal
 * gedrückt, weil nach dem Klick nichts Sichtbares passierte, und im
 * Posteingang lagen danach fünf gleiche Meldungen (Florian).
 */
export function GastAbsendeknopf({
  text,
  laeuftText,
  rand,
  farbe,
}: {
  text: string;
  laeuftText: string;
  rand: string;
  farbe: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 w-full rounded px-5 py-3 text-base font-medium sm:w-auto"
      style={{
        border: `1px solid ${rand}`,
        color: farbe,
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "progress" : "pointer",
      }}
    >
      {pending ? laeuftText : text}
    </button>
  );
}
