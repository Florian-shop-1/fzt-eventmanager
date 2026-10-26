import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import {
  belegung,
  bestueckung,
  parkplaetzeDesTages,
  PLAETZE_IM_HAUS,
  schichtName,
  schichtVon,
  tagesbelegung,
  type Parkplatzbuchung,
} from "@/lib/shop/parkplaetze";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { AbgesagtHinweis } from "@/components/AbgesagtHinweis";
import Link from "next/link";
import { Fragment } from "react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { SofortDrucken } from "@/components/SofortDrucken";
import { datumLang } from "@/lib/zeit";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  alsBuchung,
  darfParkplatzEintragen,
  handParkplaetzeAmTag,
  type HandParkplatz,
} from "@/lib/shop/parkplatz-hand";
import { parkplatzEintragen, parkplatzLoeschen, schildAbhaken } from "./aktionen";
import { gedruckteSchilder } from "@/lib/shop/parkplatz-gedruckt";

export const metadata = { title: "Parkplätze | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * VIP-Parkplätze und ihre Reservierungsschilder.
 *
 * Bisher lief das über eine Google-Tabelle: Zu jeder Buchung gehörte eine
 * eigene Präsentation, die einzeln geöffnet und gedruckt werden musste.
 * Bei fünf Parkplätzen an einem Abend sind das fünf Tabs und fünf
 * Druckvorgänge.
 *
 * Hier steht stattdessen die Liste des Tages, und ein Klick druckt alle
 * Schilder auf einmal. Jedes Schild ist eine eigene A4-Seite im
 * Querformat, damit es hinter die Windschutzscheibe oder auf den
 * Parkplatz passt und aus einigen Metern lesbar ist.
 */
export default async function ParkplaetzeSeite({
  searchParams,
}: {
  searchParams: Promise<{
    abend?: string;
    monat?: string;
    meldung?: string;
    nur?: string;
    sofort?: string;
    druck?: string;
  }>;
}) {
  const { abend, monat, meldung, nur, sofort, druck } = await searchParams;
  const ich = await angemeldeterBenutzer();
  const termine = await alleShowtage();
  // Welcher Abend gezeigt wird, entscheidet an einer Stelle für alle
  // Seiten: Adresse, dann der zuletzt angesehene Abend, dann heute.
  const { gewaehlt, monat: aufgeschlagenerMonat, heute } = await waehleAbend(termine, {
    abend,
    monat,
  });

  if (!gewaehlt) {
    return (
      <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
        <div className="font-medium">Keine Vorstellungen gefunden</div>
        <p className="mt-1 text-leise">
          Der Spielplan aus dem Ticketshop ist gerade nicht erreichbar.
        </p>
      </div>
    );
  }

  const termin = await findeTermin(gewaehlt);
  let buchungen: Parkplatzbuchung[] = [];
  let vonHand: HandParkplatz[] = [];
  let fehler: string | null = null;

  if (termin) {
    try {
      buchungen = await parkplaetzeDesTages(termin.datum);
    } catch (e) {
      // Faellt die Google-Tabelle aus, sollen wenigstens die eigenen
      // Eintraege noch dastehen: Sie liegen in unserer Datenbank.
      fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
    }
    /*
      Was wir selbst vergeben haben, kommt dazu: telefonisch gebucht oder
      verschenkt (Florian, 29.09.2026). Auf dem Parkplatz sieht man dem
      Auto nicht an, wie es gebucht wurde, deshalb landen beide Quellen in
      derselben Liste und im selben Druck.
    */
    vonHand = await handParkplaetzeAmTag(termin.datum).catch(() => []);
    buchungen = [
      ...buchungen,
      ...vonHand.map((h) => alsBuchung(h, termin.name, termin.uhrzeit ?? "")),
    ].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  /*
    Was schon gedruckt ist.

    Gedruckt wird am Tag vor der Show. Ohne diesen Vermerk weiss der
    naechste nicht, was der Kollege gestern gemacht hat, und druckt alles
    noch einmal (Florian, 05.10.2026).
  */
  const gedruckt = termin ? await gedruckteSchilder(termin.datum) : new Map();

  /*
    Was von gestern noch draussen haengt.

    "wichtig ist, dass z.b. wenn es keinen vip parkplatz gibt in einer
    show, dass nicht noch zettel von gestern drin haengen" (Florian,
    24.10.2026). Ein Schild mit fremdem Namen sperrt einen Platz, auf
    dem heute jeder stehen duerfte. Deshalb steht hier namentlich, was
    gestern hing und heute niemandem mehr gehoert.
  */
  const vortag = termin
    ? [...termine].map((t) => t.datum).filter((d) => d < termin.datum).sort().pop() ?? null
    : null;
  const vortagSchilder = vortag ? await gedruckteSchilder(vortag).catch(() => new Map()) : new Map();
  const vortagBuchungen = vortag ? await parkplaetzeDesTages(vortag).catch(() => []) : [];
  const abzunehmen = vortagBuchungen.filter(
    (alt) =>
      vortagSchilder.has(alt.orderId) &&
      !buchungen.some((heute) => heute.name.toLowerCase() === alt.name.toLowerCase()),
  );
  const offeneBuchungen = buchungen.filter((b) => !gedruckt.has(b.orderId));
  const schonGedruckt = buchungen.length - offeneBuchungen.length;

  // Ein Schild je Platz, nicht je Buchung: Wer zwei Plätze bucht, braucht
  // auch zwei Schilder.
  const alleSchilder = buchungen.flatMap((b) =>
    Array.from({ length: b.anzahl }, (_, i) => ({ ...b, nummer: i + 1 })),
  );

  /*
    Ein einzelnes Schild nachdrucken.

    Der Normalfall bleibt der Stapel am Nachmittag. Aber es kommt jemand
    nach, ein Blatt verknittert, ein Name wird korrigiert: Dann soll nicht
    der ganze Abend noch einmal aus dem Drucker kommen (Florian,
    30.09.2026). Gedruckt werden alle Schilder dieser einen Buchung, denn
    wer zwei Plaetze hat, braucht auch zwei.
  */
  /*
    Gedruckt wird, was noch offen ist.

    "wichtig ist, dass man wenn der kollege es am tag davor schon erledigt
    hat, nicht nochmal macht" (Florian, 05.10.2026). Wer trotzdem alles
    braucht, etwa weil ein Blatt verknittert ist, nimmt den Link daneben.
  */
  const schilder = nur
    ? alleSchilder.filter((x) => x.orderId === nur)
    : druck === "alle"
      ? alleSchilder
      : alleSchilder.filter((x) => !gedruckt.has(x.orderId));
  /*
    Zwei Zahlen, die auseinandergehalten gehoeren.

    "plaetze" ist, was gleich aus dem Drucker kommt, also meist nur das
    Offene. "gesamtPlaetze" ist, was der Abend ueberhaupt hat. Die Liste
    am Bildschirm richtet sich nach der zweiten: Sonst verschwindet sie,
    sobald alles abgehakt ist, und niemand kommt mehr an "rückgängig"
    (Florian, 05.10.2026: "da steht aber jetzt, dass alle hängen.. wie
    nehme ich es für den tag zurück").
  */
  const plaetze = schilder.length;
  const gesamtPlaetze = alleSchilder.length;

  /*
    Mittags oder abends?

    Das Foyer konnte an einem Tag mit zwei Shows nicht sehen, zu welcher
    ein Platz gehoert (Florian, 24.10.2026). An einem Tag mit einer Show
    ist die Frage keine, deshalb bleibt die Liste dort so schlicht wie
    bisher. An einem Tag mit zwei Shows wird nach Show getrennt, mit
    Ueberschrift, und daneben steht, wie lange das Auto steht.
  */
  const showsDesTages = termine.find((t) => t.ditixEventId === gewaehlt)?.shows ?? [];
  const doppelshow = new Set(showsDesTages.map((x) => x.uhrzeit)).size > 1;
  // Die Mittagsshow gibt die Zeit vor, zu der die Abendschilder rausgehen.
  const ersteShow = doppelshow ? [...showsDesTages.map((x) => x.uhrzeit)].sort()[0] : "";

  const gruppen = [...new Set(buchungen.map((b) => b.uhrzeit))]
    .sort((a, b) => a.localeCompare(b))
    .map((uhrzeit) => {
      const eigene = buchungen.filter((b) => b.uhrzeit === uhrzeit);
      return {
        uhrzeit,
        schicht: schichtVon(uhrzeit),
        buchungen: eigene,
        plaetze: eigene.reduce((summe, b) => summe + b.anzahl, 0),
      };
    });

  // Beide Shows haben Plaetze: Dann braucht das Foyer die Regel schwarz
  // auf weiss, denn nur dann wird es eng und nur dann wird umgehaengt.
  const beideShows =
    gruppen.some((g) => g.schicht === "mittag") && gruppen.some((g) => g.schicht === "abend");
  // Mittagsplaetze, die am Nachmittag wieder frei werden.
  const werdenFrei = buchungen.filter((b) => belegung(b).freiAb);
  // Sieben Plaetze hat das Haus. Mehr kann niemand einweisen.
  const stand = tagesbelegung(buchungen);
  const einzeln = Boolean(nur) && plaetze > 0;
  const einzelName = einzeln ? schilder[0].name : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VIP-Parkplätze</h1>
          <p className="mt-1 text-sm text-leise">
            Wer einen Platz gebucht hat, und die Schilder zum Ausdrucken.
          </p>
        </div>
        {gesamtPlaetze > 0 && (
          <div className="text-right">
            {plaetze > 0 && (
            <DruckKnopf
              text={
                nur || druck === "alle"
                  ? `${plaetze} ${plaetze === 1 ? "Schild" : "Schilder"} drucken`
                  : `${plaetze} offene ${plaetze === 1 ? "Schild" : "Schilder"} drucken`
              }
              hinweis="Je eine A4-Seite, Querformat"
            />
            )}
            {!nur && druck !== "alle" && alleSchilder.length > plaetze && (
              <div className="mt-1 text-xs text-leise">
                <Link
                  href={`/parkplaetze?abend=${encodeURIComponent(gewaehlt)}&druck=alle`}
                  className="underline"
                >
                  alle {alleSchilder.length} noch einmal drucken
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/*
        Zwei Saetze, die am Drucker gebraucht werden.

        Der eine sagt, was schon erledigt ist, der andere, wie die
        Schilder auf den Platz kommen: von links nach rechts, denn ganz
        rechts steht der schlechteste Platz (Florian, 05.10.2026).
      */}
      {buchungen.length > 0 && (
        <div className="space-y-2 print:hidden">
          <p
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: offeneBuchungen.length === 0 ? "var(--gut)" : "var(--warnung)",
              background: offeneBuchungen.length === 0 ? "var(--gut-hell)" : "var(--warnung-hell)",
            }}
          >
            {offeneBuchungen.length === 0 ? (
              <>
                <strong>Alle Schilder hängen.</strong> Für diesen Abend ist nichts mehr zu tun.
              </>
            ) : schonGedruckt === 0 ? (
              <>
                <strong>Noch kein Schild draußen.</strong>{" "}
                {doppelshow
                  ? "Die Schilder der Mittagsshow am Tag davor, die der Abendshow erst während der Mittagsshow. Was wann drankommt, steht unten an jeder Show."
                  : "Drucken und aufstellen am besten schon am Tag vor der Show."}
              </>
            ) : (
              <>
                <strong>
                  {offeneBuchungen.length} {offeneBuchungen.length === 1 ? "Schild fehlt" : "Schilder fehlen"} noch
                  draußen.
                </strong>{" "}
                {schonGedruckt} {schonGedruckt === 1 ? "hängt" : "hängen"} schon, die stehen unten mit Haken.
                Bitte nur die offenen drucken und aufstellen.
              </>
            )}
          </p>
          <p className="rounded-lg border border-linie px-4 py-3 text-sm text-leise">
            <strong>Beim Aufstellen:</strong> die Schilder von links nach rechts bestücken. Der Platz ganz
            rechts ist der schlechteste, der bleibt zuletzt.
            <br />
            {/*
              Was der Haken bedeutet, steht dabei.

              "erledigt heißt beim parkplatz es hängt auch wirklich
              draussen" (Florian, 05.10.2026). Gedruckt allein reicht
              nicht: Ein Stapel im Buero hilft dem Gast nicht.
            */}
            <strong>Erledigt</strong> heißt: Das Schild ist gedruckt <em>und</em> hängt draußen am Platz. Hast
            du dich verklickt, nimmst du es mit „rückgängig“ wieder zurück.
          </p>

          {/*
            Die Regel für Tage mit zwei Shows.

            Sie steht nur da, wenn beide Shows Plätze haben: An jedem
            anderen Tag wäre sie ein Absatz, den man wegliest. Hier ist sie
            das, was der Mitarbeiter wissen muss, bevor er ein Schild
            umhängt (Florian, 24.10.2026).
          */}
          {/*
            Wann heute bestueckt wird.

            Steht an jedem Tag mit zwei Shows, auch wenn nur eine der
            beiden Plaetze hat: Der Zeitpunkt ist das, was im Foyer
            gefehlt hat (Florian, 24.10.2026).
          */}
          {doppelshow && gruppen.length > 0 && (
            <div className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
              <strong>Heute zwei Shows. So werden die Schilder aufgestellt:</strong>
              <ul className="mt-2 space-y-1">
                {gruppen.map((g) => {
                  const wann = bestueckung(g.uhrzeit, ersteShow);
                  return (
                    <li key={g.uhrzeit || "ohne"}>
                      <strong>
                        {schichtName(g.schicht)} {g.uhrzeit}, {g.plaetze}{" "}
                        {g.plaetze === 1 ? "Platz" : "Plätze"}:
                      </strong>{" "}
                      <span className="text-leise">{wann.satz}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-leise">
                Hat eine Show keinen VIP-Parkplatz, steht für sie auch kein Schild draußen. Dann bitte
                nachsehen, ob noch eins von gestern hängt, und es abnehmen.
              </p>
            </div>
          )}

          {stand.zuViel && (
            <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
              <strong style={{ color: "var(--blocker)" }}>
                Mehr Plätze vergeben als das Haus hat.
              </strong>{" "}
              Wir haben {PLAETZE_IM_HAUS} VIP-Parkplätze. Belegt sind mittags {stand.mittag}, abends{" "}
              {stand.abend}. Bitte mit Florian oder Kevin klären, wer auf das öffentliche Parkhaus
              nebenan ausweicht, und den Gast vorher anrufen, nicht erst am Eingang.
            </div>
          )}

          {beideShows && (
            <div className="rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm">
              <strong>Heute zwei Shows, und beide haben Parkplätze.</strong>
              <ul className="mt-2 space-y-1 text-leise">
                <li>
                  <strong>Ein Platz wird pro Tag nur einmal vergeben.</strong> Ein Schild, ein Name, kein
                  Umhängen zwischen den Shows. Nur wenn die Plätze nicht reichen, wird einer
                  weitergegeben, und zwar genau der, bei dem hier „frei ab“ steht.
                </li>
                <li>
                  <strong>Mittagsshow mit Menü:</strong> Der Gast bleibt zum Essen im Haus. Das Auto steht
                  den ganzen Tag, der Platz ist für den Abend weg.
                </li>
                <li>
                  <strong>Mittagsshow ohne Menü:</strong> Der Gast fährt nach der Show heim. Der Platz wird
                  gegen 17:30 frei, manchmal erst um 18 Uhr.
                </li>
                <li>
                  <strong>Abendgäste kommen ab 17:30.</strong> Wird ein Platz erst dann frei, kann es sich
                  überschneiden. Dann den Abendgast am Eingang abfangen und einweisen, nicht auf
                  dem Platz warten lassen.
                </li>
              </ul>
              {werdenFrei.length > 0 && (
                <p className="mt-2">
                  Betrifft heute:{" "}
                  <strong>
                    {werdenFrei.map((b) => b.name).join(", ")}
                  </strong>{" "}
                  — {werdenFrei.length === 1 ? "dieser Platz" : "diese Plätze"} wird gegen 17:30 frei.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/*
        Zuerst abraeumen, dann aufstellen.

        Steht bewusst ueber allem anderen und auch dann da, wenn heute
        gar keine Plaetze gebucht sind: Genau an so einem Tag faellt
        sonst niemandem auf, dass draussen noch die Namen von gestern
        haengen (Florian, 24.10.2026).
      */}
      {abzunehmen.length > 0 && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
          <strong style={{ color: "var(--blocker)" }}>
            Zuerst: {abzunehmen.length === 1 ? "ein Schild" : `${abzunehmen.length} Schilder`} von{" "}
            {datumKurz(vortag ?? "")} abnehmen.
          </strong>{" "}
          Draußen {abzunehmen.length === 1 ? "hängt" : "hängen"} noch{" "}
          <strong>{abzunehmen.map((b) => b.name).join(", ")}</strong>. Diese Gäste kommen heute nicht,
          der Platz gehört heute niemandem mehr. Ein altes Schild sperrt einen freien Platz, auf dem
          jeder Gast stehen dürfte.
        </div>
      )}

      {sofort === "1" && <SofortDrucken bereit={plaetze > 0} bereich=".parkschilder" />}

      {einzeln && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm print:hidden">
          <span>
            Nur {plaetze === 1 ? "das Schild" : `die ${plaetze} Schilder`} für <strong>{einzelName}</strong>.
          </span>
          <Link href={`/parkplaetze?abend=${encodeURIComponent(gewaehlt)}`} className="underline">
            Zurück zur ganzen Liste
          </Link>
        </div>
      )}

      <div className="print:hidden">
        <AbendAuswahl
          basisPfad="/parkplaetze"
          gewaehlt={gewaehlt}
          monat={aufgeschlagenerMonat}
        heute={heute}
          abende={termine.map((t) => ({
            ditixEventId: t.ditixEventId,
            abgesagt: t.abgesagt,
            datum: t.datum,
            uhrzeit: t.uhrzeit,
            uhrzeiten: t.uhrzeiten,
            name: t.name,
            hinweis: t.gaeste > 0 ? `${t.gaeste} am Tisch` : "keine Gäste am Tisch",
          }))}
        />
        <AbgesagtHinweis
          abgesagt={termine.find((t) => t.ditixEventId === gewaehlt)?.abgesagt}
          teilweise={termine
            .find((t) => t.ditixEventId === gewaehlt)
            ?.shows.filter((x) => x.abgesagt)
            .map((x) => x.uhrzeit)}
        />
      </div>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {/* Die Übersicht am Bildschirm */}
      <section className="rounded-lg border border-linie bg-flaeche p-6 print:hidden">
        <h2 className="mb-1 font-semibold">
          {termin ? datumKurz(termin.datum) : "Abend"} ·{" "}
          {gesamtPlaetze === 0
            ? "keine Parkplätze gebucht"
            : `${gesamtPlaetze} ${gesamtPlaetze === 1 ? "Platz" : "Plätze"} von ${PLAETZE_IM_HAUS}`}
        </h2>
        {/*
          Zwei Zahlen statt einer, denn am Nachmittag wechselt die Lage:
          Ein Mittagsgast ohne Menü fährt heim, seiner wird wieder frei.
        */}
        {gesamtPlaetze > 0 && doppelshow && (
          <p className="text-sm text-leise">
            Mittags {stand.mittag} von {PLAETZE_IM_HAUS} belegt, abends {stand.abend}.{" "}
            {stand.wechsel > 0
              ? `${stand.wechsel} ${stand.wechsel === 1 ? "Platz wird" : "Plätze werden"} am Nachmittag wieder frei.`
              : "Keiner wird zwischendurch frei."}
          </p>
        )}

        {gesamtPlaetze === 0 ? (
          <p className="mt-2 text-sm text-leise">
            Für diesen Abend hat niemand einen VIP-Parkplatz gebucht. Es ist nichts
            vorzubereiten.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="pb-1 font-medium">Kunde</th>
                <th className="w-24 pb-1 text-right font-medium">Plätze</th>
                <th className="w-44 pb-1 font-medium">Platz belegt</th>
                <th className="w-52 pb-1 font-medium">Hängt draußen</th>
                <th className="w-36 pb-1 font-medium">Schild</th>
                <th className="w-32 pb-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gruppen.map((g) => (
                <Fragment key={g.uhrzeit || "ohne"}>
                  {/*
                    Die Überschrift nur an Tagen mit zwei Shows. Sonst wäre
                    sie eine Zeile, die nichts sagt.
                  */}
                  {doppelshow && (
                    <tr>
                      <td colSpan={6} className="pt-4 pb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {schichtName(g.schicht)}
                          {g.uhrzeit ? " · " + g.uhrzeit : ""}
                        </span>{" "}
                        <span className="text-xs text-leise">
                          {g.plaetze} {g.plaetze === 1 ? "Platz" : "Plätze"}
                        </span>
                        {/*
                          Wann diese Schilder rausgehen. Die der Abendshow erst
                          während der Mittagsshow, damit die Plätze bis dahin
                          für alle frei sind (Florian, 24.10.2026).
                        */}
                        <div className="mt-0.5 text-xs" style={{ color: "var(--gold-dunkel)" }}>
                          Schilder {bestueckung(g.uhrzeit, ersteShow).kurz} aufstellen
                        </div>
                      </td>
                    </tr>
                  )}
                  {g.buchungen.map((b) => (
                <tr key={b.orderId + b.name} className="border-b border-linie last:border-0">
                  <td className="py-2">
                    <div className="font-medium">
                      {b.name}
                      {b.quelle === "ditix" && (
                        <span
                          className="ml-2 rounded px-1.5 py-0.5 text-[11px] text-leise"
                          style={{ border: "1px solid var(--linie)" }}
                        >
                          aus Ditix
                        </span>
                      )}
                      {b.orderId.startsWith("hand:") && (
                        <span
                          className="ml-2 rounded px-1.5 py-0.5 text-[11px]"
                          style={{ background: "var(--gold-hell)" }}
                        >
                          von Hand
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-leise">
                      {b.eventName}
                      {(() => {
                        const h = vonHand.find((x) => `hand:${x.id}` === b.orderId);
                        if (!h) return null;
                        return (
                          <>
                            {h.notiz ? ` · ${h.notiz}` : ""}
                            {h.erfasstVon ? ` · eingetragen von ${h.erfasstVon}` : ""}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{b.anzahl}</td>

                  {/*
                    Wie lange das Auto steht.

                    Mit Menü bleibt der Gast im Haus, der Platz ist für den
                    Tag weg. Ohne Menü wird er nachmittags frei. Das ist die
                    Auskunft, die das Foyer am Telefon braucht, deshalb steht
                    sie in der Liste und nicht in einer Fußnote.
                  */}
                  <td className="py-2 text-xs">
                    {(() => {
                      const z = belegung(b);
                      return (
                        <>
                          <div
                            className="font-medium"
                            style={{ color: z.freiAb ? "var(--warnung)" : undefined }}
                          >
                            {z.kurz}
                          </div>
                          <div className="text-leise">
                            {b.menue === true
                              ? "mit Menü"
                              : b.menue === false
                                ? "ohne Menü"
                                : "Menü nicht bekannt"}
                          </div>
                        </>
                      );
                    })()}
                  </td>

                  {/*
                    Erledigt, mit Namen.

                    Ist schon etwas gedruckt und dieser Platz nicht, faellt
                    er auf: Dann ist er nach dem Stapel dazugekommen
                    (Florian, 05.10.2026).
                  */}
                  <td className="py-2 text-xs">
                    {(() => {
                      const v = gedruckt.get(b.orderId);
                      if (v) {
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <span style={{ color: "var(--gut)" }}>
                              ✓ hängt · {v.von || "erledigt"}, {datumKurz(v.am.slice(0, 10))}
                            </span>
                            {darfParkplatzEintragen(ich) && (
                              <form action={schildAbhaken}>
                                <input type="hidden" name="abend" value={gewaehlt} />
                                <input type="hidden" name="datum" value={termin?.datum ?? ""} />
                                <input type="hidden" name="orderId" value={b.orderId} />
                                <input type="hidden" name="name" value={b.name} />
                                <input type="hidden" name="an" value="nein" />
                                <button type="submit" className="text-leise underline">
                                  rückgängig
                                </button>
                              </form>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          {schonGedruckt > 0 && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase"
                              style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}
                            >
                              neu dazugekommen
                            </span>
                          )}
                          {darfParkplatzEintragen(ich) && (
                            <form action={schildAbhaken}>
                              <input type="hidden" name="abend" value={gewaehlt} />
                              <input type="hidden" name="datum" value={termin?.datum ?? ""} />
                              <input type="hidden" name="orderId" value={b.orderId} />
                              <input type="hidden" name="name" value={b.name} />
                              <input type="hidden" name="an" value="ja" />
                              <button
                                type="submit"
                                className="rounded-md border border-linie px-2.5 py-1 hover:bg-gold-hell"
                              >
                                Erledigt
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="py-2 text-xs">
                    {/*
                      Das Schild dieser einen Buchung, ohne den ganzen
                      Stapel. Der Weg fuehrt ueber die Adresse, damit auch
                      der zweite Rechner im Buero denselben Druck bekommt.
                    */}
                    <Link
                      href={`/parkplaetze?abend=${encodeURIComponent(gewaehlt)}&nur=${encodeURIComponent(b.orderId)}&sofort=1`}
                      className="rounded-md border border-linie px-2.5 py-1 hover:bg-gold-hell"
                    >
                      Schild drucken
                    </Link>
                  </td>
                  <td className="py-2 text-xs">
                    {b.orderId.startsWith("hand:") ? (
                      darfParkplatzEintragen(ich) ? (
                        <form action={parkplatzLoeschen}>
                          <input type="hidden" name="id" value={b.orderId.slice(5)} />
                          <input type="hidden" name="abend" value={gewaehlt} />
                          <button type="submit" className="text-leise underline hover:text-text">
                            wieder entfernen
                          </button>
                        </form>
                      ) : (
                        <span className="text-leise">von Hand vergeben</span>
                      )
                    ) : null}
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Einen Platz selbst vergeben: telefonisch gebucht oder geschenkt.
          --------------------------------------------------------------- */}
      {darfParkplatzEintragen(ich) && termin && (
        <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm print:hidden">
          <summary className="cursor-pointer font-medium">Parkplatz von Hand eintragen</summary>
          <p className="mt-2 max-w-prose text-xs text-leise">
            Für Gäste ohne Buchung im Shop: telefonisch gebucht, oder weil wir jemandem einen Platz
            schenken. Das Schild wird genauso gedruckt wie für eine Buchung.
          </p>
          <form action={parkplatzEintragen} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="abend" value={gewaehlt} />
            <input type="hidden" name="datum" value={termin.datum} />
            {/*
              Zu welcher Show, und bleibt der Gast zum Essen?

              Bei einer Buchung aus dem Shop steht beides in den Daten. Von
              Hand stand bisher nur der Tag, und genau daran ist das Foyer
              hängengeblieben. Die Show fragen wir nur, wenn es an dem Tag
              zwei gibt.
            */}
            {doppelshow ? (
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Für welche Show</span>
                <select name="uhrzeit" defaultValue={showsDesTages[0]?.uhrzeit ?? ""} className="w-44">
                  {showsDesTages.map((x) => (
                    <option key={x.uhrzeit} value={x.uhrzeit}>
                      {schichtName(schichtVon(x.uhrzeit))} · {x.uhrzeit}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="uhrzeit" value={termin.uhrzeit ?? ""} />
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Menü dazu</span>
              <select name="menue" defaultValue="" className="w-40">
                <option value="">weiß ich nicht</option>
                <option value="ja">ja, isst bei uns</option>
                <option value="nein">nein, nur Show</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Name (so steht er auf dem Schild)</span>
              <input name="name" required className="w-64" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">E-Mail (falls bekannt)</span>
              <input name="email" type="email" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Plätze</span>
              <input name="anzahl" type="number" min={1} max={20} defaultValue={1} className="w-20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Warum (nur intern)</span>
              <input name="notiz" placeholder="telefonisch gebucht" className="w-64" />
            </label>
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
          <p className="mt-3 text-xs text-leise">
            Gilt für den {termin ? datumKurz(termin.datum) : "gewählten Abend"}. Für einen anderen Abend
            oben umschalten.
          </p>
        </details>
      )}

      {/* Die Schilder. Am Bildschirm unsichtbar, im Druck je eine Seite. */}
      <div className="parkschilder hidden print:block">
        {schilder.map((s, i) => (
          <Schild key={s.orderId + s.name + i} buchung={s} zeigeShow={doppelshow} />
        ))}
      </div>
    </div>
  );
}

/**
 * Ein Reservierungsschild, eine A4-Seite quer.
 *
 * Die Gestaltung ist nicht nachgebaut, sondern die Originalvorlage aus der
 * bisherigen Google-Präsentation: Rahmen, Logo, Goldstaub, die Überschrift
 * "VIP-Parkplatz" und die Zeile "Reserviert für" sind Teil des Bildes.
 * Darüber liegen nur zwei Textzeilen, Name und Datum, genau wie in Slides.
 *
 * Auch die Maße stammen aus der Originaldatei, nicht aus dem Augenmaß:
 * Die Folie ist 29,7 x 21,0 cm, der Name sitzt bei 59,6 Prozent Höhe in
 * 55 pt, das Datum bei 78,6 Prozent in 16 pt. Deshalb ist das Schild in
 * Millimetern gesetzt statt in Bildschirmeinheiten: Auf Papier soll es
 * dasselbe sein wie bisher, nicht ungefähr dasselbe.
 */
function Schild({
  buchung,
  zeigeShow,
}: {
  buchung: Parkplatzbuchung;
  /** An Tagen mit zwei Shows steht die Show mit auf dem Schild. */
  zeigeShow: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: "297mm",
        height: "210mm",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
      {/* Als Bild, nicht als Hintergrund: Hintergründe lassen Browser beim
          Drucken standardmäßig weg, Bilder nicht. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bilder/parkschild.jpg"
        alt=""
        className="absolute inset-0"
        style={{ width: "297mm", height: "210mm" }}
      />

      <div
        className="absolute flex items-center justify-center text-center font-semibold leading-none"
        style={{
          left: "23.2mm",
          width: "250.6mm",
          top: "125.2mm",
          height: "35.1mm",
          fontSize: schriftgroesse(buchung.name),
        }}
      >
        {buchung.name}
      </div>

      <div
        className="absolute flex items-center justify-center text-center"
        style={{ left: "23.2mm", width: "250.6mm", top: "165.1mm", height: "13.2mm", fontSize: "16pt" }}
      >
        {/*
          An einem Tag mit einer Show steht hier das Datum, genau wie
          bisher. Hat der Tag zwei Shows, kommt die Show dazu: Dann sieht
          auch der Gast am Platz, dass das Schild ihm gilt, und das Foyer
          erkennt es beim Aufstellen (Florian, 24.10.2026).
        */}
        {datumLang(buchung.datum)}
        {zeigeShow && buchung.uhrzeit
          ? " · " + schichtName(schichtVon(buchung.uhrzeit)) + " " + buchung.uhrzeit
          : ""}
      </div>
    </div>
  );
}

/**
 * Schriftgröße des Namens.
 *
 * Im Original stehen 55 pt, dafür ist der Kasten 250 mm breit, das reicht
 * für rund zwanzig Zeichen. Längere Namen werden kleiner gesetzt, sonst
 * laufen sie über den Zierrahmen. "Mohamed Khaireddine Ben Hafsa" ist ein
 * echter Gast von uns, keine erfundene Grenze.
 */
function schriftgroesse(name: string): string {
  const zeichen = name.trim().length;
  if (zeichen <= 20) return "55pt";
  if (zeichen <= 26) return "44pt";
  if (zeichen <= 34) return "34pt";
  return "28pt";
}
