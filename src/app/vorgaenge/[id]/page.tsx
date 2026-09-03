import Link from "next/link";
import { notFound } from "next/navigation";
import { holeVorgang } from "@/lib/db/vorgaenge";
import { angeboteZumVorgang } from "@/lib/angebot/lesen";
import { AngebotBereich } from "@/components/AngebotBereich";
import {
  aufgabeHinzufuegen,
  aufgabeUmschalten,
  ausnahmeSetzen,
  gruppeEntfernen,
  gruppeHinzufuegen,
  notizHinzufuegen,
  menueSetzen,
  statusSetzen,
  vorgangLoeschen,
  zahlungErfassen,
} from "@/lib/db/aktionen";
import { StatusBadge, datumKurz, vorZeit } from "@/components/Status";
import { eur } from "@/lib/domain/pricing";
import { STATUS_LABEL, STATUS_REIHENFOLGE, type VorgangStatus } from "@/lib/domain/vorgang";
import { findeTermin } from "@/lib/ditix/spielplan";
import { holeAuslastung } from "@/lib/ditix/auslastung";
import { artikelDerGruppe } from "@/lib/domain/artikel";
import type { Buchungsgruppe, MenueVariante } from "@/lib/domain/types";

const MENUEVARIANTEN: Array<{ wert: MenueVariante; label: string }> = [
  { wert: "classic", label: "Classic" },
  { wert: "sea", label: "Sea" },
  { wert: "veggy", label: "Veggy" },
  { wert: "kids", label: "Kids" },
];

export const dynamic = "force-dynamic";

export default async function VorgangSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vorgang = await holeVorgang(id);
  if (!vorgang) notFound();

  const angebote = await angeboteZumVorgang(id);
  // Die Adresse, unter der der Kunde sein Angebot aufruft. Ohne Eintrag
  // greift die Adresse, unter der das Programm gerade läuft.
  const appUrl = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

  const personen = vorgang.gruppen.reduce((s, g) => s + g.personen, 0);
  const gezahlt = vorgang.zahlungen.reduce(
    (s, z) => s + (z.art === "erstattung" ? -z.betragCent : z.betragCent),
    0,
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{vorgang.kunde.name}</h1>
            <StatusBadge status={vorgang.status} />
          </div>
          <p className="mt-1 text-sm text-leise">
            {vorgang.nummer} ·{" "}
            {vorgang.vorstellung
              ? `${datumKurz(vorgang.vorstellung.datum)} · ${vorgang.vorstellung.show}`
              : vorgang.wunschzeitraum
                ? `Termin offen, Wunsch: ${vorgang.wunschzeitraum}`
                : "Termin steht noch nicht fest"}{" "}
            · {personen} {personen === 1 ? "Gast" : "Gäste"}
            {vorgang.personenUngefaehr && ` (Anfrage: ${vorgang.personenUngefaehr})`}
            {vorgang.quelle && ` · über ${vorgang.quelle}`}
          </p>
        </div>
        <Link href="/vorgaenge" className="text-sm text-leise hover:text-text">
          Zurück zur Übersicht
        </Link>
      </header>

      <StatusLeiste vorgangId={vorgang.id} aktuell={vorgang.status} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Karte titel="Gruppen">
            <p className="mb-3 text-xs text-leise">
              Wer zusammen sitzen will, ist eine Gruppe. Bei einer Firma mit mehreren Abteilungen,
              die getrennt sitzen möchten, lohnt sich eine Aufteilung.
            </p>
            <div className="space-y-3">
              {vorgang.gruppen.map((g) => (
                <div key={g.id} className="rounded-md border border-linie p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-sm text-leise">
                        {g.personen} {g.personen === 1 ? "Person" : "Personen"}
                      </span>
                    </div>
                    {vorgang.gruppen.length > 1 && (
                      <form action={gruppeEntfernen.bind(null, vorgang.id, g.id)}>
                        <button
                          type="submit"
                          className="rounded px-2 py-0.5 text-xs text-leise hover:bg-blocker-hell hover:text-blocker"
                        >
                          entfernen
                        </button>
                      </form>
                    )}
                  </div>

                  <MenueFeld vorgangId={vorgang.id} gruppe={g} />

                  <AusnahmeFeld vorgangId={vorgang.id} gruppeId={g.id} ausnahme={g.ausnahme} />
                </div>
              ))}
            </div>

            <form
              action={gruppeHinzufuegen.bind(null, vorgang.id)}
              className="mt-4 flex flex-wrap items-end gap-2 border-t border-linie pt-4"
            >
              <label className="flex-1">
                <span className="mb-1 block text-xs text-leise">Weitere Gruppe</span>
                <input type="text" name="name" placeholder="z.B. Abteilung Vertrieb" />
              </label>
              <label className="w-24">
                <span className="mb-1 block text-xs text-leise">Personen</span>
                <input type="number" name="personen" min={1} defaultValue={2} />
              </label>
              <button
                type="submit"
                className="rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
              >
                Hinzufügen
              </button>
            </form>
          </Karte>

          <AngebotBereich
            vorgangId={vorgang.id}
            angebote={angebote}
            appUrl={appUrl}
            kundeEmail={vorgang.kunde.email}
            ansprechpartner={vorgang.kunde.ansprechpartner}
          />

          <Karte titel="Notizen">
            <form action={notizHinzufuegen.bind(null, vorgang.id)} className="mb-4">
              <textarea name="text" rows={2} placeholder="Was gibt es Neues?" />
              <button
                type="submit"
                className="mt-2 rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
              >
                Notiz speichern
              </button>
            </form>

            {vorgang.notizen.length === 0 ? (
              <p className="text-sm text-leise">Noch keine Notizen.</p>
            ) : (
              <ul className="space-y-3">
                {vorgang.notizen.map((n) => (
                  <li key={n.id} className="border-l-2 border-linie pl-3">
                    <div className="whitespace-pre-wrap text-sm">{n.text}</div>
                    <div className="mt-0.5 text-xs text-leise">
                      {n.benutzer} · {vorZeit(n.zeitpunkt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Karte>

          <details className="rounded-lg border border-linie bg-flaeche px-5 py-3">
            <summary className="cursor-pointer text-sm text-leise">Vorgang löschen</summary>
            <div className="mt-3 border-t border-linie pt-3 text-sm">
              <p className="mb-3 text-leise">
                Löscht diesen Vorgang endgültig, mit allen Gruppen, Notizen, Aufgaben und
                Zahlungen. Der Kunde bleibt erhalten. Gedacht für Testeinträge und
                Fehleingaben.
              </p>
              <p className="mb-3 text-leise">
                Ein Event, das doch nicht stattfindet, solltest du stattdessen auf{" "}
                <strong>Abgesagt</strong> setzen. Dann bleibt nachvollziehbar, dass es die
                Anfrage gab.
              </p>
              <form action={vorgangLoeschen.bind(null, vorgang.id)}>
                <button
                  type="submit"
                  className="rounded-md border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: "var(--blocker)",
                    color: "var(--blocker)",
                    background: "var(--blocker-hell)",
                  }}
                >
                  {vorgang.nummer} endgültig löschen
                </button>
              </form>
            </div>
          </details>

          {vorgang.historie.length > 0 && (
            <Karte titel="Dieser Kunde war schon da">
              <ul className="space-y-2 text-sm">
                {vorgang.historie.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3">
                    <Link href={`/vorgaenge/${h.id}`} className="hover:text-gold-dunkel">
                      {h.datum ? `${datumKurz(h.datum)}, ${h.show}` : "Termin offen"}
                    </Link>
                    <span className="text-leise">
                      {h.personen} Gäste · {STATUS_LABEL[h.status as VorgangStatus] ?? h.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}
        </div>

        <div className="space-y-6">
          {vorgang.vorstellung?.ditixEventId && (
            <AuslastungKarte ditixEventId={vorgang.vorstellung.ditixEventId} />
          )}

          {!vorgang.vorstellung && (
            <div className="rounded-lg border border-warnung bg-warnung-hell px-4 py-3 text-sm">
              <strong style={{ color: "var(--warnung)" }}>Kein Termin festgelegt.</strong>
              <p className="mt-1 text-leise">
                Ein Angebot lässt sich trotzdem schreiben. Für Sitzplan und Küchenblatt wird
                der Termin gebraucht.
              </p>
            </div>
          )}

          <Karte titel="Kontakt">
            <dl className="space-y-2 text-sm">
              <Zeile bezeichnung="Firma" wert={vorgang.kunde.name} />
              <Zeile bezeichnung="Ansprechpartner" wert={vorgang.kunde.ansprechpartner} />
              <Zeile bezeichnung="E-Mail" wert={vorgang.kunde.email} />
              <Zeile bezeichnung="Telefon" wert={vorgang.kunde.telefon} />
            </dl>
          </Karte>

          <Karte titel="Aufgaben">
            {vorgang.aufgaben.length === 0 ? (
              <p className="mb-3 text-sm text-leise">Nichts offen.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {vorgang.aufgaben.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <form action={aufgabeUmschalten.bind(null, vorgang.id, a.id)}>
                      <button
                        type="submit"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border"
                        style={{
                          borderColor: a.erledigt ? "var(--gut)" : "var(--linie)",
                          background: a.erledigt ? "var(--gut)" : "transparent",
                          color: "white",
                          fontSize: "10px",
                          lineHeight: "14px",
                        }}
                        title={a.erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                      >
                        {a.erledigt ? "✓" : ""}
                      </button>
                    </form>
                    <div className={a.erledigt ? "text-leise line-through" : ""}>
                      <div>{a.text}</div>
                      <div className="text-xs text-leise">bis {datumKurz(a.faellig)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form
              action={aufgabeHinzufuegen.bind(null, vorgang.id)}
              className="space-y-2 border-t border-linie pt-3"
            >
              <input type="text" name="text" placeholder="Was ist zu tun?" />
              <input type="date" name="faellig" />
              <button
                type="submit"
                className="w-full rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
              >
                Aufgabe anlegen
              </button>
            </form>
          </Karte>

          <Karte titel="Zahlungen">
            {vorgang.zahlungen.length === 0 ? (
              <p className="mb-3 text-sm text-leise">Noch nichts eingegangen.</p>
            ) : (
              <>
                <ul className="mb-2 space-y-1 text-sm">
                  {vorgang.zahlungen.map((z) => (
                    <li key={z.id} className="flex justify-between gap-3">
                      <span className="text-leise">
                        {datumKurz(z.datum)} {z.art}
                      </span>
                      <span className="tabular-nums">{eur(z.betragCent)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mb-3 flex justify-between border-t border-linie pt-2 text-sm font-medium">
                  <span>Summe</span>
                  <span className="tabular-nums">{eur(gezahlt)}</span>
                </div>
              </>
            )}

            <form
              action={zahlungErfassen.bind(null, vorgang.id)}
              className="space-y-2 border-t border-linie pt-3"
            >
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Betrag in Euro</span>
                <input type="number" name="betrag" step="0.01" min="0" placeholder="1500,00" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Datum</span>
                <input type="date" name="datum" />
              </label>
              <select name="art" defaultValue="vollzahlung">
                <option value="anzahlung">Anzahlung</option>
                <option value="restzahlung">Restzahlung</option>
                <option value="vollzahlung">Vollzahlung</option>
                <option value="erstattung">Erstattung</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
              >
                Zahlung erfassen
              </button>
            </form>
          </Karte>
        </div>
      </div>
    </div>
  );
}

function StatusLeiste({ vorgangId, aktuell }: { vorgangId: string; aktuell: VorgangStatus }) {
  const index = STATUS_REIHENFOLGE.indexOf(aktuell);

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="mb-3 text-xs text-leise">
        Wo steht der Vorgang? Klicke die Station an, die jetzt erreicht ist.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_REIHENFOLGE.map((s, i) => {
          const erreicht = index >= 0 && i <= index;
          const jetzt = s === aktuell;
          return (
            <form key={s} action={statusSetzen.bind(null, vorgangId, s)}>
              <button
                type="submit"
                className="rounded-md border px-2.5 py-1 text-xs transition-colors"
                style={{
                  borderColor: jetzt ? "var(--gold)" : "var(--linie)",
                  background: jetzt
                    ? "var(--gold-hell)"
                    : erreicht
                      ? "var(--gut-hell)"
                      : "transparent",
                  color: jetzt
                    ? "var(--gold-dunkel)"
                    : erreicht
                      ? "var(--gut)"
                      : "var(--text-leise)",
                  fontWeight: jetzt ? 600 : 400,
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            </form>
          );
        })}
        <form action={statusSetzen.bind(null, vorgangId, "abgesagt")}>
          <button
            type="submit"
            className="rounded-md border px-2.5 py-1 text-xs"
            style={{
              borderColor: aktuell === "abgesagt" ? "var(--blocker)" : "var(--linie)",
              background: aktuell === "abgesagt" ? "var(--blocker-hell)" : "transparent",
              color: aktuell === "abgesagt" ? "var(--blocker)" : "var(--text-leise)",
            }}
          >
            Abgesagt
          </button>
        </form>
      </div>
      {aktuell !== "bezahlt" && aktuell !== "durchgefuehrt" && aktuell !== "abgesagt" && (
        <p className="mt-3 text-xs text-leise">
          Erinnerung: Laut euren Angebotsbedingungen ist die Reservierung erst mit dem
          vollständigen Zahlungseingang verbindlich. Bis dahin steht dieser Vorgang in allen
          Plänen als reserviert.
        </p>
      )}
      {aktuell === "abgesagt" && (
        <p className="mt-3 text-xs text-leise">
          Die Plätze sind wieder frei: Der Vorgang steht in Sitzplan, Küchenblatt und
          Funktionsheet nicht mehr drin. Meldet sich die Firma doch noch, klicke oben einfach
          wieder die Station an, die jetzt gilt.
        </p>
      )}
    </section>
  );
}

/**
 * Menüwahl, Unverträglichkeiten und Getränkepauschale einer Gruppe.
 * Das ist die Quelle für das Küchenblatt, deshalb steht die Summe der
 * Menüs direkt neben der Personenzahl: weichen sie ab, fällt es sofort auf.
 */
function MenueFeld({ vorgangId, gruppe }: { vorgangId: string; gruppe: Buchungsgruppe }) {
  const bestellt = Object.values(gruppe.menues ?? {}).reduce((s, n) => s + (n ?? 0), 0);
  const stimmt = bestellt === gruppe.personen;

  return (
    <details className="mt-2" open={bestellt === 0 ? undefined : true}>
      <summary className="cursor-pointer text-xs text-leise">
        Menüs und Unverträglichkeiten
        {bestellt > 0 && (
          <span style={{ color: stimmt ? "var(--gut)" : "var(--warnung)" }}>
            {" "}
            · {bestellt} von {gruppe.personen} erfasst
          </span>
        )}
      </summary>

      <form
        action={menueSetzen.bind(null, vorgangId, gruppe.id)}
        className="mt-2 space-y-2 rounded border border-linie p-3"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MENUEVARIANTEN.map(({ wert, label }) => (
            <label key={wert} className="block">
              <span className="mb-1 block text-xs text-leise">{label}</span>
              <input
                type="number"
                name={`menue_${wert}`}
                min={0}
                max={99}
                defaultValue={gruppe.menues?.[wert] ?? 0}
              />
            </label>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">
            Getränkepauschalen für die Gruppe
          </span>
          <span className="space-y-1.5">
            {artikelDerGruppe("getraenke").map((a) => (
              <label key={a.nummer} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="getraenkepauschalen"
                  value={a.nummer}
                  defaultChecked={(gruppe.getraenkepauschalen ?? []).includes(a.nummer)}
                  className="mt-0.5 h-auto w-auto"
                />
                {a.bezeichnung}
              </label>
            ))}
          </span>
          <span className="mt-1 block text-xs text-leise">
            Mehrere sind möglich. Softdrink zusammen mit Bier und Wein ist die häufigste
            Buchung: Damit sind alle versorgt.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">
            Individuelle Vereinbarung für die Gastronomie
          </span>
          <input
            type="text"
            name="sondervereinbarung"
            defaultValue={gruppe.sondervereinbarung ?? ""}
            placeholder="z.B. Aperol für alle beim Empfang, Ausschank bis 24 Uhr verlängert"
          />
          <span className="mt-1 block text-xs text-leise">
            Steht so im Funktionsheet. Alles, was nicht im Artikelstamm steht und mit Osman
            abgerechnet wird, gehört hierher.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">
            Unverträglichkeiten und Sonderwünsche
          </span>
          <input
            type="text"
            name="unvertraeglichkeiten"
            defaultValue={gruppe.unvertraeglichkeiten ?? ""}
            placeholder="2x Nussallergie, 1x laktosefrei, 1x kein Schwein"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">Zahlung vor Ort</span>
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="vor_ort_kassieren"
                defaultChecked={gruppe.vorOrtKassieren ?? false}
                className="h-auto w-auto"
              />
              muss am Abend kassiert werden
            </label>
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              name="vor_ort_betrag"
              defaultValue={
                gruppe.vorOrtBetragCent !== undefined && gruppe.vorOrtBetragCent !== null
                  ? (gruppe.vorOrtBetragCent / 100).toFixed(2).replace(".", ",")
                  : ""
              }
              placeholder="Betrag, leer = aus den Menüs gerechnet"
              className="min-w-40 flex-1"
            />
            <input
              type="text"
              name="vor_ort_hinweis"
              defaultValue={gruppe.vorOrtHinweis ?? ""}
              placeholder="Hinweis für den Service, z.B. jeder zahlt sein Menü selbst"
              className="min-w-48 flex-1"
            />
          </span>
          <span className="mt-1 block text-xs text-leise">
            Der Betrag steht dann im Funktionsheet. Es ist der einzige Preis, den die Gastronomie
            zu sehen bekommt, denn sie soll ihn kassieren.
          </span>
        </label>

        <button
          type="submit"
          className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
        >
          Speichern
        </button>

        {bestellt > 0 && !stimmt && (
          <p className="text-xs" style={{ color: "var(--warnung)" }}>
            {bestellt} Menüs für {gruppe.personen} Personen. Die Küche bekommt die Zahl, die
            hier steht.
          </p>
        )}
      </form>
    </details>
  );
}

function AusnahmeFeld({
  vorgangId,
  gruppeId,
  ausnahme,
}: {
  vorgangId: string;
  gruppeId: string;
  ausnahme?: { aktiv: boolean; grund: string; benutzer?: string; gesetztAm?: string };
}) {
  if (ausnahme?.aktiv) {
    return (
      <div className="mt-2 rounded border border-info bg-info-hell px-3 py-2 text-xs">
        <div style={{ color: "var(--info)" }} className="font-medium">
          Ausnahme hinterlegt
        </div>
        <div className="mt-0.5">{ausnahme.grund}</div>
        <div className="mt-0.5 text-leise">
          {ausnahme.benutzer}
          {ausnahme.gesetztAm && `, ${vorZeit(ausnahme.gesetztAm)}`}
        </div>
        <form action={ausnahmeSetzen.bind(null, vorgangId, gruppeId, false, "")}>
          <button type="submit" className="mt-1 text-leise underline hover:text-text">
            Ausnahme aufheben
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        await ausnahmeSetzen(vorgangId, gruppeId, true, String(formData.get("grund") ?? ""));
      }}
      className="mt-2 flex flex-wrap items-end gap-2"
    >
      <label className="min-w-48 flex-1">
        <span className="mb-1 block text-xs text-leise">
          Ausnahme vom Aufschlag für nicht belegte Logenplätze
        </span>
        <input
          type="text"
          name="grund"
          required
          minLength={5}
          placeholder="Begründung, ohne die es nicht geht"
          title="Bitte kurz begründen, warum der Aufschlag entfällt."
        />
      </label>
      <button
        type="submit"
        className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
      >
        Ausnahme machen
      </button>
    </form>
  );
}

/**
 * Zeigt, wie voll der Saal an diesem Abend schon ist. Die Zahlen kommen
 * live aus dem Ticketshop und sind fünf Minuten zwischengespeichert.
 */
async function AuslastungKarte({ ditixEventId }: { ditixEventId: string }) {
  let auslastung;
  try {
    const termin = await findeTermin(ditixEventId);
    if (!termin?.seatmapEventId) return null;
    auslastung = await holeAuslastung(termin.seatmapEventId);
  } catch {
    // Der Shop ist gerade nicht erreichbar. Kein Grund, die ganze Seite
    // zu blockieren, die Auslastung ist eine Zusatzinformation.
    return null;
  }

  const farbe =
    auslastung.prozent >= 85
      ? "var(--blocker)"
      : auslastung.prozent >= 60
        ? "var(--warnung)"
        : "var(--gut)";

  return (
    <Karte titel="Saal an diesem Abend">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">{auslastung.prozent} %</span>
        <span className="text-xs text-leise">
          {auslastung.verkauft} von {auslastung.gesamt} verkauft
        </span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-hintergrund">
        <div
          className="h-full rounded-full"
          style={{ width: `${auslastung.prozent}%`, background: farbe }}
        />
      </div>

      <table className="w-full text-xs">
        <thead className="text-left text-leise">
          <tr>
            <th className="font-medium">Kategorie</th>
            <th className="text-right font-medium">frei</th>
            <th className="text-right font-medium">verkauft</th>
          </tr>
        </thead>
        <tbody>
          {auslastung.kategorien.map((k) => (
            <tr key={k.name}>
              <td className="py-0.5">{k.name}</td>
              <td className="py-0.5 text-right tabular-nums">{k.frei}</td>
              <td className="py-0.5 text-right tabular-nums">{k.verkauft}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {auslastung.gesperrt > 0 && (
        <div className="mt-2 text-xs text-leise">
          {auslastung.gesperrt} {auslastung.gesperrt === 1 ? "Platz ist" : "Plätze sind"} gesperrt.
        </div>
      )}
      <div className="mt-2 text-xs text-leise">Stand aus dem Ticketshop, alle fünf Minuten neu.</div>
    </Karte>
  );
}

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="mb-3 text-sm font-semibold">{titel}</h2>
      {children}
    </section>
  );
}

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-leise">{bezeichnung}</dt>
      <dd className="text-right">{wert || <span className="text-leise">nicht erfasst</span>}</dd>
    </div>
  );
}
