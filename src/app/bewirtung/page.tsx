import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { bewirtungenDesJahres, euro, nachZahlweg, summen, vorkommendeGesellschaften, type Bewirtung } from "@/lib/bewirtung/db";
import { BelegScanner } from "@/components/BelegScanner";
import {
  darfGesellschaftWaehlen,
  gesellschaftKurz,
  gesellschaftName,
  GESELLSCHAFTEN,
  type Gesellschaft,
} from "@/lib/bewirtung/gesellschaft";
import { Unterschriftsfeld } from "@/components/Unterschriftsfeld";
import { hinterlegteUnterschrift } from "@/lib/bewirtung/db";
import {
  alleBereitenFestschreiben,
  belegeMitAbbuchungFreigeben,
  eigeneRechnungenVerwerfen,
  postHolen,
  unterschriftSpeichern,
} from "./aktionen";
import { letztePost, RECHNUNGSPOSTFACH } from "@/lib/bewirtung/posteingang";
import { amazonEingerichtet } from "@/lib/amazon/api";
import { abgleichStand, gemerkteRechnungen } from "@/lib/amazon/sync";
import { amazonAbgleichen, amazonVerbindungPruefen } from "./amazon";
import { empfaengerAendern, monatSchicken } from "./versand";
import { empfaengerLesen, sendungenDesJahres, type Empfaenger, type Sendung } from "@/lib/bewirtung/steuerbuero";
import { Absendeknopf } from "@/components/Absendeknopf";

export const metadata = { title: "Belege | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function datumKurz(iso: string | null): string {
  if (!iso) return "ohne Datum";
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/**
 * Bewirtungsbelege: scannen, ergänzen, festschreiben, aufaddieren.
 * Nur Florian und die Buchhaltung (sein Vater).
 */
export default async function BewirtungSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) redirect("/");
  const { jahr: jahrRoh, meldung } = await searchParams;
  const diesesJahr = new Date().getFullYear();
  const jahr = Number(jahrRoh) >= 2020 && Number(jahrRoh) <= diesesJahr + 1 ? Number(jahrRoh) : diesesJahr;

  const alle = await bewirtungenDesJahres(jahr);
  const entwuerfe = alle.filter((x) => x.status === "entwurf");
  // Weitergeleitete Ausgangsrechnungen: erkennbar an uns selbst als Geschäft.
  const eigeneRechnungen = entwuerfe.filter((x) =>
    x.restaurant.toLowerCase().includes("florian zimmer theater"),
  ).length;
  const belege = alle.filter((x) => x.status !== "entwurf");

  /*
    Je Firma eine eigene Liste, niemals eine gemeinsame.

    Theater, Magic-Expert GbR und True Talent GmbH führen getrennte
    Bücher. Eine Summe über alle drei hätte niemand je gebraucht, wäre
    aber leicht mit der Zahl einer einzelnen Firma zu verwechseln
    (Florian, 29.09.2026). Deshalb gibt es sie hier gar nicht.
  */
  const firmen = vorkommendeGesellschaften(belege);
  const [empfaenger, sendungen, post] = await Promise.all([
    empfaengerLesen(),
    sendungenDesJahres(jahr),
    letztePost(8).catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Belege</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Beleg fotografieren, die KI erkennt Bewirtung oder Einkauf und liest alles aus. Du ergänzt
            nur, was fehlt, und schreibst fest. Alles wird aufaddiert und steht fürs Steuerbüro bereit.
          </p>
        </div>
        {/*
          Die Auswahl der Firma sieht nur, wer sie treffen darf. Für alle
          anderen bleibt der Knopf wie bisher (Florian, 28.09.2026).
        */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/bewirtung/rechnungen"
            className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
          >
            Eingangsrechnungen
          </Link>
          <Link
            href="/bewirtung/abgleich"
            className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
          >
            Belege abgleichen
          </Link>
          <BelegScanner
          gesellschaften={
            darfGesellschaftWaehlen(b)
              ? GESELLSCHAFTEN.map((g) => ({ wert: g.wert, name: g.name }))
              : undefined
          }
          />
        </div>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {/* ---------------------------------------------------------------
          Rechnungen direkt aus Amazon Business (Florian, 01.10.2026).
          --------------------------------------------------------------- */}
      <AmazonKasten />

      {/* ---------------------------------------------------------------
          Rechnungen, die per Mail hereinkommen (Florian, 29.09.2026).
          --------------------------------------------------------------- */}
      <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Rechnungen aus dem Postfach{post.length > 0 ? ` (zuletzt ${post.length})` : ""}
        </summary>
        <p className="mt-2 max-w-prose text-xs text-leise">
          Was an {RECHNUNGSPOSTFACH} geht, holt das Programm jeden Morgen ab: PDF lesen, Betrag und Datum
          übernehmen, als Entwurf anlegen. Das Postfach wird dabei nur gelesen, nichts beantwortet und
          nichts verschoben.
        </p>
        {/*
          Wie weit zurueck.

          Der taegliche Lauf schaut nur wenige Tage zurueck, das genuegt
          im Alltag. Wer aber merkt, dass eine aeltere Rechnung fehlt,
          soll sie holen koennen, ohne im Postfach zu suchen
          (Florian, 30.09.2026).
        */}
        <form action={postHolen} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Wie weit zurück?</span>
            <select name="tage" defaultValue="30" className="w-44">
              <option value="14">die letzten 14 Tage</option>
              <option value="30">die letzten 30 Tage</option>
              <option value="90">die letzten 3 Monate</option>
              <option value="180">das letzte halbe Jahr</option>
              <option value="365">das letzte Jahr</option>
            </select>
          </label>
          <Absendeknopf text="Jetzt abholen" laeuftText="Wird geholt..." />
        </form>
        {post.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {post.map((m) => (
              <li key={m.nachrichtId} className="flex flex-wrap gap-2">
                <span className="text-leise">
                  {m.empfangenAm
                    ? new Date(m.empfangenAm).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
                    : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.betreff || "(ohne Betreff)"}{" "}
                  <span className="text-leise">von {m.von}</span>
                </span>
                {m.belegId ? (
                  <Link href={`/bewirtung/${m.belegId}`} className="underline">
                    Beleg
                  </Link>
                ) : (
                  <span className="text-leise">
                    {m.stand === "kein_anhang" ? "keine Rechnung dabei" : m.stand}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>

      {entwuerfe.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Noch zu ergänzen ({entwuerfe.length})</h2>
            {/*
              Dreissig Rechnungen aus dem Postfach einzeln zu oeffnen ist
              eine halbe Stunde Klicken, und solange sie Entwuerfe sind,
              findet der Abgleich sie nicht (Florian, 30.09.2026).
            */}
            <div className="flex flex-wrap gap-2">
              {/*
                Der schnelle Weg zuerst: Wo die Abbuchung auf dem Konto
                steht, ist der Beleg belegt. Der andere Knopf bleibt fuer
                Belege ohne Kontobezug, etwa bar bezahlte.
              */}
              <form action={belegeMitAbbuchungFreigeben}>
                <Absendeknopf text="Mit Abbuchung freigeben" laeuftText="Wird freigegeben..." />
              </form>
              <form action={alleBereitenFestschreiben}>
                <button
                  type="submit"
                  className="rounded-lg border border-linie bg-flaeche px-4 py-2 text-sm font-medium"
                >
                  Alle vollständigen festschreiben
                </button>
              </form>
              {/*
                Unsere eigenen Ausgangsrechnungen sind keine Belege. Sie
                landen im Postfach, weil jemand sie weiterleitet, und
                warten sonst ewig auf eine Zuordnung, die nie kommt.
              */}
              {eigeneRechnungen > 0 && (
                <form action={eigeneRechnungenVerwerfen}>
                  <button type="submit" className="text-sm underline text-leise">
                    {eigeneRechnungen} eigene Rechnungen aus der Liste nehmen
                  </button>
                </form>
              )}
            </div>
          </div>
          <p className="max-w-prose text-xs text-leise">
            <strong>Mit Abbuchung freigeben</strong> nimmt jeden Beleg, zu dem genau eine Abbuchung mit
            demselben Betrag auf dem Konto steht: Das Geld ist weg, der Beleg liegt vor, das passt. Er wird
            festgeschrieben und gleich zugeordnet.{" "}
            <strong>Alle vollständigen festschreiben</strong> nimmt die übrigen, bei denen alle
            Pflichtangaben stehen, etwa bar bezahlte ohne Kontobezug. Unvollständiges und mögliche
            Doppelgänger bleiben in beiden Fällen stehen.
          </p>
          <ul className="space-y-1 text-sm">
            {entwuerfe.map((x) => (
              <li key={x.id}>
                <Link href={`/bewirtung/${x.id}`} className="underline">
                  {datumKurz(x.datum)} · {x.restaurant || "Restaurant unbekannt"} · {euro(x.bruttoCent)}
                </Link>
                {/* Zu welcher Firma der Beleg gehört, steht schon hier: Die
                    Zuordnung nachträglich zu ändern ist lästiger, als sie
                    gleich zu sehen (Florian, 29.09.2026). */}
                <span className="ml-2 rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--gold-hell)" }}>
                  {gesellschaftKurz(x.gesellschaft)}
                </span>
                <AmazonSchild herkunft={x.herkunft} />
                <span className="text-leise">
                  {" · "}
                  {!x.zahlweg
                    ? "Karte oder bar?"
                    : x.art === "einkauf"
                      ? x.zweck ? "bereit zum Festschreiben" : "wofür fehlt"
                      : !x.anlass ? "Anlass fehlt" : !x.teilnehmer ? "Teilnehmer fehlen" : "bereit zum Festschreiben"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Jahr {jahr}</h2>
          <nav className="flex gap-1 text-sm">
            {[diesesJahr - 1, diesesJahr].map((j) => (
              <Link
                key={j}
                href={`/bewirtung?jahr=${j}`}
                className={`rounded-md px-3 py-1.5 ${j === jahr ? "bg-text text-flaeche" : "border border-linie"}`}
              >
                {j}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {firmen.length === 0 ? (
        <p className="text-sm text-leise">In {jahr} gibt es noch keine festgeschriebenen Belege.</p>
      ) : (
        firmen.map((g) => (
          <Firmenjahr
            key={g}
            g={g}
            belege={belege.filter((x) => x.gesellschaft === g)}
            jahr={jahr}
            e={empfaenger.find((x) => x.gesellschaft === g)!}
            sendungen={sendungen.filter((x) => x.gesellschaft === g)}
          />
        ))
      )}

      <UnterschriftEinrichten />

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Was das Finanzamt verlangt und wie es hier gelöst ist</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-leise">
          <li>
            <strong className="text-text">Einkäufe</strong> (Baumarkt, Büro, Tanken ...): Beleg, kurz wofür, Karte oder
            bar. Voll als Betriebsausgabe abziehbar. Ab 250 Euro brauchen Rechnungen den Namen der Firma,
            dafür an der Kasse eine Rechnung auf Florian Zimmer Theater GmbH verlangen.
          </li>
          <li>
            <strong className="text-text">Privat ausgelegt:</strong> Hast du mit eigenem Geld bezahlt, wird das
            getrennt summiert. Das erstattet dir die Firma.
          </li>
          <li>
            <strong className="text-text">Maschineller Beleg</strong> des Restaurants mit Name und Anschrift, Datum,
            Speisen und Getränken einzeln, Betrag und Mehrwertsteuer. Seit 2018 mit Angaben der Kassen-TSE.
            Handschriftliche Quittungen reichen nur ausnahmsweise.
          </li>
          <li>
            <strong className="text-text">Ergänzt von dir:</strong> Anlass (konkret, etwa „Besprechung Firmenfeier
            Muster GmbH“, nicht nur „Geschäftsessen“) und alle Teilnehmer mit Namen, du selbst eingeschlossen.
            Das darf digital ergänzt werden. Ob eine Unterschrift bei digitalen Belegen zwingend ist, sehen
            Steuerberater unterschiedlich. Deshalb hinterlegst du sie hier einmal, und sie kommt automatisch auf
            jeden Bewirtungsbeleg. Festgehalten wird ohnehin, wer den Beleg erfasst und festgeschrieben hat.
          </li>
          <li>
            <strong className="text-text">Trinkgeld</strong> separat. Am besten lässt du es auf dem Beleg vermerken
            oder bezahlst es mit Karte.
          </li>
          <li>
            <strong className="text-text">Steuerlich:</strong> 70 % des Nettobetrags sind Betriebsausgabe, 30 % nicht.
            Die Vorsteuer ist voll abziehbar.
          </li>
          <li>
            <strong className="text-text">Aufbewahrung (GoBD):</strong> Festgeschriebene Belege lassen sich nicht mehr
            ändern oder löschen, nur mit Grund stornieren. Jedes Foto hat einen Fingerabdruck (SHA-256).
            Wird ein Beleg zweimal gescannt (gleiches Datum, gleicher Betrag), warnt die App.
            Ob das Papieroriginal danach weg darf (ersetzendes Scannen), stimmt bitte mit dem Steuerbüro ab.
            Bis dahin die Papierbelege aufheben.
          </li>
        </ul>
      </details>
    </div>
  );
}

/**
 * Ein Jahr einer einzigen Firma: Summen, dann die Monate.
 *
 * Alles, was hier steht, gehört zu dieser Gesellschaft. Deshalb trägt
 * auch jeder Download ihren Namen: Das Steuerbüro bekommt je Firma eine
 * eigene Datei (Florian, 29.09.2026).
 */
function Firmenjahr({
  g,
  belege,
  jahr,
  e: empf,
  sendungen,
}: {
  g: Gesellschaft;
  belege: Bewirtung[];
  jahr: number;
  e: Empfaenger;
  sendungen: Sendung[];
}) {
  const s = summen(belege, "bewirtung", g);
  const e = summen(belege, "einkauf", g);
  const zw = nachZahlweg(belege, g);

  const kategorien = new Map<string, number>();
  for (const x of belege) {
    if (x.status !== "fertig" || x.art !== "einkauf") continue;
    const k = x.kategorie || "Sonstiges";
    kategorien.set(k, (kategorien.get(k) ?? 0) + (x.bruttoCent ?? 0));
  }

  const jeMonat = new Map<number, Bewirtung[]>();
  for (const x of belege) {
    const m = x.datum ? Number(x.datum.slice(5, 7)) : 0;
    jeMonat.set(m, [...(jeMonat.get(m) ?? []), x]);
  }
  const monate = [...jeMonat.keys()].sort((a, c) => c - a);

  return (
    <section className="space-y-3 rounded-lg border border-linie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{gesellschaftName(g)}</h2>
        <span className="text-xs text-leise">
          {empf.email ? `Belege gehen an ${empf.name || empf.email}` : "Empfänger noch nicht eingetragen"}
        </span>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-leise">Bewirtungen</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kachel zahl={String(s.anzahl)} was={s.anzahl === 1 ? "Bewirtung" : "Bewirtungen"} />
        <Kachel zahl={euro(s.bruttoCent + s.trinkgeldCent)} was="ausgegeben" hinweis={`davon ${euro(s.trinkgeldCent)} Trinkgeld`} />
        <Kachel zahl={euro(s.vorsteuerCent)} was="Vorsteuer" hinweis="voll abziehbar" />
        <Kachel zahl={euro(s.abziehbarCent)} was="Betriebsausgabe" hinweis={`70 % von ${euro(s.nettoCent)} netto`} betont />
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-leise">Einkäufe</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kachel zahl={String(e.anzahl)} was={e.anzahl === 1 ? "Einkauf" : "Einkäufe"} />
        <Kachel zahl={euro(e.bruttoCent)} was="ausgegeben" />
        <Kachel zahl={euro(e.vorsteuerCent)} was="Vorsteuer" hinweis="voll abziehbar" />
        <Kachel zahl={euro(e.abziehbarCent)} was="Betriebsausgabe" hinweis="netto, voll abziehbar" betont />
      </div>
      {kategorien.size > 0 && (
        <p className="text-xs text-leise">
          {[...kategorien].sort((a, c) => c[1] - a[1]).map(([k, c]) => `${k} ${euro(c)}`).join(" · ")}
        </p>
      )}

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-leise">Bezahlt</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kachel zahl={euro(zw.karte)} was="mit Karte" />
        <Kachel zahl={euro(zw.bar)} was="bar" />
        <Kachel zahl={euro(zw.privat)} was="privat ausgelegt" hinweis="erstattet dir die Firma" />
      </div>

      {monate.map((m) => {
        const liste = jeMonat.get(m)!;
        const fertig = liste.filter((x) => x.status === "fertig");
        const schluessel = `${jahr}-${String(m).padStart(2, "0")}`;
        // Die jüngste Sendung dieses Monats. Sie steht unter der Liste,
        // damit niemand zweimal dasselbe schickt, ohne es zu merken.
        const gesendet = sendungen.find((x) => x.monat === schluessel);
        return (
          <div key={m} className="space-y-2 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linie pb-1">
              <h4 className="font-semibold">
                {m ? MONATE[m - 1] : "ohne Datum"}{" "}
                <span className="font-normal text-leise">
                  · {fertig.length === 1 ? "1 Beleg" : `${fertig.length} Belege`} ·{" "}
                  {euro(fertig.reduce((n, x) => n + (x.bruttoCent ?? 0) + x.trinkgeldCent, 0))}
                </span>
              </h4>
              {m > 0 && (
                <span className="flex flex-wrap items-center gap-3 text-xs">
                  <Link href={`/bewirtung/monat?m=${schluessel}`} className="underline">
                    ansehen
                  </Link>
                  <a href={`/bewirtung/pdf?m=${schluessel}&g=${g}`} target="_blank" rel="noreferrer" className="underline">
                    PDF
                  </a>
                  <a href={`/bewirtung/export?m=${schluessel}&g=${g}`} className="underline">
                    CSV
                  </a>
                  {empf.email && (
                    <form action={monatSchicken} className="inline">
                      <input type="hidden" name="gesellschaft" value={g} />
                      <input type="hidden" name="monat" value={schluessel} />
                      <Absendeknopf
                        text={gesendet ? "noch einmal schicken" : `an ${empf.name || empf.email} schicken`}
                        laeuftText="wird verschickt..."
                      />
                    </form>
                  )}
                </span>
              )}
            </div>
            <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche">
              {liste.map((x) => (
                <li key={x.id}>
                  <Link href={`/bewirtung/${x.id}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-sm hover:bg-gold-hell">
                    <span className="w-24 font-mono text-xs text-leise">{x.nummer}</span>
                    <span className="w-20 tabular-nums">{datumKurz(x.datum)}</span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="mr-2 rounded px-1.5 py-0.5 text-[11px]"
                        style={{ background: x.art === "einkauf" ? "var(--info-hell)" : "var(--gold-hell)" }}
                      >
                        {x.art === "einkauf" ? "Einkauf" : "Bewirtung"}
                      </span>
                      <AmazonSchild herkunft={x.herkunft} />
                      <strong>{x.restaurant}</strong>
                      <span className="text-leise"> · {x.art === "einkauf" ? x.zweck : x.anlass}</span>
                      <span className="text-leise"> · {x.zahlweg === "bar" ? "bar" : "Karte"}{x.privatAusgelegt ? ", privat" : ""}</span>
                    </span>
                    <span className={`tabular-nums ${x.status === "storniert" ? "line-through text-leise" : ""}`}>
                      {euro((x.bruttoCent ?? 0) + x.trinkgeldCent)}
                    </span>
                    {x.status === "storniert" && <span className="text-xs" style={{ color: "var(--blocker)" }}>storniert</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {gesendet && (
              <p className="text-xs text-leise">
                Verschickt am{" "}
                {new Date(gesendet.versendetAm).toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                  dateStyle: "short",
                  timeStyle: "short",
                })}{" "}
                an {gesendet.versendetAn} ({gesendet.anzahl} Belege, {euro(gesendet.summeCent)})
              </p>
            )}
          </div>
        );
      })}

      <details className="pt-2">
        <summary className="cursor-pointer text-xs text-leise">Wer die Belege dieser Firma bekommt</summary>
        <form action={empfaengerAendern} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="gesellschaft" value={g} />
          <input type="hidden" name="jahr" value={jahr} />
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Name</span>
            <input name="name" defaultValue={empf.name} className="w-56" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Mailadresse</span>
            <input
              name="email"
              type="email"
              defaultValue={empf.email}
              placeholder="noch nicht eingetragen"
              className="w-64"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Stille Kopie an (freiwillig)</span>
            <input name="kopieAn" type="email" defaultValue={empf.kopieAn} className="w-64" />
          </label>
          <Absendeknopf text="Speichern" laeuftText="..." />
        </form>
      </details>
    </section>
  );
}

function Kachel({ zahl, was, hinweis, betont }: { zahl: string; was: string; hinweis?: string; betont?: boolean }) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ borderColor: betont ? "var(--gold)" : "var(--linie)", background: betont ? "var(--gold-hell)" : "var(--flaeche)" }}
    >
      <div className="text-xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      {hinweis && <div className="text-xs text-leise">{hinweis}</div>}
    </div>
  );
}

/** Unterschrift einmal hinterlegen. Sie kommt dann auf jede Bewirtung. */
async function UnterschriftEinrichten() {
  const u = await hinterlegteUnterschrift();
  return (
    <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Unterschrift {u.png ? "hinterlegt" : "hinterlegen"}
        {!u.png && <span className="text-leise"> (dann musst du nie wieder unterschreiben)</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-leise">
          Einmal zeichnen, fertig. Sie wird beim Festschreiben automatisch auf jeden Bewirtungsbeleg gesetzt.
          Bei einem einzelnen Beleg kannst du trotzdem abweichend unterschreiben.
        </p>
        {u.png && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u.png} alt="Hinterlegte Unterschrift" className="h-16 border-b border-text" />
            <p className="mt-1 text-xs text-leise">
              hinterlegt von {u.von} am {u.am ? new Date(u.am).toLocaleDateString("de-DE") : ""}
            </p>
          </div>
        )}
        <form action={unterschriftSpeichern} className="space-y-2">
          <Unterschriftsfeld name="unterschrift" />
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--gold-dunkel)" }}>
            {u.png ? "Neue Unterschrift hinterlegen" : "Unterschrift hinterlegen"}
          </button>
        </form>
        {u.png && (
          <form action={unterschriftSpeichern}>
            <input type="hidden" name="loeschen" value="1" />
            <button type="submit" className="text-xs text-leise underline">
              hinterlegte Unterschrift löschen
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

/**
 * Woher der Beleg kommt, wenn er nicht von Hand kam.
 *
 * "So kann ich sofort erkennen, dass der Beleg nicht manuell hochgeladen
 * oder gescannt wurde" (Florian, 01.10.2026).
 */
function AmazonSchild({ herkunft }: { herkunft: string }) {
  if (herkunft !== "amazon_business") return null;
  return (
    <span
      className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--info-hell)", color: "var(--info)" }}
      title="Automatisch von Amazon Business importiert"
    >
      Amazon Business
    </span>
  );
}

/**
 * Amazon Business: verbinden und abgleichen.
 *
 * Steht hier und nicht in einem eigenen Bereich, weil die Rechnungen
 * hier landen. Was noch kein PDF hat, steht als "wartet auf das PDF" da;
 * Amazon stellt es manchmal erst Tage nach der Lieferung bereit.
 */
async function AmazonKasten() {
  const [stand, zugang, offene] = await Promise.all([
    abgleichStand(),
    Promise.resolve(amazonEingerichtet()),
    gemerkteRechnungen(12),
  ]);
  const wartend = offene.filter((r) => r.stand === "offen");

  return (
    <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Rechnungen von Amazon Business
        {wartend.length > 0 ? ` (${wartend.length} warten auf das PDF)` : ""}
      </summary>

      <p className="mt-2 max-w-prose text-xs text-leise">
        Holt die Rechnungen aus dem Amazon-Business-Konto und legt sie hier als Entwürfe ab, mit
        Bestellnummer, Rechnungsnummer, Netto, Steuer und dem Original-PDF. Eine Bestellung kann mehrere
        Rechnungen haben, jede wird einzeln geholt. Gelesen wird nur, es wird nichts bestellt.
      </p>

      {zugang.bereit ? (
        <p className="mt-2 text-xs" style={{ color: "var(--gut)" }}>
          Verbunden.
          {stand.zuletztAm
            ? ` Zuletzt abgeglichen am ${new Date(stand.zuletztAm).toLocaleString("de-DE", {
                timeZone: "Europe/Berlin",
                dateStyle: "short",
                timeStyle: "short",
              })} Uhr, ${stand.zuletztNeu} neue Rechnungen.`
            : " Der Abgleich lief noch nie."}
        </p>
      ) : (
        <p className="mt-2 text-xs" style={{ color: "var(--warnung)" }}>
          Noch nicht verbunden. Bei Vercel fehlen: {zugang.fehlt.join(", ")}.
        </p>
      )}

      {stand.zuletztFehler && (
        <p className="mt-1 text-xs" style={{ color: "var(--blocker)" }}>
          Letzter Fehler: {stand.zuletztFehler}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={amazonVerbindungPruefen}>
          <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
            Amazon Business verbinden
          </button>
        </form>
        <form action={amazonAbgleichen}>
          <Absendeknopf text="Amazon Rechnungen synchronisieren" laeuftText="Wird geholt..." />
        </form>
      </div>

      {offene.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {offene.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-2">
              <span className="text-leise tabular-nums">
                {r.rechnungsdatum ? datumKurz(r.rechnungsdatum) : "ohne Datum"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {r.dokumenttyp === "gutschrift" ? "Gutschrift" : "Rechnung"} {r.rechnungsnummer}
                <span className="text-leise"> · Bestellung {r.orderId || "unbekannt"}</span>
              </span>
              <span className="tabular-nums">{euro(r.bruttoCent)}</span>
              {r.belegId ? (
                <Link href={`/bewirtung/${r.belegId}`} className="underline">
                  Beleg
                </Link>
              ) : (
                <span style={{ color: r.stand === "fehler" ? "var(--blocker)" : "var(--warnung)" }}>
                  {r.stand === "fehler" ? r.letzterFehler.slice(0, 80) : "Amazon-PDF noch ausstehend"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
