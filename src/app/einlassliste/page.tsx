import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { planeAbend } from "@/lib/seating/abend";
import { artikel } from "@/lib/domain/artikel";
import { LOGEN } from "@/lib/domain/venue";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { ShowSchild } from "@/components/Tagesablauf";
import { nameOrdentlich } from "@/lib/domain/namen";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Logo } from "@/components/Logo";
import { zeitpunkt } from "@/lib/zeit";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { angekommeneGruppen, einlassAbhaken } from "@/lib/db/aktionen";
import { uhrzeit } from "@/lib/zeit";
import type { Plan } from "@/lib/seating/types";

export const metadata = { title: "Einlassliste | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Liste für den Einlass.
 *
 * Anders als Funktionsheet und Sitzplan ist sie nach **Nachnamen**
 * sortiert, nicht nach Loge. Am Einlass läuft es immer gleich: Jemand
 * nennt seinen Namen, und der muss in Sekunden gefunden werden. Nach
 * Logen sortiert müsste man dafür die ganze Seite absuchen.
 *
 * Auf dem Blatt steht deshalb nur, was an der Tür gebraucht wird: Name,
 * Anzahl, wo die Leute sitzen, wie viele Armbänder sie bekommen, und ein
 * Kästchen zum Abhaken. Preise stehen bewusst nicht drauf.
 */
export default async function EinlasslisteSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
  // Ob eine Gruppe schon bezahlt hat, ist kaufmännisch. Die Gastronomie
  // sieht nur, dass die Buchung noch nicht fest ist.
  const benutzer = await angemeldeterBenutzer();
  const kaufmaennisch = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
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

  const [{ kopf, gruppen, varianten }, angekommen] = await Promise.all([
    planeAbend(gewaehlt),
    angekommeneGruppen(gewaehlt),
  ]);
  if (!kopf) return null;

  const plan = kopf.festgelegt?.plan ?? varianten[0] ?? null;

  // Nach Nachnamen sortiert, denn an der Tür sagt jeder seinen Nachnamen.
  const zeilen = gruppen.gruppen
    .map((g) => ({
      ...einlassname(g.name, g.herkunft === "shop"),
      kennung: g.id,
      show: g.show,
      personen: g.personen,
      platz: platzVon(plan, g.id),
      armbaender: g.armbaender ?? 0,
      pauschalen: g.getraenkepauschalen ?? [],
      reserviert: g.sicherheit === "reserviert",
      da: angekommen.get(g.id) ?? null,
    }))
    .sort((a, b) => a.sortier.localeCompare(b.sortier, "de"));

  const personenGesamt = zeilen.reduce((s, z) => s + z.personen, 0);
  const armbaenderGesamt = zeilen.reduce((s, z) => s + z.armbaender, 0);
  // Nur an Tagen mit zwei Shows lohnt die Spalte.
  const mehrereShows = new Set(zeilen.map((z) => z.show?.uhrzeit).filter(Boolean)).size > 1;
  const daGruppen = zeilen.filter((z) => z.da).length;
  const daPersonen = zeilen.filter((z) => z.da).reduce((s, z) => s + z.personen, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Einlassliste</h1>
          <p className="mt-1 text-sm text-leise">
            Nach Namen sortiert, zum Abhaken an der Tür. Ohne Preise.
          </p>
        </div>
        <DruckKnopf text="Einlassliste drucken" hinweis="Eine Seite, zum Abhaken." />
      </header>

      <AbendAuswahl
        basisPfad="/einlassliste"
        gewaehlt={gewaehlt}
        monat={aufgeschlagenerMonat}
        heute={heute}
        abende={termine.map((t) => ({
          ditixEventId: t.ditixEventId,
          datum: t.datum,
          uhrzeit: t.uhrzeit,
          uhrzeiten: t.uhrzeiten,
          name: t.name,
          betont: t.ausVorgaengen > 0,
          hinweis: t.gaeste > 0 ? `${t.gaeste} am Tisch` : "keine Gäste am Tisch",
        }))}
      />

      <article className="rounded-lg border border-linie bg-flaeche p-8 print:border-0 print:p-0">
        <header className="mb-5 border-b-2 border-text pb-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Logo hoehe={42} />
            <div className="text-right">
              <h2 className="text-2xl font-semibold tracking-tight">Einlassliste</h2>
              <div className="text-xs text-leise">Stand: {zeitpunkt(new Date())}</div>
            </div>
          </div>
          <div className="mt-1 text-lg">
            {datumKurz(kopf.datum)} ·{" "}
            {gruppen.shows.map((s) => `${s.uhrzeit} ${s.name}`).join("  ·  ")}
          </div>
          <div className="mt-1 text-sm text-leise">
            {zeilen.length} {zeilen.length === 1 ? "Gruppe" : "Gruppen"} · {personenGesamt} Gäste am
            Tisch
            {armbaenderGesamt > 0 && ` · ${armbaenderGesamt} Armbänder auszugeben`}
          </div>
          {daGruppen > 0 && (
            <div className="mt-2 text-sm print:hidden" style={{ color: "var(--gut)" }}>
              <strong>
                {daGruppen} von {zeilen.length} {zeilen.length === 1 ? "Gruppe" : "Gruppen"} da
              </strong>
              , {daPersonen} von {personenGesamt} Gästen
            </div>
          )}
        </header>

        {gruppen.shopFehler && (
          <p
            className="mb-4 border-2 px-3 py-2 text-sm"
            style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
          >
            <strong>Diese Liste ist unvollständig.</strong> Die Buchungen aus dem Webshop konnten
            nicht gelesen werden. Es fehlen also Gäste. Nicht als alleinige Grundlage am Einlass
            verwenden.
          </p>
        )}

        {zeilen.length === 0 ? (
          <p className="py-8 text-center text-sm text-leise">
            Für diesen Abend ist noch niemand mit Menü gebucht. Wer nur ein Showticket hat, wird
            hier nicht geführt: Diese Gäste gehen direkt in den Saal.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="w-10 pb-1 font-medium">Da</th>
                <th className="pb-1 font-medium">Name</th>
                <th className="w-20 whitespace-nowrap pb-1 text-right font-medium">Gäste</th>
                <th className="w-44 pb-1 font-medium">Platz</th>
                {mehrereShows && <th className="w-40 pb-1 font-medium">Show</th>}
                <th className="w-32 pb-1 font-medium">Armbänder</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr
                  key={z.kennung}
                  className={`border-b border-linie last:border-0 ${z.da ? "opacity-60" : ""}`}
                >
                  <td className="py-2.5">
                    <Haken ditixEventId={gewaehlt} kennung={z.kennung} da={Boolean(z.da)} />
                  </td>
                  <td className="py-2.5">
                    <span className="font-medium">{z.name}</span>
                    {z.da && (
                      <span
                        className="ml-2 text-xs print:hidden"
                        style={{ color: "var(--gut)" }}
                      >
                        da seit {uhrzeit(new Date(z.da.am))}
                        {z.da.von && ` · ${z.da.von}`}
                      </span>
                    )}
                    {z.reserviert && (
                      <span className="ml-2 text-xs" style={{ color: "var(--warnung)" }}>
                        {kaufmaennisch ? "reserviert, noch nicht bezahlt" : "nur reserviert"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums whitespace-nowrap">{z.personen}</td>
                  <td className="py-2.5">{z.platz}</td>
                  {mehrereShows && (
                    <td className="py-2.5">
                      {z.show && (
                        <ShowSchild uhrzeit={z.show.uhrzeit} vorDerShow={z.show.vorDerShow} />
                      )}
                    </td>
                  )}
                  <td className="py-2.5 text-xs">
                    {z.armbaender > 0 ? (
                      <>
                        <strong className="text-sm">{z.armbaender}</strong>
                        {z.pauschalen.map((n) => (
                          <div key={n} className="text-leise">
                            {sicherArtikelname(n)}
                          </div>
                        ))}
                      </>
                    ) : (
                      <span className="text-leise">keine</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="mt-6 border-t border-linie pt-3 text-xs text-leise">
          Gäste ohne Menü stehen nicht auf dieser Liste, sie gehen direkt in den Saal. Diese Liste
          zeigt nur, wer an einem Tisch in der Magicuisine sitzt.
          <span className="print:hidden">
            {" "}
            Am Bildschirm kannst du die Kästchen anklicken, dann sehen alle denselben Stand.
          </span>
        </footer>
      </article>

      <div className="flex gap-4 text-sm print:hidden">
        <Link href={`/sitzplan?abend=${gewaehlt}`} className="text-leise underline hover:text-text">
          Sitzplan ändern
        </Link>
        <Link
          href={`/funktionsheet?abend=${gewaehlt}`}
          className="text-leise underline hover:text-text"
        >
          Funktionsheet
        </Link>
      </div>
    </div>
  );
}

/** Wörter, an denen eine Firma zu erkennen ist. */
const FIRMENWORTE =
  /\b(gmbh|mbh|ag|kg|ohg|ug|e\.?\s?v|e\.?\s?k|se|gbr|co|und|firma|praxis|kanzlei|hotel|verein|team)\b|&/i;

/**
 * Bereitet einen Namen für die Einlassliste auf.
 *
 * An der Tür nennt jeder seinen Nachnamen. Eine nach Vornamen sortierte
 * Liste zwingt dazu, jedes Mal das ganze Blatt abzusuchen, deshalb wird
 * nach dem letzten Wort sortiert.
 *
 * Umgedreht angezeigt ("Kuhn, Anastasia") wird nur bei Buchungen aus dem
 * Webshop, denn nur dort steht der Name einer Privatperson. Alles, was aus
 * einem Vorgang kommt, ist ein Firmen- oder Gruppenname und bleibt stehen
 * wie er ist: Aus "Sparkasse Neu-Ulm" darf nie "Neu-Ulm, Sparkasse" werden.
 *
 * Und selbst bei Shop-Buchungen wird nur bei genau zwei Wörtern getauscht. Bei längeren Namen wäre die Trennung zu oft falsch, etwa bei
 * mehrteiligen Nachnamen: Aus "Mohamed Khaireddine Ben Hafsa" würde sonst
 * "Hafsa, Mohamed Khaireddine Ben". Solche Namen bleiben stehen wie sie
 * sind und werden trotzdem an der richtigen Stelle einsortiert.
 *
 * Firmennamen bleiben immer unangetastet, sonst stünde dort "GmbH, Fluoron".
 */
function einlassname(
  name: string,
  ausShop: boolean,
): { name: string; sortier: string } {
  const sauber = name.replace(/\s+/g, " ").trim();
  const teile = nameOrdentlich(sauber).split(" ");
  const ganz = teile.join(" ");

  if (!ausShop || FIRMENWORTE.test(sauber)) return { name: ganz, sortier: ganz };

  const letztes = teile[teile.length - 1];
  if (teile.length === 2) {
    return { name: `${letztes}, ${teile[0]}`, sortier: letztes };
  }
  return { name: ganz, sortier: teile.length > 1 ? letztes : ganz };
}

/** Wo sitzt eine Gruppe? Klartext für die Tür. */
function platzVon(plan: Plan | null, gruppeId: string): string {
  if (!plan) return "noch nicht verteilt";

  const loge = plan.logen.find((z) => z.gruppeId === gruppeId);
  if (loge) {
    const namen = loge.logenNummern.map(
      (n) => LOGEN.find((l) => l.nummer === n)?.name ?? `Loge ${n}`,
    );
    return namen.join(" + ");
  }

  const galerie = plan.galerie.find((z) => z.gruppeId === gruppeId);
  if (galerie) return `Eventgalerie, ${galerie.tischBeschreibung}`;

  return "kein Platz zugeteilt";
}

function sicherArtikelname(nummer: string): string {
  try {
    return artikel(nummer).bezeichnung;
  } catch {
    return nummer;
  }
}

/**
 * Das Kästchen zum Abhaken.
 *
 * Am Bildschirm ein Knopf: ein Klick trägt die Ankunft ein, ein zweiter
 * nimmt sie zurück, denn am Einlass verklickt man sich. Alle, die die
 * Liste offen haben, sehen denselben Stand.
 *
 * Auf Papier bleibt es ein leeres Kästchen zum Ankreuzen. Wer schon da
 * ist, bekommt dort ein Kreuz, damit ein Ausdruck mitten im Abend den
 * aktuellen Stand zeigt.
 */
function Haken({
  ditixEventId,
  kennung,
  da,
}: {
  ditixEventId: string;
  kennung: string;
  da: boolean;
}) {
  return (
    <form action={einlassAbhaken.bind(null, ditixEventId, kennung, da)}>
      <button
        type="submit"
        title={da ? "Doch nicht da" : "Als angekommen abhaken"}
        className="druckt-mit flex h-6 w-6 items-center justify-center border border-text text-sm leading-none print:h-4 print:w-4"
        style={{
          background: da ? "var(--gut-hell)" : "transparent",
          color: da ? "var(--gut)" : "transparent",
        }}
      >
        {da ? "✓" : ""}
      </button>
    </form>
  );
}
