import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Vertragstext } from "@/components/Vertragstext";
import { downloads, vertragLesen } from "@/lib/db/arbeitsvertrag";
import { luecken } from "@/lib/personal/vertragsdaten";
import { ARTNAME } from "@/lib/personal/arbeitsvertrag";
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
  const tag = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
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

      {v.unterschriebenAm && !v.aufPapier && (
        <div
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          <strong>Unterschrieben am {zeit(v.unterschriebenAm)} Uhr.</strong> Der Wortlaut, den {v.name}
          dabei vor sich hatte, ist mitgespeichert (Fingerabdruck {v.textstand}).
        </div>
      )}

      {/*
        Ein Vertrag aus der Zeit vor dem Eventmanager.

        Er steht hier nur, damit das Haus weiß, was vereinbart ist. Die
        heutige Vorlage zu zeigen wäre falsch: Unterschrieben wurde ein
        anderes Blatt, und das liegt im Ordner (Florian, 01.10.2026).
      */}
      {v.aufPapier && (
        <div
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}
        >
          <strong>Auf Papier geschlossen.</strong> Dieser Vertrag wurde außerhalb des Eventmanagers
          unterschrieben und hier nur nachgetragen, damit Laufzeit und Lohn im Haus bekannt sind. Der
          Wortlaut ist die Datei{v.quelle ? `: ${v.quelle}` : "."} Unterschreiben muss hier niemand mehr.
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

      {v.aufPapier ? (
        <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-linie bg-flaeche p-6 text-sm sm:grid-cols-2">
          <Zeile k="Art" w={ARTNAME[v.art]} />
          <Zeile k="Tätigkeit" w={v.position || v.taetigkeit} />
          <Zeile k="Laufzeit" w={`${tag(v.beginn)} bis ${tag(v.ende)}`} />
          <Zeile
            k="Vergütung"
            w={
              v.stundenlohnCent
                ? `${(v.stundenlohnCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} je Stunde`
                : v.festgehaltCent
                  ? `${(v.festgehaltCent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} im Monat`
                  : "nicht hinterlegt"
            }
          />
          <Zeile k="Anschrift" w={v.personalien?.anschrift ?? ""} />
          <Zeile k="Geburtsdatum" w={v.personalien?.geburtsdatum ?? ""} />
          <Zeile k="Nachgetragen" w={`${v.angelegtVon}, ${tag(v.angelegtAm)}`} />
          <Zeile k="Unterlage" w={v.quelle} />
        </dl>
      ) : (
      <div className="rounded-lg border border-linie bg-flaeche p-6 print:border-0 print:p-0">
        <Vertragstext
          art={v.art}
          luecken={luecken(v)}
          unterschrift={v.unterschrift}
          unterschriebenAm={v.unterschriebenAm}
          arbeitgeberUnterschrift={v.unterschriebenAm ? v.arbeitgeberUnterschrift : null}
        />
      </div>
      )}

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

/** Eine Zeile in den Eckdaten eines Papiervertrags. */
function Zeile({ k, w }: { k: string; w: string }) {
  if (!w) return null;
  return (
    <div>
      <dt className="text-xs text-leise">{k}</dt>
      <dd className="font-medium">{w}</dd>
    </div>
  );
}
