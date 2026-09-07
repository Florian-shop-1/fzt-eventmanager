"use client";

/**
 * Der Knopf für die Testmail.
 *
 * Eigene Komponente nur wegen einer Kleinigkeit, die aber den ganzen
 * Unterschied macht: Zwischen Klick und Antwort vergehen ein bis zwei
 * Sekunden, in denen der Server mit Microsoft spricht. Ohne Rückmeldung
 * sieht die Seite in dieser Zeit aus, als sei nichts passiert, und man
 * klickt ein zweites Mal.
 */

import { useFormStatus } from "react-dom";

export function Probeknopf({ bereit }: { bereit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!bereit || pending}
      className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird geschickt..." : "Testmail schicken"}
    </button>
  );
}
