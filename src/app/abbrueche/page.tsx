import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { abbrecher, abbruchEinstellung, abbruchZahlen, grundText } from "@/lib/abbrecher/db";
import { vorZeit } from "@/components/Status";
import { Absendeknopf } from "@/components/Absendeknopf";
import { KONTINGENT_JE_WOCHE } from "@/lib/abbrecher/lauf";
import {
  anrufNotieren,
  automatikSchalten,
  mailSchicken,
  probeAnMich,
  vertriebSpeichern,
  vertriebsLeute,
} from "./aktionen";
import { STATUS, statusFarbe, statusText, trichter, verlaeufe } from "@/lib/abbrecher/vertrieb";
import { offeneNachfuehren } from "@/lib/db/shop-buchungen";

export const metadata = { title: "Abgebrochene Buchungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const euro = (cent: number | null) =>
  cent === null
    ? "-"
    : (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * Wer im Warenkorb stehen geblieben ist.
 *
 * Sortiert nach Geld, nicht nach Zeit: Ein Korb über 600 Euro ist einen
 * Anruf wert, einer über 40 nicht. Oben steht, was insgesamt liegen
 * geblieben ist, damit die Zahl nicht aus dem Blick gerät.
 */
export default async function AbbruecheSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; alle?: string; sortierung?: string; stufe?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle)) redirect("/");
  const { meldung, alle, sortierung, stufe } = await searchParams;
  // Neueste zuerst ist der Standard: Ein Korb von gestern laesst sich noch
  // retten, einer von vor drei Wochen selten. Nach Betrag sortiert, wer
  // gezielt die grossen Gruppen anruft (Florian, 23.09.2026).
  const nachBetrag = sortierung === "betrag";

  /*
    Erst beim Shop nachfragen, wer inzwischen doch bezahlt hat.

    Der Zahlungsstand wurde bisher nur nachgeführt, wenn jemand die
    Buchungen eines Showtags öffnete. Wer danach bezahlte, stand hier
    weiter als Abbrecher, im Fall von Corinna Hagel mit bereits bezahlten
    Karten (Florian, 23.09.2026). Es werden nur die zuletzt eingegangenen
    Körbe geprüft und jeder höchstens alle drei Stunden, damit das Öffnen
    der Seite schnell bleibt.
  */
  await offeneNachfuehren({ hoechstens: 40 }).catch(() => 0);

  const [liste, zahlen, schalter, leute, stufen] = await Promise.all([
    abbrecher(30),
    abbruchZahlen(30),
    abbruchEinstellung(),
    vertriebsLeute(),
    trichter(30),
  ]);
  const verlauf = await verlaeufe(liste.map((a) => a.id));
  const offen = liste.filter((a) => !a.spaeterGekauft);
  const sichtbar = (alle === "ja" ? liste : offen)
    .filter((a) => !stufe || a.status === stufe)
    .slice()
    .sort((x, y) =>
      nachBetrag
        ? (y.gesamtCent ?? 0) - (x.gesamtCent ?? 0)
        : Date.parse(y.eingegangenAm) - Date.parse(x.eingegangenAm),
    );

  /* Die Filter oben bauen sich ihre Adresse selbst, damit Sortierung und
     Stufe nebeneinander bestehen koennen. */
  const link = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    if (alle === "ja") p.set("alle", "ja");
    if (nachBetrag) p.set("sortierung", "betrag");
    if (stufe) p.set("stufe", stufe);
    for (const [k, v] of Object.entries(aenderung)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `/abbrueche?${q}` : "/abbrueche";
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Abgebrochene Buchungen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Gäste, die Plätze gewählt und ihre Daten eingetippt haben, bei denen aber keine Zahlung ankam. Die
          letzten 30 Tage.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      <section className="flex flex-wrap gap-4">
        <Kachel zahl={String(zahlen.anzahl)} was="abgebrochen" hinweis="in 30 Tagen" />
        <Kachel zahl={euro(zahlen.summeCent)} was="liegt im Korb" hinweis="Warenwert zusammen" betont />
        <Kachel zahl={String(zahlen.gefragt)} was="angeschrieben" hinweis="Frage nach dem Grund" />
        <Kachel zahl={String(zahlen.geantwortet)} was="haben geantwortet" hinweis={`${zahlen.gefragt} gefragt`} />
      </section>

      {zahlen.gruende.length > 0 && (
        <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <h2 className="mb-2 font-semibold">Was die Gäste sagen</h2>
          <ul className="space-y-1">
            {zahlen.gruende.map((g) => (
              <li key={g.grund}>
                <strong>{g.anzahl}×</strong> {grundText(g.grund)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        action={automatikSchalten}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: schalter.aktiv ? "var(--gut)" : "var(--warnung)",
          background: schalter.aktiv ? "var(--gut-hell)" : "var(--warnung-hell)",
        }}
      >
        <div className="max-w-prose">
          <strong>Automatischer Versand: {schalter.aktiv ? "an" : "aus"}</strong>
          <div className="text-leise">
            {schalter.aktiv
              ? `Die Mails gehen täglich hinaus, höchstens ${schalter.hoechstens} am Tag.`
              : "Es geht nichts hinaus. Einzelne Mails kannst du unten trotzdem von Hand schicken."}
            {schalter.geaendertVon ? ` Zuletzt von ${schalter.geaendertVon}.` : ""}
          </div>
        </div>
        <input type="hidden" name="an" value={schalter.aktiv ? "aus" : "an"} />
        <span className="flex flex-wrap items-center gap-2">
          {b.rolle === "chef" && (
            <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5">
              {schalter.aktiv ? "Ausschalten" : "Einschalten"}
            </button>
          )}
        </span>
      </form>

      {/* Erst ansehen, dann einschalten. */}
      <form action={probeAnMich}>
        <Absendeknopf text="Alle vier Mails als Probe an mich" laeuftText="Wird verschickt..." />
      </form>

      <p className="max-w-prose text-xs text-leise">
        Automatisch läuft: Die Frage „Was hat dich abgehalten?“ geht am Tag nach dem Abbruch hinaus, drei Tage
        später bekommen alle ein Geschenk: {KONTINGENT_JE_WOCHE} Getränkepakete je Woche werden verlost, die
        Übrigen bekommen ein Souvenirglas, bei Familienshows einen Zauberstab. Gültig 24 Stunden, abholbar an
        der Magic-Bar. Wer sich abgemeldet hat, bekommt nichts mehr.
      </p>

      {/* Sortierung und Stufen: Florian sucht nach Betrag, Kevin nach Datum. */}
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-leise">Sortieren</span>
        <Link
          href={link({ sortierung: "" })}
          className={`rounded-md px-3 py-1.5 ${!nachBetrag ? "bg-text text-flaeche" : "border border-linie"}`}
        >
          Neueste zuerst
        </Link>
        <Link
          href={link({ sortierung: "betrag" })}
          className={`rounded-md px-3 py-1.5 ${nachBetrag ? "bg-text text-flaeche" : "border border-linie"}`}
        >
          Größter Korb
        </Link>
      </nav>

      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-xs uppercase tracking-wide text-leise">Stufe</span>
        <Link
          href={link({ stufe: "" })}
          className={`rounded-md px-3 py-1.5 ${!stufe ? "bg-text text-flaeche" : "border border-linie"}`}
        >
          Alle
        </Link>
        {stufen.map((t) => (
          <Link
            key={t.status}
            href={link({ stufe: t.status })}
            className={`rounded-md px-3 py-1.5 ${stufe === t.status ? "bg-text text-flaeche" : "border border-linie"}`}
            title={`${euro(t.summeCent)} Warenwert`}
          >
            {statusText(t.status)} ({t.anzahl})
          </Link>
        ))}
      </nav>

      {sichtbar.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Nichts offen. Entweder hat gerade niemand abgebrochen, oder alle haben später doch gekauft.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Korb</th>
                <th className="px-4 py-2 font-medium">Gast</th>
                <th className="px-4 py-2 font-medium">Show</th>
                <th className="px-4 py-2 font-medium">Stand</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((a) => (
                <tr key={a.id} className="border-b border-linie align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-base font-semibold tabular-nums">{euro(a.gesamtCent)}</div>
                    <div className="text-xs text-leise">
                      {a.posten.length > 0
                        ? a.posten.map((p) => `${p.anzahl} × ${p.name}`).join(", ")
                        : `${a.plaetze ?? "?"} Plätze`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.name || <span className="text-leise">ohne Namen</span>}
                    <div className="text-xs text-leise">{a.email}</div>
                    {a.telefon && (
                      <a href={`tel:${a.telefon.replace(/\s/g, "")}`} className="text-xs underline">
                        {a.telefon}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.show}
                    <div className="text-xs text-leise">
                      {a.datum.split("-").reverse().join(".")} {a.uhrzeit ? `· ${a.uhrzeit} Uhr` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-leise">abgebrochen {vorZeit(a.eingegangenAm)}</div>
                    {a.spaeterGekauft && <div style={{ color: "var(--gut)" }}>hat später doch gekauft</div>}
                    {a.frageAm && <div>Frage raus {vorZeit(a.frageAm)}</div>}
                    {a.abbruchGrund && <div style={{ color: "var(--info)" }}>sagt: {grundText(a.abbruchGrund)}</div>}
                    {a.angebotAm && <div>Angebot raus {vorZeit(a.angebotAm)}</div>}

                    <div className="mt-1 font-semibold" style={{ color: statusFarbe(a.status) }}>
                      {statusText(a.status)}
                      {a.bearbeiter ? ` · ${a.bearbeiter}` : ""}
                    </div>
                    {a.wiedervorlage && (
                      <div style={{ color: "var(--warnung)" }}>
                        Wiedervorlage {a.wiedervorlage.split("-").reverse().join(".")}
                      </div>
                    )}
                    {(verlauf.get(a.id) ?? []).slice(0, 2).map((v, i) => (
                      <div key={i} className="text-leise">
                        {v.text}{" "}
                        <span className="opacity-70">
                          ({v.wer}, {vorZeit(v.am)})
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {/* Anrufen und gleich festhalten, was dabei herauskam. */}
                      {a.telefon && (
                        <form action={anrufNotieren} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={a.id} />
                          <select name="ergebnis" defaultValue="nicht_erreicht" className="rounded border px-2 py-1 text-xs">
                            {STATUS.filter((x) => x.wert !== "neu").map((x) => (
                              <option key={x.wert} value={x.wert}>
                                {x.text}
                              </option>
                            ))}
                          </select>
                          <input name="notiz" placeholder="Notiz" maxLength={200} className="w-24 text-xs" />
                          <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs">
                            Anruf
                          </button>
                        </form>
                      )}

                      <form action={vertriebSpeichern} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        <select name="status" defaultValue={a.status} className="rounded border px-2 py-1 text-xs">
                          {STATUS.map((x) => (
                            <option key={x.wert} value={x.wert}>
                              {x.text}
                            </option>
                          ))}
                        </select>
                        <select
                          name="bearbeiter"
                          defaultValue={a.bearbeiterId ?? ""}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="">ohne Bearbeiter</option>
                          {leute.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          name="wiedervorlage"
                          defaultValue={a.wiedervorlage ?? ""}
                          className="rounded border px-2 py-1 text-xs"
                          title="Wiedervorlage"
                        />
                        <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs">
                          Speichern
                        </button>
                      </form>
                    </div>

                    {!a.spaeterGekauft && (
                      <div className="mt-2 flex flex-col gap-1">
                        {!a.frageAm && (
                          <form action={mailSchicken}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="art" value="frage" />
                            <Absendeknopf text="Fragen" laeuftText="..." />
                          </form>
                        )}
                        {!a.angebotAm && (
                          <form action={mailSchicken}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="art" value="angebot" />
                            <Absendeknopf text="Getränke anbieten" laeuftText="..." />
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
}: {
  zahl: string;
  was: string;
  hinweis: string;
  betont?: boolean;
}) {
  return (
    <div
      className="min-w-44 flex-1 rounded-lg border px-4 py-3"
      style={{
        borderColor: betont ? "var(--gold)" : "var(--linie)",
        background: betont ? "var(--gold-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
