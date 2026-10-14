import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { akte } from "@/lib/personal/akte";
import { bogenVon } from "@/lib/db/personalbogen";
import { zeilen } from "@/lib/personal/personalbogen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { eur } from "@/lib/domain/pricing";
import { personalbogenAnfordern } from "@/lib/auth/aktionen";

export const metadata = { title: "Personalakte | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

/**
 * Die Personalakte einer Person.
 *
 * Alles, was man im Alltag über einen Menschen wissen will, auf einer
 * Seite: Zugang, Personalbogen, Vertrag, Geheimhaltung, Stunden. Und
 * oben der Knopf, der am häufigsten gebraucht wird: den Personalbogen
 * noch einmal anfordern (Florian, 14.10.2026).
 */
export default async function AktenSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");

  const { id } = await params;
  const { meldung } = await searchParams;
  const a = await akte(id);
  if (!a) notFound();

  const bogen = await bogenVon(id).catch(() => null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
          <p className="mt-1 text-sm text-leise">
            {a.rolle}
            {a.art ? ` · ${a.art}` : ""}
            {a.fest ? " · fest angestellt" : ""}
            {a.schnuppert ? " · schnuppert" : ""}
            {a.aktiv ? "" : " · Zugang gesperrt"}
          </p>
        </div>
        <Link href="/mitarbeiter" className="text-sm text-leise hover:text-text">
          Zurück zur Liste
        </Link>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {/*
        Der Personalbogen steht oben, weil er am häufigsten fehlt und
        weil der Knopf dafür bisher nirgends zu finden war.
      */}
      <section
        className="rounded-lg border px-5 py-4"
        style={
          a.personalbogenAm
            ? { borderColor: "var(--linie)", background: "var(--flaeche)" }
            : { borderColor: "var(--warnung)", background: "var(--warnung-hell)" }
        }
      >
        <h2 className="font-semibold">Personalbogen</h2>
        {a.personalbogenAm ? (
          <p className="mt-1 text-sm">
            Abgegeben am {datum(a.personalbogenAm)}.{" "}
            <Link href="/unterlagen" className="underline">
              In den Unterlagen ansehen
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm">
            Liegt noch nicht vor. Ohne ihn kann weder das Lohnbüro anmelden noch ein Vertrag fertig werden.
          </p>
        )}

        <form action={personalbogenAnfordern.bind(null, a.id)} className="mt-3">
          <Absendeknopf
            text={a.personalbogenAm ? "Neu anfordern" : "Per Mail anfordern"}
            laeuftText="Wird verschickt..."
          />
        </form>
        <p className="mt-2 text-xs text-leise">
          Geht an {a.email || "keine Adresse hinterlegt"}. Der Haken wird dabei zurückgesetzt, damit die
          Aufgabe im Programm wieder erscheint.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Karte titel="Zugang">
          <Zeile was="E-Mail" wert={a.email} />
          <Zeile was="Handy" wert={a.handy ? `+${a.handy}` : "nicht hinterlegt"} />
          <Zeile was="Angelegt" wert={datum(a.erstelltAm)} />
          <Zeile
            was="Zuletzt angemeldet"
            wert={a.letzterLogin ? vorZeit(a.letzterLogin) : "noch nie"}
          />
          {!a.aktiv && (
            <>
              <Zeile was="Gesperrt seit" wert={datum(a.ausgeschiedenAm)} />
              {a.ausscheidenGrund && <Zeile was="Grund" wert={a.ausscheidenGrund} />}
              <Zeile
                was="Lohnbüro"
                wert={a.abgemeldetAm ? `abgemeldet am ${datum(a.abgemeldetAm)}` : "noch nicht abgemeldet"}
              />
            </>
          )}
          <p className="mt-2 text-xs text-leise">
            Rolle, Sperre und Passwort ändern sich unter{" "}
            <Link href="/einstellungen/benutzer" className="underline">
              Zugänge
            </Link>
            .
          </p>
        </Karte>

        <Karte titel="Arbeitsvertrag">
          {a.vertrag ? (
            <>
              <Zeile was="Art" wert={a.vertrag.art} />
              <Zeile was="Beginn" wert={a.vertrag.beginn?.split("-").reverse().join(".") ?? ""} />
              {a.vertrag.stundenlohnCent !== null && (
                <Zeile was="Stundenlohn" wert={`${eur(a.vertrag.stundenlohnCent)} €`} />
              )}
              {a.vertrag.festgehaltCent !== null && (
                <Zeile was="Festgehalt" wert={`${eur(a.vertrag.festgehaltCent)} €`} />
              )}
              <Zeile
                was="Unterschrieben"
                wert={a.vertrag.unterschriebenAm ? datum(a.vertrag.unterschriebenAm) : "noch nicht"}
              />
              <p className="mt-2 text-xs">
                <Link href={`/vertraege/${a.vertrag.id}`} className="underline">
                  Vertrag öffnen
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-leise">
              Kein Vertrag hinterlegt.{" "}
              <Link href="/vertraege" className="underline">
                Hier anlegen
              </Link>
            </p>
          )}
        </Karte>

        <Karte titel="Arbeit">
          <Zeile was="Stunden, letzte 90 Tage" wert={`${a.stundenLetzte90} Std`} />
          <Zeile
            was="Zuletzt gestempelt"
            wert={a.letzterStempel ? vorZeit(a.letzterStempel) : "noch nie"}
          />
          <Zeile was="Kommende Dienste" wert={String(a.diensteKommend)} />
          <p className="mt-2 text-xs text-leise">
            Zeiten ändern unter{" "}
            <Link href={`/stempeluhr?wer=${a.id}`} className="underline">
              Zeiterfassung
            </Link>
            .
          </p>
        </Karte>

        <Karte titel="Papiere">
          <Zeile
            was="Geheimhaltung"
            wert={a.geheimhaltungAm ? `unterschrieben am ${datum(a.geheimhaltungAm)}` : "offen"}
          />
          <Zeile was="Dateien im Ordner" wert={String(a.dateien)} />
          <p className="mt-2 text-xs text-leise">
            Alte Verträge und Papierbögen stehen unter{" "}
            <Link href="/unterlagen" className="underline">
              Personalunterlagen
            </Link>
            .
          </p>
        </Karte>
      </div>

      {/* Die Angaben aus dem Bogen, wenn er da ist. */}
      {bogen && (
        <section className="rounded-lg border border-linie bg-flaeche p-5">
          <h2 className="font-semibold">Angaben aus dem Personalbogen</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {zeilen(bogen.daten).map((g) => (
              <div key={g.gruppe}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-leise">{g.gruppe}</h3>
                <dl className="mt-1 space-y-1 text-sm">
                  {g.felder
                    .filter(([, wert]) => String(wert).trim() !== "")
                    .map(([was, wert]) => (
                      <div key={was} className="flex gap-2">
                        <dt className="min-w-36 text-leise">{was}</dt>
                        <dd className="break-all">{wert}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="mb-2 font-semibold">{titel}</h2>
      <dl className="space-y-1 text-sm">{children}</dl>
    </section>
  );
}

function Zeile({ was, wert }: { was: string; wert: string }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-36 text-leise">{was}</dt>
      <dd className="break-all">{wert || "-"}</dd>
    </div>
  );
}
