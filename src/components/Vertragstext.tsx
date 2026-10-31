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
  arbeitgeberUnterschrift,
}: {
  art: Vertragsart;
  luecken: Luecken;
  unterschrift?: string | null;
  unterschriebenAm?: string | null;
  /**
   * Die Unterschrift des Arbeitgebers.
   *
   * Sie wird nur gezeigt, wenn der Mitarbeiter unterschrieben hat. Die
   * Regel steht zweimal im Weg: Die Seiten geben sie vorher gar nicht
   * erst mit, und hier wird sie zusaetzlich geprueft. Ein Blatt, auf dem
   * nur der Chef unterschrieben hat, soll es nicht geben koennen
   * (Florian, 01.10.2026).
   */
  arbeitgeberUnterschrift?: string | null;
}) {
  const chefZeigen = Boolean(unterschriebenAm && arbeitgeberUnterschrift);
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
            {chefZeigen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={arbeitgeberUnterschrift!}
                alt="Unterschrift Florian Zimmer"
                className="h-16 border-b border-text"
              />
            ) : (
              <div className="h-16 border-b border-text" />
            )}
            <div className="mt-1 text-sm">Florian Zimmer Theater GmbH</div>
            <div className="text-xs text-leise">
              Arbeitgeber{chefZeigen ? ", Florian Zimmer" : ""}
            </div>
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

        {/*
          Der Vermerk unter den Unterschriften.

          "baue am besten in die beschreibung ein, dass dieser vertrag
          gültig ist, zeitstempel usw. falls man ihn für eine behörde
          braucht" (Florian, 31.10.2026).

          Was hier steht, sind Tatsachen: wann unterschrieben wurde, von
          wem, und dass der Wortlaut seitdem unveraendert gespeichert
          ist. Bewusst steht hier NICHT "dieser Ausdruck ist
          rechtsgueltig". Ob ein Vertrag gilt, entscheidet kein Satz, den
          das Programm selbst darunterschreibt, sondern das Gesetz, und
          bei einer Befristung verlangt § 14 Abs. 4 TzBfG die
          Schriftform. Ein Satz, der mehr verspricht als er halten kann,
          schadet vor einer Behoerde mehr, als er nuetzt.
        */}
        {unterschriebenAm && (
          <div className="mt-8 border-t border-linie pt-3 text-xs leading-relaxed text-leise">
            <strong>Vermerk zur Ausfertigung.</strong> Dieser Vertrag wurde am{" "}
            {new Date(unterschriebenAm).toLocaleString("de-DE", {
              timeZone: "Europe/Berlin",
              dateStyle: "long",
              timeStyle: "short",
            })}{" "}
            Uhr von {luecken.name} und der Florian Zimmer Theater GmbH elektronisch
            unterzeichnet. Der Wortlaut wird seit diesem Zeitpunkt unverändert gespeichert; diese
            Ausfertigung gibt ihn vollständig wieder. Jeder Abruf wird mit Datum und Uhrzeit
            festgehalten. Rückfragen beantwortet das Büro unter info@florianzimmer.com oder
            0731 7906110.
          </div>
        )}
      </section>
    </article>
  );
}
