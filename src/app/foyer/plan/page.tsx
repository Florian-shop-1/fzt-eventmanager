import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { foyerLeute, foyerPlan, type FoyerDienst, type FoyerPerson } from "@/lib/foyer/dienstplan";
import { offeneUebernahmen, type UebernahmeAntrag } from "@/lib/dienstplan/uebernahme";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { ShowKommentare } from "@/components/ShowKommentare";
import { FoyerZusatzPlaetze } from "@/components/FoyerZusatzPlaetze";
import { kommentareFuer } from "@/lib/dienstplan/kommentar";
import { festMarkieren, foyerUebernahmeEntscheiden, foyerUebernehmenAnbieten, tagEintragen, zeiten } from "./aktionen";

export const metadata = { title: "Foyer-Dienstplan | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Foyerdienst, geplant von Sarah.
 *
 * Zwei Plätze je Showtag mit vorgerechneten Zeiten, weitere nach Bedarf
 * über das Plus. Sarah trägt
 * feste Mitarbeiterinnen und Aushilfen gleichermaßen direkt ein; Kevin
 * und Florian bekommen bei einer Aushilfe nur noch eine Info-Mail, keine
 * Freigabe mehr nötig (Florian, 25.09.2026).
 */
export default async function FoyerPlanSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!["chef", "team", "foyer"].includes(b.rolle)) redirect("/");
  const { meldung } = await searchParams;

  const [tage, leute] = await Promise.all([foyerPlan(), foyerLeute()]);
  const buero = darfKaufmaennisches(b.rolle);
  const darfFreigeben = b.rolle === "chef" || darfEinladen(b);
  const uebernahmeAnfragen = darfFreigeben ? await offeneUebernahmen("foyer") : [];
  const ichArbeiteImFoyer = leute.some((p) => p.id === b.id);

  /*
    Die Kommentare unter jedem Tag, wie im Dienstplan des Showteams.

    Das Foyer redet über den Abend, nicht über eine Zeile: wer später
    kommt, wo die Schlüssel liegen, dass eine große Gruppe erwartet wird.
    Gespeichert in derselben Tabelle wie die Kommentare zur Show, mit
    "foyer:" plus Datum als Schlüssel. So bleiben beide getrennt, ohne
    dass es eine zweite Tabelle braucht (Florian, 25.09.2026).
  */
  const kommentarSchluessel = (datum: string) => `foyer:${datum}`;
  const kommentare = await kommentareFuer(tage.map((t) => kommentarSchluessel(t.datum)), b.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Foyer-Dienstplan</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Zwei Plätze je Showtag, weitere kommen über das Plus dazu. Die Zeiten rechnet das Programm aus dem Spielplan: erste Person zwei Stunden
          vor der ersten Show, zweite 45 Minuten später, Schluss rund drei Stunden nach Beginn der letzten Show. An
          Tagen mit Flo-Zirkus reicht anderthalb Stunden Vorlauf. Passt es einmal nicht, änderst du die Zeiten
          einfach am Tag.
        </p>
        <p className="mt-2 max-w-prose text-sm text-leise">
          Faustregel für die Anzahl: eine Person je 50 Gäste, also bis 50 eine, über 50 zwei, über 100 drei. Reichen
          zwei nicht, holst du über &quot;+ weitere Mitarbeiter einteilen&quot; einen dazu. Darunter steht sofort
          wieder ein Plus, so viele wie du brauchst.
        </p>
        <p className="mt-2 max-w-prose text-sm text-leise">
          Feste Mitarbeiterinnen und Aushilfen trägst du gleich ein, eine Freigabe braucht es nicht mehr. Bei einer
          Aushilfe bekommen Kevin und Florian nur noch eine Info-Mail.
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {darfFreigeben && uebernahmeAnfragen.length > 0 && (
        <section
          id="uebernahme"
          className="scroll-mt-24 space-y-2 rounded-lg border p-4"
          style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
        >
          <h2 className="font-semibold">Übernahme-Anfragen warten auf Freigabe</h2>
          <ul className="space-y-2 text-sm">
            {uebernahmeAnfragen.map((a: UebernahmeAntrag) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-flaeche px-3 py-2">
                <span className="flex-1">
                  <strong>{a.anbieterName}</strong> möchte {a.bisherigerName}s Foyerdienst übernehmen
                </span>
                <span className="flex gap-2">
                  <form action={foyerUebernahmeEntscheiden}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value="angenommen" />
                    <Absendeknopf text="Freigeben" laeuftText="..." />
                  </form>
                  <form action={foyerUebernahmeEntscheiden}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value="abgelehnt" />
                    <button type="submit" className="text-sm text-leise underline">
                      Ablehnen
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tage.length === 0 ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
          In den nächsten Wochen stehen keine Shows im Spielplan.
        </p>
      ) : (
        <ul className="space-y-3">
          {tage.map((t) => (
            <li key={t.datum} id={`t-${t.datum}`} className="rounded-lg border border-linie bg-flaeche p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <strong>{datumMitWochentag(t.datum)}</strong>
                <span className="text-sm text-leise">
                  {t.shows.map((s) => `${s.uhrzeit} Uhr`).join(" und ")} · {t.shows[0]?.name}
                </span>
                {t.pause && <span className="text-sm text-leise">Pause {t.pause}</span>}
              </div>

              {/*
                Zwei Plaetze stehen immer da, die besetzten Zusatzplaetze
                darunter, und zum Schluss ein Pluszeichen fuer den
                naechsten. Ist der besetzt und gespeichert, steht darunter
                wieder ein Pluszeichen (Florian, 04.10.2026).
              */}
              <form action={tagEintragen}>
                <input type="hidden" name="datum" value={t.datum} />
                <ul className="mt-2 space-y-2">
                  {t.dienste
                    .filter((d, i) => i < 2 || d.benutzerId)
                    .map((d) => (
                      <PlatzZeile key={d.nummer} d={d} leute={leute} />
                    ))}
                </ul>
                {(() => {
                  const naechster = t.dienste[t.dienste.length - 1];
                  if (!naechster || naechster.benutzerId) return null;
                  return (
                    <FoyerZusatzPlaetze
                      abNummer={naechster.nummer}
                      von={naechster.von}
                      bis={naechster.bis}
                      leute={leute.map((p) => ({ id: p.id, name: p.name, fest: p.fest }))}
                    />
                  );
                })()}
                <div className="mt-2">
                  <Absendeknopf text="Tag speichern" laeuftText="..." />
                </div>
              </form>

              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-leise underline">Zeiten oder Notiz ändern</summary>
                {t.dienste.filter((d, i) => i < 2 || d.benutzerId).map((d) => (
                  <form key={d.nummer} action={zeiten} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="datum" value={t.datum} />
                    <input type="hidden" name="nummer" value={d.nummer} />
                    <span className="w-24 shrink-0">{d.nummer}. Person</span>
                    <label className="block">
                      <span className="mb-1 block text-xs text-leise">von</span>
                      <input type="time" name="von" defaultValue={d.von} className="w-28" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-leise">bis</span>
                      <input type="time" name="bis" defaultValue={d.bis} className="w-28" />
                    </label>
                    <label className="block min-w-[12rem] flex-1">
                      <span className="mb-1 block text-xs text-leise">Notiz</span>
                      <input name="notiz" defaultValue={d.notiz} maxLength={300} placeholder="zum Beispiel Pause während der Nachmittagsshow" />
                    </label>
                    <button type="submit" className="rounded-md border border-linie px-3 py-1.5">
                      Speichern
                    </button>
                  </form>
                ))}
              </details>

              {ichArbeiteImFoyer && (
                <VertretungAnbieten
                  dienste={t.dienste.filter((d) => d.benutzerId && d.benutzerId !== b.id)}
                  leute={leute}
                />
              )}

              <ShowKommentare
                eventId={kommentarSchluessel(t.datum)}
                kommentare={kommentare.get(kommentarSchluessel(t.datum)) ?? []}
                ichId={b.id}
                darfLoeschen={buero}
                ziel="foyer"
                einladung="Etwas zu diesem Abend schreiben"
              />
            </li>
          ))}
        </ul>
      )}

      <section id="leute" className="scroll-mt-24 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Wer im Foyer arbeitet</h2>
        <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
          {leute.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <span className="flex-1">{p.name}</span>
              <span className="text-leise">{p.fest ? "fest angestellt" : "Aushilfe"}</span>
              {buero && (
                <form action={festMarkieren}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="fest" value={p.fest ? "nein" : "ja"} />
                  <button type="submit" className="text-xs text-leise underline">
                    {p.fest ? "als Aushilfe führen" : "als fest angestellt führen"}
                  </button>
                </form>
              )}
            </li>
          ))}
          {leute.length === 0 && <li className="px-4 py-2 text-leise">Noch niemand mit Foyer-Zugang.</li>}
        </ul>
        <p className="text-xs text-leise">
          Wer hier steht, hat einen Foyer-Zugang im Eventmanager. Neue Leute lädt Florian über die Einladungslinks
          ein. Ob jemand fest angestellt ist, tragen nur Kevin und Florian ein.
        </p>
      </section>
    </div>
  );
}

/** Eine Zeile im Tagesformular: wer steht auf diesem Platz. */
function PlatzZeile({ d, leute }: { d: FoyerDienst; leute: FoyerPerson[] }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-linie pt-2 text-sm">
      <span className="w-24 shrink-0 font-medium">{d.nummer}. Person</span>

      <input type="hidden" name={`von${d.nummer}`} value={d.von} />
      <input type="hidden" name={`bis${d.nummer}`} value={d.bis} />
      <select name={`benutzer${d.nummer}`} defaultValue={d.benutzerId ?? "offen"} className="text-sm">
        <option value="offen">offen</option>
        {leute.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.fest ? "" : " (Aushilfe)"}
          </option>
        ))}
      </select>

      <span className="text-leise">
        {d.von || "?"} bis {d.bis || "?"} Uhr
      </span>

      {d.notiz && <span className="text-leise">· {d.notiz}</span>}
    </li>
  );
}

/**
 * Zur Entlastung eine besetzte Schicht anbieten, außerhalb des großen
 * Formulars oben: Ein eigenes, kleines Formular je Platz, sonst gäbe es
 * ein Formular im Formular (Florian, 28.09.2026).
 */
function VertretungAnbieten({ dienste, leute }: { dienste: FoyerDienst[]; leute: FoyerPerson[] }) {
  if (dienste.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-sm">
      {dienste.map((d) => {
        const person = leute.find((p) => p.id === d.benutzerId);
        return (
          <form key={d.nummer} action={foyerUebernehmenAnbieten}>
            <input type="hidden" name="id" value={d.id} />
            <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-xs hover:bg-gold-hell">
              {person?.name.split(" ")[0]} entlasten{person?.fest ? " (Freigabe nötig)" : ""}
            </button>
          </form>
        );
      })}
    </div>
  );
}
