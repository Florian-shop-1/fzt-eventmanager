import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { erledigteMerker, offeneMerker } from "@/lib/db/merker";
import { Absendeknopf } from "@/components/Absendeknopf";
import { abhaken, notieren, verschieben, wiederOeffnen } from "./aktionen";

export const metadata = { title: "Merkzettel | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const tag = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Der eigene Merkzettel.
 *
 * Für Dinge, die von außen abhängen: ein Zugang, eine Rückfrage, eine
 * Nummer, die noch fehlt. Das Programm meldet sich alle paar Tage damit,
 * bis es abgehakt ist.
 */
export default async function MerkerSeite({ searchParams }: { searchParams: Promise<{ meldung?: string }> }) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  const { meldung } = await searchParams;
  const [offen, erledigt] = await Promise.all([offeneMerker(b.id), erledigteMerker(b.id)]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Merkzettel</h1>
        <p className="mt-1 text-sm text-leise">
          Was noch zu erledigen ist und von jemand anderem abhängt. Das Programm erinnert dich alle paar Tage daran,
          bis du es abhakst.
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {offen.length === 0 ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
          Nichts offen. Schön.
        </p>
      ) : (
        <ul className="space-y-3">
          {offen.map((m) => (
            <li key={m.id} className="rounded-lg border border-linie bg-flaeche p-4">
              <p className="font-semibold">{m.titel}</p>
              {m.text && <p className="mt-1 text-sm text-leise">{m.text}</p>}
              <p className="mt-1 text-xs text-leise">Nächste Erinnerung: {tag(m.wiederAm)}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {m.link && (
                  <Link href={m.link} className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
                    Hinschauen
                  </Link>
                )}
                <form action={abhaken}>
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--gut)" }}>
                    Erledigt
                  </button>
                </form>
                <form action={verschieben} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="tage" value="7" />
                  <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
                    in einer Woche
                  </button>
                </form>
                <form action={verschieben} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="tage" value="30" />
                  <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
                    in einem Monat
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Selbst etwas notieren</summary>
        <form action={notieren} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Worum geht es?</span>
            <input name="titel" required maxLength={120} placeholder="zum Beispiel Steuernummer auf der Rechnung eintragen" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Notiz, freiwillig</span>
            <textarea name="text" rows={2} maxLength={500} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Erinnere mich in wie vielen Tagen?</span>
            <input name="tage" type="number" min={0} max={365} defaultValue={0} className="w-28" />
          </label>
          <Absendeknopf text="Auf den Zettel" laeuftText="..." />
        </form>
      </details>

      {erledigt.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-leise underline">Schon erledigt ({erledigt.length})</summary>
          <ul className="mt-2 space-y-2">
            {erledigt.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 border-b border-linie pb-2">
                <span className="flex-1">{m.titel}</span>
                <form action={wiederOeffnen}>
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    doch noch offen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
