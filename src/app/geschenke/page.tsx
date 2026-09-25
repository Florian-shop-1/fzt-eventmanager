import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { geschenke, GESCHENK_TEXT } from "@/lib/abbrecher/geschenk";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { ausgegeben, dochNicht } from "./aktionen";

export const metadata = { title: "Abbrecher-Geschenke | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Was an der Magic-Bar für einen Gast bereitliegt.
 *
 * Gäste, die im Warenkorb stehen geblieben sind, bekommen von uns ein
 * Geschenk und danach doch gebucht haben. In Ditix steht davon nichts,
 * das Geschenk ist auf den Namen hinterlegt (Florian, 23.09.2026).
 *
 * Gedacht fürs Foyer am Abend: Name suchen, ausgeben, abhaken. Deshalb
 * große Zeilen, wenig Text und der Name zuerst.
 */
export default async function GeschenkeSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeige?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");

  /*
    Im Foyer zaehlt nur der Abend, der gerade laeuft. Alles andere ist
    Suchen in einer Liste, waehrend jemand vor einem steht
    (Florian, 23.09.2026). Deshalb ist "Heute" die Vorgabe.
  */
  const { zeige } = await searchParams;
  const ansicht = zeige === "offen" || zeige === "alle" ? zeige : "heute";
  const alleZeigen = ansicht === "alle";
  const roh = await geschenke(alleZeigen);
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const heuteListe = roh.filter((g) => g.gebuchtDatum === heute && !g.eingeloestAm);
  const liste =
    ansicht === "heute" ? roh.filter((g) => g.gebuchtDatum === heute) : roh;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Geschenke an der Magic-Bar</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Diese Gäste haben von uns etwas geschenkt bekommen, weil ihre Buchung zuerst abgebrochen war. Sie
          melden sich an der Bar, du gibst es aus und hakst ab. In Ditix steht davon nichts, es läuft nur über
          diese Liste.
        </p>
      </header>

      {heuteListe.length > 0 && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
          <strong>Heute Abend erwartet:</strong> {heuteListe.length}{" "}
          {heuteListe.length === 1 ? "Gast" : "Gäste"} mit einem Geschenk.
        </p>
      )}

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["heute", `Heute (${heuteListe.length})`],
          ["offen", "Alle offenen"],
          ["alle", "Auch schon ausgegeben"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={wert === "heute" ? "/geschenke" : `/geschenke?zeige=${wert}`}
            className={`rounded-md px-3 py-1.5 ${ansicht === wert ? "bg-text text-flaeche" : "border border-linie"}`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          {ansicht === "heute"
            ? "Für heute Abend liegt nichts bereit. Wenn jemand trotzdem danach fragt, schau unter „Alle offenen“."
            : "Gerade liegt nichts bereit."}
        </p>
      ) : (
        <ul className="space-y-2">
          {liste.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3"
              style={{
                borderColor: g.eingeloestAm ? "var(--linie)" : "var(--gold)",
                background: g.eingeloestAm ? "var(--flaeche)" : "var(--gold-hell)",
                opacity: g.eingeloestAm ? 0.6 : 1,
              }}
            >
              <div className="min-w-48 flex-1">
                <div className="text-lg font-semibold">{g.name || g.email}</div>
                <div className="text-sm">
                  <strong>{g.gilt}</strong> × {GESCHENK_TEXT[g.art]}
                </div>
                {/* Hat er am Ende weniger Plätze gebucht, gibt es auch
                    weniger. Die Zahl steht trotzdem dabei, damit im Foyer
                    niemand rätselt (Florian, 23.09.2026). */}
                {g.gebuchtPlaetze !== null && g.gilt !== g.anzahl && (
                  <div className="text-xs" style={{ color: "var(--warnung)" }}>
                    {g.anzahl} waren versprochen, gebucht hat er {g.gebuchtPlaetze}
                    {g.gebuchtPlaetze === 1 ? " Platz" : " Plätze"}
                  </div>
                )}
                {/* Hier steht nur noch, wer wirklich gebucht hat, siehe
                    lib/abbrecher/geschenk.ts. */}
                <div className="text-xs text-leise">
                  {g.gebuchtShow} am {g.gebuchtDatum?.split("-").reverse().join(".")}
                  {g.gebuchtUhrzeit ? `, ${g.gebuchtUhrzeit} Uhr` : ""}
                </div>
                {g.eingeloestAm && (
                  <div className="text-xs" style={{ color: "var(--gut)" }}>
                    ausgegeben {vorZeit(g.eingeloestAm)}
                    {g.eingeloestVon ? ` von ${g.eingeloestVon}` : ""}
                  </div>
                )}
              </div>

              {g.eingeloestAm ? (
                <form action={dochNicht}>
                  <input type="hidden" name="id" value={g.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    doch nicht
                  </button>
                </form>
              ) : (
                <form action={ausgegeben}>
                  <input type="hidden" name="id" value={g.id} />
                  <Absendeknopf text="Ausgegeben" laeuftText="..." />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
