import { nameMerken } from "@/app/wer/aktionen";

/**
 * Die Frage, wer gerade am geteilten Zugang arbeitet.
 *
 * Ein Tipp auf den Namen genügt, wie beim Abhaken der Checklisten. Wer
 * nicht im Dienstplan steht, schreibt sich dazu.
 */
export function WerBistDu({
  namen,
  gewaehlt,
  zurueck,
}: {
  /** Vorschläge: wer heute eingeteilt ist. */
  namen: string[];
  /** Der gemerkte Name, oder "". */
  gewaehlt: string;
  /** Wohin nach dem Klick, für die Aktualisierung. */
  zurueck: string;
}) {
  if (gewaehlt) {
    return (
      <p className="text-xs text-leise">
        Du arbeitest gerade als <strong>{gewaehlt}</strong>.{" "}
        <form action={nameMerken} className="inline">
          <input type="hidden" name="name" value="" />
          <input type="hidden" name="zurueck" value={zurueck} />
          <button type="submit" className="underline">
            jemand anderes
          </button>
        </form>
      </p>
    );
  }

  return (
    <div className="rounded-lg border-2 px-4 py-3" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
      <p className="text-sm font-semibold">Wer arbeitet gerade hier?</p>
      <p className="mt-0.5 text-xs text-leise">
        Damit an dem, was du erledigst, dein Name steht. Gilt für diesen Abend und dieses Gerät.
      </p>

      {namen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {namen.map((n) => (
            <form key={n} action={nameMerken}>
              <input type="hidden" name="name" value={n} />
              <input type="hidden" name="zurueck" value={zurueck} />
              <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm">
                {n}
              </button>
            </form>
          ))}
        </div>
      )}

      <form action={nameMerken} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="zurueck" value={zurueck} />
        <input
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder={namen.length > 0 ? "jemand anderes: Name" : "Name"}
          className="min-w-[12rem] flex-1 text-sm"
        />
        <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
          Das bin ich
        </button>
      </form>
    </div>
  );
}
