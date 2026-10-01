import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Vertragstext } from "@/components/Vertragstext";
import { downloads, vertragLesen } from "@/lib/db/arbeitsvertrag";
import { luecken } from "@/lib/personal/vertragsdaten";
import { vertragFreigabe, vertragFreigabeZurueck, vertragWeg } from "../aktionen";

export const metadata = { title: "Arbeitsvertrag | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Ein Vertrag, wie das Büro ihn sieht.
 *
 * Solange er nicht freigegeben ist, steht oben deutlich, dass ihn außer
 * dem Büro niemand sieht. Erst der Knopf "Zur Unterschrift freigeben"
 * macht ihn für den Mitarbeiter sichtbar (Florian, 30.09.2026).
 */
export default async function VertragSeite({ params }: { params: Promise<{ id: string }> }) {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");

  const { id } = await params;
  const v = await vertragLesen(id);
  if (!v) notFound();

  const geladen = await downloads(v.id);
  const zeit = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="print:hidden">
        <Link href="/vertraege" className="text-sm underline text-leise">
          zurück zur Übersicht
        </Link>
      </div>

      {!v.freigegebenAm && (
        <div
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
        >
          <strong>Entwurf, nur für euch sichtbar.</strong> {v.name} weiß nichts davon und kann nichts
          unterschreiben. Lies den Vertrag durch; stimmt etwas nicht, zieh ihn zurück und leg ihn neu an.
          Ein früherer Vertrag gilt weiter, bis dieser hier unterschrieben ist.
        </div>
      )}

      {v.freigegebenAm && !v.unterschriebenAm && (
        <div
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}
        >
          <strong>Freigegeben.</strong> {v.name} sieht den Vertrag seit {zeit(v.freigegebenAm)} Uhr und kann
          unterschreiben. Freigegeben von {v.freigegebenVon}.
        </div>
      )}

      {v.abgeloestAm && (
        <div className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm print:hidden">
          <strong>Abgelöst.</strong> Dieser Vertrag gilt nicht mehr; seit dem{" "}
          {zeit(v.abgeloestAm)} Uhr gilt ein neuerer. Er bleibt hier stehen, damit nachvollziehbar
          bleibt, was vorher vereinbart war.
          {v.abgeloestDurch && (
            <>
              {" "}
              <Link href={`/vertraege/${v.abgeloestDurch}`} className="underline">
                zum neuen Vertrag
              </Link>
            </>
          )}
        </div>
      )}

      {v.unterschriebenAm && (
        <div
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          <strong>Unterschrieben am {zeit(v.unterschriebenAm)} Uhr.</strong> Der Wortlaut, den {v.name}
          dabei vor sich hatte, ist mitgespeichert (Fingerabdruck {v.textstand}).
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DruckKnopf text="Vertrag drucken" hinweis="oder als PDF speichern" />

        {!v.freigegebenAm && !v.unterschriebenAm && (
          <form action={vertragFreigabe}>
            <input type="hidden" name="id" value={v.id} />
            <Absendeknopf text="Zur Unterschrift freigeben" laeuftText="Wird freigegeben..." />
          </form>
        )}

        {v.freigegebenAm && !v.unterschriebenAm && (
          <form action={vertragFreigabeZurueck}>
            <input type="hidden" name="id" value={v.id} />
            <button type="submit" className="rounded-lg border border-linie px-4 py-2 text-sm">
              Freigabe zurücknehmen
            </button>
          </form>
        )}

        {!v.unterschriebenAm && (
          <form action={vertragWeg}>
            <input type="hidden" name="id" value={v.id} />
            <button type="submit" className="text-sm underline text-leise">
              Vertrag zurückziehen
            </button>
          </form>
        )}
      </div>

      <div className="rounded-lg border border-linie bg-flaeche p-6 print:border-0 print:p-0">
        <Vertragstext
          art={v.art}
          luecken={luecken(v)}
          unterschrift={v.unterschrift}
          unterschriebenAm={v.unterschriebenAm}
          arbeitgeberUnterschrift={v.unterschriebenAm ? v.arbeitgeberUnterschrift : null}
        />
      </div>

      {/*
        Wer die Ausfertigung geholt hat und wann.

        Der Vertrag sagt zu, dass der Arbeitnehmer eine unterzeichnete
        Ausfertigung bekommt. Bei einer Unterschrift am Bildschirm ist der
        Abruf genau das, deshalb steht hier, ob und wann er stattfand
        (Florian, 30.09.2026).
      */}
      {geladen.length > 0 && (
        <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm print:hidden">
          <div className="font-medium">Ausfertigung abgerufen</div>
          <ul className="mt-1 space-y-1 text-xs text-leise">
            {geladen.map((g, i) => (
              <li key={i}>
                {zeit(g.wann)} Uhr von {g.wer} {g.eigener ? "(selbst)" : "(Büro)"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
