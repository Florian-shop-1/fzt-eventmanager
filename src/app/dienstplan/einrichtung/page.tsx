import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import {
  ERKLAERUNG,
  POSITIONEN,
  VORSCHLAG_FEST,
  VORSCHLAG_KANN,
  WOCHENTAGE,
  allePersonen,
  einstellungLesen,
  festeTage,
  type FestePosition,
  type Person,
} from "@/lib/dienstplan/plan";
import { einladungAus, einladungErneuern, festeTageSpeichern, positionenSpeichern } from "../aktionen";
import { aktiveEinladung, einladungsLink } from "@/lib/dienstplan/einladung";
import { LinkKopieren } from "@/components/LinkKopieren";

export const metadata = { title: "Dienstplan einrichten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/** Montag zuerst, wie im Kalender. */
const TAGE = [1, 2, 3, 4, 5, 6, 0];

/**
 * Nur Florian: wer welche Position kann und welche Tage fest vergeben sind.
 *
 * Solange noch nichts gespeichert ist, sind die Felder mit dem vorbelegt,
 * was Florian am 18.09.2026 aufgeschrieben hat. Zugeordnet wird über den
 * Vornamen, deshalb erst die Zugänge anlegen, dann hier speichern.
 */
export default async function DienstplanEinrichtung({ searchParams }: { searchParams: Promise<{ meldung?: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || benutzer.rolle !== "chef") redirect("/dienstplan");
  const { meldung } = await searchParams;
  const [personen, fest, einstellung, einladung] = await Promise.all([
    allePersonen(),
    festeTage(),
    einstellungLesen(),
    aktiveEinladung(),
  ]);
  const link = einladung ? einladungsLink(einladung.token) : null;
  const whatsappText = link
    ? `Hallo zusammen! Ab jetzt planen wir das Showteam im Eventmanager. Bitte tragt euch einmal hier ein (dauert eine Minute): ${link}`
    : "";

  const nochNichts = personen.every((p) => p.kann.size === 0);
  const vor = (p: Person) => p.vorname.toLowerCase();
  const kann = (p: Person): Map<FestePosition, boolean> =>
    p.kann.size > 0 || !nochNichts || p.rolle !== "showteam" ? p.kann : new Map(VORSCHLAG_KANN[vor(p)] ?? []);

  const wichtig = personen.filter((p) => p.rolle === "showteam" || kann(p).size > 0);
  const weitere = personen.filter((p) => !wichtig.includes(p));

  const festWert = (pos: FestePosition, tag: number | null): string => {
    if (fest.length > 0) return fest.find((f) => f.position === pos && f.wochentag === tag)?.benutzerId ?? "";
    const v = VORSCHLAG_FEST.find((f) => f.position === pos && f.wochentag === tag);
    return (v && personen.find((p) => p.rolle === "showteam" && vor(p) === v.vorname)?.id) ?? "";
  };
  const fuer = (pos: FestePosition) => personen.filter((p) => kann(p).has(pos));
  const fehlt = ["Leeven", "Sabah", "Levi", "Mario", "Julian", "Noel", "Sarah", "Chris", "Sammy", "Ben"].filter(
    (n) => !personen.some((p) => p.rolle === "showteam" && vor(p) === n.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Link href="/dienstplan" className="text-sm text-leise underline">
          zurück zum Dienstplan
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Positionen und feste Tage</h1>
        <p className="mt-1 text-sm text-leise">Nur für dich sichtbar.</p>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      <section id="einladung" className="scroll-mt-24 space-y-3 rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="text-lg font-semibold">Einladungslink fürs Showteam</h2>
        <p className="text-sm text-leise">
          Schick diesen Link an alle vom Showteam. Jeder trägt sich selbst ein: Name, E-Mail, eigenes
          Passwort und was er macht (FOH, T1, T1 Rookie, T2). Danach ist er angemeldet und sieht den
          Dienstplan. Du bekommst bei jeder Anmeldung eine Mail. Die festen Tage (Levi Fr, Leeven Sa,
          Sabah So, Ben T2) werden beim Eintragen automatisch gesetzt.
        </p>
        {link ? (
          <>
            <LinkKopieren link={link} />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-3 py-1.5 font-medium text-white"
                style={{ background: "#25D366" }}
              >
                Per WhatsApp teilen
              </a>
              <span className="text-leise">
                {einladung!.benutzt === 0
                  ? "Noch niemand hat sich eingetragen."
                  : `${einladung!.benutzt} ${einladung!.benutzt === 1 ? "Person hat" : "Personen haben"} sich eingetragen.`}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <form action={einladungErneuern}>
                <button type="submit" className="text-leise underline">neuen Link erzeugen (alter gilt dann nicht mehr)</button>
              </form>
              <form action={einladungAus}>
                <button type="submit" className="text-leise underline">Link abschalten</button>
              </form>
            </div>
          </>
        ) : (
          <form action={einladungErneuern}>
            <Absendeknopf text="Einladungslink erstellen" laeuftText="..." />
          </form>
        )}
      </section>

      {fehlt.length > 0 && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          Noch nicht eingetragen: {fehlt.join(", ")}. Am einfachsten über den Einladungslink oben.
          Wer eine andere Rolle hat und trotzdem im Showteam arbeitet, steht unten unter „Weitere
          Mitarbeiter“.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Wer macht was?</h2>
        <p className="text-sm text-leise">
          „Rookie“ heißt: macht T1, kann die Show aber noch nicht allein. An seinen Abenden braucht er
          einen Shadow, also jemanden mit T1 ohne Rookie-Haken (Mario, Julian). Sobald er es allein
          kann, den Haken rausnehmen.
          {nochNichts && " Vorausgefüllt nach deiner Liste, bitte prüfen und speichern."}
        </p>
        <form action={positionenSpeichern} className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linie text-left text-xs text-leise">
                <th className="px-4 py-2 font-normal">Name</th>
                {POSITIONEN.map((pos) => (
                  <th key={pos} className="px-3 py-2 font-normal" title={ERKLAERUNG[pos]}>
                    {pos}
                  </th>
                ))}
                <th className="px-3 py-2 font-normal">Rookie</th>
              </tr>
            </thead>
            <tbody>
              {wichtig.map((p) => (
                <PersonZeile key={p.id} p={p} kann={kann(p)} />
              ))}
            </tbody>
          </table>
          {weitere.length > 0 && (
            <details className="border-t border-linie">
              <summary className="cursor-pointer px-4 py-2 text-sm text-leise">
                Weitere Mitarbeiter ({weitere.length})
              </summary>
              <table className="w-full text-sm">
                <tbody>
                  {weitere.map((p) => (
                    <PersonZeile key={p.id} p={p} kann={kann(p)} />
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <div className="border-t border-linie p-4">
            <Absendeknopf text="Positionen speichern" laeuftText="Wird gespeichert..." />
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Feste Tage</h2>
        <p className="text-sm text-leise">
          Wer an einem Wochentag immer arbeitet. Diese Schichten stehen im Plan automatisch fest und
          sind markiert. „Jeden Tag“ gilt, wenn für den Wochentag niemand eingetragen ist.
        </p>
        <form action={festeTageSpeichern} className="space-y-4 rounded-lg border border-linie bg-flaeche p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-leise">
                  <th className="py-2 pr-3 font-normal" />
                  <th className="px-1 py-2 font-normal">Jeden Tag</th>
                  {TAGE.map((t) => (
                    <th key={t} className="px-1 py-2 font-normal">
                      {WOCHENTAGE[t].slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONEN.map((pos) => (
                  <tr key={pos} className="border-t border-linie">
                    <td className="py-2 pr-3 font-semibold">{pos}</td>
                    {[null, ...TAGE].map((tag) => (
                      <td key={String(tag)} className="px-1 py-2">
                        <select
                          name={`fest:${pos}:${tag ?? "alle"}`}
                          defaultValue={festWert(pos, tag)}
                          className="min-w-24 text-xs"
                          aria-label={`${pos} ${tag === null ? "jeden Tag" : WOCHENTAGE[tag]}`}
                        >
                          <option value="">-</option>
                          {fuer(pos).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.vorname}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-leise">
            Zur Auswahl stehen nur Leute, die oben die Position haben. Erst die Positionen speichern.
          </p>
          {!einstellung.erledigt && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="erledigt" />
              Die festen Tage sind vollständig, du musst mich nicht mehr daran erinnern.
            </label>
          )}
          <Absendeknopf text="Feste Tage speichern" laeuftText="Wird gespeichert..." />
        </form>
      </section>
    </div>
  );
}

function PersonZeile({ p, kann }: { p: Person; kann: Map<FestePosition, boolean> }) {
  return (
    <tr className="border-b border-linie last:border-0">
      <td className="px-4 py-2">
        <input type="hidden" name="person" value={p.id} />
        {p.name}
        {p.rolle !== "showteam" && <span className="ml-2 text-xs text-leise">{p.rolle}</span>}
      </td>
      {POSITIONEN.map((pos) => (
        <td key={pos} className="px-3 py-2">
          <input type="checkbox" name={`kann:${p.id}:${pos}`} defaultChecked={kann.has(pos)} aria-label={`${p.name} ${pos}`} />
        </td>
      ))}
      <td className="px-3 py-2">
        <input type="checkbox" name={`lernt:${p.id}`} defaultChecked={kann.get("T1") === true} aria-label={`${p.name} ist Rookie`} />
      </td>
    </tr>
  );
}
