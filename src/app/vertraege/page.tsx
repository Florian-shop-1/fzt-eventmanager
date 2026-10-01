import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { abgeloesteVertraege, fuerVertrag, vertraege } from "@/lib/db/arbeitsvertrag";
import { SPIELZEIT_ENDE } from "@/lib/personal/arbeitsvertrag";
import { HASE_ERHOEHUNG, HASE_VERTRAG } from "@/lib/personal/hasensatz";
import { StellenWahl } from "@/components/StellenWahl";
import { vertragErstellen } from "./aktionen";

export const metadata = { title: "Arbeitsverträge | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Arbeitsverträge: anlegen, ansehen, freigeben.
 *
 * Der Weg ist zweistufig, und das ist der Kern: Erst entsteht ein
 * Entwurf, den nur das Büro sieht, und erst wenn Florian ihn gelesen hat,
 * wird er freigegeben und beim Mitarbeiter sichtbar (Florian, 30.09.2026).
 *
 * In der Auswahl steht jeder, auch wer schon einen Vertrag hat: Ein neuer
 * Vertrag ersetzt den alten, so wie es im Vertragstext steht, und genau so
 * läuft eine Gehaltserhöhung (Florian, 01.10.2026). Der alte gilt weiter,
 * bis der neue unterschrieben ist, und bleibt danach als Beleg stehen.
 */
export default async function VertraegeSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");
  const { meldung } = await searchParams;

  const [liste, leute, abgeloest] = await Promise.all([vertraege(), fuerVertrag(), abgeloesteVertraege()]);
  const entwuerfe = liste.filter((v) => !v.freigegebenAm);
  const wartend = liste.filter((v) => v.freigegebenAm && !v.unterschriebenAm);
  const fertig = liste.filter((v) => v.unterschriebenAm);

  const euro = (c: number | null) =>
    c === null ? "" : (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const tag = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Arbeitsverträge</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Anlegen, ansehen, freigeben. Der Mitarbeiter sieht einen Vertrag erst, wenn er freigegeben ist,
          und unterschreibt ihn am Bildschirm. Sichtbar ist dieser Bereich nur für Werner, Kevin und
          Florian.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {entwuerfe.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
            Entwürfe, nur für euch sichtbar ({entwuerfe.length})
          </h2>
          <ul className="space-y-2">
            {entwuerfe.map((v) => (
              <li key={v.id} className="rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm">
                <Link href={`/vertraege/${v.id}`} className="font-medium underline">
                  {v.name}
                </Link>{" "}
                <span className="text-leise">
                  {v.art === "teilzeit" ? "Teilzeit" : "Kurzfristig"} · {v.position || v.taetigkeit} · ab{" "}
                  {tag(v.beginn)} · {v.art === "teilzeit" ? euro(v.festgehaltCent) : `${euro(v.stundenlohnCent)} je Stunde`}
                </span>
                <div className="mt-1 text-xs text-leise">
                  angelegt von {v.angelegtVon}. Noch nicht freigegeben, der Mitarbeiter sieht nichts.
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {wartend.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
            Wartet auf die Unterschrift ({wartend.length})
          </h2>
          <ul className="space-y-2">
            {wartend.map((v) => (
              <li key={v.id} className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
                <Link href={`/vertraege/${v.id}`} className="font-medium underline">
                  {v.name}
                </Link>{" "}
                <span className="text-leise">
                  freigegeben von {v.freigegebenVon} am {tag(v.freigegebenAm!)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fertig.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
            Unterschrieben und nachgetragen ({fertig.length})
          </h2>
          <ul className="space-y-2">
            {fertig.map((v) => (
              <li key={v.id} className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
                <Link href={`/vertraege/${v.id}`} className="font-medium underline">
                  {v.name}
                </Link>{" "}
                <span style={{ color: "var(--gut)" }}>
                  {v.aufPapier
                    ? `auf Papier geschlossen, ab ${tag(v.beginn)}`
                    : `unterschrieben am ${tag(v.unterschriebenAm!)}`}
                </span>
                {v.aufPapier && (
                  <span className="text-leise"> · nachgetragen aus {v.quelle || "den Papierunterlagen"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold" id="anlegen">Neuen Vertrag anlegen</h2>
        <p className="text-sm text-leise">
          Hat die Person schon einen Vertrag, ersetzt der neue ihn, sobald sie unterschrieben hat. Bis
          dahin gilt der alte weiter. Für eine Gehaltserhöhung legst du also einfach einen neuen an.
        </p>
        {leute.length === 0 ? (
          <p className="text-sm text-leise">Es gibt niemanden, für den ein Vertrag infrage kommt.</p>
        ) : (
          <form action={vertragErstellen} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Für wen</span>
                <select name="benutzerId" defaultValue="" required>
                  <option value="" disabled>
                    bitte wählen
                  </option>
                  {leute.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.aktuell
                        ? ` (hat ${euro(p.aktuell.stundenlohnCent ?? p.aktuell.festgehaltCent)}${
                            p.aktuell.stundenlohnCent ? " je Stunde" : " im Monat"
                          } seit ${tag(p.aktuell.beginn)})`
                        : ""}
                      {p.bogenAm ? "" : " (Personalbogen fehlt)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Art des Vertrags</span>
                <select name="art" defaultValue="kurzfristig">
                  <option value="kurzfristig">Kurzfristige Beschäftigung</option>
                  <option value="teilzeit">Teilzeit / Saison mit Festgehalt</option>
                </select>
              </label>
            </div>

            {/*
              Stelle waehlen, Taetigkeit und Aufgaben fuellen sich mit
              den Formulierungen, die Florian vorgegeben hat. Aendern
              geht weiterhin (Florian, 01.10.2026).
            */}
            <StellenWahl />

            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Vertragsbeginn</span>
                <input type="date" name="beginn" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Vertragsende</span>
                <input type="date" name="ende" defaultValue={SPIELZEIT_ENDE} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Stundenlohn € (kurzfristig)</span>
                <input name="stundenlohn" inputMode="decimal" placeholder="14,50" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Probezeit in Monaten (Teilzeit)</span>
                <input name="probezeit" inputMode="numeric" placeholder="3" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Monatsstunden (Teilzeit)</span>
                <input name="monatsstunden" inputMode="decimal" placeholder="80" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Monatliches Bruttogehalt € (Teilzeit)</span>
                <input name="festgehalt" inputMode="decimal" placeholder="1.300,00" />
              </label>
            </div>

            {/*
              Anschrift und Geburtsdatum kommen aus der Geheimhaltung, dort
              hat sie die Person selbst eingetragen. Fehlen sie, traegt das
              Buero sie hier ein; im Entwurf faellt jede Luecke rot auf.
            */}
            <details className="rounded-lg border border-linie px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Personalien von Hand eintragen (nur nötig, wenn sie fehlen)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Name</span>
                  <input name="name" maxLength={120} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Anschrift</span>
                  <input name="anschrift" maxLength={200} placeholder="Straße 1, 89231 Neu-Ulm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Geburtsdatum</span>
                  <input name="geburtsdatum" placeholder="TT.MM.JJJJ" maxLength={10} />
                </label>
              </div>
            </details>

            {/*
              Was der Hase sagt, wenn der Vertrag bereitliegt.

              Leer heisst: der Standardsatz, und bei einer Erhoehung
              freut er sich von selbst. Wer einen eigenen Satz schreibt,
              dessen Satz gilt (Florian, 01.10.2026).
            */}
            <label className="block">
              <span className="mb-1 block text-xs text-leise">
                Botschaft vom Hasi individualisieren (freiwillig)
              </span>
              <input
                name="hasenText"
                maxLength={300}
                placeholder={`Ohne Eintrag sagt er: „${HASE_VERTRAG}“ oder bei mehr Lohn „${HASE_ERHOEHUNG}“`}
              />
            </label>

            <Absendeknopf text="Entwurf anlegen und ansehen" laeuftText="Wird angelegt..." />
          </form>
        )}
      </section>

      {/*
        Die abgelösten Verträge bleiben nachschlagbar. Wer wissen will, was
        jemand vorher verdient hat, findet es hier (Florian, 01.10.2026).
      */}
      {abgeloest.length > 0 && (
        <details className="rounded-lg border border-linie bg-flaeche p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Frühere Verträge, abgelöst ({abgeloest.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {abgeloest.map((v) => (
              <li key={v.id} className="text-sm">
                <Link href={`/vertraege/${v.id}`} className="underline">
                  {v.name}
                </Link>{" "}
                <span className="text-leise">
                  {v.art === "teilzeit" ? "Teilzeit" : "Kurzfristig"} · ab {tag(v.beginn)} ·{" "}
                  {v.art === "teilzeit" ? euro(v.festgehaltCent) : `${euro(v.stundenlohnCent)} je Stunde`} ·
                  abgelöst am {tag(v.abgeloestAm!)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
