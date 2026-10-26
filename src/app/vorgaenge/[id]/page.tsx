import Link from "next/link";
import { notFound } from "next/navigation";
import { holeVorgang } from "@/lib/db/vorgaenge";
import { angeboteZumVorgang } from "@/lib/angebot/lesen";
import { AngebotBereich } from "@/components/AngebotBereich";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  aufgabeHinzufuegen,
  aufgabeUmschalten,
  adresseVorschlagen,
  kontaktAendern,
  terminSetzen,
  ausnahmeSetzen,
  gruppeEntfernen,
  gruppeHinzufuegen,
  gruppePersonenSetzen,
  notizHinzufuegen,
  menueSetzen,
  statusSetzen,
  vorgangLoeschen,
  wunschSetzen,
  zahlungErfassen,
} from "@/lib/db/aktionen";
import { StatusBadge, datumKurz, vorZeit } from "@/components/Status";
import { eur } from "@/lib/domain/pricing";
import { STATUS_LABEL, STATUS_REIHENFOLGE, type VorgangStatus } from "@/lib/domain/vorgang";
import { terminlage } from "@/lib/domain/terminlage";
import { findeTermin, kommendeTermine } from "@/lib/ditix/spielplan";
import { holeAuslastung } from "@/lib/ditix/auslastung";
import { artikelDerGruppe } from "@/lib/domain/artikel";
import type { Buchungsgruppe, MenueVariante } from "@/lib/domain/types";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { auslastung, empfehlung, optionen } from "@/lib/flotix/option";
import { optionFreigeben, optionLaengerHalten, plaetzeOptionieren } from "./optionen";

const MENUEVARIANTEN: Array<{ wert: MenueVariante; label: string }> = [
  { wert: "classic", label: "Classic" },
  { wert: "sea", label: "Sea" },
  { wert: "veggy", label: "Veggy" },
  { wert: "kids", label: "Kids" },
];

export const dynamic = "force-dynamic";

export default async function VorgangSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mail?: string; an?: string; meldung?: string; vorschlag?: string }>;
}) {
  const { id } = await params;
  const { mail, an, meldung, vorschlag } = await searchParams;

  /*
    Ein Adressvorschlag aus dem Netz, noch nicht gespeichert.

    Er kommt als Text in der Adresszeile zurueck und fuellt das Formular
    vor. Erst wer auf Speichern drueckt, uebernimmt ihn
    (Florian, 15.10.2026).
  */
  let adressvorschlag: {
    firma: string;
    strasse: string;
    plz: string;
    ort: string;
    quelle: string;
  } | null = null;
  try {
    adressvorschlag = vorschlag ? JSON.parse(vorschlag) : null;
  } catch {
    adressvorschlag = null;
  }
  const vorgang = await holeVorgang(id);
  if (!vorgang) notFound();

  const angebote = await angeboteZumVorgang(id);
  // Die Adresse, unter der der Kunde sein Angebot aufruft. Ohne Eintrag
  // greift die Adresse, unter der das Programm gerade läuft.
  const appUrl = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

  const personen = vorgang.gruppen.reduce((s, g) => s + g.personen, 0);
  // Die Kennung des Abends in FloTix, dort haengen die Plaetze.
  const vorgangFlotixId = vorgang.vorstellung?.ditixEventId ?? "";
  const ich = await angemeldeterBenutzer();
  const darfOptionieren = Boolean(ich && darfKaufmaennisches(ich.rolle));

  /*
    Optionierte Plätze, falls welche gehalten werden.

    Die Plätze liegen in FloTix, hier steht nur, was daraus folgt.
    Fällt FloTix aus, fehlt der Kasten, der Rest der Seite bleibt
    benutzbar (Florian, 26.10.2026).
  */
  const [laufendeOptionen, auslastungDesAbends] = await Promise.all([
    optionen().catch(() => []),
    vorgangFlotixId ? auslastung(vorgangFlotixId).catch(() => null) : Promise.resolve(null),
  ]);
  const meineOption = laufendeOptionen.find((o) => o.vorgang === vorgang.nummer) ?? null;
  const rat = empfehlung(
    auslastungDesAbends,
    angebote[0]?.gueltigBis ? new Date(angebote[0].gueltigBis) : null,
  );
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
              : vorgang.wunschzeitraum || vorgang.wunschtag
                ? `Termin offen, Wunsch: ${[vorgang.wunschtag, vorgang.wunschzeitraum]
                    .filter(Boolean)
                    .join(", ")}`
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

      {/*
        Rückmeldung nach dem Mailversand. Ohne sie sieht die Seite nach
        dem Abschicken aus wie vorher, und niemand weiss, ob das Angebot
        beim Kunden ist.
      */}
      {mail === "weg" && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          <strong>Das Angebot ist raus.</strong> Verschickt an {an ?? "den Kunden"}, von
          kevin.steele@florianzimmer.com. Es steht dort unter Gesendete Elemente, Antworten des
          Kunden landen bei Kevin, und hier ist es als versendet vermerkt.
        </div>
      )}

      {/* Rueckmeldung nach dem Aendern der Kontaktdaten. */}
      {meldung && mail !== "fehler" && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </div>
      )}

      {mail === "fehler" && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Das Angebot ging nicht raus.</strong>
          <div className="mt-1 text-leise">{meldung ?? "Unbekannter Fehler"}</div>
        </div>
      )}

      <StatusLeiste vorgangId={vorgang.id} aktuell={vorgang.status} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Karte titel="Gruppen und Teilnehmerzahl">
            <p className="mb-3 text-xs text-leise">
              Wer zusammen sitzen will, ist eine Gruppe. Bei einer Firma mit mehreren Abteilungen,
              die getrennt sitzen möchten, lohnt sich eine Aufteilung. Hier steht auch die Zahl der
              Teilnehmer: Die Summe aller Gruppen geht ins Angebot, in den Sitzplan und auf das
              Küchenblatt.
            </p>
            <div className="space-y-3">
              {vorgang.gruppen.map((g) => (
                <div key={g.id} className="rounded-md border border-linie p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{g.name}</span>
                      {/*
                        Die Zahl ist ein Feld, kein Text: Teilnehmerzahlen
                        aendern sich bis zuletzt (Florian, 15.10.2026).
                      */}
                      <form
                        action={gruppePersonenSetzen.bind(null, vorgang.id, g.id)}
                        className="flex items-center gap-1 text-sm"
                      >
                        <input
                          type="number"
                          name="personen"
                          min={1}
                          defaultValue={g.personen}
                          className="w-20 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
                        />
                        <span className="text-leise">Teilnehmer</span>
                        <button
                          type="submit"
                          className="rounded px-2 py-0.5 text-xs underline text-leise hover:text-text"
                        >
                          ändern
                        </button>
                      </form>
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
            personen={personen}
            terminDatum={vorgang.vorstellung?.datum ?? null}
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

          {/*
            Der Termin, zu setzen und zu ändern.

            "bei Angebot erstellen kam die Nachfrage, wo der denn das
            Datum eingeben kann" (Florian, 14.10.2026). Gewählt wird aus
            dem Spielplan: So steht nie ein Abend im Vorgang, an dem
            keine Show läuft.
          */}
          {!vorgang.vorstellung ? (
            <div className="rounded-lg border border-warnung bg-warnung-hell px-4 py-3 text-sm">
              <strong style={{ color: "var(--warnung)" }}>Kein Termin festgelegt.</strong>
              <p className="mt-1 text-leise">
                {vorgang.wunschtag || vorgang.wunschzeitraum
                  ? `Der Kunde hat sich gewünscht: ${[
                      vorgang.wunschtag,
                      vorgang.wunschzeitraum?.replace(/_/g, " "),
                    ]
                      .filter(Boolean)
                      .join(", ")}. Bitte den Abend auswählen.`
                  : "Ein Angebot lässt sich trotzdem schreiben. Für Sitzplan und Küchenblatt wird der Termin gebraucht."}
              </p>

              {/*
                Der Wunsch, hier zu aendern.

                "wo ist das mit dem wunschtag" (Florian, 26.10.2026): Im
                Anlegeformular stand er, im laufenden Vorgang nicht. Beim
                Telefonat ist aber der Vorgang offen, nicht das Formular.
              */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs underline">
                  Wunschtag und Zeitraum eintragen
                </summary>
                <form
                  action={wunschSetzen.bind(null, vorgang.id)}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Wunschtag</span>
                    <select name="wunschtag" defaultValue={vorgang.wunschtag ?? ""} className="w-40">
                      <option value="">kein bestimmter Tag</option>
                      <option value="Montag">Montag</option>
                      <option value="Dienstag">Dienstag</option>
                      <option value="Mittwoch">Mittwoch</option>
                      <option value="Donnerstag">Donnerstag</option>
                      <option value="Freitag">Freitag</option>
                      <option value="Samstag">Samstag</option>
                      <option value="Sonntag">Sonntag</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Zeitraum</span>
                    <input
                      name="wunschzeitraum"
                      defaultValue={vorgang.wunschzeitraum?.replace(/_/g, " ") ?? ""}
                      placeholder="in den nächsten 3 Monaten"
                      className="w-56"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm"
                  >
                    Wunsch speichern
                  </button>
                </form>
              </details>

              <TerminWahl vorgangId={vorgang.id} aktuell={null} wunsch={vorgang.wunschzeitraum} />
            </div>
          ) : (
            <Karte titel="Termin">
              <p className="text-sm">
                <strong>{datumKurz(vorgang.vorstellung.datum)}</strong> · {vorgang.vorstellung.show}
              </p>

              {/*
                Plätze freihalten, solange der Kunde überlegt.

                "wenn der kunde noch zeit braucht, sollte man auch plätze
                blockieren können" (Florian, 26.10.2026). Wie lange,
                schlägt der Eventmanager anhand der Auslastung vor: Einen
                vollen Samstag hält man niemandem eine Woche frei.
              */}
              {darfOptionieren && (
                <div
                  className="mt-3 rounded-md border px-3 py-2 text-sm"
                  style={{
                    borderColor: meineOption ? "var(--gold)" : "var(--linie)",
                    background: meineOption ? "var(--gold-hell)" : "transparent",
                  }}
                >
                  {meineOption ? (
                    <>
                      <strong>
                        {meineOption.plaetze.length}{" "}
                        {meineOption.plaetze.length === 1 ? "Platz ist" : "Plätze sind"} optioniert,
                        bis {new Date(meineOption.bis).toLocaleDateString("de-DE")}.
                      </strong>
                      <div className="mt-1 text-xs text-leise">
                        {meineOption.plaetze
                          .slice(0, 12)
                          .map((p) => `Reihe ${p.reihe}, Platz ${p.platz}`)
                          .join(" · ")}
                        {meineOption.plaetze.length > 12 ? " und weitere" : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <form action={optionLaengerHalten.bind(null, vorgang.id)}>
                          <label className="text-xs text-leise">
                            noch einmal
                            <input
                              type="number"
                              name="tage"
                              min={1}
                              max={7}
                              defaultValue={rat.tage}
                              className="mx-1 w-14"
                            />
                            Tage
                          </label>
                          <button
                            type="submit"
                            className="ml-1 rounded-md border border-linie bg-flaeche px-2 py-1 text-xs"
                          >
                            verlängern
                          </button>
                        </form>
                        <form action={optionFreigeben.bind(null, vorgang.id)}>
                          <button type="submit" className="text-xs text-leise underline">
                            Plätze wieder freigeben
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <form
                      action={plaetzeOptionieren.bind(null, vorgang.id)}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Plätze</span>
                        <input
                          type="number"
                          name="anzahl"
                          min={1}
                          max={400}
                          defaultValue={personen || vorgang.personenUngefaehr || 10}
                          className="w-20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Tage</span>
                        <input
                          type="number"
                          name="tage"
                          min={1}
                          max={7}
                          defaultValue={rat.tage}
                          className="w-16"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm"
                      >
                        Plätze optionieren
                      </button>
                      <span className="w-full text-xs text-leise">{rat.grund}</span>
                    </form>
                  )}
                </div>
              )}

              {/*
                Zusage oder nicht. "es muss klar ersichtlich sein, ob es
                noch Zusage ausstehend ist oder bestätigt" (Florian,
                14.10.2026). Bestätigt ist es mit der ersten Zahlung,
                auch bei Ratenzahlung.
              */}
              {(() => {
                const lage = terminlage({ status: vorgang.status, zahlungen: vorgang.zahlungen });
                return (
                  <>
                    <p className="mt-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={
                          lage.bestaetigt
                            ? { background: "var(--gut-hell)", color: "var(--gut)" }
                            : { background: "var(--warnung-hell)", color: "var(--warnung)" }
                        }
                      >
                        {lage.text}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-leise">{lage.erklaerung}</p>
                  </>
                );
              })()}

              {/* Ein Abend, den es in Ditix nicht gibt: dann fehlt der Saalplan. */}
              {!vorgang.vorstellung.ditixEventId && (
                <p className="mt-2 text-xs" style={{ color: "var(--warnung)" }}>
                  An diesem Tag steht keine Show im Spielplan. Saalplan, Auslastung und Einlass über die
                  App gibt es für diesen Abend nicht.
                </p>
              )}

              <TerminWahl
                vorgangId={vorgang.id}
                aktuell={vorgang.vorstellung.ditixEventId}
                wunsch={vorgang.wunschzeitraum}
              />
            </Karte>
          )}

          <Karte titel="Kontakt">
            <dl className="space-y-2 text-sm">
              <Zeile bezeichnung="Firma" wert={vorgang.kunde.name} />
              <Zeile bezeichnung="Ansprechpartner" wert={vorgang.kunde.ansprechpartner} />
              <Zeile bezeichnung="E-Mail" wert={vorgang.kunde.email} />
              <Zeile bezeichnung="Telefon" wert={vorgang.kunde.telefon} />
            </dl>

            {/*
              Adresse aendern, ohne in die Datenbank zu muessen.

              Dieselbe Adresse bekommt das Angebot. Ein Tippfehler darin
              fiel bisher erst auf, wenn nichts zurueckkam
              (Kevin, 14.10.2026). Wird sie geaendert, geht der Kontakt
              auch neu zu Brevo.
            */}
            <details className="mt-3" open={!vorgang.kunde.ort || Boolean(adressvorschlag)}>
              <summary className="cursor-pointer text-xs text-leise">
                Kontakt und Anschrift ändern
              </summary>
              <form action={kontaktAendern.bind(null, vorgang.id)} className="mt-2 space-y-2">
                <input type="hidden" name="kundeId" value={vorgang.kunde.id} />
                {adressvorschlag && (
                  <p
                    className="rounded border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
                  >
                    Vorschlag aus dem Netz, bitte prüfen: {adressvorschlag.strasse},{" "}
                    {adressvorschlag.plz} {adressvorschlag.ort}
                    {adressvorschlag.quelle && (
                      <span className="block text-leise">Quelle: {adressvorschlag.quelle}</span>
                    )}
                  </p>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Firma</span>
                  <input
                    name="firma"
                    defaultValue={adressvorschlag?.firma ?? vorgang.kunde.name}
                    className="w-full text-sm"
                  />
                </label>
                {/*
                  Die Anschrift steht im Adressfeld des Angebots. Fehlt
                  sie, klappt dieser Bereich von selbst auf, damit sie
                  nicht vergessen wird (Florian, 15.10.2026).
                */}
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Straße und Hausnummer</span>
                  <input
                    name="strasse"
                    defaultValue={adressvorschlag?.strasse ?? vorgang.kunde.strasse ?? ""}
                    className="w-full text-sm"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">PLZ</span>
                    <input
                      name="plz"
                      defaultValue={adressvorschlag?.plz ?? vorgang.kunde.plz ?? ""}
                      maxLength={10}
                      className="w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Ort</span>
                    <input
                      name="ort"
                      defaultValue={adressvorschlag?.ort ?? vorgang.kunde.ort ?? ""}
                      className="w-full text-sm"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">E-Mail</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={vorgang.kunde.email}
                    className="w-full text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Ansprechpartner</span>
                  <input
                    name="ansprechpartner"
                    defaultValue={vorgang.kunde.ansprechpartner ?? ""}
                    className="w-full text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Telefon</span>
                  <input name="telefon" defaultValue={vorgang.kunde.telefon ?? ""} className="w-full text-sm" />
                </label>
                <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
                  Speichern
                </button>
                <p className="text-xs text-leise">
                  Firma, Anschrift und Ansprechpartner stehen damit im Adressfeld des Angebots. Der
                  Kontakt geht bei jedem Speichern auch an Brevo.
                </p>
              </form>

              {/*
                Die Anschrift im Netz suchen. Gespeichert wird nichts,
                der Vorschlag fuellt nur das Formular oben
                (Florian, 15.10.2026).
              */}
              <form action={adresseVorschlagen.bind(null, vorgang.id)} className="mt-2">
                <input type="hidden" name="firma" value={vorgang.kunde.name} />
                <input type="hidden" name="email" value={vorgang.kunde.email} />
                <input type="hidden" name="hinweis" value={vorgang.kunde.ort ?? ""} />
                <Absendeknopf text="Anschrift online suchen" laeuftText="Wird gesucht..." />
              </form>
            </details>
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

/** Die Auswahl aus dem Spielplan. Serverseitig, damit sie immer stimmt. */
async function TerminWahl({
  vorgangId,
  aktuell,
  wunsch,
}: {
  vorgangId: string;
  aktuell: string | null;
  /** Was der Kunde sich gewünscht hat, als Text aus der Anfrage. */
  wunsch?: string | null;
}) {
  const termine = await kommendeTermine(120).catch(() => []);

  /*
    Steht im Wunsch ein Datum, ist der passende Abend vorausgewählt.

    "wenn der Kunde schon gesagt hat, wann er möchte, sollte der Termin
    drin stehen" (Florian, 14.10.2026).
  */
  const passend = wunschTermin(wunsch, termine);

  return (
    <details className="mt-2" open={!aktuell}>
      <summary className="cursor-pointer text-xs text-leise">
        {aktuell ? "Termin ändern" : "Termin festlegen"}
      </summary>

      <form action={terminSetzen.bind(null, vorgangId)} className="mt-2 space-y-2">
        <select
          name="ditixEventId"
          defaultValue={aktuell ?? passend?.ditixEventId ?? ""}
          className="w-full text-sm"
        >
          <option value="">Termin offen lassen</option>
          {termine.map((t) => (
            <option key={t.ditixEventId} value={t.ditixEventId}>
              {datumKurz(t.datum)}, {t.uhrzeit} Uhr · {t.name}
              {t.ausverkauft ? " (ausverkauft)" : ""}
            </option>
          ))}
        </select>
        {passend && !aktuell && (
          <p className="text-xs" style={{ color: "var(--gut)" }}>
            Vorausgewählt nach dem Wunsch des Kunden: {datumKurz(passend.datum)}.
          </p>
        )}
        <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm">
          Speichern
        </button>
      </form>

      {/*
        Ein Abend ohne Show. Firmen mieten das Haus auch an spielfreien
        Tagen (Florian, 14.10.2026). Getrennt vom Spielplan-Formular,
        damit niemand aus Versehen beides ausfüllt.
      */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-leise">Tag ohne Show im Spielplan</summary>
        <form action={terminSetzen.bind(null, vorgangId)} className="mt-2 space-y-2">
          <input type="hidden" name="ditixEventId" value="" />
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Datum</span>
            <input name="freiesDatum" type="date" required className="w-full text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Wie soll der Abend heißen?</span>
            <input name="freierName" placeholder="Sonderveranstaltung" className="w-full text-sm" />
          </label>
          <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm">
            Termin ohne Show speichern
          </button>
          <p className="text-xs" style={{ color: "var(--warnung)" }}>
            Dafür gibt es keinen Saalplan, keine Auslastung und keinen Einlass über die App. Soll der
            Abend verkauft werden, muss er zuerst in Ditix angelegt werden.
          </p>
        </form>
      </details>
    </details>
  );
}

/** Der Abend, der zum Wunschtext des Kunden passt, falls einer darin steht. */
function wunschTermin<T extends { datum: string }>(wunsch: string | null | undefined, termine: T[]): T | undefined {
  const t = (wunsch ?? "").trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  const de = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/);

  let tag: string | null = null;
  if (iso) {
    tag = `${iso[1]}-${iso[2]}-${iso[3]}`;
  } else if (de) {
    const jahr = de[3].length === 2 ? `20${de[3]}` : de[3];
    tag = `${jahr}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  }
  return tag ? termine.find((x) => x.datum === tag) : undefined;
}

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-leise">{bezeichnung}</dt>
      <dd className="text-right">{wert || <span className="text-leise">nicht erfasst</span>}</dd>
    </div>
  );
}
