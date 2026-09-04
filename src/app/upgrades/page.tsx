import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { termineDesTages, findeTermin, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { holeSaalplan, type Saalplan, type Sitz } from "@/lib/ditix/saalplan";
import { empfehlung, type Bereich, type Empfehlung, type Reihe } from "@/lib/seating/upgrade";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import { datumLang } from "@/lib/zeit";

export const metadata = { title: "Upgrades | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/** Buchstaben für die Bereiche: A, B, C ... */
function buchstabe(i: number): string {
  return String.fromCharCode(65 + i);
}

/**
 * Upgrades: die hinteren Reihen nach vorne holen.
 *
 * An schwach verkauften Abenden sitzen vorne Grüppchen und hinten eine
 * gut gefüllte Reihe. Von der Bühne aus sieht das leer aus. Das Showteam
 * spricht die Gäste der letzten Reihe beim Einlass an, verschenkt ein
 * Upgrade und schickt sie nach vorn.
 *
 * Diese Seite ist dafür da, ausgedruckt zu werden. Der Mitarbeiter hat
 * sie am Einlass in der Hand, zeigt den Gästen ihren neuen Platz und
 * streicht ihn durch, sobald er vergeben ist. Deshalb steht neben jedem
 * Bereich ein Kästchen, und deshalb ist der Saalplan groß genug, um ihn
 * jemandem hinzuhalten.
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
            Ausdrucken, am Einlass die Gäste ansprechen und jeden vergebenen Bereich durchstreichen.
          </p>
        </div>
        {rat && rat.umzusetzen.length > 0 && (
          <DruckKnopf text="Plan drucken" hinweis="mit Empfehlung zum Abhaken" />
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
          <Saalzeichnung plan={plan} rat={rat} />
          <Ansageliste rat={rat} />
        </>
      )}
    </div>
  );
}

/** Die Zahlen des Abends in einem Satz, plus das Nötigste als Kacheln. */
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

  return (
    <section className="space-y-3">
      <div className="hidden text-sm print:block">
        {plan.verkauft} von {plan.sitze.length} Plätzen verkauft ({quote} Prozent).
      </div>

      <div className="flex flex-wrap gap-4 print:hidden">
        <Kachel zahl={plan.verkauft} was="verkauft" hinweis={`von ${plan.sitze.length} (${quote} %)`} />
        <Kachel
          zahl={rat.umzusetzen.length}
          was="umzusetzen"
          hinweis={quellen || "nichts zu räumen"}
          betont={rat.umzusetzen.length > 0}
        />
        <Kachel
          zahl={rat.ziele.reduce((n, b) => n + b.sitze.length, 0)}
          was="Plätze vorne"
          hinweis={`in ${rat.ziele.length} ${rat.ziele.length === 1 ? "Bereich" : "Bereichen"}`}
        />
      </div>

      {rat.umzusetzen.length === 0 && (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          In den hinteren Reihen sitzt niemand. Hier ist nichts zu tun.
        </p>
      )}

      {rat.fehlend > 0 && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>{rat.fehlend} Gäste passen nicht mehr nach vorne.</strong> Der Saal ist vorne zu
          voll. Setz so viele um, wie die Liste hergibt, der Rest bleibt sitzen.
        </p>
      )}

      <p className="hidden text-sm print:block">
        Umzusetzen: {rat.umzusetzen.length} Gäste aus {quellen || "keiner Reihe"} —{" "}
        {vorstellung.uhrzeit} Uhr.
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
 * Der Saal als Zeichnung.
 *
 * Gezeichnet wird aus den Koordinaten, die Ditix zu jedem Platz
 * mitliefert, nicht aus einem Bild. So stimmt der Plan auch dann, wenn
 * im Ticketshop etwas umgebaut wird.
 *
 * Die Farben müssen auch auf Papier durchkommen, deshalb trägt die
 * Zeichnung die Klasse "druckt-farbe": Browser lassen Flächen beim
 * Drucken sonst weg, und dann sähen alle Plätze gleich aus.
 */
function Saalzeichnung({ plan, rat }: { plan: Saalplan; rat: Empfehlung }) {
  const nummer = new Map<number, number>();
  rat.ziele.forEach((b, i) => b.sitze.forEach((s) => nummer.set(s.id, i)));
  const quellen = new Set(rat.quellreihen.flatMap((r) => r.sitze.map((s) => s.id)));

  const xs = plan.sitze.map((s) => s.x);
  const ys = plan.sitze.map((s) => s.y);
  const links = Math.min(...xs);
  const rechts = Math.max(...xs);
  const oben = Math.min(...ys);
  const unten = Math.max(...ys);

  // Sitzkantenlänge aus dem Abstand der Plätze, damit die Zeichnung bei
  // jedem Saalplan stimmt und nicht nur bei diesem einen.
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
            {/* Reihenbeschriftung links neben der Reihe. */}
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
                bereich={nummer.get(s.id)}
                quelle={quellen.has(s.id)}
              />
            ))}
          </g>
        ))}
      </svg>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <Zeichen farbe="var(--text)" text="verkauft" />
        <Zeichen farbe="var(--flaeche)" rahmen="var(--linie)" text="frei" />
        <Zeichen farbe="var(--gold)" text="hierhin umsetzen" />
        <Zeichen farbe="var(--warnung-hell)" rahmen="var(--warnung)" text="ansprechen, sitzt hinten" />
        <Zeichen farbe="var(--linie)" text="gesperrt" />
      </figcaption>
    </figure>
  );
}

/** Ein einzelner Platz in der Zeichnung. */
function Platz({
  sitz,
  kante,
  bereich,
  quelle,
}: {
  sitz: Sitz;
  kante: number;
  bereich: number | undefined;
  quelle: boolean;
}) {
  let fuellung = "var(--flaeche)";
  let rahmen = "var(--linie)";
  let schrift = "var(--text-leise)";

  if (sitz.status === "gesperrt") {
    fuellung = "var(--linie)";
    rahmen = "var(--linie)";
  } else if (bereich !== undefined) {
    fuellung = "var(--gold)";
    rahmen = "var(--gold-dunkel)";
    schrift = "#ffffff";
  } else if (quelle && sitz.status === "verkauft") {
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
        strokeWidth={1}
      />
      <text
        x={sitz.x}
        y={sitz.y + 3.2}
        textAnchor="middle"
        fontSize={9}
        fill={schrift}
      >
        {bereich !== undefined ? buchstabe(bereich) : sitz.name}
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

/**
 * Was am Einlass gesagt wird.
 *
 * Eine Zeile je Bereich, von vorne nach hinten. Das Kästchen links wird
 * mit dem Stift durchgestrichen, sobald der Bereich vergeben ist. Die
 * Zeile ist bewusst so formuliert, wie man sie vorliest.
 */
function Ansageliste({ rat }: { rat: Empfehlung }) {
  if (rat.ziele.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        Der Reihe nach vergeben, {rat.umzusetzen.length} Gäste
      </h2>

      <ul className="space-y-2">
        {rat.ziele.map((b, i) => (
          <li
            key={`${b.reihe.sektor}-${b.reihe.nummer}-${b.von}`}
            className="flex items-center gap-3 rounded-lg border border-linie bg-flaeche px-3 py-2"
          >
            <span
              className="druckt-farbe flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
              style={{ background: "var(--gold)", color: "#fff" }}
            >
              {buchstabe(i)}
            </span>
            <span className="flex-1 text-sm">
              <strong>
                Reihe {b.reihe.nummer}, {ansage(b)}
              </strong>
              <span className="text-leise">
                {" "}
                — {b.sitze.length} {b.sitze.length === 1 ? "Platz" : "Plätze"} ({b.reihe.sektor})
              </span>
            </span>
            {/* Zum Abhaken mit dem Stift. */}
            <span className="h-6 w-6 shrink-0 rounded border border-text" aria-hidden="true" />
          </li>
        ))}
      </ul>

      <p className="max-w-prose text-xs text-leise">
        Die Bereiche stehen von vorne nach hinten. Kommt eine Gruppe, die nicht genau passt, nimm
        den nächsten Bereich und trag den Rest im nächsten ein. Was vergeben ist, wird
        durchgestrichen.
      </p>
    </section>
  );
}

/** "Platz 7 bis 8" oder "Platz 7". */
function ansage(b: Bereich): string {
  return b.von === b.bis ? `Platz ${b.von}` : `Platz ${b.von} bis ${b.bis}`;
}

export type { Reihe };
