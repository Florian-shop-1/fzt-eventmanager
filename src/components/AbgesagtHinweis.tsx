/**
 * Der rote Balken über einem abgesagten Abend.
 *
 * "wenn eine Show abgesagt wurde, dann muss diese auch bei den
 * Showupgrades und an jeder anderen Stelle als storniert erscheinen.
 * Aktuell sieht man sie noch ganz normal im Plan" (Florian, 17.10.2026).
 *
 * Steht auf jeder Seite, die einen einzelnen Abend aufschlägt: Küche,
 * Foyer, Einlass, Sitzplan, Upgrades, Parkplätze. Die Seite selbst
 * bleibt bedienbar, denn nach einer Absage gibt es dort durchaus noch
 * etwas zu tun, etwa Gäste umbuchen. Sie sagt nur deutlich, woran man
 * ist.
 */
export function AbgesagtHinweis({
  abgesagt,
  /** Einzelne abgesagte Vorstellungen, wenn nur eine von zweien ausfällt. */
  teilweise,
}: {
  abgesagt?: boolean;
  teilweise?: string[];
}) {
  if (!abgesagt && (!teilweise || teilweise.length === 0)) return null;

  return (
    <p
      className="rounded-lg border px-4 py-3 text-sm font-medium"
      style={{
        borderColor: "var(--blocker)",
        background: "var(--blocker-hell)",
        color: "var(--blocker)",
      }}
    >
      {abgesagt
        ? "Diese Vorstellung ist abgesagt und findet nicht statt."
        : `Abgesagt: ${teilweise?.join(" und ")} Uhr. Die übrigen Vorstellungen finden statt.`}
    </p>
  );
}
