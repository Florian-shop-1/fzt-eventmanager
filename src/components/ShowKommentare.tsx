import type { Kommentar } from "@/lib/dienstplan/kommentar";
import { vorZeit } from "@/components/Status";
import { Absendeknopf } from "@/components/Absendeknopf";
import { herzGeben, kommentarWeg, kommentieren } from "@/app/dienstplan/aktionen";

/**
 * Die Kommentare unter einer Show, wie unter einem Beitrag bei Facebook.
 *
 * Zugeklappt steht nur eine Zeile da ("3 Kommentare"), damit der Plan
 * übersichtlich bleibt. Wer aufklappt, sieht alles und kann schreiben,
 * antworten und ein Herz geben. Gibt es noch nichts, steht die Einladung
 * zum Schreiben da, sonst traut sich niemand als Erster.
 *
 * Bewusst ohne Javascript im Browser: Jeder Knopf ist ein Formular, das
 * abschickt und die Seite neu lädt. Das ist auf einem alten Handy im
 * Foyer verlässlicher als alles andere (Florian, 23.09.2026).
 */
export function ShowKommentare({
  eventId,
  kommentare,
  ichId,
  darfLoeschen,
  offen,
}: {
  eventId: string;
  kommentare: Kommentar[];
  ichId: string | null;
  /** Büro und Inhaber dürfen auch fremde Kommentare entfernen. */
  darfLoeschen: boolean;
  /** Aufgeklappt anzeigen, etwa wenn gerade jemand geschrieben hat. */
  offen?: boolean;
}) {
  const anzahl = kommentare.reduce((n, k) => n + 1 + k.antworten.length, 0);

  return (
    <details open={offen || anzahl > 0} className="border-t border-linie px-4 py-2 text-sm">
      <summary className="cursor-pointer list-none text-leise hover:text-text">
        {anzahl === 0 ? "Etwas zu dieser Show schreiben" : anzahl === 1 ? "1 Kommentar" : `${anzahl} Kommentare`}
      </summary>

      <div className="mt-3 space-y-3">
        {kommentare.map((k) => (
          <Beitrag
            key={k.id}
            k={k}
            eventId={eventId}
            ichId={ichId}
            darfLoeschen={darfLoeschen}
          />
        ))}

        <form action={kommentieren} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="vorstellung" value={eventId} />
          <input
            name="text"
            maxLength={2000}
            placeholder="Etwas zu dieser Show schreiben..."
            className="min-w-[12rem] flex-1 rounded-md border border-linie px-3 py-1.5"
          />
          <Absendeknopf text="Senden" laeuftText="..." />
        </form>
      </div>
    </details>
  );
}

function Beitrag({
  k,
  eventId,
  ichId,
  darfLoeschen,
  antwort,
}: {
  k: Kommentar;
  eventId: string;
  ichId: string | null;
  darfLoeschen: boolean;
  antwort?: boolean;
}) {
  const meiner = ichId !== null && k.benutzerId === ichId;

  return (
    <div className={antwort ? "ml-6 border-l border-linie pl-3" : ""}>
      <div className="rounded-lg bg-gold-hell/40 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <strong>{k.wer}</strong>
          <span className="text-xs text-leise">{vorZeit(k.erstelltAm)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words">
          {k.geloescht ? <span className="text-leise">Kommentar entfernt</span> : k.text}
        </p>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-leise">
        {!k.geloescht && (
          <form action={herzGeben}>
            <input type="hidden" name="vorstellung" value={eventId} />
            <input type="hidden" name="kommentar" value={k.id} />
            <button
              type="submit"
              className="hover:text-text"
              style={{ color: k.meinHerz ? "var(--blocker)" : undefined }}
              aria-label={k.meinHerz ? "Herz zurücknehmen" : "Herz geben"}
            >
              {k.meinHerz ? "♥" : "♡"} {k.herzen > 0 ? k.herzen : ""}
            </button>
          </form>
        )}

        {!antwort && !k.geloescht && (
          <details>
            <summary className="cursor-pointer list-none hover:text-text">Antworten</summary>
            <form action={kommentieren} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="vorstellung" value={eventId} />
              <input type="hidden" name="antwortAuf" value={k.id} />
              <input
                name="text"
                maxLength={2000}
                placeholder={`Antwort an ${k.wer.split(" ")[0]}...`}
                className="min-w-[10rem] flex-1 rounded-md border border-linie px-3 py-1.5 text-sm"
              />
              <Absendeknopf text="Antworten" laeuftText="..." />
            </form>
          </details>
        )}

        {(meiner || darfLoeschen) && !k.geloescht && (
          <form action={kommentarWeg}>
            <input type="hidden" name="vorstellung" value={eventId} />
            <input type="hidden" name="kommentar" value={k.id} />
            <button type="submit" className="hover:text-text">
              Löschen
            </button>
          </form>
        )}
      </div>

      {k.antworten.length > 0 && (
        <div className="mt-2 space-y-2">
          {k.antworten.map((a) => (
            <Beitrag key={a.id} k={a} eventId={eventId} ichId={ichId} darfLoeschen={darfLoeschen} antwort />
          ))}
        </div>
      )}
    </div>
  );
}
