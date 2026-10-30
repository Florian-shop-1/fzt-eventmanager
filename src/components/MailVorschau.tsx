"use client";

/**
 * Die Mail ansehen, bevor sie rausgeht.
 *
 * "Zeig am besten auch die Vorschau der mail, bevor man abschickt!"
 * (Florian, 30.10.2026).
 *
 * Im Textfeld steht nur der Brief. Knöpfe, Fußzeile, Unterschrift und
 * die Bewertungslinks hängt der Eventmanager darunter, und die sah man
 * vorher nie. Dieser Knopf holt genau dieselbe Fassung, die auch
 * verschickt wird, und zeigt sie in einem Rahmen darunter.
 *
 * Gelesen wird dabei aus dem Formular, in dem der Knopf steht: So
 * stimmt die Vorschau immer mit dem überein, was gerade getippt ist.
 */

import { useRef, useState } from "react";

export function MailVorschau({
  /** Die Angebote mit ihren Überschriften, falls mehrere mitgehen. */
  angebote,
  /** Ein einzelner Link, wenn es nur ein Angebot ist. */
  link,
}: {
  angebote?: Array<{ id: string; href: string }>;
  link?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const knopf = useRef<HTMLButtonElement | null>(null);

  async function zeigen() {
    const form = knopf.current?.form;
    if (!form) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const daten = new FormData(form);
      const gewaehlt = daten.getAll("angebot").map((x) => String(x));
      const liste = (angebote ?? [])
        .filter((a) => gewaehlt.length === 0 || gewaehlt.includes(a.id))
        .map((a) => ({
          titel: String(daten.get(`titel-${a.id}`) ?? "").trim(),
          href: a.href,
        }));

      const antwort = await fetch("/api/mailvorschau", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: String(daten.get("text") ?? ""),
          link,
          angebote: liste,
        }),
      });
      if (!antwort.ok) throw new Error("Die Vorschau kam nicht.");
      setHtml(await antwort.text());
    } catch (f) {
      setFehler(f instanceof Error ? f.message : "Das ging nicht.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        ref={knopf}
        type="button"
        onClick={() => void (html ? setHtml(null) : zeigen())}
        disabled={laeuft}
        className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {laeuft ? "einen Moment..." : html ? "Vorschau schließen" : "Vorschau ansehen"}
      </button>

      {fehler && (
        <p className="text-xs" style={{ color: "var(--blocker)" }}>
          {fehler}
        </p>
      )}

      {html && (
        <>
          <iframe
            srcDoc={html}
            title="Vorschau der Mail"
            className="h-[60vh] w-full rounded-md border border-linie bg-white"
          />
          <p className="text-xs text-leise">
            So kommt sie beim Kunden an. Unterschrift, Fußzeile und die Bewertungslinks stehen
            schon darin, die gehören nicht ins Textfeld.
          </p>
        </>
      )}
    </div>
  );
}
