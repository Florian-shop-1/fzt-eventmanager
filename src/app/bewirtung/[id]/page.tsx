import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { bewirtungLesen } from "@/lib/bewirtung/db";
import { Absendeknopf } from "@/components/Absendeknopf";
import { BewirtungsBlatt } from "@/components/BewirtungsBlatt";
import { DruckKnopf } from "@/components/DruckKnopf";
import { belegSpeichern, belegStornieren, belegVerwerfen } from "../aktionen";
import { KATEGORIEN } from "@/lib/bewirtung/lesen";

export const metadata = { title: "Bewirtungsbeleg | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const betrag = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default async function BelegSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meldung?: string }>;
}) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { id } = await params;
  const { meldung } = await searchParams;
  const b = await bewirtungLesen(id);
  if (!b) notFound();

  const l = b.lesung;
  const warnungen = [
    l && !l.beleg_ok && "Die KI war sich nicht sicher, ob das ein lesbarer Beleg ist.",
    l && !l.maschinell && b.art === "bewirtung" && "Der Beleg scheint handschriftlich zu sein. Das Finanzamt verlangt bei Bewirtungen in der Regel einen maschinellen Beleg.",
    l && l.maschinell && !l.tse_vorhanden && "Auf dem Beleg sind keine TSE-Angaben zu erkennen. Bitte prüfen, ob sie abgeschnitten sind.",
    l?.hinweis,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/bewirtung" className="text-sm text-leise underline">
            zurück zur Übersicht
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {b.status === "entwurf" ? "Beleg ergänzen" : `${b.art === "einkauf" ? "Einkauf" : "Bewirtung"} ${b.nummer}`}
            {b.status === "storniert" && <span style={{ color: "var(--blocker)" }}> (storniert)</span>}
          </h1>
        </div>
        {b.status !== "entwurf" && <DruckKnopf text="Drucken" hinweis="Beleg mit Foto" />}
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm print:hidden" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {b.status === "entwurf" ? (
        <div className="grid gap-6 md:grid-cols-2">
          {/*
            Welche Felder gelten, hängt an der Belegart. Umgeschaltet wird ohne
            Neuladen über :has(): Ist "Einkauf" gewählt, verschwinden Anlass und
            Teilnehmer, dafür kommen Kategorie und Zweck.
          */}
          <form action={belegSpeichern} className="group space-y-4">
            <input type="hidden" name="id" value={b.id} />

            {warnungen.length > 0 && (
              <ul className="space-y-1 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
                {warnungen.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 text-xs text-leise">Was für ein Beleg?</legend>
              {(["bewirtung", "einkauf"] as const).map((a) => (
                <label key={a} className="flex cursor-pointer items-center gap-2 rounded-lg border border-linie bg-flaeche px-4 py-2 has-[:checked]:border-gold has-[:checked]:bg-gold-hell">
                  <input type="radio" name="art" value={a} defaultChecked={b.art === a} />
                  <span className="text-sm font-medium">{a === "bewirtung" ? "Bewirtung (Restaurant)" : "Einkauf"}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border border-linie bg-flaeche p-4 group-has-[input[name=art][value=einkauf]:checked]:hidden">
              <legend className="px-1 text-sm font-semibold">Für das Finanzamt</legend>
              <Feld name="anlass" label="Anlass der Bewirtung" wert={b.anlass} pflicht mehrzeilig
                hinweis="Konkret, zum Beispiel: Besprechung Weihnachtsfeier Muster GmbH, Vertragsverhandlung Kooperation Hotel X" />
              <Feld name="teilnehmer" label="Bewirtete Personen, dich eingeschlossen" wert={b.teilnehmer || "Florian Zimmer"} pflicht mehrzeilig
                hinweis="Alle Namen, bei Geschäftspartnern mit Firma. Eine Person je Zeile." />
            </fieldset>

            <fieldset className="hidden space-y-3 rounded-lg border border-linie bg-flaeche p-4 group-has-[input[name=art][value=einkauf]:checked]:block">
              <legend className="px-1 text-sm font-semibold">Wofür?</legend>
              <Feld name="zweck" label="Was und wofür" wert={b.zweck} pflicht
                hinweis="Kurz, zum Beispiel: Farbe und Schrauben für Bühnenbau, Druckerpapier" />
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Kategorie</span>
                <select name="kategorie" defaultValue={b.kategorie || "Sonstiges"}>
                  {KATEGORIEN.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset
              className="space-y-2 rounded-lg border p-4"
              style={b.zahlweg ? { borderColor: "var(--linie)", background: "var(--flaeche)" } : { borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
            >
              <legend className="px-1 text-sm font-semibold">
                Bezahlt mit {!b.zahlweg && <span style={{ color: "var(--warnung)" }}>, steht nicht auf dem Beleg: Karte oder bar?</span>}
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["karte", "bar"] as const).map((z) => (
                  <label key={z} className="flex cursor-pointer items-center gap-2 rounded-lg border border-linie bg-flaeche px-4 py-2 has-[:checked]:border-gold has-[:checked]:bg-gold-hell">
                    <input type="radio" name="zahlweg" value={z} defaultChecked={b.zahlweg === z} />
                    <span className="text-sm font-medium">{z === "karte" ? "Karte" : "Bar"}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="privat" defaultChecked={b.privatAusgelegt} />
                Privat ausgelegt (mit eigenem Geld, die Firma erstattet)
              </label>
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border border-linie bg-flaeche p-4">
              <legend className="px-1 text-sm font-semibold">Vom Beleg {l ? "(von der KI gelesen, bitte prüfen)" : ""}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Feld name="restaurant" label="Restaurant bzw. Geschäft" wert={b.restaurant} pflicht />
                <Feld name="datum" label="Datum" wert={b.datum ?? ""} typ="date" pflicht />
              </div>
              <Feld name="anschrift" label="Anschrift" wert={b.anschrift} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Feld name="brutto" label="Betrag brutto €" wert={betrag(b.bruttoCent)} pflicht zahl />
                <Feld name="mwst7" label="USt 7 % €" wert={betrag(b.mwst7Cent)} zahl />
                <Feld name="mwst19" label="USt 19 % €" wert={betrag(b.mwst19Cent)} zahl />
                <Feld name="trinkgeld" label="Trinkgeld €" wert={betrag(b.trinkgeldCent)} zahl />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Feld name="zahlart" label="Zahlart laut Beleg" wert={b.zahlart} hinweis="zum Beispiel Girocard, Visa, Bar" />
                <Feld name="bewirtender" label="Bewirtende bzw. einkaufende Person" wert={b.bewirtender} />
              </div>
              <input type="hidden" name="ort" value={b.ortDerBewirtung} />
              <Feld name="notiz" label="Notiz (freiwillig)" wert={b.notiz} />
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" name="fertig" value="1" className="rounded-md px-4 py-2 font-semibold text-white" style={{ background: "var(--gold-dunkel)" }}>
                Festschreiben
              </button>
              <button type="submit" className="rounded-md border border-linie px-4 py-2 text-sm">
                Zwischenspeichern
              </button>
            </div>
            <p className="text-xs text-leise">
              Nach dem Festschreiben lässt sich der Beleg nicht mehr ändern, nur noch stornieren. So will es die GoBD.
            </p>
          </form>

          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/bewirtung/foto/${b.id}`} alt="Beleg" className="w-full rounded-lg border border-linie" />
            <form action={belegVerwerfen}>
              <input type="hidden" name="id" value={b.id} />
              <button type="submit" className="text-xs text-leise underline">
                Entwurf verwerfen (falsches Foto)
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <BewirtungsBlatt b={b} />
          {b.status === "fertig" && (
            <details className="text-sm print:hidden">
              <summary className="cursor-pointer text-leise underline">Beleg stornieren</summary>
              <form action={belegStornieren} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={b.id} />
                <input name="grund" required placeholder="Grund, zum Beispiel: doppelt erfasst, falscher Betrag" className="w-80" />
                <Absendeknopf text="Stornieren" laeuftText="..." />
              </form>
              <p className="mt-1 text-xs text-leise">
                Der Beleg bleibt erhalten und ist als storniert markiert. Bei einem Fehler danach neu scannen.
              </p>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Feld({
  name,
  label,
  wert,
  pflicht,
  mehrzeilig,
  typ = "text",
  zahl,
  hinweis,
}: {
  name: string;
  label: string;
  wert: string;
  pflicht?: boolean;
  mehrzeilig?: boolean;
  typ?: string;
  zahl?: boolean;
  hinweis?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-leise">
        {label}
        {pflicht && <span style={{ color: "var(--warnung)" }}> *</span>}
      </span>
      {mehrzeilig ? (
        <textarea name={name} defaultValue={wert} rows={3} />
      ) : (
        <input name={name} type={typ} defaultValue={wert} inputMode={zahl ? "decimal" : undefined} />
      )}
      {hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>}
    </label>
  );
}
