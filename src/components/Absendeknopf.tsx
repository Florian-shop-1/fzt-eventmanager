"use client";

/**
 * Ein Absendeknopf, der sagt, dass er arbeitet.
 *
 * Überall dort, wo ein Klick eine Mail auslöst, vergehen ein bis zwei
 * Sekunden, in denen der Server mit Microsoft spricht. Ohne Rückmeldung
 * sieht die Seite in dieser Zeit aus, als sei nichts passiert, und man
 * klickt noch einmal. Bei einer Mail an einen Kunden wäre das eine
 * zweite Mail.
 */

import { useFormStatus } from "react-dom";

export function Absendeknopf({
  text,
  laeuftText,
  deaktiviert,
}: {
  text: string;
  laeuftText: string;
  deaktiviert?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || deaktiviert}
      className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? laeuftText : text}
    </button>
  );
}
