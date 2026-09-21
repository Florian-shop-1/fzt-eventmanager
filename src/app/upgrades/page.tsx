import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { termineDesTages, findeTermin, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { holeSaalplan, type Saalplan, type Sitz } from "@/lib/ditix/saalplan";
import { empfehlung, gaestePlaetze, type Bereich, type Empfehlung } from "@/lib/seating/upgrade";
import { gaesteDerVorstellung, type Gast } from "@/lib/db/gaesteliste";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { gastGesetzt } from "@/app/gaesteliste/aktionen";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import { datumLang, datumMitWochentag } from "@/lib/zeit";
import { UpgradeTafel, type TafelGruppe, type TafelSitz } from "@/components/UpgradeTafel";
import { umsetzungenDerVorstellung } from "@/lib/db/upgradeumsetzung";

export const metadata = { title: "Upgrades | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/** Buchstaben für die Umzüge: A, B, C ... */
function buchstabe(i: number): string {
  return String.fromCharCode(65 + i);
}

/** "Platz 7 bis 8" oder "Platz 7". */
function plaetze(b: Bereich): string {
  return b.von === b.bis ? `Platz ${b.von}` : `Platz ${b.von} bis ${b.bis}`;
}

/**
 * Upgrades: die hinteren Reihen nach vorne holen.
 *
 * An schwach verkauften Abenden sitzen vorne Grüppchen und hinten eine
 * gut gefüllte Reihe. Von der Bühne aus sieht das leer aus. Das Showteam
 * spricht die Gäste der letzten Reihe beim Einlass an, verschenkt ein
 * Upgrade und schickt sie nach vorn.
 *
 * Gruppen bleiben dabei immer zusammen. Wer zu viert kommt, sitzt auch
 * vorne zu viert nebeneinander.
 *
 * Diese Seite ist dafür da, ausgedruckt zu werden. Der Mitarbeiter hat
 * sie am Einlass in der Hand, zeigt den Gästen ihren neuen Platz und
 * hakt ihn ab, sobald sie sitzen.
 */
export default async function UpgradeSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string; show?: string }>;
}) {
  const { abend, monat, show } = await searchParams;

  const termine = await alleShowtage();
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

  const tag = await findeTermin(gewaehlt);
  const shows = tag ? await termineDesTages(tag.datum) : [];

  // An Tagen mit zwei Vorstellungen wird jede für sich verkauft, also
  // auch für sich umgesetzt. Ohne ausdrückliche Wahl die erste.
  const vorstellung: Vorstellungstermin | undefined =
    shows.find((s) => s.ditixEventId === show) ?? shows[0];

  let plan: Saalplan | null = null;
  let fehler: string | null = null;
  if (vorstellung?.seatmapEventId) {
    try {
      plan = await holeSaalplan(vorstellung.seatmapEventId);
    } catch (e) {
      fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
    }
  }

  const rat = plan ? empfehlung(plan) : null;

  // Die Gästeliste: ohne Ticket, vor Ort zu setzen. Vorschläge nach den Upgrades.
  const gaeste = vorstellung ? await gaesteDerVorstellung(vorstellung.ditixEventId) : [];
  const vorschlaege = rat ? gaestePlaetze(rat, gaeste.filter((g) => !g.platz)) : new Map<string, Bereich | null>();
  const benutzer = await angemeldeterBenutzer();
  const darfEintragen = benutzer?.rolle === "chef" || benutzer?.rolle === "team";
  // Was am Einlass schon gesetzt wurde. Steht ueber dem Vorschlag: Der Plan
  // ist eine Empfehlung, gezaehlt wird, was der Einlass eingetippt hat.
  const umsetzungen = vorstellung ? await umsetzungenDerVorstellung(vorstellung.ditixEventId) : [];

  return (
    <div className="space-y-6">
      <Druckkopf
        titel="Upgrades"
        untertitel={
          vorstellung
            ? `${datumLang(vorstellung.datum)}, ${vorstellung.uhrzeit} Uhr, ${vorstellung.name}`
            : undefined
        }
      />

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upgrades</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Wer hinter dem gestrichelten Kasten sitzt, kommt hinein, die letzte Reihe zuerst.
            Dort kann gespielt werden, dort wirkt der Saal voll. Gruppen bleiben zusammen, und
            niemand wird nach hinten gesetzt. Ausdrucken, am Einlass ansprechen, abhaken.
          </p>
        </div>
        {((rat && rat.umzuege.length > 0) || gaeste.length > 0) && (
          <DruckKnopf text="Plan drucken" hinweis="mit Liste zum Abhaken" />
        )}
      </header>

      <div className="print:hidden">
        <AbendAuswahl
          basisPfad="/upgrades"
          gewaehlt={gewaehlt}
          monat={aufgeschlagenerMonat}
          heute={heute}
          abende={termine.map((t) => ({
            ditixEventId: t.ditixEventId,
            datum: t.datum,
            uhrzeit: t.uhrzeit,
            uhrzeiten: t.uhrzeiten,
            name: t.name,
            hinweis: t.uhrzeiten.length > 1 ? `${t.uhrzeiten.length} Vorstellungen` : t.name,
          }))}
        />
      </div>

      {/*
        Zwei Shows am Tag sind zwei verschiedene Säle: eigener Verkauf,
        eigener Plan, eigener Ausdruck. Deshalb groß zum Umschalten und
        darunter deutlich, welche gerade zu sehen ist (Florian, 19.09.2026).
      */}
      {shows.length > 1 && vorstellung && (
        <nav className="grid gap-2 sm:grid-cols-2 print:hidden" aria-label="Vorstellung wählen">
          {shows.map((s) => {
            const aktiv = s.ditixEventId === vorstellung.ditixEventId;
            return (
              <Link
                key={s.ditixEventId}
                href={`/upgrades?abend=${gewaehlt}&monat=${aufgeschlagenerMonat ?? ""}&show=${s.ditixEventId}`}
                aria-current={aktiv ? "page" : undefined}
                className={`rounded-lg border-2 px-4 py-3 ${aktiv ? "border-gold bg-gold-hell" : "border-linie bg-flaeche hover:border-gold"}`}
              >
                <span className="block text-xs uppercase tracking-wide text-leise">
                  {tageszeitDerShow(s.uhrzeit)}
                </span>
                <span className="block text-lg font-semibold">{s.uhrzeit} Uhr</span>
                <span className="block text-sm text-leise">{s.name}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {vorstellung && (
        <h2 className="text-xl font-semibold tracking-tight print:hidden">
          {datumMitWochentag(vorstellung.datum)}, {vorstellung.uhrzeit} Uhr
          <span className="font-normal text-leise"> · {vorstellung.name}</span>
          {shows.length > 1 && (
            <span className="ml-2 align-middle text-xs font-normal text-leise">
              (nur diese Vorstellung, die andere hat ihren eigenen Plan)
            </span>
          )}
        </h2>
      )}

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
          <strong style={{ color: "var(--blocker)" }}>Saalplan nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {!vorstellung?.seatmapEventId && !fehler && (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm print:hidden">
          <div className="font-medium">Für diese Vorstellung gibt es keinen Saalplan</div>
          <p className="mt-1 text-leise">Ohne Saalplan lässt sich nicht sagen, wer wo sitzt.</p>
        </div>
      )}

      {plan && rat && vorstellung && (
        <>
          <Lage plan={plan} rat={rat} vorstellung={vorstellung} gaesteliste={gaeste.reduce((n, g) => n + g.anzahl, 0)} />
          <Umzugsliste rat={rat} />
        </>
      )}

      {vorstellung && (gaeste.length > 0 || darfEintragen) && (
        <Gaesteliste
          gaeste={gaeste}
          vorschlaege={vorschlaege}
          mitVorschlag={Boolean(rat)}
          eintragenLink={darfEintragen ? `/gaesteliste?v=${vorstellung.ditixEventId}` : null}
        />
      )}

      {plan && rat && vorstellung && (
        <UpgradeTafel
          eventId={vorstellung.ditixEventId}
          sitze={tafelSitze(plan, rat)}
          gruppen={tafelGruppen(rat, gaeste, vorschlaege)}
          umsetzungen={umsetzungen.map((u) => ({
            schluessel: u.schluessel,
            zielText: u.zielText,
            zielIds: u.zielIds,
            gesetztVon: u.gesetztVon,
          }))}
          zone={{ links: rat.zone.links, rechts: rat.zone.rechts, oben: rat.zone.oben, unten: rat.zone.unten }}
        />
      )}

      {plan && rat && (
        <Saalzeichnung plan={plan} rat={rat} gaeste={gaeste} vorschlaege={vorschlaege} />
      )}
    </div>
  );
}

/** "Mittagsshow" oder "Abendshow", damit man die beiden nicht verwechselt. */
function tageszeitDerShow(uhrzeit: string): string {
  if (uhrzeit < "13:00") return "Vormittagsshow";
  if (uhrzeit < "18:00") return "Mittagsshow";
  return "Abendshow";
}

/** Die Lage des Abends in Zahlen. */
function Lage({
  plan,
  rat,
  vorstellung,
  gaesteliste,
}: {
  plan: Saalplan;
  rat: Empfehlung;
  vorstellung: Vorstellungstermin;
  /** Gäste ohne Ticket von der Gästeliste, sie sitzen trotzdem im Saal. */
  gaesteliste: number;
}) {
  const gesamt = plan.verkauft + gaesteliste;
  const quote = Math.round((plan.verkauft / Math.max(1, plan.sitze.length)) * 100);
  const hintenGesamt = rat.gruppen.reduce((n, g) => n + g.sitze.length, 0);
  const quellen = [...new Set(rat.gruppen.map((g) => `Reihe ${g.reihe.nummer}`))].join(", ");

  return (
    <section className="space-y-3">
      <p className="hidden text-sm print:block">
        <strong>{gesamt} Zuschauer gesamt</strong>
        {gaesteliste > 0 && ` (${plan.verkauft} verkauft + ${gaesteliste} Gästeliste)`}.{" "}
        {plan.verkauft} von {plan.sitze.length} Plätzen verkauft ({quote} Prozent). Umzusetzen:{" "}
        {rat.gaeste} Gäste in {rat.umzuege.length}{" "}
        {rat.umzuege.length === 1 ? "Gruppe" : "Gruppen"} aus {quellen || "keiner Reihe"}.
      </p>

      <div className="flex flex-wrap gap-4 print:hidden">
        <Kachel
          zahl={gesamt}
          was="Zuschauer gesamt"
          hinweis={gaesteliste > 0 ? `${plan.verkauft} verkauft + ${gaesteliste} Gästeliste` : "keine Gästeliste"}
          betont
        />
        <Kachel
          zahl={plan.verkauft}
          was="verkauft"
          hinweis={`von ${plan.sitze.length} (${quote} %)`}
        />
        <Kachel
          zahl={hintenGesamt}
          was="sitzen dahinter"
          hinweis={quellen || "alle sitzen gut"}
          betont={hintenGesamt > 0}
        />
        <Kachel
          zahl={rat.umzuege.length}
          was={rat.umzuege.length === 1 ? "Gruppe umsetzen" : "Gruppen umsetzen"}
          hinweis={`${rat.gaeste} Gäste`}
        />
      </div>

      {rat.gruppen.length === 0 && (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          Hinter der spielbaren Zone sitzt niemand. Hier ist nichts zu tun.
        </p>
      )}

      {rat.bleiben.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>
            {rat.bleiben.length}{" "}
            {rat.bleiben.length === 1 ? "Gruppe bleibt" : "Gruppen bleiben"} sitzen.
          </strong>{" "}
          Vorne ist kein Block am Stück frei, der groß genug wäre. Auseinandergezogen wird
          niemand.
          <ul className="mt-2 space-y-1">
            {rat.bleiben.map((g) => (
              <li key={`${g.reihe.nummer}-${g.von}`}>
                Reihe {g.reihe.nummer}, {plaetze(g)}: {g.sitze.length}{" "}
                {g.sitze.length === 1 ? "Gast" : "Gäste"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="hidden text-xs text-leise print:block">
        {vorstellung.name}, Stand des Verkaufs beim Ausdruck.
      </p>
    </section>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
}: {
  zahl: number;
  was: string;
  hinweis: string;
  betont?: boolean;
}) {
  return (
    <div
      className="min-w-40 rounded-lg border px-4 py-3"
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

/**
 * Wer wohin kommt.
 *
 * Eine Zeile je Gruppe, mit dem alten Platz links und dem neuen rechts.
 * Der alte Platz steht bewusst zuerst: Danach sucht der Mitarbeiter,
 * wenn jemand am Einlass seine Karte hinhält.
 */
function Umzugsliste({ rat }: { rat: Empfehlung }) {
  if (rat.umzuege.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {rat.umzuege.length} {rat.umzuege.length === 1 ? "Gruppe" : "Gruppen"}, {rat.gaeste} Gäste
      </h2>

      <ul className="space-y-2">
        {rat.umzuege.map((u, i) => (
          <li
            key={`${u.gruppe.reihe.nummer}-${u.gruppe.von}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-linie bg-flaeche px-3 py-2"
          >
            <span
              className="druckt-farbe flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
              style={{ background: "var(--gold)", color: "#fff" }}
            >
              {buchstabe(i)}
            </span>

            <span className="text-sm">
              <span className="text-leise">sitzt in</span>{" "}
              <strong>
                Reihe {u.gruppe.reihe.nummer}, {plaetze(u.gruppe)}
              </strong>
            </span>

            <span aria-hidden="true" className="text-leise">
              →
            </span>

            <span className="text-sm">
              <span className="text-leise">neu:</span>{" "}
              <strong>
                Reihe {u.ziel.reihe.nummer}, {plaetze(u.ziel)}
                {u.ziel2 && (
                  <>
                    {" "}+ dahinter Reihe {u.ziel2.reihe.nummer}, {plaetze(u.ziel2)}
                  </>
                )}
              </strong>{" "}
              <span className="text-leise">
                ({u.ziel.reihe.sektor}
                {u.ziel2 && `, ${u.ziel.sitze.length} vorne und ${u.ziel2.sitze.length} direkt dahinter`})
              </span>
            </span>

            <span className="ml-auto flex items-center gap-3">
              <span className="text-sm text-leise">
                {u.gruppe.sitze.length} {u.gruppe.sitze.length === 1 ? "Gast" : "Gäste"}
              </span>
              {/* Zum Abhaken mit dem Stift. */}
              <span className="h-6 w-6 shrink-0 rounded border border-text" aria-hidden="true" />
            </span>
          </li>
        ))}
      </ul>

      <p className="max-w-prose text-xs text-leise">
        Die Liste steht von vorne nach hinten. Jede Gruppe zieht am Stück um, niemand wird
        getrennt. Passt eine Gruppe nicht in eine Reihe, sitzt sie als Block auf zwei Reihen
        genau hintereinander. Kommt jemand nicht, bleibt sein Block einfach frei.
      </p>
    </section>
  );
}

/** "G1", "G2" ... für die Gäste von der Gästeliste, auf Liste und Zeichnung gleich. */
function gastZeichen(i: number): string {
  return `G${i + 1}`;
}

/**
 * Die Gästeliste auf dem Ausdruck.
 *
 * Diese Gäste haben kein Ticket und keinen Platz. Wer die Upgrades macht,
 * setzt sie vor Ort, am besten auf den Vorschlag: Er liegt in dem, was nach
 * den Upgrades in der spielbaren Zone frei ist. Daneben eine Linie, um den
 * tatsächlichen Platz mit dem Stift zu notieren, und am Bildschirm ein Feld
 * dafür.
 */
function Gaesteliste({
  gaeste,
  vorschlaege,
  mitVorschlag,
  eintragenLink,
}: {
  gaeste: Gast[];
  vorschlaege: Map<string, Bereich | null>;
  mitVorschlag: boolean;
  eintragenLink: string | null;
}) {
  const summe = gaeste.reduce((s, g) => s + g.anzahl, 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Gästeliste
          {gaeste.length > 0 &&
            `: ${gaeste.length} ${gaeste.length === 1 ? "Eintrag" : "Einträge"}, ${summe} ${summe === 1 ? "Gast" : "Gäste"}`}
        </h2>
        {eintragenLink && (
          <a href={eintragenLink} className="text-sm underline print:hidden">
            Gast eintragen
          </a>
        )}
      </div>
      {gaeste.length === 0 ? (
        <p className="text-sm text-leise print:hidden">Für diese Vorstellung steht niemand auf der Gästeliste.</p>
      ) : (
        <>
          <p className="max-w-prose text-xs text-leise">
            Ohne Ticket, ohne festen Platz. Nach den Upgrades setzen, am besten auf den Vorschlag.
            Wo sie tatsächlich sitzen, rechts notieren.
          </p>
          <ul className="space-y-2">
            {gaeste.map((g, i) => {
              const v = vorschlaege.get(g.id);
              return (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-linie bg-flaeche px-3 py-2"
                >
                  <span
                    className="druckt-farbe flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-sm font-semibold"
                    style={{ background: "var(--info)", color: "#fff" }}
                  >
                    {gastZeichen(i)}
                  </span>
                  <span className="text-sm">
                    <strong>{g.name}</strong>
                    {g.notiz && <span className="text-leise"> · {g.notiz}</span>}
                  </span>
                  <span className="text-sm text-leise">
                    {g.anzahl} {g.anzahl === 1 ? "Gast" : "Gäste"}
                  </span>
                  <span className="text-sm">
                    {g.platz ? (
                      <>
                        <span className="text-leise">sitzt:</span>{" "}
                        <strong style={{ color: "var(--gut)" }}>{g.platz}</strong>
                      </>
                    ) : v ? (
                      <>
                        <span className="text-leise">Vorschlag:</span>{" "}
                        <strong>
                          Reihe {v.reihe.nummer}, {plaetze(v)}
                        </strong>
                      </>
                    ) : (
                      <span className="text-leise">
                        {mitVorschlag ? "kein Block am Stück frei, vor Ort setzen" : "vor Ort setzen"}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <form action={gastGesetzt} className="flex items-center gap-1 print:hidden">
                      <input type="hidden" name="id" value={g.id} />
                      <input
                        name="platz"
                        defaultValue={g.platz ?? (v ? `Reihe ${v.reihe.nummer}, ${plaetze(v)}` : "")}
                        placeholder="Reihe, Platz"
                        className="w-40 text-xs"
                        aria-label={`Platz für ${g.name}`}
                      />
                      <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs hover:bg-gold-hell">
                        sitzt
                      </button>
                    </form>
                    {/* Auf Papier: Linie für den Platz und Kästchen zum Abhaken. */}
                    <span className="hidden w-32 border-b border-text print:inline-block" aria-hidden="true" />
                    <span className="hidden h-6 w-6 shrink-0 rounded border border-text print:inline-block" aria-hidden="true" />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Der Saal als Zeichnung.
 *
 * Gezeichnet wird aus den Koordinaten, die Ditix zu jedem Platz
 * mitliefert, nicht aus einem Bild. So stimmt der Plan auch dann, wenn
 * im Ticketshop etwas umgebaut wird.
 *
 * Alter und neuer Platz einer Gruppe tragen denselben Buchstaben. Damit
 * lässt sich auf dem Papier mit dem Finger nachfahren, wer wohin geht.
 *
 * Die Farben müssen auch auf Papier durchkommen, deshalb trägt die
 * Zeichnung die Klasse "druckt-farbe": Browser lassen Flächen beim
 * Drucken sonst weg, und dann sähen alle Plätze gleich aus.
 */
function Saalzeichnung({
  plan,
  rat,
  gaeste,
  vorschlaege,
}: {
  plan: Saalplan;
  rat: Empfehlung;
  gaeste: Gast[];
  vorschlaege: Map<string, Bereich | null>;
}) {
  const gastSitz = new Map<number, string>();
  gaeste.forEach((g, i) => vorschlaege.get(g.id)?.sitze.forEach((s) => gastSitz.set(s.id, gastZeichen(i))));
  const ziel = new Map<number, number>();
  const quelle = new Map<number, number>();
  rat.umzuege.forEach((u, i) => {
    [...u.ziel.sitze, ...(u.ziel2?.sitze ?? [])].forEach((s) => ziel.set(s.id, i));
    u.gruppe.sitze.forEach((s) => quelle.set(s.id, i));
  });
  const bleibt = new Set(rat.bleiben.flatMap((g) => g.sitze.map((s) => s.id)));

  const xs = plan.sitze.map((s) => s.x);
  const ys = plan.sitze.map((s) => s.y);
  const links = Math.min(...xs);
  const rechts = Math.max(...xs);
  const oben = Math.min(...ys);
  const unten = Math.max(...ys);

  const kante = 22;
  const rand = 34;
  const breite = rechts - links + kante + rand * 2;
  const hoehe = unten - oben + kante + rand * 2 + 26;
  const vx = links - kante / 2 - rand;
  const vy = oben - kante / 2 - rand - 26;

  return (
    <figure className="druckt-farbe overflow-x-auto rounded-lg border border-linie bg-flaeche p-3 print:border-0 print:p-0">
      <svg
        viewBox={`${vx} ${vy} ${breite} ${hoehe}`}
        className="mx-auto block h-auto w-full"
        style={{ maxWidth: "820px" }}
        role="img"
        aria-label="Saalplan mit den empfohlenen Plätzen"
      >
        {/* Die Bühne, damit klar ist, wo vorne ist. */}
        <rect
          x={links - kante}
          y={vy + 10}
          width={rechts - links + kante * 2}
          height={17}
          rx={4}
          fill="var(--gold-hell)"
          stroke="var(--gold)"
          strokeWidth={0.8}
        />
        <text
          x={(links + rechts) / 2}
          y={vy + 22}
          textAnchor="middle"
          fontSize={11}
          letterSpacing={2}
          fill="var(--gold-dunkel)"
        >
          BÜHNE
        </text>

        {/*
          Die spielbare Zone. Sie steht auf dem Blatt, damit am Einlass
          niemand auf die Idee kommt, jemanden aussen oder weiter hinten
          hinzusetzen: Dort ist er bei den Nummern nicht erreichbar, bei
          denen etwas ins Publikum geht.
        */}
        <rect
          x={rat.zone.links - kante / 2 - 5}
          y={rat.zone.oben - kante / 2 - 5}
          width={rat.zone.rechts - rat.zone.links + kante + 10}
          height={rat.zone.unten - rat.zone.oben + kante + 10}
          rx={6}
          fill="none"
          stroke="var(--gold-dunkel)"
          strokeWidth={1.6}
          strokeDasharray="7 4"
        />

        {rat.reihen.map((reihe) => (
          <g key={`${reihe.sektor}-${reihe.nummer}`}>
            <text
              x={links - kante}
              y={reihe.y + 3.5}
              textAnchor="end"
              fontSize={9}
              fill="var(--text-leise)"
            >
              {reihe.nummer}
            </text>
            {reihe.sitze.map((s) => (
              <Platz
                key={s.id}
                sitz={s}
                kante={kante}
                ziel={ziel.get(s.id)}
                quelle={quelle.get(s.id)}
                bleibt={bleibt.has(s.id)}
                gast={gastSitz.get(s.id)}
              />
            ))}
          </g>
        ))}
      </svg>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <Zeichen farbe="var(--gold)" text="hierhin, neuer Platz" />
        <Zeichen
          farbe="var(--gold-hell)"
          rahmen="var(--gold-dunkel)"
          text="sitzt hier, wird angesprochen"
        />
        {gastSitz.size > 0 && <Zeichen farbe="var(--info)" text="Vorschlag für die Gästeliste" />}
        <Zeichen farbe="var(--text)" text="verkauft, bleibt sitzen" />
        <Zeichen
          farbe="var(--warnung-hell)"
          rahmen="var(--warnung)"
          text="bleibt hinten, kein Block frei"
        />
        <Zeichen farbe="var(--flaeche)" rahmen="var(--linie)" text="frei" />
        <Zeichen farbe="var(--linie)" text="gesperrt" />
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-dashed"
            style={{ borderColor: "var(--gold-dunkel)" }}
          />
          spielbare Zone, nur hierhin umsetzen
        </span>
      </figcaption>
    </figure>
  );
}

/** Ein einzelner Platz in der Zeichnung. */
function Platz({
  sitz,
  kante,
  ziel,
  quelle,
  bleibt,
  gast,
}: {
  sitz: Sitz;
  kante: number;
  ziel: number | undefined;
  quelle: number | undefined;
  bleibt: boolean;
  gast?: string;
}) {
  let fuellung = "var(--flaeche)";
  let rahmen = "var(--linie)";
  let schrift = "var(--text-leise)";
  let beschriftung = sitz.name;

  if (sitz.status === "gesperrt") {
    fuellung = "var(--linie)";
    rahmen = "var(--linie)";
  } else if (ziel !== undefined) {
    fuellung = "var(--gold)";
    rahmen = "var(--gold-dunkel)";
    schrift = "#ffffff";
    beschriftung = buchstabe(ziel);
  } else if (gast) {
    fuellung = "var(--info)";
    rahmen = "var(--info)";
    schrift = "#ffffff";
    beschriftung = gast;
  } else if (quelle !== undefined) {
    fuellung = "var(--gold-hell)";
    rahmen = "var(--gold-dunkel)";
    schrift = "var(--gold-dunkel)";
    beschriftung = buchstabe(quelle);
  } else if (bleibt) {
    fuellung = "var(--warnung-hell)";
    rahmen = "var(--warnung)";
    schrift = "var(--text)";
  } else if (sitz.status === "verkauft") {
    fuellung = "var(--text)";
    rahmen = "var(--text)";
    schrift = "#ffffff";
  }

  return (
    <g>
      <rect
        x={sitz.x - kante / 2}
        y={sitz.y - kante / 2}
        width={kante}
        height={kante}
        rx={3.5}
        fill={fuellung}
        stroke={rahmen}
        strokeWidth={ziel !== undefined || quelle !== undefined ? 1.6 : 1}
      />
      <text x={sitz.x} y={sitz.y + 3.2} textAnchor="middle" fontSize={9} fill={schrift}>
        {beschriftung}
      </text>
    </g>
  );
}

function Zeichen({ farbe, rahmen, text }: { farbe: string; rahmen?: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded-sm border"
        style={{ background: farbe, borderColor: rahmen ?? farbe }}
      />
      {text}
    </span>
  );
}

/** Die Sitze, wie das Tablet sie braucht: flach und ohne Ditix-Eigenheiten. */
function tafelSitze(plan: Saalplan, rat: Empfehlung): TafelSitz[] {
  return plan.sitze.map((s) => ({
    id: s.id,
    name: s.name,
    reihe: s.reihe,
    sektor: s.sektor,
    x: s.x,
    y: s.y,
    status: s.status,
    inZone: rat.zone.sitze.has(s.id),
  }));
}

/**
 * Was am Einlass umzusetzen ist: die Gruppen von hinten und die Gäste von
 * der Gästeliste. Der Schlüssel haengt an der Herkunft, nicht am Ziel:
 * So bleibt er gleich, auch wenn jemand zweimal umgesetzt wird.
 */
function tafelGruppen(
  rat: Empfehlung,
  gaeste: Gast[],
  vorschlaege: Map<string, Bereich | null>,
): TafelGruppe[] {
  const ausBereich = (b: Bereich): string => `g:${b.sitze.map((s) => s.id).sort((x, y) => x - y).join("-")}`;

  const umzuege: TafelGruppe[] = rat.umzuege.map((u) => ({
    schluessel: ausBereich(u.gruppe),
    art: "gruppe" as const,
    titel: `Reihe ${u.gruppe.reihe.nummer}, ${plaetze(u.gruppe)}`,
    zusatz: u.gruppe.reihe.sektor,
    personen: u.gruppe.sitze.length,
    quelleIds: u.gruppe.sitze.map((s) => s.id),
    vorschlagText: `Reihe ${u.ziel.reihe.nummer}, ${plaetze(u.ziel)}${
      u.ziel2 ? ` und Reihe ${u.ziel2.reihe.nummer}, ${plaetze(u.ziel2)}` : ""
    }`,
    vorschlagIds: [...u.ziel.sitze, ...(u.ziel2?.sitze ?? [])].map((s) => s.id),
  }));

  const bleiben: TafelGruppe[] = rat.bleiben.map((b) => ({
    schluessel: ausBereich(b),
    art: "gruppe" as const,
    titel: `Reihe ${b.reihe.nummer}, ${plaetze(b)}`,
    zusatz: "kein Block am Stück frei",
    personen: b.sitze.length,
    quelleIds: b.sitze.map((s) => s.id),
    vorschlagText: null,
    vorschlagIds: [],
  }));

  const gaesteliste: TafelGruppe[] = gaeste.map((g) => {
    const v = vorschlaege.get(g.id) ?? null;
    return {
      schluessel: `gast:${g.id}`,
      art: "gast" as const,
      titel: g.name,
      zusatz: g.notiz || "Gästeliste, ohne Ticket",
      personen: g.anzahl,
      quelleIds: [],
      vorschlagText: v ? `Reihe ${v.reihe.nummer}, ${plaetze(v)}` : null,
      vorschlagIds: v ? v.sitze.map((s) => s.id) : [],
      gastId: g.id,
    };
  });

  return [...umzuege, ...bleiben, ...gaesteliste];
}
