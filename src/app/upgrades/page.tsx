import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { termineDesTages, findeTermin, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { holeSaalplan, type Saalplan, type Sitz } from "@/lib/ditix/saalplan";
import { empfehlung, type Bereich, type Empfehlung } from "@/lib/seating/upgrade";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import { datumLang } from "@/lib/zeit";

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
  searchParams: Promise<{ abend?: string; monat?: string; show?: string; reihen?: string }>;
}) {
  const { abend, monat, show, reihen } = await searchParams;
  const reihenRaeumen = reihen === "2" ? 2 : reihen === "3" ? 3 : 1;

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

  const rat = plan ? empfehlung(plan, reihenRaeumen) : null;

  return (
    <div className="space-y-6">
      <Druckkopf
        titel="Upgrades"
        untertitel={
          vorstellung
            ? `${datumLang(vorstellung.datum)}, ${vorstellung.uhrzeit} Uhr — ${vorstellung.name}`
            : undefined
        }
      />

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upgrades</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Die hinteren Reihen nach vorne holen, damit der Saal von der Bühne aus voll wirkt.
            Gruppen bleiben zusammen. Ausdrucken, am Einlass ansprechen, abhaken.
          </p>
        </div>
        {rat && rat.umzuege.length > 0 && (
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

      {shows.length > 1 && vorstellung && (
        <nav className="flex flex-wrap gap-2 text-sm print:hidden">
          {shows.map((s) => (
            <Link
              key={s.ditixEventId}
              href={`/upgrades?abend=${gewaehlt}&monat=${aufgeschlagenerMonat ?? ""}&show=${s.ditixEventId}&reihen=${reihenRaeumen}`}
              className={`rounded-md border px-3 py-1.5 ${
                s.ditixEventId === vorstellung.ditixEventId
                  ? "border-gold bg-gold-hell"
                  : "border-linie"
              }`}
            >
              {s.uhrzeit} Uhr
            </Link>
          ))}
        </nav>
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
          <Lage plan={plan} rat={rat} vorstellung={vorstellung} />
          <Reihenwahl
            gewaehlt={gewaehlt}
            monat={aufgeschlagenerMonat ?? gewaehlt.slice(0, 7)}
            show={vorstellung.ditixEventId}
            reihenRaeumen={reihenRaeumen}
            moeglich={rat.reihen.length}
          />
          <Umzugsliste rat={rat} />
          <Saalzeichnung plan={plan} rat={rat} />
        </>
      )}
    </div>
  );
}

/** Die Lage des Abends in Zahlen. */
function Lage({
  plan,
  rat,
  vorstellung,
}: {
  plan: Saalplan;
  rat: Empfehlung;
  vorstellung: Vorstellungstermin;
}) {
  const quote = Math.round((plan.verkauft / Math.max(1, plan.sitze.length)) * 100);
  const quellen = rat.quellreihen.map((r) => `${r.sektor}, Reihe ${r.nummer}`).join(" und ");
  const hintenGesamt = rat.gruppen.reduce((n, g) => n + g.sitze.length, 0);

  return (
    <section className="space-y-3">
      <p className="hidden text-sm print:block">
        {plan.verkauft} von {plan.sitze.length} Plätzen verkauft ({quote} Prozent). Umzusetzen:{" "}
        {rat.gaeste} Gäste in {rat.umzuege.length}{" "}
        {rat.umzuege.length === 1 ? "Gruppe" : "Gruppen"} aus {quellen || "keiner Reihe"}.
      </p>

      <div className="flex flex-wrap gap-4 print:hidden">
        <Kachel
          zahl={plan.verkauft}
          was="verkauft"
          hinweis={`von ${plan.sitze.length} (${quote} %)`}
        />
        <Kachel
          zahl={hintenGesamt}
          was="sitzen hinten"
          hinweis={quellen || "nichts zu räumen"}
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
          In den hinteren Reihen sitzt niemand. Hier ist nichts zu tun.
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
                Reihe {g.reihe.nummer}, {plaetze(g)} — {g.sitze.length}{" "}
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

/** Wie viele Reihen von hinten geräumt werden sollen. */
function Reihenwahl({
  gewaehlt,
  monat,
  show,
  reihenRaeumen,
  moeglich,
}: {
  gewaehlt: string;
  monat: string;
  show: string;
  reihenRaeumen: number;
  moeglich: number;
}) {
  const stufen = [1, 2, 3].filter((n) => n < moeglich);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm print:hidden">
      <span className="text-leise">Von hinten räumen:</span>
      {stufen.map((n) => (
        <Link
          key={n}
          href={`/upgrades?abend=${gewaehlt}&monat=${monat}&show=${show}&reihen=${n}`}
          className={`rounded-md border px-3 py-1.5 ${
            n === reihenRaeumen ? "border-gold bg-gold-hell" : "border-linie"
          }`}
        >
          {n === 1 ? "letzte Reihe" : `${n} Reihen`}
        </Link>
      ))}
      <span className="text-xs text-leise">
        Reicht das Futter aus der letzten Reihe nicht, nimm die vorletzte dazu.
      </span>
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
              </strong>{" "}
              <span className="text-leise">({u.ziel.reihe.sektor})</span>
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
        getrennt. Kommt jemand nicht, bleibt sein Block einfach frei.
      </p>
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
function Saalzeichnung({ plan, rat }: { plan: Saalplan; rat: Empfehlung }) {
  const ziel = new Map<number, number>();
  const quelle = new Map<number, number>();
  rat.umzuege.forEach((u, i) => {
    u.ziel.sitze.forEach((s) => ziel.set(s.id, i));
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
        <Zeichen farbe="var(--text)" text="verkauft, bleibt sitzen" />
        <Zeichen
          farbe="var(--warnung-hell)"
          rahmen="var(--warnung)"
          text="bleibt hinten, kein Block frei"
        />
        <Zeichen farbe="var(--flaeche)" rahmen="var(--linie)" text="frei" />
        <Zeichen farbe="var(--linie)" text="gesperrt" />
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
}: {
  sitz: Sitz;
  kante: number;
  ziel: number | undefined;
  quelle: number | undefined;
  bleibt: boolean;
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
