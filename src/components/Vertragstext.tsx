/**
 * Der Arbeitsvertrag, wie ihn beide Seiten lesen.
 *
 * Ein Bauteil für alle drei Stellen: die Vorschau im Büro, die Ansicht
 * beim Mitarbeiter und den Ausdruck. Drei Fassungen desselben Vertrages
 * wären drei Gelegenheiten, dass sie auseinanderlaufen.
 *
 * Am Bildschirm ist es ein langer Text zum Lesen, im Druck eine Folge von
 * A4-Seiten mit Briefkopf. Die Unterschriften stehen am Ende, entweder
 * als gezeichneter Namenszug oder als Linie zum Unterschreiben.
 */

import { Logo } from "@/components/Logo";
import { FIRMENANSCHRIFT, UEBERSCHRIFT, vertragsAbschnitte, type Luecken, type Vertragsart } from "@/lib/personal/arbeitsvertrag";

const datumDe = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

export function Vertragstext({
  art,
  luecken,
  unterschrift,
  unterschriebenAm,
}: {
  art: Vertragsart;
  luecken: Luecken;
  unterschrift?: string | null;
  unterschriebenAm?: string | null;
}) {
  const abschnitte = vertragsAbschnitte(art, luecken);
  const kopf = UEBERSCHRIFT[art];

  return (
    <article className="vertrag space-y-5 text-[15px] leading-relaxed">
      <header className="space-y-3 border-b border-linie pb-4 text-center">
        {/* Das Logo bringt den Claim HOME OF MAGIC schon mit. */}
        <div className="flex justify-center">
          <Logo hoehe={64} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{kopf.titel}</h1>
        <p className="text-sm text-leise">{kopf.unterzeile}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-leise">Arbeitgeber</div>
          <div className="mt-1">
            Florian Zimmer Theater GmbH
            <br />
            vertreten durch den Geschäftsführer Florian Zimmer
            <br />
            {FIRMENANSCHRIFT}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-leise">Arbeitnehmer</div>
          <div className="mt-1">
            {luecken.name || <span style={{ color: "var(--blocker)" }}>Name fehlt</span>}
            <br />
            {luecken.anschrift || <span style={{ color: "var(--blocker)" }}>Anschrift fehlt</span>}
            <br />
            geboren am {luecken.geburtsdatum || <span style={{ color: "var(--blocker)" }}>Datum fehlt</span>}
          </div>
        </div>
      </section>

      <p className="text-sm text-leise">
        – nachfolgend gemeinsam „Vertragsparteien“ genannt – wird folgender Arbeitsvertrag geschlossen:
      </p>

      {abschnitte.map((a) => (
        <section key={a.titel} className="space-y-1.5">
          <h2 className="font-semibold">{a.titel}</h2>
          {a.absaetze.map((absatz, i) => (
            <p key={i}>{absatz}</p>
          ))}
        </section>
      ))}

      <section className="space-y-6 border-t border-linie pt-6">
        <div>Neu-Ulm, {datumDe(unterschriebenAm ?? new Date().toISOString())}</div>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <div className="h-16 border-b border-text" />
            <div className="mt-1 text-sm">Florian Zimmer Theater GmbH</div>
            <div className="text-xs text-leise">Arbeitgeber</div>
          </div>
          <div>
            {unterschrift ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={unterschrift} alt="Unterschrift" className="h-16 border-b border-text" />
            ) : (
              <div className="h-16 border-b border-text" />
            )}
            <div className="mt-1 text-sm">{luecken.name}</div>
            <div className="text-xs text-leise">
              Arbeitnehmer
              {unterschriebenAm
                ? `, digital unterschrieben am ${new Date(unterschriebenAm).toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    dateStyle: "short",
                    timeStyle: "short",
                  })} Uhr`
                : ""}
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
