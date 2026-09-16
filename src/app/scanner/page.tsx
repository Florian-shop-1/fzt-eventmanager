import { redirect } from "next/navigation";
import { scannerBenutzer } from "@/lib/scanner/zugang";
import { karten, zahlen, einstellung } from "@/lib/db/scanner";
import { azureEingerichtet } from "@/lib/scanner/azure";
import { claudeEingerichtet } from "@/lib/scanner/claude";
import { brevoListen, type BrevoListe } from "@/lib/scanner/brevo";
import { ScannerKamera } from "@/components/ScannerKamera";
import { KartePruefen } from "@/components/KartePruefen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { listenSpeichern, nachtlaufStarten } from "./aktionen";

export const metadata = { title: "Scanner | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Glücks-Moji-Scanner.
 *
 * Oben der große Knopf zum Fotografieren, darunter der Stand und alles,
 * was ein Mensch entscheiden muss. Siehe lib/scanner/ablauf.ts.
 */
export default async function ScannerSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const benutzer = await scannerBenutzer();
  if (!benutzer) redirect("/");
  const { meldung } = await searchParams;

  const [stand, zuPruefen, wartend, erledigt, listen] = await Promise.all([
    zahlen(),
    karten(["pruefen", "fehler"], 100),
    karten(["neu", "wartet_claude", "claude_laeuft"], 100),
    karten(["uebertragen", "doppelt", "verworfen"], 30),
    einstellung(),
  ]);
  const s = (k: string) => stand.jeStatus[k] ?? 0;

  let brevo: BrevoListe[] = [];
  let brevoFehler: string | null = null;
  if (benutzer.rolle === "chef") {
    try {
      brevo = await brevoListen();
    } catch (e) {
      brevoFehler = e instanceof Error ? e.message : "Brevo nicht erreichbar";
    }
  }
  const listenFehlen = listen.newsletter === null && listen.emoji === null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Glücks-Moji-Scanner</h1>
        <p className="mt-1 text-sm text-leise">
          Karte fotografieren, fertig. Eindeutige Karten gehen sofort zu Brevo in Magic News und
          Emoji. Alles Unklare liest Claude nachts nach, und was dann noch zweifelhaft ist, steht
          unten zum Prüfen.
        </p>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {listenFehlen && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Es sind noch keine Brevo-Listen gewählt. Gescannte Karten warten so lange{benutzer.rolle === "chef" ? ", Auswahl ganz unten." : ", Florian wählt sie aus."}
        </div>
      )}

      <ScannerKamera />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kachel zahl={stand.heute} was="heute gescannt" />
        <Kachel zahl={s("uebertragen")} was="bei Brevo eingetragen" farbe="var(--gut)" />
        <Kachel zahl={s("pruefen") + s("fehler")} was="bitte prüfen" farbe={s("pruefen") + s("fehler") > 0 ? "var(--warnung)" : undefined} />
        <Kachel zahl={s("neu") + s("wartet_claude") + s("claude_laeuft")} was="Claude liest nachts" farbe="var(--info)" />
      </section>
      <p className="-mt-3 text-xs text-leise">
        Insgesamt {stand.gesamt} {stand.gesamt === 1 ? "Karte" : "Karten"} · {s("doppelt")} Adressen waren schon da · {s("verworfen")} verworfen ·
        Claude bisher {(stand.kostenCent / 100).toLocaleString("de-DE", { style: "currency", currency: "USD" })}
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Bitte prüfen ({zuPruefen.length})</h2>
        {zuPruefen.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linie px-4 py-6 text-center text-sm text-leise">
            Nichts zu tun. Alles, was gescannt wurde, ist erledigt oder wartet auf Claude.
          </p>
        ) : (
          zuPruefen.map((k) => <KartePruefen key={k.id} karte={k} />)
        )}
      </section>

      {wartend.length > 0 && (
        <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Wartet auf Claude ({wartend.length})</h2>
            {(benutzer.rolle === "chef" || benutzer.rolle === "team") && (
              <form action={nachtlaufStarten}>
                <Absendeknopf text="Jetzt an Claude / Ergebnisse holen" laeuftText="Läuft..." />
              </form>
            )}
          </div>
          <ul className="mt-2 divide-y divide-linie">
            {wartend.map((k) => (
              <li key={k.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>{[k.vorname, k.nachname].filter(Boolean).join(" ") || "Karte"} <span className="text-leise">{k.email}</span></span>
                <span className="text-xs text-leise">
                  {k.status === "claude_laeuft" ? "bei Claude" : "wartet"} · {vorZeit(k.erstelltAm)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <h2 className="font-semibold">Zuletzt erledigt</h2>
        {erledigt.length === 0 ? (
          <p className="mt-2 text-leise">Noch keine.</p>
        ) : (
          <ul className="mt-2 divide-y divide-linie">
            {erledigt.map((k) => (
              <li key={k.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {[k.vorname, k.nachname].filter(Boolean).join(" ") || "Karte"}{" "}
                  <span className="font-mono text-xs text-leise">{k.email}</span>
                </span>
                <span className="text-xs" style={{ color: k.status === "uebertragen" ? "var(--gut)" : "var(--text-leise)" }}>
                  {k.status === "uebertragen" ? "bei Brevo" : k.status === "doppelt" ? "war schon da" : "verworfen"}
                  {k.geprueftVon && ` · geprüft von ${k.geprueftVon}`} · {vorZeit(k.erstelltAm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(benutzer.rolle === "chef" || benutzer.rolle === "team") && (
        <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <h2 className="font-semibold">Einrichtung</h2>
          <ul className="mt-2 space-y-1">
            <Zeile gut={azureEingerichtet()} text="Azure (erste Lesung, kostenlos)" fehlt="AZURE_VISION_ENDPOINT und AZURE_VISION_KEY bei Vercel fehlen" />
            <Zeile gut={claudeEingerichtet()} text="Claude (Nachlesen bei Unklarheit)" fehlt="ANTHROPIC_API_KEY bei Vercel fehlt" />
            <Zeile gut={!listenFehlen} text="Brevo-Listen gewählt" fehlt="noch keine Liste gewählt" />
          </ul>

          {benutzer.rolle === "chef" && (
            <form action={listenSpeichern} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              {brevoFehler && <p className="sm:col-span-3" style={{ color: "var(--blocker)" }}>{brevoFehler}</p>}
              <ListenWahl name="newsletter" titel="Newsletter (Magic News)" listen={brevo} gewaehlt={listen.newsletter} />
              <ListenWahl name="emoji" titel="Emoji-Liste" listen={brevo} gewaehlt={listen.emoji} />
              <Absendeknopf text="Speichern" laeuftText="..." />
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function Kachel({ zahl, was, farbe }: { zahl: number; was: string; farbe?: string }) {
  return (
    <div className="rounded-lg border border-linie bg-flaeche px-4 py-3" style={farbe && zahl > 0 ? { borderColor: farbe } : undefined}>
      <div className="text-3xl font-semibold tabular-nums" style={farbe && zahl > 0 ? { color: farbe } : undefined}>{zahl}</div>
      <div className="text-xs text-leise">{was}</div>
    </div>
  );
}

function Zeile({ gut, text, fehlt }: { gut: boolean; text: string; fehlt: string }) {
  return (
    <li className="flex gap-2">
      <span style={{ color: gut ? "var(--gut)" : "var(--warnung)" }}>{gut ? "✓" : "✗"}</span>
      <span>{text}{!gut && <span className="text-leise">: {fehlt}</span>}</span>
    </li>
  );
}

function ListenWahl({ name, titel, listen, gewaehlt }: { name: string; titel: string; listen: BrevoListe[]; gewaehlt: number | null }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-leise">{titel}</span>
      <select name={name} defaultValue={gewaehlt ?? ""}>
        <option value="">keine</option>
        {listen.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.anzahl})
          </option>
        ))}
        {gewaehlt !== null && !listen.some((l) => l.id === gewaehlt) && <option value={gewaehlt}>Liste {gewaehlt}</option>}
      </select>
    </label>
  );
}
