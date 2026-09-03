"use client";

/**
 * Öffnet die Druckansicht von selbst, sobald die Seite fertig ist.
 *
 * Gedacht für den Weg aus einer einzelnen Sendung heraus: Wer dort auf
 * "Gutschein drucken" klickt, will drucken und nicht erst eine zweite
 * Seite und einen zweiten Knopf sehen.
 *
 * Drei Dinge sind hier wichtig, alle drei aus Fehlversuchen gelernt:
 *
 * Erstens muss das Laden der Seite abgewartet werden, nicht nur das
 * Erscheinen dieses Bausteins. Ruft man window.print() auf, solange der
 * Browser die Seite noch lädt, wartet die Druckvorschau auf ein Ende,
 * das nie kommt: Chrome zeigt dann dauerhaft einen Kreisel und "0
 * Papierbögen". Genau dieses Bild gab es hier.
 *
 * Zweitens müssen die Bilder da sein. Wird zu früh gedruckt, fehlt der
 * Briefbogen oder der Gutscheinbogen, denn beide sind Bilder und laden
 * später als Text.
 *
 * Drittens darf das Warten niemals in eine Sackgasse führen. Deshalb
 * bleibt unten immer ein Knopf stehen, mit dem sich das Druckfenster von
 * Hand öffnen lässt. Wenn etwas klemmt, kommt man damit weiter, statt vor
 * einer Seite zu sitzen, die nichts tut.
 */

import { useEffect, useState } from "react";

export function SofortDrucken({ bereit = true }: { bereit?: boolean }) {
  const [wartet, setWartet] = useState(bereit);

  useEffect(() => {
    // Gibt es nichts zu drucken, wird auch kein Druckfenster geöffnet.
    // Ein leerer Druckauftrag ist genau der Fall, in dem die Vorschau
    // ratlos stehen bleibt.
    if (!bereit) return;

    let erledigt = false;
    let bremse: number | undefined;

    const drucke = () => {
      if (erledigt) return;
      erledigt = true;
      window.clearTimeout(bremse);
      setWartet(false);
      // Ein Herzschlag Abstand, damit der Hinweis verschwunden ist,
      // bevor sich das Druckfenster über die Seite legt.
      requestAnimationFrame(() => window.print());
    };

    const nachDemLaden = () => {
      // Nur die Bilder abwarten, die auch gedruckt werden. Alles andere
      // steht ohnehin nicht auf dem Blatt.
      const bilder = [...document.querySelectorAll<HTMLImageElement>(".briefseiten img")];
      const offen = bilder.filter((b) => !b.complete);

      if (offen.length === 0) {
        drucke();
        return;
      }

      let uebrig = offen.length;
      const einesFertig = () => {
        uebrig -= 1;
        if (uebrig === 0) drucke();
      };
      for (const b of offen) {
        b.addEventListener("load", einesFertig, { once: true });
        b.addEventListener("error", einesFertig, { once: true });
      }

      // Bremse: Nach zwei Sekunden wird gedruckt, egal was noch lädt.
      bremse = window.setTimeout(drucke, 2000);
    };

    if (document.readyState === "complete") {
      nachDemLaden();
    } else {
      window.addEventListener("load", nachDemLaden, { once: true });
    }

    return () => {
      window.clearTimeout(bremse);
      window.removeEventListener("load", nachDemLaden);
    };
  }, [bereit]);

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm print:hidden"
      role="status"
    >
      <span>
        {!bereit
          ? "Hier gibt es nichts zu drucken."
          : wartet
            ? "Das Druckfenster wird geöffnet..."
            : "Das Druckfenster ist offen. Kommt nichts, hier nochmal klicken:"}
      </span>
      {bereit && !wartet && (
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gold bg-white px-3 py-1.5 font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          Druckfenster öffnen
        </button>
      )}
    </div>
  );
}
