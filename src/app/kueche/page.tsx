import Link from "next/link";
import { holeKuechenblatt } from "@/lib/kueche/blatt";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { artikel } from "@/lib/domain/artikel";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import type { MenueVariante } from "@/lib/domain/types";

export const metadata = { title: "Küche | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const VARIANTEN: Array<{ wert: MenueVariante; label: string }> = [
  { wert: "classic", label: "Classic" },
  { wert: "sea", label: "Sea" },
  { wert: "veggy", label: "Veggy" },
  { wert: "kids", label: "Kids" },
];

export default async function KuecheSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
  const benutzer = await angemeldeterBenutzer();
  const kaufmaennisch = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
  const termine = await alleShowtage();
  // Welcher Abend gezeigt wird, entscheidet an einer Stelle für alle
  // Seiten: Adresse, dann der zuletzt angesehene Abend, dann heute.
  const { gewaehlt, monat: aufgeschlagenerMonat, heute } = await waehleAbend(termine, {
    abend,
    monat,
  });
  const blatt = gewaehlt ? await holeKuechenblatt(gewaehlt) : null;

  const kopfzeile = blatt ? `${datumKurz(blatt.datum)} · ${blatt.show}` : undefined;

  return (
    <div className="space-y-6">
      <Druckkopf titel="Küchenblatt" untertitel={kopfzeile} />

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Küchenblatt</h1>
          <p className="mt-1 text-sm text-leise">
            Was an einem Abend gegessen und getrunken wird. Zusammengeführt aus den Bestellungen
            im Shop und den Firmenevents aus diesem Programm.
          </p>
        </div>
        <DruckKnopf text="Küchenblatt drucken" />
      </header>

      {termine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">Keine Vorstellungen gefunden</div>
          <p className="mt-1 text-leise">
            Der Spielplan aus dem Ticketshop ist gerade nicht erreichbar.
          </p>
        </div>
      ) : (
        <>
          <AbendAuswahl
            basisPfad="/kueche"
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
              hinweis: t.gaeste > 0 ? `${t.gaeste} mit Menü` : "keine Menüs",
            }))}
          />

          {blatt && <Blatt blatt={blatt} kaufmaennisch={kaufmaennisch} />}
        </>
      )}
    </div>
  );
}

function Blatt({
  blatt,
  kaufmaennisch,
}: {
  blatt: NonNullable<Awaited<ReturnType<typeof holeKuechenblatt>>>;
  kaufmaennisch: boolean;
}) {
  const shopMenues = blatt.shop?.menuesGesamt ?? 0;
  const firmenMenues = blatt.firmen.reduce((s, f) => s + f.menuesGesamt, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gold bg-gold-hell p-6">
        <div className="mb-1 text-sm text-leise">
          {datumKurz(blatt.datum)} · {blatt.show}
          {kaufmaennisch && blatt.showgaeste > 0 && ` · ${blatt.showgaeste} Showgäste im Haus`}
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-semibold tabular-nums">{blatt.gesamtMenues}</span>
          <span className="text-lg">
            {blatt.gesamtMenues === 0 ? "Menüs, nur Show und Bar" : "Menüs insgesamt"}
          </span>
          {blatt.reservierteMenues > 0 && (
            <span className="text-sm" style={{ color: "var(--warnung)" }}>
              davon {blatt.reservierteMenues} nur reserviert
            </span>
          )}
        </div>

        <table className="mt-4 w-full max-w-md text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-leise">
            <tr>
              <th className="pb-1 font-medium">Variante</th>
              <th className="pb-1 text-right font-medium">Shop</th>
              <th className="pb-1 text-right font-medium">Firmen</th>
              <th className="pb-1 text-right font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {VARIANTEN.map(({ wert, label }) => {
              const s = blatt.shop?.menues[wert] ?? 0;
              const f = blatt.firmen.reduce((sum, g) => sum + (g.menues[wert] ?? 0), 0);
              return (
                <tr key={wert} className="border-t border-gold/30">
                  <td className="py-1">{label}</td>
                  <td className="py-1 text-right tabular-nums text-leise">{s}</td>
                  <td className="py-1 text-right tabular-nums text-leise">{f}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{s + f}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gold-dunkel">
              <td className="py-1 font-medium">Summe</td>
              <td className="py-1 text-right tabular-nums text-leise">{shopMenues}</td>
              <td className="py-1 text-right tabular-nums text-leise">{firmenMenues}</td>
              <td className="py-1 text-right text-lg font-semibold tabular-nums">
                {blatt.gesamtMenues}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {blatt.luecken.length > 0 && (
        <section className="rounded-lg border border-warnung bg-warnung-hell p-5 text-sm">
          <h2 className="mb-2 font-semibold" style={{ color: "var(--warnung)" }}>
            Menüzahl passt nicht zur Gästezahl
          </h2>
          <ul className="space-y-1">
            {blatt.luecken.map((l) => (
              <li key={l.gruppe}>
                <strong>{l.gruppe}</strong>: {l.personen} Gäste, aber {l.menues} Menüs erfasst
                {l.menues === 0 && " (noch gar keine Menüwahl eingetragen)"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-leise">
            Die Küche bekommt die Zahl, die oben steht. Vor dem Einkauf klären.
          </p>
        </section>
      )}

      {blatt.unvertraeglichkeiten.length > 0 && (
        <section className="rounded-lg border border-linie bg-flaeche p-5">
          <h2 className="mb-3 text-sm font-semibold">Unverträglichkeiten und Sonderwünsche</h2>
          <ul className="space-y-2 text-sm">
            {blatt.unvertraeglichkeiten.map((u) => (
              <li key={u.gruppe} className="border-l-2 pl-3" style={{ borderColor: "var(--warnung)" }}>
                <div className="font-medium">{u.gruppe}</div>
                <div>{u.text}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="mb-3 text-sm font-semibold">Firmenevents an diesem Abend</h2>
        {blatt.firmen.length === 0 ? (
          <p className="text-sm text-leise">Keine Firmengruppen eingetragen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                <tr>
                  <th className="pb-1 font-medium">Gruppe</th>
                  <th className="pb-1 font-medium">Stand</th>
                  <th className="pb-1 text-right font-medium">Gäste</th>
                  <th className="pb-1 text-right font-medium">Menüs</th>
                  <th className="pb-1 font-medium">Getränke</th>
                  <th className="pb-1 font-medium">Vorgang</th>
                </tr>
              </thead>
              <tbody>
                {blatt.firmen.map((f) => (
                  <tr key={f.vorgangId + f.gruppe} className="border-b border-linie last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{f.gruppe}</div>
                      {f.kunde !== f.gruppe && (
                        <div className="text-xs text-leise">{f.kunde}</div>
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      {f.sicherheit === "reserviert" ? (
                        <span style={{ color: "var(--warnung)" }}>reserviert</span>
                      ) : (
                        <span style={{ color: "var(--gut)" }}>gebucht</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{f.personen}</td>
                    <td className="py-2 text-right tabular-nums">{f.menuesGesamt}</td>
                    <td className="py-2 text-xs">
                      {f.getraenkepauschalen.length > 0 ? (
                        <>
                          {f.getraenkepauschalen.map(sicherArtikelname).join(" + ")}
                          <div className="text-leise">{f.personen} Armbänder</div>
                        </>
                      ) : (
                        <span className="text-leise">keine</span>
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      <Link href={`/vorgaenge/${f.vorgangId}`} className="hover:text-gold-dunkel">
                        {f.vorgangNummer}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="mb-3 text-sm font-semibold">Aus dem Shop</h2>
        {blatt.shopFehler ? (
          <p className="text-sm" style={{ color: "var(--blocker)" }}>
            {blatt.shopFehler}
          </p>
        ) : !blatt.ditixEventId ? (
          <p className="text-sm text-leise">
            Für diesen Abend ist keine Vorstellung aus dem Ticketshop hinterlegt, deshalb können
            die Shop-Bestellungen nicht zugeordnet werden.
          </p>
        ) : blatt.shop ? (
          <div className="space-y-2 text-sm">
            <p className="text-leise">
              {blatt.shop.bestellungen} Bestellungen mit Zusatzleistungen.
            </p>
            <ul className="space-y-1">
              {blatt.shop.getraenkeArmbaender > 0 && (
                <li>{blatt.shop.getraenkeArmbaender} Getränkeflat-Armbänder</li>
              )}
              {blatt.shop.vipArmbandGold > 0 && (
                <li>{blatt.shop.vipArmbandGold} goldene VIP-Armbänder</li>
              )}
              {blatt.shop.stehtische > 0 && <li>{blatt.shop.stehtische} Stehtische im Foyer</li>}
              {blatt.shop.sonstiges.map((s) => (
                <li key={s.bezeichnung} className="text-leise">
                  {s.menge}x {s.bezeichnung}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Artikelnamen nachschlagen, ohne bei unbekannter Nummer abzustürzen. */
function sicherArtikelname(nummer: string): string {
  try {
    return artikel(nummer).bezeichnung;
  } catch {
    return nummer;
  }
}
