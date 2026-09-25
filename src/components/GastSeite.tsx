import { Inter, Playfair_Display } from "next/font/google";

/**
 * Der Rahmen für die Seiten, die Gäste zu sehen bekommen.
 *
 * Angebot und Antwortseite hingen bisher im hellen Look des
 * Eventmanagers. Das ist die interne Handschrift, ein Gast kennt sie
 * nicht: Er kommt aus einer schwarz-goldenen Mail und landete auf einer
 * cremefarbenen Bürooberfläche (Florian, 23.09.2026).
 *
 * Deshalb hier dieselben Mittel wie im Shop: Schwarz, Gold, Playfair
 * Display für die Überschriften, Inter für den Text. Die Farbwerte sind
 * eins zu eins aus dem Shop übernommen (globals.css im Ticketshop).
 *
 * Der dunkle Grund kommt über ein eigenes style-Element auf den body:
 * Das Grundgerüst der Seite gehört dem Eventmanager, und daran darf eine
 * einzelne Seite nichts ändern. So bleibt auch der Rand unten dunkel,
 * wenn der Inhalt kurz ist.
 */

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"], variable: "--fzt-serif" });
const inter = Inter({ subsets: ["latin"], variable: "--fzt-sans" });

export const FARBEN = {
  schwarz: "#080808",
  karte: "#191919",
  gold: "#C9A84C",
  goldHell: "#E2C97A",
  weiss: "#FFFFFF",
  leise: "#A8A8A8",
  linie: "rgba(201,168,76,0.25)",
};

export function GastSeite({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${playfair.variable} ${inter.variable}`}>
      <style>{`
        body { background: ${FARBEN.schwarz}; }
        .gast { font-family: var(--fzt-sans), Inter, system-ui, sans-serif; }
        .gast h1, .gast h2 { font-family: var(--fzt-serif), Georgia, serif; font-weight: 600; line-height: 1.2; }
        .gast a.unterstrichen { text-decoration: underline; }
      `}</style>
      <div
        className="gast mx-auto w-full max-w-lg px-6 py-14 text-center"
        style={{ color: FARBEN.weiss, minHeight: "100vh" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Die kleine goldene Zeile über der Überschrift. */
export function Wortzeile() {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: FARBEN.gold }}>
      Home of Magic
    </p>
  );
}

/** Ein Kasten im Shop-Look: dunkle Fläche, goldene Linie. */
export function Kasten({
  children,
  gold = false,
  className = "",
}: {
  children: React.ReactNode;
  /** Für das eine Element, das heraussticht: der Countdown. */
  gold?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border px-5 py-5 ${className}`}
      style={{
        background: gold ? "rgba(201,168,76,0.08)" : FARBEN.karte,
        borderColor: gold ? FARBEN.gold : FARBEN.linie,
      }}
    >
      {children}
    </div>
  );
}

/** Der goldene Knopf, groß genug fürs Handy. */
export function GoldKnopf({ text, ziel }: { text: string; ziel: string }) {
  return (
    <a
      href={ziel}
      className="inline-block w-full rounded px-6 py-3.5 text-lg font-semibold sm:w-auto"
      style={{ background: FARBEN.gold, color: FARBEN.schwarz }}
    >
      {text}
    </a>
  );
}

/** Die Kontaktzeile, auf jeder Gastseite dieselbe. */
export function Kontaktzeile() {
  return (
    <p className="mt-10 text-sm" style={{ color: FARBEN.leise }}>
      Fragen?{" "}
      <a href="tel:+497317906110" className="unterstrichen" style={{ color: FARBEN.goldHell }}>
        0731 7906 110
      </a>{" "}
      oder{" "}
      <a href="mailto:tickets@florianzimmer.com" className="unterstrichen" style={{ color: FARBEN.goldHell }}>
        tickets@florianzimmer.com
      </a>
    </p>
  );
}
