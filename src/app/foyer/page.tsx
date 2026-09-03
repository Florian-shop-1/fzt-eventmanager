import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { planeAbend } from "@/lib/seating/abend";
import { holeKuechenblatt } from "@/lib/kueche/blatt";
import { artikel } from "@/lib/domain/artikel";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import { ShowSchild, Tagesablauf } from "@/components/Tagesablauf";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { zeitpunkt } from "@/lib/zeit";
import type { Plan } from "@/lib/seating/types";
import { LOGEN } from "@/lib/domain/venue";

export const metadata = { title: "Foyer | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Das Blatt für den Foyerdienst.
 *
 * Sarah macht etwas anderes als Küche und Büro. Ihre Fragen sind: Wie
 * viele Stehtische stelle ich, wie viele Bändchen gebe ich aus, wen
 * schicke ich wohin, und wann muss wer im Saal sein.
 *
 * Deshalb ein eigenes Blatt statt eines abgespeckten Funktionsheets. Was
 * die Küche braucht, steht hier nicht: keine Menüvarianten, keine
 * Unverträglichkeiten. Preise stehen ohnehin nirgends.
 */
export default async function FoyerSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
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

  const benutzer = await angemeldeterBenutzer();
  const [blatt, { kopf, gruppen, varianten }] = await Promise.all([
    holeKuechenblatt(gewaehlt),
    planeAbend(gewaehlt),
  ]);
  if (!blatt || !kopf) return null;

  const plan = kopf.festgelegt?.plan ?? varianten[0] ?? null;
  const mehrereShows = blatt.menuesJeShow.filter((m) => m.menues > 0).length > 1;

  // Was auszugeben ist. Firmenflats und Shop-Bändchen sind zwei Töpfe mit
  // unterschiedlicher Gültigkeit, deshalb getrennt.
  const firmenFlats = blatt.firmen.filter((f) => f.getraenkepauschalen.length > 0);
  const flatArmbaender = firmenFlats.reduce((s, f) => s + f.personen, 0);
  const shopArmbaender = blatt.shop?.getraenkeArmbaender ?? 0;
  const goldArmbaender = blatt.shop?.vipArmbandGold ?? 0;
  const stehtische = blatt.shop?.stehtische ?? 0;

  // Welcher Tisch für wen? Die Summe allein hilft im Foyer nicht: Silver
  // und Gold werden unterschiedlich eingedeckt, und der Tisch braucht ein
  // Schild mit dem richtigen Namen.
  const tische = blatt.shopZusatz.filter((z) =>
    z.bezeichnung.toLowerCase().includes("stehtisch"),
  );

  return (
    <div className="space-y-6">
      <Druckkopf
        titel="Foyer"
        untertitel={`${datumKurz(blatt.datum)} · ${blatt.shows.map((s) => `${s.uhrzeit} ${s.name}`).join("  ·  ")}`}
      />

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Foyer</h1>
          <p className="mt-1 text-sm text-leise">
            Stehtische, Bändchen und wer wohin gehört. Für den Dienst im Foyer.
          </p>
        </div>
        <DruckKnopf text="Foyerblatt drucken" />
      </header>

      <AbendAuswahl
        basisPfad="/foyer"
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

      <article className="space-y-6 rounded-lg border border-linie bg-flaeche p-8 print:border-0 print:p-0">
        <header className="border-b-2 border-text pb-3 print:hidden">
          <div className="text-lg">
            {datumKurz(blatt.datum)} ·{" "}
            {blatt.shows.map((s) => `${s.uhrzeit} ${s.name}`).join("  ·  ")}
          </div>
          <div className="mt-1 text-sm text-leise">
            {blatt.gesamtMenues} Gäste essen bei uns · Stand: {zeitpunkt(new Date())}
          </div>
        </header>

        {blatt.shopFehler && (
          <p
            className="border-2 px-3 py-2 text-sm"
            style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
          >
            <strong>Dieses Blatt ist unvollständig.</strong> Die Buchungen aus dem Webshop
            konnten nicht gelesen werden. Es fehlen also Bändchen und Stehtische.
          </p>
        )}

        {/* 1. Was vorzubereiten ist */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            1. Vorbereiten
          </h2>
          <div className="mb-4 flex flex-wrap gap-4">
            <Kachel
              zahl={stehtische}
              was={stehtische === 1 ? "Stehtisch" : "Stehtische"}
              hinweis="im Foyer, reserviert für die Pause"
            />
            <Kachel
              zahl={flatArmbaender + shopArmbaender}
              was="Bändchen"
              hinweis="insgesamt auszugeben"
            />
          </div>

          {tische.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                <tr>
                  <th className="pb-1 font-medium">Für wen</th>
                  <th className="pb-1 font-medium">Welcher Tisch</th>
                  <th className="w-16 pb-1 text-right font-medium">Anzahl</th>
                </tr>
              </thead>
              <tbody>
                {tische.map((t) => (
                  <tr
                    key={t.name + t.bezeichnung}
                    className="border-b border-linie align-top last:border-0"
                  >
                    <td className="py-2 font-medium">{t.name}</td>
                    <td className="py-2">
                      {t.bezeichnung}
                      {inhaltVon(t.bezeichnung) && (
                        <div className="text-xs text-leise">{inhaltVon(t.bezeichnung)}</div>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{t.menge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            stehtische === 0 &&
            flatArmbaender + shopArmbaender === 0 && (
              <p className="text-sm text-leise">
                Für diesen Abend ist nichts vorzubereiten. Keine Stehtische, keine Bändchen.
              </p>
            )
          )}
        </section>

        {/* 2. Bändchen im Einzelnen */}
        {(flatArmbaender > 0 || shopArmbaender > 0) && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
              2. Bändchen ausgeben
            </h2>

            {firmenFlats.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 font-semibold">Firmengruppen mit Getränkeflat</h3>
                <p className="mb-2 text-xs text-leise">
                  Gilt am Tisch im Saal. Der Umfang steht in der Bezeichnung.
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {firmenFlats.map((f) => (
                      <tr key={f.gruppeId} className="border-b border-linie last:border-0">
                        <td className="py-2">
                          <div className="font-medium">{f.gruppe}</div>
                          <div className="text-xs text-leise">
                            {f.getraenkepauschalen.map(sicherArtikelname).join(" + ")}
                          </div>
                        </td>
                        <td className="w-32 py-2 text-right">
                          <strong className="text-base">{f.personen}</strong> Bändchen
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(shopArmbaender > 0 || goldArmbaender > 0) && (
              <div className="border-l-4 pl-3" style={{ borderColor: "var(--warnung)" }}>
                <h3 className="mb-1 font-semibold">VIP-Bändchen aus dem Webshop</h3>
                <p className="mb-2 text-sm">
                  <strong>{shopArmbaender} Bändchen</strong>
                  {goldArmbaender > 0 && (
                    <>
                      , davon <strong>{goldArmbaender} in Gold</strong>
                    </>
                  )}
                </p>
                <p className="text-xs text-leise">
                  Achtung, anderer Geltungsbereich als die Firmenflats: Diese Bändchen gelten
                  <strong> nur im Foyer</strong>, eine Stunde vor der Show und in der Pause.
                  Nicht am Tisch im Saal.
                </p>
              </div>
            )}
          </section>
        )}

        {/* 3. Wen schicke ich wohin */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            3. Wer gehört wohin
          </h2>
          {blatt.gesamtMenues === 0 ? (
            <p className="text-sm text-leise">
              Niemand isst heute bei uns. Alle Gäste gehen direkt in den Saal.
            </p>
          ) : plan ? (
            <WerWohin plan={plan} mehrereShows={mehrereShows} />
          ) : (
            <p className="text-sm text-leise">Für diesen Abend liegt noch keine Verteilung vor.</p>
          )}
        </section>

        {/* 4. Der Ablauf */}
        {mehrereShows && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
              4. Der Ablauf
            </h2>
            <Tagesablauf anteile={blatt.menuesJeShow} gesamtMenues={blatt.gesamtMenues} />
          </section>
        )}

        <footer className="border-t border-linie pt-3 text-xs text-leise">
          Florian Zimmer Theater GmbH, Neu-Ulm.
          {gruppen.ausShop > 0 &&
            ` ${gruppen.ausShop} Buchungen aus dem Webshop, ${gruppen.ausVorgaengen} aus Firmenvorgängen.`}
        </footer>
      </article>

      <div className="flex gap-4 text-sm print:hidden">
        <Link
          href={`/einlassliste?abend=${gewaehlt}`}
          className="text-leise underline hover:text-text"
        >
          Einlassliste zum Abhaken
        </Link>
        {benutzer && benutzer.rolle !== "foyer" && (
          <Link
            href={`/funktionsheet?abend=${gewaehlt}`}
            className="text-leise underline hover:text-text"
          >
            Funktionsheet
          </Link>
        )}
      </div>
    </div>
  );
}

/** Große Zahl mit Beschriftung, für das Wichtigste auf einen Blick. */
function Kachel({ zahl, was, hinweis }: { zahl: number; was: string; hinweis: string }) {
  if (zahl === 0) return null;
  return (
    <div className="rounded-lg border border-gold bg-gold-hell px-5 py-4">
      <div className="text-4xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm font-medium">{was}</div>
      <div className="mt-0.5 max-w-48 text-xs text-leise">{hinweis}</div>
    </div>
  );
}

/**
 * Wer sitzt wo, aus Foyersicht.
 *
 * Bewusst knapper als im Funktionsheet: Sarah muss Leute hinbringen, nicht
 * eindecken. Sie braucht Name, Anzahl und den Platz, und an Tagen mit zwei
 * Shows die Info, ob die Gruppe noch in die Show geht.
 */
function WerWohin({ plan, mehrereShows }: { plan: Plan; mehrereShows: boolean }) {
  const zeilen = [
    ...plan.logen.map((z) => ({
      name: z.gruppeName,
      personen: z.personen,
      platz: z.logenNummern
        .map((n) => LOGEN.find((l) => l.nummer === n)?.name ?? `Loge ${n}`)
        .join(" + "),
      show: z.show,
    })),
    ...plan.galerie.map((z) => ({
      name: z.gruppeName,
      personen: z.personen,
      platz: `Eventgalerie, ${z.tischBeschreibung}`,
      show: z.show,
    })),
  ];

  if (zeilen.length === 0) {
    return <p className="text-sm text-leise">Noch niemand verteilt.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
        <tr>
          <th className="pb-1 font-medium">Gruppe</th>
          <th className="w-20 whitespace-nowrap pb-1 text-right font-medium">Gäste</th>
          <th className="w-56 pb-1 font-medium">Platz</th>
          {mehrereShows && <th className="w-40 pb-1 font-medium">Show</th>}
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.name + z.platz} className="border-b border-linie last:border-0">
            <td className="py-2 font-medium">{z.name}</td>
            <td className="py-2 text-right tabular-nums whitespace-nowrap">{z.personen}</td>
            <td className="py-2">{z.platz}</td>
            {mehrereShows && (
              <td className="py-2">
                {z.show && <ShowSchild uhrzeit={z.show.uhrzeit} vorDerShow={z.show.vorDerShow} />}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function sicherArtikelname(nummer: string): string {
  try {
    return artikel(nummer).bezeichnung;
  } catch {
    return nummer;
  }
}

/**
 * Was gehört auf welchen Stehtisch?
 *
 * Silver und Gold unterscheiden sich im Inhalt, und genau das muss beim
 * Eindecken klar sein. Die Beschreibung kommt aus dem Artikelstamm, damit
 * sie nicht an zwei Stellen gepflegt werden muss.
 */
function inhaltVon(bezeichnung: string): string | null {
  const klein = bezeichnung.toLowerCase();
  const nummer = klein.includes("gold")
    ? "STEHGOLD"
    : klein.includes("silver") || klein.includes("silber")
      ? "STEHSILVER"
      : klein.includes("diamond")
        ? "STEHDIAMOND"
        : null;
  if (!nummer) return null;
  try {
    return artikel(nummer).beschreibung ?? null;
  } catch {
    return null;
  }
}
