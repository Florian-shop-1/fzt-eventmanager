import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { SofortDrucken } from "@/components/SofortDrucken";
import { Unterschriftsfeld } from "@/components/Unterschriftsfeld";
import { Vertragstext } from "@/components/Vertragstext";
import { vertragVon } from "@/lib/db/arbeitsvertrag";
import { luecken } from "@/lib/personal/vertragsdaten";
import { ausfertigungGeholt, vertragSignieren } from "./aktionen";

export const metadata = { title: "Mein Arbeitsvertrag | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der eigene Arbeitsvertrag: lesen, unterschreiben, aufbewahren.
 *
 * Gezeigt wird er erst, wenn das Büro ihn freigegeben hat. Vorher gibt es
 * diese Seite zwar, sie sagt dann aber nur, dass nichts vorliegt: Ein
 * Entwurf, an dem noch gearbeitet wird, geht niemanden etwas an.
 */
export default async function MeinVertrag({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; drucken?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  const { meldung, drucken } = await searchParams;

  const v = await vertragVon(b.id);
  const bereit = v && v.freigegebenAm;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Dein Arbeitsvertrag</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Lies ihn in Ruhe durch. Unterschreiben kannst du unten mit dem Finger oder der Maus. Danach
          bekommst du deine Ausfertigung und kannst sie jederzeit hier wieder aufrufen.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {!bereit && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Für dich liegt gerade kein Vertrag bereit. Sobald das Büro einen für dich fertig gemacht hat,
          steht er hier.
        </p>
      )}

      {bereit && v && (
        <>
          {drucken === "1" && <SofortDrucken bereit bereich=".vertrag" />}

          {v.erhoehung && !v.unterschriebenAm && (
            <p
              className="rounded-lg border px-4 py-3 text-sm print:hidden"
              style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
            >
              <strong>Gute Nachrichten:</strong> In diesem Vertrag verdienst du mehr als bisher.
            </p>
          )}

          <div className="rounded-lg border border-linie bg-flaeche p-6 print:border-0 print:p-0">
            <Vertragstext
              art={v.art}
              luecken={luecken(v)}
              unterschrift={v.unterschrift}
              unterschriebenAm={v.unterschriebenAm}
            />
          </div>

          {!v.unterschriebenAm ? (
            <form
              action={vertragSignieren}
              className="space-y-3 rounded-lg border-2 px-5 py-4 print:hidden"
              style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
            >
              <div className="font-semibold">Hier unterschreiben</div>
              <p className="text-sm">
                Mit deiner Unterschrift nimmst du diesen Vertrag an. Gespeichert wird dabei auch der
                Wortlaut, den du gerade vor dir hast, damit später niemand behaupten kann, es habe etwas
                anderes darin gestanden.
              </p>
              <Unterschriftsfeld name="unterschrift" />
              <Absendeknopf text="Vertrag unterschreiben" laeuftText="Wird gespeichert..." />
            </form>
          ) : (
            <form action={ausfertigungGeholt} className="print:hidden">
              <Absendeknopf text="Meine Ausfertigung öffnen" laeuftText="Wird geöffnet..." />
              <p className="mt-2 text-xs text-leise">
                Öffnet die Druckansicht. Dort kannst du den Vertrag ausdrucken oder als PDF speichern. Dass
                du ihn abgerufen hast, wird mit Datum festgehalten.
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
