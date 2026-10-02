import { menueStornieren, menueStornoZurueck } from "@/app/kueche/aktionen";
import type { ShopBestellung } from "@/lib/shop/menueliste";

/**
 * Einzelne Shop-Bestellungen streichen.
 *
 * Ein Storno in Ditix kommt hier nicht an: Die Tabelle, aus der die
 * Bestellungen stammen, schreibt der Shop und räumt nichts weg. Wer in
 * Ditix storniert, muss es hier noch einmal sagen, sonst kocht die Küche
 * für Gäste, die abgesagt haben (Florian, 02.10.2026).
 *
 * Steht auf dem Küchenblatt und auf dem Funktionsheet, weil die Küche mit
 * dem einen und die Gastro mit dem anderen arbeitet. Gelöscht wird nie:
 * Der Storno steht daneben und lässt sich zurücknehmen.
 */
export function MenueStorno({
  bestellungen,
  eventId,
  woher,
}: {
  bestellungen: Array<ShopBestellung & { storniert: boolean }>;
  eventId: string;
  /** "kueche" oder "funktionsheet": wohin es nach dem Klick zurückgeht. */
  woher: "kueche" | "funktionsheet";
}) {
  if (bestellungen.length === 0) return null;

  return (
    <div className="mt-4 border-t border-linie pt-3 print:hidden">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-leise">
        Einzelne Bestellungen aus dem Shop
      </p>
      <ul className="space-y-2">
        {bestellungen.map((b) => {
          const menues = Object.entries(b.menues)
            .filter(([, n]) => (n ?? 0) > 0)
            .map(([k, n]) => `${n}x ${k}`)
            .join(", ");
          return (
            <li key={b.bestellung} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={b.storniert ? "text-leise line-through" : ""}>
                <strong>{b.kunde || "ohne Namen"}</strong>
                <span className="text-leise">
                  {" "}
                  · {b.bestellung}
                  {menues ? ` · ${menues}` : " · keine Menüs"}
                </span>
              </span>
              {b.storniert ? (
                <form action={menueStornoZurueck} className="ml-auto flex items-center gap-2">
                  <input type="hidden" name="bestellung" value={b.bestellung} />
                  <input type="hidden" name="abend" value={eventId} />
                  <input type="hidden" name="woher" value={woher} />
                  <span className="text-xs" style={{ color: "var(--blocker)" }}>
                    storniert
                  </span>
                  <button type="submit" className="text-xs underline text-leise">
                    zurücknehmen
                  </button>
                </form>
              ) : (
                <form action={menueStornieren} className="ml-auto flex flex-wrap items-center gap-2">
                  <input type="hidden" name="bestellung" value={b.bestellung} />
                  <input type="hidden" name="kunde" value={b.kunde} />
                  <input type="hidden" name="abend" value={eventId} />
                  <input type="hidden" name="woher" value={woher} />
                  <input
                    name="grund"
                    maxLength={300}
                    placeholder="Grund, zum Beispiel in Ditix storniert"
                    className="w-56 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-linie px-2 py-1 text-xs"
                    style={{ color: "var(--blocker)" }}
                  >
                    stornieren
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-leise">
        Stornierte Bestellungen zählen im Küchenblatt, auf dem Funktionsheet und in der Belegung nicht
        mehr mit. In der Tabelle des Shops bleibt die Zeile unverändert stehen.
      </p>
    </div>
  );
}
