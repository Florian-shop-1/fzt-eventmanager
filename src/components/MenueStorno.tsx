import { menueKorrigieren, menueStornieren, menueStornoZurueck } from "@/app/kueche/aktionen";
import type { GeprüfteBestellung } from "@/lib/shop/menueliste";
import type { MenueVariante } from "@/lib/domain/types";

/**
 * Einzelne Shop-Bestellungen streichen oder in der Menge korrigieren.
 *
 * Ein Storno in Ditix kommt hier nicht an: Die Tabelle, aus der die
 * Bestellungen stammen, schreibt der Shop und räumt nichts weg. Wer dort
 * absagt oder von acht auf vier Menüs geht, muss es hier noch einmal
 * sagen, sonst kocht die Küche für Gäste, die nicht kommen
 * (Florian, 02.10.2026).
 *
 * Steht auf dem Küchenblatt und auf dem Funktionsheet, weil die Küche mit
 * dem einen und die Gastro mit dem anderen arbeitet. Geändert wird nie an
 * der Bestellung selbst: Die Korrektur steht daneben, mit Namen und
 * Grund, und lässt sich zurücknehmen.
 */

const VARIANTEN: Array<{ wert: MenueVariante; kurz: string }> = [
  { wert: "classic", kurz: "Classic" },
  { wert: "sea", kurz: "Sea" },
  { wert: "veggy", kurz: "Veggy" },
  { wert: "kids", kurz: "Kids" },
];

export function MenueStorno({
  bestellungen,
  eventId,
  woher,
  darfAendern,
}: {
  bestellungen: GeprüfteBestellung[];
  eventId: string;
  /** "kueche" oder "funktionsheet": wohin es nach dem Klick zurückgeht. */
  woher: "kueche" | "funktionsheet";
  /** Streichen und korrigieren dürfen nur Florian und Kevin. */
  darfAendern: boolean;
}) {
  if (bestellungen.length === 0) return null;

  const zeit = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mt-4 border-t border-linie pt-3 print:hidden">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-leise">
        Einzelne Bestellungen aus dem Shop
      </p>

      <ul className="space-y-3">
        {aufgeteilt(bestellungen).map((b) => {
          const bestellt = mengenText(b.menues);
          const gilt = mengenText(b.menuesGueltig);
          return (
            <li key={b.bestellung} className="rounded-md border border-linie px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <strong className={b.storniert ? "text-leise line-through" : ""}>
                  {b.kunde || "ohne Namen"}
                </strong>
                <span className="text-xs text-leise">{b.bestellung}</span>
                <span className={`ml-auto tabular-nums ${b.storniert ? "text-leise line-through" : ""}`}>
                  {gilt || "keine Menüs"}
                </span>
              </div>

              {/* Was war, und was jetzt gilt: beides sichtbar. */}
              {b.aenderung && (
                <p className="mt-1 text-xs" style={{ color: "var(--warnung)" }}>
                  {b.aenderung.art === "storno" ? "Storniert" : `Korrigiert, bestellt waren ${bestellt || "keine"}`}
                  {" von "}
                  <strong>{b.aenderung.wer || "unbekannt"}</strong> am {zeit(b.aenderung.wann)} Uhr
                  {b.aenderung.grund ? `: ${b.aenderung.grund}` : ""}
                </p>
              )}

              {darfAendern && (
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  {b.aenderung ? (
                    <form action={menueStornoZurueck}>
                      <input type="hidden" name="bestellung" value={b.bestellung} />
                      <input type="hidden" name="abend" value={eventId} />
                      <input type="hidden" name="woher" value={woher} />
                      <button type="submit" className="text-xs underline text-leise">
                        Änderung zurücknehmen
                      </button>
                    </form>
                  ) : (
                    <>
                      {/* Mengen korrigieren: acht Menüs werden vier. */}
                      <form action={menueKorrigieren} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="bestellung" value={b.bestellung} />
                        <input type="hidden" name="kunde" value={b.kunde} />
                        <input type="hidden" name="abend" value={eventId} />
                        <input type="hidden" name="woher" value={woher} />
                        {VARIANTEN.map((v) => (
                          <label key={v.wert} className="block">
                            <span className="mb-0.5 block text-[11px] text-leise">{v.kurz}</span>
                            <input
                              name={v.wert}
                              inputMode="numeric"
                              defaultValue={String(b.menues[v.wert] ?? 0)}
                              className="w-14 text-sm"
                            />
                          </label>
                        ))}
                        <input name="grund" maxLength={300} placeholder="Grund" className="w-44 text-xs" />
                        <button type="submit" className="rounded-md border border-linie px-2 py-1 text-xs">
                          Menge korrigieren
                        </button>
                      </form>

                      <form action={menueStornieren} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="bestellung" value={b.bestellung} />
                        <input type="hidden" name="kunde" value={b.kunde} />
                        <input type="hidden" name="abend" value={eventId} />
                        <input type="hidden" name="woher" value={woher} />
                        <input name="grund" maxLength={300} placeholder="Grund" className="w-44 text-xs" />
                        <button
                          type="submit"
                          className="rounded-md border border-linie px-2 py-1 text-xs"
                          style={{ color: "var(--blocker)" }}
                        >
                          ganz stornieren
                        </button>
                      </form>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-leise">
        {darfAendern
          ? "Was hier steht, zählt im Küchenblatt, auf dem Funktionsheet und in der Belegung. In der Tabelle des Shops bleibt die Bestellung unverändert."
          : "Ändern dürfen das nur Florian und Kevin."}
      </p>
    </div>
  );
}

/** Bestellungen mit Menüs zuerst: Sie sind der Grund, warum man hier liest. */
function aufgeteilt(alle: GeprüfteBestellung[]): GeprüfteBestellung[] {
  const summe = (b: GeprüfteBestellung) =>
    Object.values(b.menues).reduce((s, n) => s + (n ?? 0), 0);
  return [...alle].sort((a, b) => summe(b) - summe(a));
}

function mengenText(menues: Partial<Record<MenueVariante, number>>): string {
  return VARIANTEN.filter((v) => (menues[v.wert] ?? 0) > 0)
    .map((v) => `${menues[v.wert]}x ${v.kurz}`)
    .join(", ");
}
