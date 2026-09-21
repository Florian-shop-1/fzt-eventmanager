import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  ABSTELLORT,
  artikelListe,
  bestellungen,
  einstellungLesen,
  euro,
  leihArtikel,
  leihen,
  mitAufschlag,
  summe,
  zugang,
  type WeinBestellung,
} from "@/lib/wein/db";
import {
  absenderSpeichern,
  alsUebergebenMarkieren,
  bestellen,
  bestellungStornieren,
  freischalten,
  leiheDochBerechnen,
  leiheEntfernen,
  leiheErfassen,
  leiheZurueckgebracht,
  meldenSpeichern,
  preiseSpeichern,
  rechnungEinstellungSpeichern,
  rechnungJetzt,
} from "./aktionen";
import { lexofficeEingerichtet } from "@/lib/lexoffice/client";
import { fehlendePflichtangaben, monatsPositionen, rechnungDesMonats, rechnungsEinstellung } from "@/lib/wein/rechnung";

export const metadata = { title: "Bestellungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const zeit = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const betrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * Magicuvée-Bestellungen der Gastronomie.
 * Die Gastro bestellt, das Theater übergibt, einmal im Monat wird abgerechnet.
 */
export default async function BestellungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; monat?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.sehen) redirect("/");
  const { meldung, monat } = await searchParams;

  const artikel = await artikelListe(!z.verwalten);
  const alle = await bestellungen({ bestellerId: z.uebergeben ? undefined : b.id });
  const offen = alle.filter((x) => x.status === "offen");
  const erledigt = alle.filter((x) => x.status !== "offen").slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bestellungen</h1>
        <p className="mt-1 text-sm text-leise">
          Magicuvée für die Gastronomie. Einfach die Menge wählen und bestellen. Die Übergabe wird
          vermerkt, abgerechnet wird einmal im Monat.
        </p>
      </header>

      {z.verwalten && !z.freigegeben && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          <strong>Vorschau, nur für dich sichtbar.</strong> Die Gastro sieht den Bereich erst, wenn du unten
          auf „Freischalten“ drückst.
        </div>
      )}

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </div>
      )}

      {z.bestellen && (
        <form action={bestellen} className="space-y-4 rounded-lg border border-linie bg-flaeche p-5">
          <h2 className="text-lg font-semibold">Neue Bestellung</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {artikel.filter((a) => a.aktiv).map((a) => (
              <label key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-linie px-4 py-3">
                <span>
                  <span className="block font-medium">{a.name}</span>
                  <span className="text-xs text-leise">{euro(a.ekCent)} je Flasche</span>
                </span>
                <input
                  name={`menge:${a.id}`}
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={0}
                  inputMode="numeric"
                  className="w-20 text-center text-lg"
                  aria-label={`Anzahl ${a.name}`}
                />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Notiz (freiwillig), zum Beispiel „bis Freitag“ oder „für Tisch 12“</span>
            <input name="notiz" maxLength={300} />
          </label>
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gut-hell)", color: "var(--gut)" }}>
            Die Lieferung wird im {ABSTELLORT} bereitgestellt.
          </p>
          <Absendeknopf text="Bestellen" laeuftText="Wird bestellt..." />
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Offen {offen.length > 0 && <span className="text-leise">({offen.length})</span>}
        </h2>
        {offen.length === 0 ? (
          <p className="text-sm text-leise">Keine offenen Bestellungen.</p>
        ) : (
          <ul className="space-y-2">
            {offen.map((x) => (
              <BestellKarte key={x.id} x={x} uebergeben={z.uebergeben} darfZurueck />
            ))}
          </ul>
        )}
      </section>

      {erledigt.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Zuletzt erledigt</h2>
          <ul className="space-y-2">
            {erledigt.map((x) => (
              <BestellKarte key={x.id} x={x} uebergeben={false} darfZurueck={false} />
            ))}
          </ul>
        </section>
      )}

      {z.uebergeben && <Leihware darfLoeschen={z.verwalten} />}

      {z.verwalten && <Abrechnung monat={monat} />}
      {z.verwalten && <Einrichtung freigegeben={z.freigegeben} />}
    </div>
  );
}

function BestellKarte({ x, uebergeben, darfZurueck }: { x: WeinBestellung; uebergeben: boolean; darfZurueck: boolean }) {
  const farbe = x.status === "offen" ? "var(--warnung)" : x.status === "uebergeben" ? "var(--gut)" : "var(--linie)";
  return (
    <li className="rounded-lg border bg-flaeche px-4 py-3" style={{ borderColor: farbe }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {x.positionen.map((p) => `${p.menge} × ${p.name}`).join(", ")}
        </span>
        <span className="text-sm tabular-nums">{euro(summe(x.positionen))}</span>
      </div>
      <div className="mt-1 text-xs text-leise">
        bestellt von {x.bestellerName} am {zeit(x.erstelltAm)}
        {x.notiz && ` · ${x.notiz}`}
        {x.status === "uebergeben" && x.uebergebenAm && ` · abgestellt am ${zeit(x.uebergebenAm)} von ${x.uebergebenVon}`}
        {x.status === "storniert" && " · zurückgezogen"}
      </div>
      {(uebergeben || darfZurueck) && x.status === "offen" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {uebergeben && (
            <form action={alsUebergebenMarkieren}>
              <input type="hidden" name="id" value={x.id} />
              <Absendeknopf text="Abgestellt bei den Kühlhäusern" laeuftText="..." />
            </form>
          )}
          {darfZurueck && (
            <form action={bestellungStornieren}>
              <input type="hidden" name="id" value={x.id} />
              <button type="submit" className="text-xs text-leise underline">
                zurückziehen
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/** Was im Monat zu berechnen ist: übergebener Wein und nicht zurückgebrachte Ware. */
async function Abrechnung({ monat }: { monat?: string }) {
  const jetzt = new Date();
  const m = /^\d{4}-\d{2}$/.test(monat ?? "") ? monat! : `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
  const [j, mm] = m.split("-").map(Number);
  const vorher = `${mm === 1 ? j - 1 : j}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const danach = `${mm === 12 ? j + 1 : j}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
  const daten = await monatsPositionen(m);

  return (
    <section id="abrechnung" className="scroll-mt-24 space-y-3 rounded-lg border border-linie bg-flaeche p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Abrechnung {MONATE[mm - 1]} {j}
        </h2>
        <span className="flex gap-3 text-sm">
          <a href={`/bestellungen?monat=${vorher}#abrechnung`} className="underline">
            Vormonat
          </a>
          <a href={`/bestellungen?monat=${danach}#abrechnung`} className="underline">
            Folgemonat
          </a>
        </span>
      </div>
      {daten.positionen.length === 0 ? (
        <p className="text-sm text-leise">In diesem Monat gibt es nichts zu berechnen.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs text-leise">
              <tr>
                <th className="py-1.5">Position</th>
                <th className="py-1.5 text-right">Anzahl</th>
                <th className="py-1.5 text-right">Einzelpreis</th>
                <th className="py-1.5 text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {daten.positionen.map((e) => (
                <tr key={e.name + e.einzelCent} className="border-b border-linie">
                  <td className="py-1.5">{e.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{e.menge}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(e.einzelCent)}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(e.summeCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-leise">Netto</dt>
            <dd className="text-right tabular-nums">{euro(daten.netto)}</dd>
            <dt className="text-leise">Umsatzsteuer 19 %</dt>
            <dd className="text-right tabular-nums">{euro(daten.ust)}</dd>
            <dt className="font-semibold">Rechnungsbetrag</dt>
            <dd className="text-right font-semibold tabular-nums">{euro(daten.brutto)}</dd>
          </dl>
          <p className="text-xs text-leise">
            {daten.uebergaben} {daten.uebergaben === 1 ? "Lieferung" : "Lieferungen"}
            {daten.leihware.length > 0 && `, dazu ${daten.leihware.length} Position aus unserem Bestand`}.
            Leistungszeitraum {daten.leistungszeitraum}.
          </p>
          <Rechnungsblock monat={m} />
        </>
      )}
    </section>
  );
}

const STATUS: Record<string, string> = {
  open: "offen",
  overdue: "überfällig",
  paid: "bezahlt",
  paidoff: "bezahlt",
  voided: "storniert",
  draft: "Entwurf",
};

/** Die Rechnung zum Monat: anlegen und senden, oder Stand und PDF. */
async function Rechnungsblock({ monat }: { monat: string }) {
  const r = await rechnungDesMonats(monat);
  const e = await rechnungsEinstellung();
  const fehlt = fehlendePflichtangaben(e.absender);
  const jetzt = new Date();
  const laufend = monat === `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;

  if (r?.versendetAm) {
    const bezahlt = r.status === "paid" || r.status === "paidoff";
    return (
      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: bezahlt ? "var(--gut)" : "var(--warnung)", background: bezahlt ? "var(--gut-hell)" : "var(--warnung-hell)" }}
      >
        <strong>Rechnung {r.nummer}</strong> über {euro(r.bruttoCent)}, verschickt am{" "}
        {new Date(r.versendetAm).toLocaleDateString("de-DE")} an {r.versendetAn.join(", ")}.{" "}
        {r.lexofficeId ? <strong>{STATUS[r.status] ?? r.status}</strong> : <span className="text-leise">Zahlungsstand nicht verbunden</span>}
        {r.bezahltAm && ` seit ${new Date(r.bezahltAm).toLocaleDateString("de-DE")}`}.{" "}
        {r.hatPdf && (
          <a href={`/bestellungen/rechnung/${r.id}`} target="_blank" rel="noreferrer" className="underline">
            PDF ansehen
          </a>
        )}
      </div>
    );
  }

  // Erstellt, aber der Versand ging schief: Nummer und PDF stehen, ein Klick wiederholt den Versand.
  if (r && !r.versendetAm) {
    return (
      <div className="space-y-2 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
        <p>
          <strong>Rechnung {r.nummer}</strong> über {euro(r.bruttoCent)} ist erstellt, aber noch nicht verschickt.
          {r.hatPdf && (
            <>
              {" "}
              <a href={`/bestellungen/rechnung/${r.id}`} target="_blank" rel="noreferrer" className="underline">
                PDF ansehen
              </a>
            </>
          )}
        </p>
        <form action={rechnungJetzt}>
          <input type="hidden" name="monat" value={monat} />
          <Absendeknopf text="Jetzt verschicken" laeuftText="Wird verschickt..." />
        </form>
      </div>
    );
  }

  if (fehlt.length > 0) {
    return (
      <p className="text-xs" style={{ color: "var(--warnung)" }}>
        Für die Rechnung fehlen noch Angaben: {fehlt.join(", ")}. Siehe unten unter „Absender auf der Rechnung“.
      </p>
    );
  }

  return (
    <form action={rechnungJetzt} className="space-y-2 rounded-lg border border-linie px-4 py-3">
      <input type="hidden" name="monat" value={monat} />
      <p className="text-sm">
        Rechnung an <strong>{e.empfaenger.name}</strong> erstellen und per Mail an {e.an.join(", ")} schicken
        {e.kopie.length > 0 && `, Kopie an ${e.kopie.join(", ")}`}.
        {laufend && " Achtung: Der Monat läuft noch, spätere Lieferungen kämen dann nicht mehr auf diese Rechnung."}
      </p>
      <Absendeknopf text="Rechnung erstellen und senden" laeuftText="Wird erstellt und verschickt..." />
    </form>
  );
}

/** Preise, wer Bescheid bekommt, Freischalten. Nur Florian. */
async function Einrichtung({ freigegeben }: { freigegeben: boolean }) {
  const [artikel, e, leute] = await Promise.all([
    artikelListe(false),
    einstellungLesen(),
    db()`select id, name, rolle from benutzer where aktiv and rolle in ('chef', 'team', 'foyer') order by name`.then(
      (z) => z as Array<{ id: string; name: string; rolle: string }>,
    ),
  ]);
  return (
    <section id="einrichtung" className="space-y-5 rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="text-lg font-semibold">Einrichtung (nur für dich)</h2>

      <form action={preiseSpeichern} className="space-y-2">
        <h3 className="text-sm font-semibold">Preise</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-leise">
              <tr>
                <th className="py-1">Sorte</th>
                <th className="py-1">Preis für Gäste €</th>
                <th className="py-1">Preis Gastro €</th>
                <th className="py-1">aktiv</th>
              </tr>
            </thead>
            <tbody>
              {artikel.map((a) => (
                <tr key={a.id}>
                  <td className="py-1 pr-2">{a.name}</td>
                  <td className="py-1 pr-2">
                    <input name={`vk:${a.id}`} defaultValue={betrag(a.vkCent)} inputMode="decimal" className="w-24" />
                  </td>
                  <td className="py-1 pr-2">
                    <input name={`ek:${a.id}`} defaultValue={betrag(a.ekCent)} inputMode="decimal" className="w-24" />
                  </td>
                  <td className="py-1">
                    <input type="checkbox" name={`aktiv:${a.id}`} defaultChecked={a.aktiv} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Absendeknopf text="Preise speichern" laeuftText="..." />
      </form>

      <form action={meldenSpeichern} className="space-y-2">
        <h3 className="text-sm font-semibold">Wer bekommt bei einer neuen Bestellung eine Mail?</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {leute.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="melden" value={p.id} defaultChecked={e.meldenAn.includes(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
        <Absendeknopf text="Speichern" laeuftText="..." />
      </form>

      <AbsenderEinrichtung />

      <RechnungsEinrichtung />

      <form action={freischalten} className="flex flex-wrap items-center gap-3 border-t border-linie pt-4">
        <input type="hidden" name="an" value={freigegeben ? "0" : "1"} />
        <span className="text-sm">
          {freigegeben ? "Freigeschaltet: Gastro, Büro und Foyer sehen „Bestellungen“." : "Noch nicht freigeschaltet."}
        </span>
        <Absendeknopf text={freigegeben ? "Wieder verbergen" : "Freischalten"} laeuftText="..." />
      </form>
    </section>
  );
}

async function RechnungsEinrichtung() {
  const e = await rechnungsEinstellung();
  const verbunden = lexofficeEingerichtet();
  return (
    <form action={rechnungEinstellungSpeichern} className="space-y-3 border-t border-linie pt-4">
      <h3 className="text-sm font-semibold">Monatsrechnung</h3>
      <p className="text-xs" style={{ color: verbunden ? "var(--gut)" : "var(--warnung)" }}>
        {verbunden
          ? "Lexware Office ist verbunden. Rechnungen bekommen dort ihre Nummer, und lexoffice gleicht die Zahlung mit dem Konto ab."
          : "Lexware Office ist noch nicht verbunden. Dafür muss der API-Schlüssel bei Vercel eingetragen werden."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-leise">Rechnung an (Firma)</span>
          <input name="name" defaultValue={e.empfaenger.name} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-leise">Straße</span>
          <input name="strasse" defaultValue={e.empfaenger.strasse} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">PLZ</span>
          <input name="plz" defaultValue={e.empfaenger.plz} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Ort</span>
          <input name="ort" defaultValue={e.empfaenger.ort} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-leise">Rechnung per Mail an (mit Komma getrennt)</span>
          <input name="an" defaultValue={e.an.join(", ")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Zahlungsziel in Tagen</span>
          <input name="ziel" type="number" min={0} max={60} defaultValue={e.zahlungszielTage} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="automatisch" defaultChecked={e.automatisch} />
        Automatisch: am 1. jedes Monats die Rechnung für den Vormonat erstellen und senden
      </label>
      <Absendeknopf text="Speichern" laeuftText="..." />
    </form>
  );
}

/**
 * Ware, die sich die Gastro genommen hat. Kommt sie zurück, kostet sie
 * nichts. Sonst steht sie mit Ladenpreis plus 10 Prozent auf der Rechnung.
 */
async function Leihware({ darfLoeschen }: { darfLoeschen: boolean }) {
  const [katalog, liste] = await Promise.all([leihArtikel(), leihen({})]);
  const offeneSumme = liste.filter((l) => l.status === "offen").reduce((n, l) => n + l.menge * l.preisCent, 0);
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <section id="leihware" className="scroll-mt-24 space-y-4 rounded-lg border border-linie bg-flaeche p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Ware aus unserem Bestand</h2>
        {offeneSumme > 0 && <span className="text-sm text-leise">offen: {euro(offeneSumme)}</span>}
      </div>
      <p className="text-sm text-leise">
        Wenn sich die Gastro etwas nimmt, zum Beispiel eine Flasche Aperol. Kommt sie zurück, kostet es nichts.
        Sonst kommt sie mit einem Aufschlag von 10 Prozent auf die Monatsrechnung.
      </p>

      <form action={leiheErfassen} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Was wurde genommen?</span>
          <select name="artikel" defaultValue={katalog[0]?.id ?? ""}>
            {katalog.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({euro(a.marktpreisCent)}, berechnet {euro(mitAufschlag(a.marktpreisCent))})
              </option>
            ))}
            <option value="">etwas anderes ...</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Menge</span>
          <input name="menge" type="number" min={1} max={100} defaultValue={1} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Nur bei „etwas anderes“: Bezeichnung</span>
          <input name="name" maxLength={120} placeholder="zum Beispiel Havana Club 0,7 l" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Nur bei „etwas anderes“: üblicher Ladenpreis €</span>
          <input name="marktpreis" inputMode="decimal" placeholder="12,99" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Wann</span>
          <input name="datum" type="date" defaultValue={heute} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Notiz (freiwillig)</span>
          <input name="notiz" maxLength={200} placeholder="zum Beispiel: von Giusi geholt" />
        </label>
        <div className="sm:col-span-2">
          <Absendeknopf text="Eintragen" laeuftText="Wird eingetragen..." />
        </div>
      </form>

      {liste.length > 0 && (
        <ul className="divide-y divide-linie border-t border-linie">
          {liste.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-24 tabular-nums text-leise">{l.datum.split("-").reverse().join(".")}</span>
              <span className="min-w-0 flex-1">
                <strong>
                  {l.menge} × {l.name}
                </strong>
                {l.notiz && <span className="text-leise"> · {l.notiz}</span>}
                <span className="text-leise"> · eingetragen von {l.erfasstVon}</span>
              </span>
              <span className={`tabular-nums ${l.status === "zurueck" ? "text-leise line-through" : ""}`}>
                {euro(l.menge * l.preisCent)}
              </span>
              {l.status === "offen" ? (
                <form action={leiheZurueckgebracht}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs hover:bg-gold-hell">
                    zurückgebracht
                  </button>
                </form>
              ) : (
                <form action={leiheDochBerechnen}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    doch berechnen
                  </button>
                </form>
              )}
              {darfLoeschen && (
                <form action={leiheEntfernen}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    löschen
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Absenderdaten für die Rechnung. Ohne sie geht keine Rechnung raus. */
async function AbsenderEinrichtung() {
  const e = await rechnungsEinstellung();
  const a = e.absender;
  const fehlt = fehlendePflichtangaben(a);
  return (
    <form action={absenderSpeichern} className="space-y-3 border-t border-linie pt-4">
      <h3 className="text-sm font-semibold">Absender auf der Rechnung</h3>
      {fehlt.length > 0 && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}>
          Es fehlt noch: {fehlt.join(", ")}. Ohne diese Angaben lässt sich keine Rechnung erstellen.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Feld name="firma" label="Firma" wert={a.firma} spalten />
        <Feld name="a_strasse" label="Straße" wert={a.strasse} spalten />
        <Feld name="a_plz" label="PLZ" wert={a.plz} />
        <Feld name="a_ort" label="Ort" wert={a.ort} />
        <Feld name="telefon" label="Telefon" wert={a.telefon} />
        <Feld name="a_email" label="E-Mail" wert={a.email} />
        <Feld name="web" label="Webseite" wert={a.web} />
        <Feld name="gf" label="Geschäftsführung" wert={a.geschaeftsfuehrer} />
        <Feld name="steuernummer" label="Steuernummer" wert={a.steuernummer} />
        <Feld name="ustid" label="USt-IdNr." wert={a.ustId} />
        <Feld name="bank" label="Bank" wert={a.bank} />
        <Feld name="iban" label="IBAN" wert={a.iban} />
        <Feld name="bic" label="BIC" wert={a.bic} />
        <Feld name="registergericht" label="Registergericht" wert={a.registergericht} />
      </div>
      <Absendeknopf text="Absender speichern" laeuftText="..." />
    </form>
  );
}

function Feld({ name, label, wert, spalten }: { name: string; label: string; wert: string; spalten?: boolean }) {
  return (
    <label className={`block ${spalten ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs text-leise">{label}</span>
      <input name={name} defaultValue={wert} />
    </label>
  );
}
