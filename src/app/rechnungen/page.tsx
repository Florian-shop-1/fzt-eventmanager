import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { alleRechnungen, einstellung } from "@/lib/rechnung/db";
import { StatusSchild, euro, faelligText, tagKurz } from "@/components/RechnungStatus";
import { Absendeknopf } from "@/components/Absendeknopf";
import { handRechnungErstellen, zahlungszielSpeichern } from "./aktionen";

export const metadata = { title: "Rechnungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Alle Rechnungen mit ihrem Stand.
 *
 * Eine Zeile je Rechnung, und in der Zeile steht alles, was man im Alltag
 * wissen will: Wer, wie viel, ob die Mail raus ist, wann sie fällig ist
 * und was davon bezahlt wurde. Der Rest steht auf der Detailseite.
 */
const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export default async function RechnungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; nur?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b)) redirect("/");
  const { meldung, nur } = await searchParams;

  const [alle, e] = await Promise.all([alleRechnungen(), einstellung()]);
  const offen = alle.filter((r) => !["PAID", "CANCELLED"].includes(r.status));
  const offenSumme = offen.reduce((n, r) => n + r.offenCent, 0);
  const ueberfaellig = offen.filter((r) => r.status === "OVERDUE");
  const verzugSumme = ueberfaellig.reduce((n, r) => n + r.offenCent, 0);
  const bezahlt = alle.filter((r) => r.status === "PAID");
  const nochOffen = offen.filter((r) => r.status !== "OVERDUE");

  const liste =
    nur === "verzug"
      ? ueberfaellig
      : nur === "offen"
        ? offen
        : nur === "bezahlt"
          ? bezahlt
          : alle;

  /*
    Wie alt ist der Blick aufs Konto?

    Eine Rechnung gilt erst als bezahlt, wenn die Zahlung vom Konto
    zugeordnet wurde. Laeuft der Abruf nicht mehr, steht hier tagelang
    "offen", obwohl das Geld da ist, und niemand wuesste, woran es liegt
    (Florian, 30.09.2026).
  */
  const abgleichAlter = e.zuletztAm
    ? Math.floor((Date.now() - Date.parse(e.zuletztAm)) / 86400000)
    : null;
  const abgleichAlt = abgleichAlter === null || abgleichAlter >= 2;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rechnungen</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Was gestellt, versendet, fällig und bezahlt ist. Zahlungen vom Konto ordnet das Programm selbst zu,
            sobald die Rechnungsnummer im Verwendungszweck steht und der Betrag passt.
          </p>
        </div>
        <Link
          href="/zahlungseingaenge"
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
        >
          Zahlungseingänge
        </Link>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {/*
        Der Stand auf einen Blick, in Farben, die man nicht uebersieht.

        "das machst du sehr plakativ" (Florian, 30.09.2026). Wer Geld
        hereinbekommen will, schaut hierher und nirgendwo sonst: Rot heisst
        hinterher, Blau heisst warten, Gruen heisst erledigt. Jede Kachel
        ist zugleich der Filter darunter.
      */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kachel
          href="/rechnungen?nur=verzug"
          zahl={String(ueberfaellig.length)}
          was="in Verzug"
          hinweis={ueberfaellig.length > 0 ? `${euro(verzugSumme)} überfällig` : "nichts überfällig"}
          farbe={ueberfaellig.length > 0 ? "blocker" : "gut"}
        />
        <Kachel
          href="/rechnungen?nur=offen"
          zahl={String(nochOffen.length)}
          was="noch offen"
          hinweis={offenSumme > 0 ? `${euro(offenSumme)} insgesamt offen` : "alles bezahlt"}
          farbe={nochOffen.length > 0 ? "info" : "gut"}
        />
        <Kachel
          href="/rechnungen?nur=bezahlt"
          zahl={String(bezahlt.length)}
          was="bezahlt"
          hinweis={`von ${alle.length} insgesamt`}
          farbe="gut"
        />
        <Kachel
          zahl={abgleichAlter === null ? "nie" : abgleichAlter === 0 ? "heute" : `vor ${abgleichAlter} Tagen`}
          was="Konto abgeglichen"
          hinweis={e.zuletztAm ? `${e.zuletztUmsaetze} neue Umsätze` : "der Abruf lief noch nie"}
          farbe={abgleichAlt ? "warnung" : "neutral"}
        />
      </div>

      {/*
        Eine Rechnung, die nicht aus einem Angebot kommt.

        "bei ausgangsrechnung soll es möglich sein, dass wir eine von hand
        erstellen" (Florian, 01.10.2026). Sie bekommt dieselbe Nummer aus
        demselben Kreis und denselben Hausbrief; danach läuft sie den
        gewohnten Weg mit Versand, Zahlungsabgleich und Erinnerung.
      */}
      <details className="rounded-lg border border-linie bg-flaeche p-5">
        <summary className="cursor-pointer font-semibold">Rechnung von Hand schreiben</summary>
        <form action={handRechnungErstellen} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Kunde (Rechnungsempfänger)</span>
              <input name="kunde" required maxLength={200} placeholder="Muster GmbH" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Ansprechpartner</span>
              <input name="ansprechpartner" maxLength={120} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">E-Mail</span>
              <input name="email" type="email" maxLength={200} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Straße</span>
              <input name="strasse" maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">PLZ</span>
              <input name="plz" maxLength={10} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Ort</span>
              <input name="ort" maxLength={120} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-leise">Leistung (Überschrift auf der Rechnung)</span>
              <input name="leistung" maxLength={300} placeholder="Technikgestellung" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Leistungszeitraum</span>
              <input name="leistungszeitraum" maxLength={100} placeholder="September 2026" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Rechnungsdatum</span>
              <input type="date" name="rechnungsdatum" defaultValue={heuteIso()} />
            </label>
          </div>

          <div>
            <div className="mb-1 text-xs text-leise">Positionen (Preise brutto)</div>
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-12">
                  <input
                    name={`bezeichnung${i}`}
                    maxLength={200}
                    placeholder={i === 0 ? "Bezeichnung" : ""}
                    className="sm:col-span-5"
                  />
                  <input name={`menge${i}`} inputMode="decimal" placeholder="Menge" defaultValue={i === 0 ? "1" : ""} className="sm:col-span-2" />
                  <input name={`einheit${i}`} maxLength={20} placeholder="Einheit" className="sm:col-span-2" />
                  <input name={`preis${i}`} inputMode="decimal" placeholder="Preis €" className="sm:col-span-2" />
                  <select name={`ust${i}`} defaultValue="19" className="sm:col-span-1">
                    <option value="19">19 %</option>
                    <option value="7">7 %</option>
                    <option value="0">0 %</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Zahlungsziel in Tagen</span>
              <input name="zahlungsziel" inputMode="numeric" defaultValue={String(e.zahlungszielTage)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-leise">Notiz (nur für uns)</span>
              <input name="notiz" maxLength={300} />
            </label>
          </div>

          <Absendeknopf text="Rechnung anlegen" laeuftText="Wird angelegt..." />
        </form>
      </details>

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["", "Alle"],
          ["verzug", "In Verzug"],
          ["offen", "Offen"],
          ["bezahlt", "Bezahlt"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={wert ? `/rechnungen?nur=${wert}` : "/rechnungen"}
            className={`rounded-md px-3 py-1.5 ${
              (nur ?? "") === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Hier steht noch keine Rechnung. Sobald eine erstellt wird, erscheint sie mit ihrem Stand.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Rechnung</th>
                <th className="px-4 py-2 font-medium">Kunde</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
                <th className="px-4 py-2 font-medium">Versand</th>
                <th className="px-4 py-2 font-medium">Fällig</th>
                <th className="px-4 py-2 font-medium">Zahlung</th>
                <th className="px-4 py-2 font-medium">Stand</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                /*
                  Der Streifen links traegt die Farbe des Standes, und eine
                  ueberfaellige Rechnung bekommt zusaetzlich einen roten
                  Grund. So sieht man beim Ueberfliegen, wo es klemmt, ohne
                  die Schilder rechts zu lesen.
                */
                <tr
                  key={r.id}
                  className="border-b border-linie last:border-0 align-top"
                  style={{
                    borderLeft: `5px solid ${zeilenfarbe(r.status)}`,
                    background: r.status === "OVERDUE" ? "var(--blocker-hell)" : undefined,
                  }}
                >
                  <td className="px-4 py-3">
                    <Link href={`/rechnungen/${r.id}`} className="font-medium underline">
                      {r.nummer}
                    </Link>
                    <div className="text-xs text-leise">{tagKurz(r.rechnungsdatum)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.kunde}
                    {r.kundeEmail && <div className="text-xs text-leise">{r.kundeEmail}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {euro(r.betragCent)}
                    {r.bezahltCent > 0 && r.offenCent > 0 && (
                      <div className="text-xs text-leise">offen {euro(r.offenCent)}</div>
                    )}
                    {r.ueberzahlungCent && (
                      <div className="text-xs" style={{ color: "var(--warnung)" }}>
                        Überzahlung {euro(r.ueberzahlungCent)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.mailStatus === "gesendet" ? (
                      <>
                        <span style={{ color: "var(--gut)" }}>versendet</span>
                        <div className="text-xs text-leise">
                          {r.versendetAm ? tagKurz(r.versendetAm) : ""} {r.versendetAn ? `· ${r.versendetAn}` : ""}
                        </div>
                      </>
                    ) : r.mailStatus === "fehlgeschlagen" ? (
                      <span style={{ color: "var(--blocker)" }}>Versand fehlgeschlagen</span>
                    ) : (
                      <span className="text-leise">noch nicht versendet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {tagKurz(r.faelligAm)}
                    <div
                      className="text-xs"
                      style={{ color: r.status === "OVERDUE" ? "var(--blocker)" : "var(--text-leise)" }}
                    >
                      {faelligText(r)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.zahlungen.length === 0 ? (
                      <span className="text-leise">-</span>
                    ) : (
                      r.zahlungen.map((z) => (
                        <div key={z.id} className="text-xs">
                          {tagKurz(z.datum)} · {euro(z.betragCent)}
                          <span className="text-leise">
                            {" "}
                            {z.herkunft === "automatisch" ? "(Bank)" : "(manuell)"}
                          </span>
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSchild status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Einstellungen</summary>
        <form action={zahlungszielSpeichern} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Standard-Zahlungsziel in Tagen</span>
            <input name="tage" type="number" min={0} max={90} defaultValue={e.zahlungszielTage} className="w-28" />
          </label>
          <Absendeknopf text="Speichern" laeuftText="..." />
        </form>
        <p className="mt-3 text-xs text-leise">
          Konto für den Abgleich: {e.bank}, endet auf {e.kontoEndetAuf} ({e.bic}). Die vollständige IBAN und die
          Zugangsdaten stehen nicht im Programm, sondern nur auf dem Rechner, der die Umsätze abholt.
        </p>
      </details>
    </div>
  );
}

/** Die Farbe des Standes, fuer den Streifen links an der Zeile. */
function zeilenfarbe(status: string): string {
  if (status === "OVERDUE") return "var(--blocker)";
  if (status === "PAID") return "var(--gut)";
  if (status === "PARTIALLY_PAID") return "var(--warnung)";
  if (status === "CANCELLED" || status === "DRAFT") return "var(--linie)";
  return "var(--info)";
}

/**
 * Eine Kennzahl, gross und in der Farbe ihrer Bedeutung.
 *
 * Rot heisst hinterher, Blau heisst warten, Gruen heisst erledigt, Gelb
 * heisst hinsehen. Das Wort steht immer dabei: Wer Farben schlecht
 * unterscheidet, liest dasselbe (Florian, 30.09.2026).
 */
const KACHELFARBEN = {
  blocker: { rand: "var(--blocker)", flaeche: "var(--blocker-hell)", schrift: "var(--blocker)" },
  info: { rand: "var(--info)", flaeche: "var(--info-hell)", schrift: "var(--info)" },
  gut: { rand: "var(--gut)", flaeche: "var(--gut-hell)", schrift: "var(--gut)" },
  warnung: { rand: "var(--warnung)", flaeche: "var(--warnung-hell)", schrift: "var(--warnung)" },
  neutral: { rand: "var(--linie)", flaeche: "var(--flaeche)", schrift: "var(--text)" },
} as const;

function Kachel({
  zahl,
  was,
  hinweis,
  farbe = "neutral",
  href,
}: {
  zahl: string;
  was: string;
  hinweis: string;
  farbe?: keyof typeof KACHELFARBEN;
  href?: string;
}) {
  const f = KACHELFARBEN[farbe];
  const inhalt = (
    <>
      <div className="text-4xl font-semibold tabular-nums" style={{ color: f.schrift }}>
        {zahl}
      </div>
      <div className="mt-1 text-sm font-semibold uppercase tracking-wide" style={{ color: f.schrift }}>
        {was}
      </div>
      <div className="mt-0.5 text-xs text-leise">{hinweis}</div>
    </>
  );

  const stil = {
    borderColor: f.rand,
    background: f.flaeche,
    borderWidth: 2,
  } as const;

  return href ? (
    <Link href={href} className="block rounded-xl border px-5 py-4 transition hover:brightness-95" style={stil}>
      {inhalt}
    </Link>
  ) : (
    <div className="rounded-xl border px-5 py-4" style={stil}>
      {inhalt}
    </div>
  );
}
