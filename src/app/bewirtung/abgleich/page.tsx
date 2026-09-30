import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { euro } from "@/lib/bewirtung/db";
import {
  ausgabenDesMonats,
  monatsstand,
  regeln,
  vorschlaegeFuerMonat,
  type Ausgabe,
  type Belegvorschlag,
} from "@/lib/bewirtung/abgleich";
import { konten } from "@/lib/rechnung/konten";
import { dateiEinlesen } from "@/app/rechnungen/aktionen";
import { loesen, ohneBeleg, regelSpeichern, regelWeg, zuordnen } from "./aktionen";

export const metadata = { title: "Belege abgleichen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/**
 * Zu welcher Abbuchung fehlt noch ein Beleg?
 *
 * Das Programm kennt beide Seiten und legt sie nebeneinander: die
 * Ausgaben vom Konto und die gescannten Belege. Stimmen Betrag und Datum,
 * schlägt es die Zuordnung vor, und ein Klick hakt sie ab. Übrig bleibt
 * genau das, was wirklich fehlt (Florian, 29.09.2026).
 *
 * Wiederkehrendes wie Löhne oder Strom braucht keinen Beleg. Dafür gibt
 * es Regeln auf den Namen, damit man das nicht jeden Monat neu abhakt.
 */
export default async function AbgleichSeite({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; meldung?: string; zeige?: string }>;
}) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { m, meldung, zeige } = await searchParams;

  const jetzt = new Date();
  const monat = /^\d{4}-\d{2}$/.test(m ?? "")
    ? m!
    : `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
  const [jahr, mm] = monat.split("-").map(Number);
  const vorher = `${mm === 1 ? jahr - 1 : jahr}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const danach = `${mm === 12 ? jahr + 1 : jahr}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;

  const [alle, vorschlaege, regelliste, kontenliste] = await Promise.all([
    ausgabenDesMonats(monat),
    vorschlaegeFuerMonat(monat),
    regeln(),
    konten(),
  ]);

  const stand = monatsstand(alle);
  const alleZeigen = zeige === "alle";
  const liste = alleZeigen ? alle : alle.filter((a) => a.stand === "offen" && !a.regel);
  const kontoName = (endetAuf: string) =>
    kontenliste.find((k) => k.endetAuf === endetAuf)?.bezeichnung || (endetAuf ? `Konto ${endetAuf}` : "");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Belege abgleichen</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Jede Ausgabe vom Konto braucht einen Beleg. Das Programm sucht zu jeder Abbuchung den
            passenden gescannten Beleg heraus, du bestätigst mit einem Klick. Übrig bleibt, was wirklich
            fehlt.
          </p>
        </div>
        <span className="flex gap-3 text-sm">
          <Link href={`/bewirtung/abgleich?m=${vorher}`} className="underline">
            Vormonat
          </Link>
          <Link href={`/bewirtung/abgleich?m=${danach}`} className="underline">
            Folgemonat
          </Link>
          <Link href="/bewirtung" className="underline">
            Zu den Belegen
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

      <section className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-linie bg-flaeche px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">
            {MONATE[mm - 1]} {jahr}
          </h2>
          <p className="text-sm text-leise">
            {stand.ausgaben} Ausgaben · {stand.mitBeleg} mit Beleg · {stand.keinBelegNoetig} brauchen keinen
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-semibold tabular-nums"
            style={{ color: stand.ohneBeleg > 0 ? "var(--warnung)" : "var(--gut)" }}
          >
            {stand.ohneBeleg}
          </div>
          <div className="text-xs text-leise">
            {stand.ohneBeleg === 1 ? "Beleg fehlt" : "Belege fehlen"}
            {stand.ohneBeleg > 0 && ` · ${euro(stand.summeOhneBelegCent)}`}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Die Kreditkartenabrechnung.

          Ueber die Bankschnittstelle gibt die Bank die Kartenumsaetze nicht
          heraus, gemessen am 29.09.2026. Deshalb kommt die Abrechnung einmal
          im Monat von Hand herein, und danach laeuft der Abgleich fuer die
          Karte genauso wie fuers Konto (Florian, 30.09.2026).
          --------------------------------------------------------------- */}
      {kontenliste.some((k) => k.art === "kreditkarte" && k.aktiv) && (
        <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Kreditkartenabrechnung hochladen</summary>
          <p className="mt-2 max-w-prose text-xs text-leise">
            Im OnlineBanking die Umsatzliste der Karte als CSV oder camt herunterladen und hier einlesen.
            Danach stehen die einzelnen Kartenzahlungen in dieser Liste und bekommen ihren Beleg, genau wie
            die Abbuchungen vom Konto.
          </p>
          <form action={dateiEinlesen} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="file" name="datei" accept=".csv,.xml,.sta,.txt,.mt940" required className="text-sm" />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Karte</span>
              <select name="konto" className="w-56" defaultValue={kontenliste.find((k) => k.art === "kreditkarte")?.endetAuf ?? ""}>
                {kontenliste
                  .filter((k) => k.aktiv)
                  .map((k) => (
                    <option key={k.endetAuf} value={k.endetAuf}>
                      {k.bezeichnung || "Konto"} ({k.endetAuf})
                    </option>
                  ))}
              </select>
            </label>
            <Absendeknopf text="Abrechnung einlesen" laeuftText="Wird gelesen..." />
          </form>
        </details>
      )}

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["", `Offen (${stand.ohneBeleg})`],
          ["alle", `Alle (${stand.ausgaben})`],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={`/bewirtung/abgleich?m=${monat}${wert ? `&zeige=${wert}` : ""}`}
            className={`rounded-md px-3 py-1.5 ${
              (zeige ?? "") === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          {alleZeigen
            ? "In diesem Monat gibt es keine Ausgaben."
            : "Alles belegt. Für jede Ausgabe dieses Monats liegt ein Beleg vor oder sie braucht keinen."}
        </p>
      ) : (
        <ul className="space-y-2">
          {liste.map((a) => (
            <Zeile
              key={a.id}
              a={a}
              monat={monat}
              vorschlaege={vorschlaege.get(a.id) ?? []}
              kontoName={kontoName(a.konto)}
            />
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------------
          Regeln: was nie einen Beleg braucht.
          --------------------------------------------------------------- */}
      <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Was nie einen Beleg braucht ({regelliste.length})
        </summary>
        <p className="mt-2 max-w-prose text-xs text-leise">
          Löhne, Miete, Steuern und Versicherungen belegen sich durch den Vertrag. Steht der Name hier,
          taucht die Abbuchung gar nicht mehr in der offenen Liste auf, auch nicht nächsten Monat.
        </p>

        <ul className="mt-3 space-y-1">
          {regelliste.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3">
              <strong>{r.muster}</strong>
              {r.grund && <span className="text-leise">{r.grund}</span>}
              <form action={regelWeg} className="ml-auto">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="monat" value={monat} />
                <button type="submit" className="text-xs text-leise underline">
                  löschen
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={regelSpeichern} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="monat" value={monat} />
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Teil des Empfängernamens</span>
            <input name="muster" placeholder="SWU Energie" className="w-56" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Warum kein Beleg?</span>
            <input name="grund" placeholder="Vertrag, monatliche Abschlagszahlung" className="w-72" />
          </label>
          <Absendeknopf text="Regel speichern" laeuftText="..." />
        </form>
      </details>
    </div>
  );
}

/** Eine Ausgabe mit ihren Vorschlägen. */
function Zeile({
  a,
  monat,
  vorschlaege,
  kontoName,
}: {
  a: Ausgabe;
  monat: string;
  vorschlaege: Belegvorschlag[];
  kontoName: string;
}) {
  const erledigt = a.stand !== "offen" || Boolean(a.regel);

  return (
    <li
      className="rounded-lg border px-4 py-3"
      style={{
        borderColor: erledigt ? "var(--linie)" : "var(--warnung)",
        background: erledigt ? "var(--flaeche)" : "var(--warnung-hell)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="w-20 tabular-nums text-sm">{datumDe(a.buchungstag)}</span>
        <span className="min-w-0 flex-1">
          <strong>{a.gegenname || "ohne Empfänger"}</strong>
          <span className="block truncate text-xs text-leise">{a.verwendungszweck}</span>
        </span>
        <span className="tabular-nums font-semibold">{euro(a.betragCent)}</span>
        {kontoName && <span className="text-xs text-leise">{kontoName}</span>}
      </div>

      {/* Schon erledigt: kurz sagen, wodurch. */}
      {a.stand === "beleg" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span style={{ color: "var(--gut)" }}>
            Beleg {a.belegNummer ?? ""} {a.belegGeschaeft ? `· ${a.belegGeschaeft}` : ""}
          </span>
          {a.belegId && (
            <Link href={`/bewirtung/${a.belegId}`} className="text-xs underline">
              ansehen
            </Link>
          )}
          <form action={loesen} className="ml-auto">
            <input type="hidden" name="umsatzId" value={a.id} />
            <input type="hidden" name="monat" value={monat} />
            <button type="submit" className="text-xs text-leise underline">
              doch nicht
            </button>
          </form>
        </div>
      )}

      {a.stand === "kein_beleg" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-leise">
          <span>Kein Beleg nötig{a.notiz ? `: ${a.notiz}` : ""}</span>
          <form action={loesen} className="ml-auto">
            <input type="hidden" name="umsatzId" value={a.id} />
            <input type="hidden" name="monat" value={monat} />
            <button type="submit" className="text-xs underline">
              doch nicht
            </button>
          </form>
        </div>
      )}

      {a.stand === "offen" && a.regel && (
        <div className="mt-2 text-sm text-leise">Braucht keinen Beleg ({a.regel})</div>
      )}

      {/* Noch offen: Vorschläge und die Handgriffe. */}
      {a.stand === "offen" && !a.regel && (
        <div className="mt-3 space-y-2">
          {vorschlaege.length > 0 ? (
            vorschlaege.map((v) => (
              <form
                key={v.belegId}
                action={zuordnen}
                className="flex flex-wrap items-center gap-3 rounded-md border border-linie bg-flaeche px-3 py-2 text-sm"
              >
                <input type="hidden" name="umsatzId" value={a.id} />
                <input type="hidden" name="belegId" value={v.belegId} />
                <input type="hidden" name="monat" value={monat} />
                <span className="min-w-0 flex-1">
                  <strong>{v.geschaeft || "Beleg"}</strong>{" "}
                  <span className="text-leise">
                    {v.nummer ? `${v.nummer}, ` : ""}
                    {v.datum ? datumDe(v.datum) : ""} · {euro(v.betragCent)}
                  </span>
                  <span className="block text-xs text-leise">{v.warum}</span>
                </span>
                <Absendeknopf text="Das ist er" laeuftText="..." />
              </form>
            ))
          ) : (
            <p className="text-xs text-leise">
              Kein passender Beleg gefunden. Entweder fehlt er noch, oder er ist noch nicht gescannt.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Link
              href="/bewirtung"
              className="rounded-md border border-linie px-3 py-1.5 text-xs hover:bg-gold-hell"
            >
              Beleg scannen
            </Link>
            <form action={ohneBeleg} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="umsatzId" value={a.id} />
              <input type="hidden" name="monat" value={monat} />
              <input
                name="grund"
                placeholder="braucht keinen Beleg, weil ..."
                className="w-64 text-sm"
              />
              <Absendeknopf text="Kein Beleg nötig" laeuftText="..." />
            </form>
          </div>
        </div>
      )}
    </li>
  );
}
