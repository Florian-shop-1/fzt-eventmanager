/**
 * Der Ablauf eines Spieltags aus Sicht des Restaurants.
 *
 * Der Grund für diese Darstellung: An Tagen mit zwei Vorstellungen essen
 * trotzdem alle gemeinsam um 18 Uhr. Wer nachmittags in der Show war,
 * kommt danach zum Essen, wer abends hineingeht, isst davor. Für die
 * Küche ist das eine einzige Zahl. Für den Service sind es zwei Sorten
 * Gäste, die unterschiedlich behandelt werden wollen.
 *
 * Diese Leiste zeigt beides auf einmal: oben die große Zahl für die
 * Küche, darunter, woraus sie sich zusammensetzt.
 */

import { MENUE_BEGINNT, RESTAURANT_OEFFNET } from "@/lib/ditix/spielplan";

export interface ShowAnteil {
  uhrzeit: string;
  name: string;
  menues: number;
  vorDerShow: boolean;
}

export function Tagesablauf({
  anteile,
  gesamtMenues,
}: {
  anteile: ShowAnteil[];
  gesamtMenues: number;
}) {
  const mitGaesten = anteile.filter((a) => a.menues > 0);
  const nachDerShow = mitGaesten.filter((a) => !a.vorDerShow);
  const vorDerShow = mitGaesten.filter((a) => a.vorDerShow);

  // Nur eine Vorstellung mit Essern: Dann gibt es nichts zu erklären.
  if (mitGaesten.length < 2) return null;

  const spaeteste = vorDerShow
    .map((a) => a.uhrzeit)
    .sort()
    .at(-1);

  return (
    <div className="border-l-4 pl-4" style={{ borderColor: "var(--gold)" }}>
      <h3 className="mb-2 text-sm font-semibold">So läuft der Tag</h3>

      <ol className="space-y-2.5 text-sm">
        <Schritt zeit={RESTAURANT_OEFFNET} text="Restaurant öffnet" />

        {nachDerShow.map((a) => (
          <Schritt
            key={a.uhrzeit}
            zeit=""
            text={
              <>
                <strong>{a.menues} Gäste</strong> kommen aus der {a.uhrzeit}-Show.{" "}
                <span className="text-leise">
                  Sie haben die Show hinter sich, ihr Abend endet hier.
                </span>
              </>
            }
          />
        ))}

        {vorDerShow.map((a) => (
          <Schritt
            key={a.uhrzeit}
            zeit=""
            text={
              <>
                <strong>{a.menues} Gäste</strong> kommen vor der {a.uhrzeit}-Show.{" "}
                <span className="text-leise">Für sie geht der Abend danach erst los.</span>
              </>
            }
          />
        ))}

        <Schritt
          zeit={MENUE_BEGINNT}
          text={
            <>
              Menü für alle: <strong>{gesamtMenues} Gedecke</strong> auf einmal
            </>
          }
          betont
        />

        {spaeteste && (
          <Schritt
            zeit={minutenVorher(spaeteste, 15)}
            text={
              <>
                Die Gäste der {spaeteste}-Show müssen fertig sein und gehen in den Saal
              </>
            }
          />
        )}

        {nachDerShow.length > 0 && vorDerShow.length > 0 && (
          <Schritt
            zeit=""
            text={
              <>
                Danach bleiben nur noch die Gäste aus der{" "}
                {nachDerShow.map((a) => a.uhrzeit).join(" und ")}-Show.{" "}
                <span className="text-leise">In Ruhe abrechnen.</span>
              </>
            }
          />
        )}
      </ol>

      {nachDerShow.length > 0 && vorDerShow.length > 0 && (
        <p
          className="mt-3 border-l-4 pl-3 text-sm"
          style={{ borderColor: "var(--warnung)" }}
        >
          <strong>Fürs Kassieren:</strong> Zuerst die Gäste abrechnen, die noch in die Show
          gehen, sie haben es eilig. Wer die Show schon gesehen hat, wird zum Schluss
          abgerechnet. So hält niemand die Reihe auf.
        </p>
      )}
    </div>
  );
}

function Schritt({
  zeit,
  text,
  betont,
}: {
  zeit: string;
  text: React.ReactNode;
  betont?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="w-14 shrink-0 tabular-nums"
        style={{ color: zeit ? "var(--gold-dunkel)" : "transparent" }}
      >
        {zeit || "·"}
      </span>
      <span className={betont ? "font-medium" : undefined}>{text}</span>
    </li>
  );
}

/** "19:45" aus "20:00" und 15 Minuten. */
function minutenVorher(uhrzeit: string, minuten: number): string {
  const [h, m] = uhrzeit.split(":").map(Number);
  const gesamt = h * 60 + m - minuten;
  const stunde = Math.floor(gesamt / 60);
  return `${String(stunde).padStart(2, "0")}:${String(gesamt % 60).padStart(2, "0")}`;
}

/**
 * Kurzes Schild an einer Gruppe: Show schon gesehen oder noch vor sich.
 * Dient dem Service, nicht der Küche.
 */
export function ShowSchild({
  uhrzeit,
  vorDerShow,
}: {
  uhrzeit: string;
  vorDerShow: boolean;
}) {
  return (
    <span
      className="whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium"
      style={{
        color: vorDerShow ? "var(--info)" : "var(--gut)",
        borderColor: vorDerShow ? "var(--info)" : "var(--gut)",
        background: vorDerShow ? "var(--info-hell)" : "var(--gut-hell)",
      }}
      title={
        vorDerShow
          ? `Geht nach dem Essen in die ${uhrzeit}-Show`
          : `War schon in der ${uhrzeit}-Show`
      }
    >
      {vorDerShow ? `vor der ${uhrzeit}-Show` : `nach der ${uhrzeit}-Show`}
    </span>
  );
}
