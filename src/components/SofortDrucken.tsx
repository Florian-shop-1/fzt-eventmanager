"use client";

/**
 * Öffnet die Druckansicht von selbst, sobald die Seite fertig ist.
 *
 * Gedacht für den Weg aus einer einzelnen Sendung heraus: Wer dort auf
 * "Anschreiben drucken" klickt, will drucken und nicht erst eine zweite
 * Seite und einen zweiten Knopf sehen.
 *
 * Zwei Dinge sind hier wichtig, beide gelernt aus einem Fehlversuch:
 *
 * Erstens muss auf die Bilder gewartet werden. Wird zu früh gedruckt,
 * fehlt der Briefbogen, denn der ist ein Bild und lädt später als Text.
 *
 * Zweitens darf das Warten niemals lange dauern. In der ersten Fassung
 * wartete es bis zu zehn Sekunden, und in dieser Zeit passierte sichtbar
 * nichts: kein Fenster, keine Meldung, nur eine Seite, die aussah, als
 * hinge sie. Deshalb jetzt eine Bremse nach zwei Sekunden und ein
 * sichtbarer Hinweis, solange gewartet wird.
 */

import { useEffect, useState } from "react";

export function SofortDrucken() {
  const [warte, setWarte] = useState(true);

  useEffect(() => {
    let fertig = false;

    const drucke = () => {
      if (fertig) return;
      fertig = true;
      setWarte(false);
      // Ein Herzschlag Abstand, damit der Hinweis verschwunden ist,
      // bevor sich das Druckfenster über die Seite legt.
      requestAnimationFrame(() => window.print());
    };

    // Nur die Bilder abwarten, die auch gedruckt werden. Alles andere
    // steht ohnehin nicht auf dem Blatt.
    const bilder = [...document.querySelectorAll<HTMLImageElement>(".briefseiten img")];
    const offen = bilder.filter((b) => !b.complete);

    if (offen.length === 0) {
      drucke();
    } else {
      let uebrig = offen.length;
      const einesFertig = () => {
        uebrig -= 1;
        if (uebrig === 0) drucke();
      };
      for (const b of offen) {
        b.addEventListener("load", einesFertig, { once: true });
        b.addEventListener("error", einesFertig, { once: true });
      }
    }

    // Bremse: Nach zwei Sekunden wird gedruckt, egal was noch lädt.
    const bremse = setTimeout(drucke, 2000);
    return () => clearTimeout(bremse);
  }, []);

  if (!warte) return null;

  return (
    <div
      className="rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm print:hidden"
      role="status"
    >
      Das Druckfenster wird geöffnet...
    </div>
  );
}
