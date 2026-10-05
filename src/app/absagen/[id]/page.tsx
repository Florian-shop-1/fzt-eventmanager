import { redirect, notFound } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { absageLesen, gaesteFuerAbsage, type AbsageGast } from "@/lib/absage/db";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { alleSenden, entwurfAktualisieren, mailSenden, rueckrufAbhaken, umbuchungErledigt } from "../aktionen";
import { holeSpielplan } from "@/lib/ditix/spielplan";
import { ditixVerkaufLink } from "@/lib/ditix/link";

export const metadata = { title: "Show-Absage | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Übersicht einer Absage: jeder betroffene Gast mit editierbarem
 * Mailentwurf, wie beim Angebot im Vorgang (Florian, 29.09.2026).
 */
export default async function AbsageDetailSeite({ params }: { params: Promise<{ id: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  if (benutzer.rolle !== "chef" && !darfEinladen(benutzer)) redirect("/");

  const { id } = await params;
  const absage = await absageLesen(id);
  if (!absage) notFound();
  const gaeste = await gaesteFuerAbsage(id);
  const nichtVersendet = gaeste.filter((g) => !g.versendetAm).length;

  /*
    Steht die Show im Shop noch zum Verkauf?

    Die Absage hier nimmt sie dort nicht heraus: Der Eventmanager liest
    Ditix nur. Solange sie im Spielplan steht, kann ein Gast Karten fuer
    einen Abend kaufen, den es nicht gibt (Florian, 05.10.2026).
  */
  const nochImVerkauf = (await holeSpielplan().catch(() => [])).some(
    (v) => v.id === absage.ditixEventId && v.ticketSaleState !== "CLOSED",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Absage: {datumMitWochentag(absage.datum)}, {absage.uhrzeit} Uhr – {absage.show}
        </h1>
        <p className="mt-1 text-sm text-leise">
          Grund: {absage.grund} · abgesagt von {absage.abgesagtVon} am{" "}
          {new Date(absage.abgesagtAm).toLocaleDateString("de-DE")}
        </p>
      </header>

      {nochImVerkauf && (
        <div
          className="rounded-lg border-2 px-4 py-3 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          <strong>Diese Vorstellung steht im Shop noch zum Verkauf.</strong> Der Eventmanager kann sie dort
          nicht herausnehmen, das geht nur in Ditix. Bitte zuerst dort schließen, sonst kauft jemand Karten
          für einen Abend, den es nicht gibt.
          <div className="mt-2">
            <a
              href={ditixVerkaufLink(absage.ditixEventId) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm font-medium"
            >
              In Ditix öffnen und Verkauf schließen
            </a>
          </div>
        </div>
      )}

      {gaeste.length === 0 ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
          Für diese Show gab es keine bezahlten Buchungen im Shop, die wir hier kennen. Manuell in Ditix angelegte
          Buchungen müsst ihr selbst kontaktieren.
        </p>
      ) : (
        <>
          {nichtVersendet > 1 && (
            <form action={alleSenden}>
              <input type="hidden" name="absageId" value={id} />
              <Absendeknopf
                text={`Alle ${nichtVersendet} noch offenen Mails jetzt verschicken`}
                laeuftText="Wird verschickt..."
              />
            </form>
          )}
          <ul className="space-y-4">
            {gaeste.map((g) => (
              <GastKarte key={g.id} gast={g} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function GastKarte({ gast }: { gast: AbsageGast }) {
  return (
    <li className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{gast.name}</span>
          <span className="ml-2 text-sm text-leise">{gast.email}</span>
        </div>
        <span className="text-xs text-leise">
          {gast.plaetze} {gast.plaetze === 1 ? "Platz" : "Plätze"} · bisher {gast.alteKategorie}
        </span>
      </div>

      <p className="mt-1 text-sm">
        Entschädigung:{" "}
        <strong>
          {gast.kompensationArt === "upgrade"
            ? `Upgrade auf ${gast.neueKategorie}`
            : gast.plaetze === 1
              ? "ein Souvenirglas"
              : `${gast.plaetze} Souvenirgläser`}
        </strong>
      </p>

      <details className="mt-3 rounded border border-linie p-3" open={!gast.versendetAm}>
        <summary className="cursor-pointer text-sm font-medium">Mailentwurf</summary>
        <form action={entwurfAktualisieren} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={gast.id} />
          <label className="block text-xs">
            <span className="text-leise">Betreff</span>
            <input
              name="betreff"
              defaultValue={gast.entwurfBetreff}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-leise">Text</span>
            <textarea
              name="text"
              rows={14}
              defaultValue={gast.entwurfText}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 font-sans text-sm"
            />
          </label>
          <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-xs hover:bg-gold-hell">
            Entwurf speichern
          </button>
        </form>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {gast.versendetAm ? (
          <span className="text-xs" style={{ color: "var(--gut)" }}>
            Mail verschickt am {new Date(gast.versendetAm).toLocaleDateString("de-DE")}
          </span>
        ) : (
          <form action={mailSenden}>
            <input type="hidden" name="id" value={gast.id} />
            <Absendeknopf text="Mail jetzt verschicken" laeuftText="..." />
          </form>
        )}

        {gast.gewaehltAm && (
          <span
            className="rounded px-2 py-1 text-xs"
            style={{ background: "var(--gold-hell)", color: "var(--gold-dunkel)" }}
          >
            gewählt: {gast.gewaehlterTerminName}
          </span>
        )}

        {gast.gewaehltAm && !gast.umgebuchtAm && (
          <form action={umbuchungErledigt}>
            <input type="hidden" name="id" value={gast.id} />
            <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-xs hover:bg-gold-hell">
              In Ditix umgebucht, als erledigt markieren
            </button>
          </form>
        )}

        {gast.umgebuchtAm && (
          <span className="text-xs" style={{ color: "var(--gut)" }}>
            umgebucht von {gast.umgebuchtVon} am {new Date(gast.umgebuchtAm).toLocaleDateString("de-DE")}
          </span>
        )}
      </div>

      {/*
        Ein Rückrufwunsch steht hier auffällig, bis jemand zurückgerufen
        hat. Er ist das Dringendste auf der Seite: Da wartet jemand
        (Florian, 01.10.2026).
      */}
      {gast.rueckrufAm && !gast.rueckrufErledigtAm && (
        <div
          className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <span>
            <strong>Bittet um Rückruf:</strong> {gast.rueckrufNummer}
            {gast.rueckrufNotiz ? ` (${gast.rueckrufNotiz})` : ""}
          </span>
          <form action={rueckrufAbhaken}>
            <input type="hidden" name="id" value={gast.id} />
            <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-xs hover:bg-gold-hell">
              zurückgerufen
            </button>
          </form>
        </div>
      )}

      {gast.rueckrufErledigtAm && (
        <p className="mt-2 text-xs text-leise">
          zurückgerufen von {gast.rueckrufErledigtVon} am{" "}
          {new Date(gast.rueckrufErledigtAm).toLocaleDateString("de-DE")}
        </p>
      )}
    </li>
  );
}
