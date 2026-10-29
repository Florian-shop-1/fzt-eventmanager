import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  FAHRT_MINUTEN,
  VORLAUF_MINUTEN,
  freieTage,
  fremdtermine,
  kollisionen,
} from "@/lib/personal/fremdtermin";
import { kalenderSchluessel } from "@/lib/personal/kalenderfeed";

export const metadata = { title: "Auswärts | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/** Nur Florian und Kevin. */
const WER = ["info@florianzimmer.com", "kevin.steele@florianzimmer.com"];

const datumDe = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const tage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${tage[d.getUTCDay()]}, ${iso.split("-").reverse().join(".")}`;
};

const monatName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

/**
 * Was auswärts ansteht, und wo es sich mit dem eigenen Spielplan beißt.
 *
 * "ich möchte, dass diese Termine im Eventmanager sichtbar sind, dass
 * ich da im Theater Ulm bin. Es soll nur für Kevin und mich sichtbar
 * sein" (Florian, 16.10.2026).
 */
export default async function AuswaertsSeite() {
  const b = await angemeldeterBenutzer();
  if (!b || !WER.includes(b.email.toLowerCase())) redirect("/");

  const [termine, konflikte, donnerstage] = await Promise.all([
    fremdtermine(),
    kollisionen(),
    freieTage({ wochentag: 4, showzeit: "20:00" }),
  ]);

  const monate = [...new Set(termine.map((t) => t.datum.slice(0, 7)))];
  const schluessel = kalenderSchluessel();
  const kalenderLink = schluessel ? `https://eventmanager.florianzimmertheater.de/api/kalender/${schluessel}.ics` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Auswärts</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Florians Termine im Theater Ulm. Sichtbar nur für Florian und Kevin. Gerechnet wird mit
          {" "}{VORLAUF_MINUTEN} Minuten Vorlauf im eigenen Haus und {FAHRT_MINUTEN} Minuten Fahrt,
          ein Termin dort muss also 45 Minuten vor der eigenen Vorstellung enden.
        </p>
      </header>

      {/* ---------------------------------------------------------------
          Zuerst, was weh tut.
          --------------------------------------------------------------- */}
      <section
        className="rounded-lg border px-5 py-4"
        style={
          konflikte.length > 0
            ? { borderColor: "var(--blocker)", background: "var(--blocker-hell)" }
            : { borderColor: "var(--gut)", background: "var(--gut-hell)" }
        }
      >
        <h2 className="font-semibold">
          {konflikte.length === 0
            ? "Keine Kollision mit dem eigenen Spielplan"
            : `${konflikte.length} Kollisionen mit dem eigenen Spielplan`}
        </h2>
        {konflikte.length > 0 && (
          <ul className="mt-2 space-y-2 text-sm">
            {konflikte.map((k, i) => (
              <li key={i}>
                <strong>{datumDe(k.datum)}</strong>: eigene Show {k.showzeit} Uhr „{k.showname}",
                in Ulm {k.termin.von} bis {k.termin.bis} ({k.termin.art}
                {k.termin.raum ? `, ${k.termin.raum}` : ""}).
                <span className="block text-leise">
                  Spätester Aufbruch in Ulm wäre {k.aufbruch} Uhr.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Der Kalender zum Abonnieren: Neue und abgesagte Vorstellungen laufen von allein hinein. */}
      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold">Kalender in Outlook abonnieren</h2>
        {kalenderLink ? (
          <>
            <p className="mt-1 text-sm text-leise">
              Alle Vorstellungen und alle Termine im Theater Ulm, Kollisionen mit „⚠ KOLLISION“. Outlook holt sich die Adresse
              regelmäßig neu: Neue Shows kommen von allein hinein, abgesagte verschwinden. Outlook im Web: Kalender hinzufügen,
              Aus dem Internet abonnieren. Die Adresse ist geheim, bitte nicht weitergeben.
            </p>
            <input readOnly value={kalenderLink} className="mt-3 w-full rounded border border-linie bg-transparent px-3 py-2 text-xs" />
          </>
        ) : (
          <p className="mt-1 text-sm text-leise">Dafür fehlt auf dem Server CRON_SECRET.</p>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Donnerstage: dort sollen zusätzliche Vorstellungen hin.
          --------------------------------------------------------------- */}
      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold">Donnerstage für zusätzliche Vorstellungen</h2>
        <p className="mt-1 text-sm text-leise">
          Geprüft für eine Show um 20 Uhr im eigenen Haus.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {donnerstage.map((t) => (
            <li key={t.datum} className="flex flex-wrap items-baseline gap-2">
              <span style={{ color: t.frei ? "var(--gut)" : "var(--blocker)" }}>
                {t.frei ? "geht" : "geht nicht"}
              </span>
              <strong>{datumDe(t.datum)}</strong>
              <span className="text-leise">{t.was}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------
          Die Liste selbst, nach Monaten.
          --------------------------------------------------------------- */}
      {monate.map((monat) => (
        <section key={monat} className="rounded-lg border border-linie bg-flaeche p-5">
          <h2 className="mb-2 font-semibold">{monatName(`${monat}-01`)}</h2>
          <ul className="space-y-1 text-sm">
            {termine
              .filter((t) => t.datum.startsWith(monat))
              .map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="min-w-32">{datumDe(t.datum)}</span>
                  <span className="tabular-nums">
                    {t.von} bis {t.bis}
                  </span>
                  <span className="text-leise">
                    {t.art}
                    {t.raum ? ` · ${t.raum}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {termine.length === 0 && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Es sind keine Auswärtstermine hinterlegt.
        </p>
      )}
    </div>
  );
}
