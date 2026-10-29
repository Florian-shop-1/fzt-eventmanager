"use client";

/**
 * Die Tickets als Seiten zum Drucken, nicht als PDF-Datei.
 *
 * "beim ticket selber geht es auf eine webseite. es zeigt dann die
 * tickets an, aber nicht für mich zum drucken das menü wie beim
 * anschreiben. beim anschreiben kann ich quer, hochformat wählen usw."
 * (Florian, 29.10.2026).
 *
 * Der Unterschied ist nicht die Gestaltung, sondern wer druckt. Beim
 * Anschreiben druckt der Browser eine Seite des Programms, und dabei
 * erscheint sein eigenes Druckfenster mit Drucker, Format und Anzahl.
 * Beim Ticket lieferte der Server eine fertige PDF-Datei, und die zeigt
 * der PDF-Betrachter an. Auf dem Handy heisst das: erst teilen, dann
 * drucken, und die Auswahl fehlt.
 *
 * Deshalb werden die Seiten des Ticket-PDFs hier im Browser zu Bildern
 * gezeichnet und als gewoehnliche Seite ausgegeben. Danach ist es fuer
 * den Browser derselbe Fall wie beim Anschreiben.
 *
 * Gerechnet wird mit der doppelten Aufloesung: Ein Ticket traegt einen
 * Strichcode, und der muss am Einlass noch lesbar sein, wenn das Blatt
 * einmal gefaltet war.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Wie viel feiner gezeichnet wird als die Bildschirmgroesse.
 *
 * 2,5 ergibt bei A4 rund 1500 mal 2100 Punkte, also etwa 180 dpi. Das
 * reicht fuer den Strichcode und ergibt je Seite ein knappes halbes
 * Megabyte im Speicher. Bei vielen Tickets auf einmal wird daraus
 * schnell zu viel fuer ein Handy, deshalb dort etwas groeber.
 */
function schaerfeFuer(seiten: number): number {
  return seiten > 12 ? 1.8 : 2.5;
}

export function TicketSeiten({
  quelle,
  sofort = false,
}: {
  quelle: string;
  /**
   * Nach dem Zeichnen gleich das Druckfenster oeffnen.
   *
   * Das macht hier die Komponente selbst und nicht SofortDrucken: Jener
   * Baustein wartet auf Bilder, die beim Laden der Seite schon im Baum
   * stehen. Hier entstehen sie erst danach, er wuerde also drucken,
   * bevor es etwas zu drucken gibt.
   */
  sofort?: boolean;
}) {
  const [seiten, setSeiten] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [quer, setQuer] = useState(false);
  const gestartet = useRef(false);

  useEffect(() => {
    // In der Entwicklung laeuft der Effekt zweimal. Ein zweiter Lauf
    // wuerde dieselben Seiten ein zweites Mal zeichnen.
    if (gestartet.current) return;
    gestartet.current = true;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const antwort = await fetch(quelle, { cache: "no-store" });
        if (!antwort.ok) {
          const text = await antwort.text().catch(() => "");
          throw new Error(text.slice(0, 200) || `Die Tickets kamen nicht (${antwort.status}).`);
        }
        const daten = await antwort.arrayBuffer();
        const dokument = await pdfjs.getDocument({ data: daten }).promise;

        const schaerfe = schaerfeFuer(dokument.numPages);
        const bilder: string[] = [];
        for (let nr = 1; nr <= dokument.numPages; nr++) {
          const seite = await dokument.getPage(nr);
          const flaeche = seite.getViewport({ scale: schaerfe });
          if (nr === 1) setQuer(flaeche.width > flaeche.height);

          const leinwand = document.createElement("canvas");
          leinwand.width = Math.round(flaeche.width);
          leinwand.height = Math.round(flaeche.height);
          const stift = leinwand.getContext("2d");
          if (!stift) throw new Error("Der Browser kann hier nicht zeichnen.");
          stift.fillStyle = "#ffffff";
          stift.fillRect(0, 0, leinwand.width, leinwand.height);
          await seite.render({ canvas: leinwand, canvasContext: stift, viewport: flaeche }).promise;
          bilder.push(leinwand.toDataURL("image/jpeg", 0.92));
        }
        setSeiten(bilder);

        if (sofort) {
          // Zwei Herzschlaege: einer, bis React die Bilder gesetzt hat,
          // einer, bis der Browser sie gezeichnet hat.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.setTimeout(() => window.print(), 120)),
          );
        }
      } catch (f) {
        setFehler(f instanceof Error ? f.message : "Unbekannter Fehler");
      }
    })();
  }, [quelle, sofort]);

  if (fehler) {
    return (
      <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
        <strong style={{ color: "var(--blocker)" }}>Die Tickets ließen sich nicht aufbauen.</strong>
        <div className="mt-1 text-leise">{fehler}</div>
      </div>
    );
  }

  if (seiten.length === 0) {
    return (
      <p className="text-sm text-leise print:hidden">
        Die Tickets werden aufgebaut, das dauert einen Moment.
      </p>
    );
  }

  return (
    <>
      {/*
        Das Blattformat richtet sich nach dem Ticket selbst. Steht hier
        nichts, nimmt der Browser Hochformat, und ein quer angelegtes
        Ticket wuerde auf dem Blatt abgeschnitten.
      */}
      <style>{`@page ticket { size: A4 ${quer ? "landscape" : "portrait"}; margin: 0 }
        @media print { .ticketseiten { page: ticket } }`}</style>

      <div className="ticketseiten">
        {seiten.map((bild, i) => (
          <div key={i} className="ticketblatt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bild} alt={`Ticket ${i + 1}`} className="block w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
