import Link from "next/link";
import { BARRIEREFREI_STATUS, holeLeads, istBarrierefrei, type Lead } from "@/lib/shop/leads";
import { leadStaende, type LeadStand } from "@/lib/db/buero";
import { vorZeit } from "@/components/Status";
import { barrierefreiSpeichern } from "./aktionen";

export const metadata = { title: "Barrierefreie Plätze | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Anfragen nach einem barrierefreien Platz.
 *
 * Wer einen Rollstuhlplatz braucht, kann ihn im Saalplan nicht selbst
 * anklicken: Die Plätze stehen dort nicht zur Wahl, weil daneben Raum
 * für Begleitung und Anfahrt frei bleiben muss. Deshalb gibt es im
 * Buchungsfenster den Knopf "Barrierefreien Platz benötigt", und seine
 * Anfragen laufen über denselben Weg herein wie alle anderen.
 *
 * Auf der Vertriebsliste haben sie nichts zu suchen: "anfragen für
 * barrierefreiheit sollten nicht bei den events landen" (Florian,
 * 29.10.2026). Dort stehen Firmenevents, und der Gesprächsleitfaden
 * daneben fragt nach Exklusivbuchung und Rechnungsanschrift. Das geht an
 * einem Gast vorbei, der einfach ins Theater möchte.
 *
 * Diese Seite ist ihr Platz. Sie ist bewusst kurz: Wer sitzt wann wo,
 * und steht der Platz schon. Die Telefonnummer steht vorn, denn geklärt
 * wird das in zwei Minuten am Telefon und nicht in drei Mails.
 */
export default async function BarrierefreiSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeige?: string }>;
}) {
  const { zeige } = await searchParams;
  const alleZeigen = zeige === "alle";

  let leads: Lead[] = [];
  let fehler: string | null = null;
  try {
    leads = await holeLeads();
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const staende = await leadStaende();

  const anfragen = leads
    .filter(istBarrierefrei)
    .map((l) => {
      const stand = staende.get(l.schluessel);
      return { ...l, stand, zustand: stand?.status ?? "Neu" };
    })
    .sort((a, b) => b.eingang.localeCompare(a.eingang));

  const offen = anfragen.filter((a) => !/erledigt/i.test(a.zustand));
  const sichtbar = alleZeigen ? anfragen : offen;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Barrierefreie Plätze</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Rollstuhlplätze lassen sich im Saalplan nicht selbst anklicken, deshalb fragt der Gast
          an. Hier steht, wer wann kommen möchte. Am schnellsten geht es mit einem Anruf: Welcher
          Platz passt, wie viele Begleitpersonen kommen mit, und schon steht es.
        </p>
      </header>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      <section className="flex flex-wrap items-center gap-4">
        <div className="rounded-lg border border-linie bg-flaeche px-5 py-4">
          <div className="text-2xl font-semibold tabular-nums">{offen.length}</div>
          <div className="text-xs text-leise">offen</div>
        </div>
        <div className="rounded-lg border border-linie bg-flaeche px-5 py-4">
          <div className="text-2xl font-semibold tabular-nums">{anfragen.length}</div>
          <div className="text-xs text-leise">insgesamt</div>
        </div>
        <Link
          href={alleZeigen ? "/barrierefrei" : "/barrierefrei?zeige=alle"}
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
        >
          {alleZeigen ? "nur offene zeigen" : "auch erledigte zeigen"}
        </Link>
      </section>

      {sichtbar.length === 0 ? (
        <p className="text-sm text-leise">
          {anfragen.length === 0
            ? "Noch keine Anfrage eingegangen."
            : "Alles erledigt. Nichts offen."}
        </p>
      ) : (
        <div className="space-y-3">
          {sichtbar.map((a) => (
            <Karte key={a.schluessel} anfrage={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Karte({
  anfrage,
}: {
  anfrage: Lead & { stand: LeadStand | undefined; zustand: string };
}) {
  const erledigt = /erledigt/i.test(anfrage.zustand);

  return (
    <section
      className="rounded-lg border bg-flaeche p-4"
      style={{ borderColor: erledigt ? "var(--linie)" : "var(--gold)" }}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{anfrage.name || "ohne Namen"}</span>
          {/*
            Der Eingang steht so da, wie ihn die Anfragenliste fuehrt.
            Nicht als "vor drei Stunden" umgerechnet: Das Feld kommt je
            nach Quelle in verschiedenen Schreibweisen herein, und eine
            falsch gelesene Zeit waere schlimmer als gar keine.
          */}
          <span className="ml-3 text-xs text-leise">Eingang {anfrage.eingang}</span>
        </div>
        <span
          className="text-xs font-medium"
          style={{ color: erledigt ? "var(--gut)" : "var(--gold-dunkel)" }}
        >
          {anfrage.zustand}
        </span>
      </div>

      {/*
        Die Nummer zuerst und als Link: Auf dem Handy waehlt ein Tipp, am
        Rechner greift das Telefonprogramm. Ein Anruf klaert hier mehr
        als jede Rueckmail.
      */}
      <div className="flex flex-wrap gap-4 text-sm">
        {anfrage.telefon && (
          <a href={`tel:${anfrage.telefon.replace(/\s+/g, "")}`} className="font-medium underline">
            {anfrage.telefon}
          </a>
        )}
        {anfrage.email && (
          <a href={`mailto:${anfrage.email}`} className="underline">
            {anfrage.email}
          </a>
        )}
      </div>

      {anfrage.wunschdatum && (
        <p className="mt-2 text-sm">
          <span className="text-leise">Für </span>
          {anfrage.wunschdatum}
        </p>
      )}

      {anfrage.kommentar && (
        <p className="mt-2 whitespace-pre-wrap rounded-md border border-linie px-3 py-2 text-sm">
          {anfrage.kommentar}
        </p>
      )}

      <form action={barrierefreiSpeichern.bind(null, anfrage.schluessel)} className="mt-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-leise">Stand</span>
            <select
              name="status"
              defaultValue={anfrage.zustand}
              className="rounded-md border border-linie px-2 py-1.5 text-sm"
            >
              {BARRIEREFREI_STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-64 flex-1 text-xs">
            <span className="mb-1 block text-leise">Notiz, zum Beispiel welcher Platz</span>
            <input
              name="kommentar"
              defaultValue={anfrage.stand?.kommentar ?? ""}
              maxLength={300}
              placeholder="Reihe 1, Platz 2 und 3, Begleitung daneben"
              className="w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-md border border-gold bg-gold px-4 py-1.5 text-sm font-medium text-white hover:bg-gold-dunkel"
          >
            Speichern
          </button>
        </div>
      </form>

      {anfrage.stand?.geaendertVon && (
        <p className="mt-2 text-xs text-leise">
          Zuletzt {anfrage.stand.geaendertVon}
          {anfrage.stand.geaendertAm && `, ${vorZeit(anfrage.stand.geaendertAm)}`}
        </p>
      )}
    </section>
  );
}
