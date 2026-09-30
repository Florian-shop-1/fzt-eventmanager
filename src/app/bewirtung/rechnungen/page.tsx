import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { euro } from "@/lib/bewirtung/db";
import { gesellschaftKurz } from "@/lib/bewirtung/gesellschaft";
import {
  eingangsrechnungen,
  postlaufStand,
  rechnungsstand,
  type Eingangsrechnung,
} from "@/lib/bewirtung/eingangsrechnung";
import { RECHNUNGSPOSTFACH } from "@/lib/bewirtung/posteingang";
import { Absendeknopf } from "@/components/Absendeknopf";
import { postHolen } from "../aktionen";

export const metadata = { title: "Eingangsrechnungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const datumDe = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const zeitpunktDe = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  });

/**
 * Was das Haus schuldet, und was schon vom Konto abgegangen ist.
 *
 * Werners Arbeit auf einer Seite. Bisher hat er jede Kreditkartenzahlung
 * von Hand mit den Belegen verglichen und nebenher gemerkt, was noch offen
 * ist (Florian, 30.09.2026).
 *
 * Bezahlt heißt hier: Der Rechnung ist eine Abbuchung vom Konto zugeordnet.
 * Wo das noch nicht geschehen ist, führt der Weg direkt zum Abgleich.
 */
export default async function EingangsrechnungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ nur?: string; meldung?: string }>;
}) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { nur, meldung } = await searchParams;
  const auswahl = nur === "bezahlt" || nur === "alle" ? nur : "offen";

  const [alle, post] = await Promise.all([eingangsrechnungen(), postlaufStand()]);
  const stand = rechnungsstand(alle);
  const liste =
    auswahl === "offen"
      ? alle.filter((r) => !r.bezahltAm)
      : auswahl === "bezahlt"
        ? alle.filter((r) => r.bezahltAm)
        : alle;

  // Wie alt ist der letzte Postfachlauf? Ab anderthalb Tagen wird es auffällig.
  const stundenHer = post.zuletztAm
    ? Math.round((Date.now() - Date.parse(post.zuletztAm)) / 3600000)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eingangsrechnungen</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Was wir bezahlen müssen und was schon vom Konto abgegangen ist. Bezahlt ist, wozu im Abgleich
            eine Abbuchung gefunden wurde.
          </p>
        </div>
        <span className="flex flex-wrap gap-3 text-sm">
          <Link href="/bewirtung" className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell">
            Belege
          </Link>
          <Link
            href="/bewirtung/abgleich"
            className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
          >
            Abgleich
          </Link>
        </span>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {/* ---------------------------------------------------------------
          Der tägliche Postfachlauf. Steht oben, weil daran hängt, ob die
          Liste unten überhaupt vollständig ist.
          --------------------------------------------------------------- */}
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: post.fehlerAnzahl > 0 ? "var(--warnung)" : "var(--linie)",
          background: post.fehlerAnzahl > 0 ? "var(--warnung-hell)" : "var(--flaeche)",
        }}
      >
        <div>
          <strong className="font-medium">Postfach {RECHNUNGSPOSTFACH}</strong>
          <div className="text-leise">
            {post.zuletztAm ? (
              <>
                zuletzt {zeitpunktDe(post.zuletztAm)}
                {stundenHer !== null && stundenHer > 36 && " (das ist lange her)"} · {post.gesehen} Mails
                angesehen, {post.neu} neue Belege
                {post.ohneAnhang > 0 && `, ${post.ohneAnhang} ohne Rechnung im Anhang`}
              </>
            ) : (
              "noch nie abgeholt. Der tägliche Lauf ist für 6:15 Uhr eingerichtet."
            )}
          </div>
          {post.letzterFehler && (
            <div className="mt-1" style={{ color: "var(--warnung)" }}>
              {post.letzterFehler}
            </div>
          )}
        </div>
        <form action={postHolen}>
          <Absendeknopf text="Jetzt abholen" laeuftText="Wird geholt..." />
        </form>
      </section>

      <section className="flex flex-wrap gap-4">
        <Kachel
          zahl={String(stand.offen)}
          was="offen"
          hinweis={euro(stand.offenCent)}
          farbe={stand.offen > 0 ? "var(--warnung)" : undefined}
        />
        <Kachel
          zahl={String(stand.ueberfaellig)}
          was="überfällig"
          hinweis={stand.ueberfaellig > 0 ? euro(stand.ueberfaelligCent) : "nichts überfällig"}
          farbe={stand.ueberfaellig > 0 ? "var(--blocker)" : undefined}
        />
        <Kachel zahl={String(stand.bezahlt)} was="bezahlt" hinweis={euro(stand.bezahltCent)} />
        <Kachel
          zahl={String(stand.abweichungen)}
          was="Betrag weicht ab"
          hinweis="Beleg gegen Abbuchung"
          farbe={stand.abweichungen > 0 ? "var(--warnung)" : undefined}
        />
      </section>

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["offen", `Offen (${stand.offen})`],
          ["bezahlt", `Bezahlt (${stand.bezahlt})`],
          ["alle", `Alle (${alle.length})`],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={`/bewirtung/rechnungen?nur=${wert}`}
            className={`rounded-md px-3 py-1.5 ${
              auswahl === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          {auswahl === "offen"
            ? "Nichts offen. Zu jedem Beleg gibt es eine Abbuchung."
            : "Hier steht noch nichts."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Lieferant</th>
                <th className="px-4 py-2 font-medium">Datum</th>
                <th className="px-4 py-2 font-medium">Fällig</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
                <th className="px-4 py-2 font-medium">Bezahlt</th>
                <th className="px-4 py-2 font-medium">Firma</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <Zeile key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-leise">
        Eine Rechnung gilt als bezahlt, sobald ihr im Abgleich eine Abbuchung zugeordnet ist. Kommt die
        Zahlung über die Kreditkarte, lade die Abrechnung unter Zahlungseingängen hoch und wähle dabei das
        Kartenkonto aus; danach findet der Abgleich die Posten von selbst.
      </p>
    </div>
  );
}

function Zeile({ r }: { r: Eingangsrechnung }) {
  const abweichung =
    r.bezahltCent !== null && Math.abs(r.bezahltCent - r.betragCent) >= 100
      ? r.bezahltCent - r.betragCent
      : 0;

  return (
    <tr className="border-b border-linie last:border-0 align-top">
      <td className="px-4 py-3">
        <Link href={`/bewirtung/${r.id}`} className="font-medium underline">
          {r.lieferant || "ohne Namen"}
        </Link>
        <div className="text-xs text-leise">
          {r.nummer ?? "Entwurf"}
          {r.lieferantNummer && ` · ${r.lieferantNummer}`}
          {r.herkunft === "mail" && ` · aus dem Postfach${r.mailVon ? ` von ${r.mailVon}` : ""}`}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums">{datumDe(r.datum)}</td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
        {datumDe(r.faelligAm) || <span className="text-leise">offen</span>}
        {(r.tageUeberfaellig ?? 0) > 0 && (
          <div className="text-xs" style={{ color: "var(--blocker)" }}>
            {r.tageUeberfaellig} Tage überfällig
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{euro(r.betragCent)}</td>
      <td className="px-4 py-3">
        {r.bezahltAm ? (
          <>
            <span style={{ color: "var(--gut)" }}>{datumDe(r.bezahltAm)}</span>
            <div className="text-xs text-leise">
              {r.bezahltKonto ? `Konto ${r.bezahltKonto}` : "Konto unbekannt"}
            </div>
            {abweichung !== 0 && (
              <div className="text-xs" style={{ color: "var(--warnung)" }}>
                {abweichung > 0 ? "abgebucht wurden " : "abgebucht wurden nur "}
                {euro(r.bezahltCent ?? 0)}
              </div>
            )}
          </>
        ) : (
          <Link href="/bewirtung/abgleich" className="text-xs underline text-leise">
            noch offen
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-leise">{gesellschaftKurz(r.gesellschaft)}</td>
    </tr>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  farbe,
}: {
  zahl: string;
  was: string;
  hinweis: string;
  farbe?: string;
}) {
  return (
    <div
      className="min-w-44 rounded-lg border px-4 py-3"
      style={{ borderColor: farbe ?? "var(--linie)", background: "var(--flaeche)" }}
    >
      <div className="text-2xl font-semibold tabular-nums" style={farbe ? { color: farbe } : undefined}>
        {zahl}
      </div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
