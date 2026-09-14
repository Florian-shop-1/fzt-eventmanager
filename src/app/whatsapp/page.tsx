import Link from "next/link";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  alsGelesenMarkieren,
  holeUnterhaltungen,
  holeVerlauf,
  type Nachricht,
  type Unterhaltung,
} from "@/lib/db/whatsapp";
import { anderweitigErledigt, antworten } from "@/lib/whatsapp/aktionen";
import { istEingerichtet } from "@/lib/whatsapp/senden";
import { Absendeknopf } from "@/components/Absendeknopf";
import { BenachrichtigungErlauben } from "@/components/BenachrichtigungErlauben";
import { vorZeit } from "@/components/Status";
import { uhrzeit, datumMitWochentag, isoDatum } from "@/lib/zeit";
import { istKennung, istNummer, kennungLesbar } from "@/lib/whatsapp/kennung";

export const metadata = { title: "WhatsApp | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der gemeinsame WhatsApp-Posteingang.
 *
 * Links die Unterhaltungen, rechts der Verlauf mit Antwortfeld. Auf dem
 * Handy nacheinander: erst die Liste, nach dem Antippen der Verlauf.
 *
 * Wer eine Unterhaltung öffnet, markiert sie für alle als gelesen. Das ist
 * Absicht, siehe migrations/030_whatsapp.sql.
 */
export default async function WhatsAppSeite({
  searchParams,
}: {
  searchParams: Promise<{ mit?: string; fehler?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return null;

  if (!benutzer.whatsapp) {
    return (
      <div className="mx-auto max-w-prose rounded-lg border border-linie bg-flaeche p-6 text-sm">
        <h1 className="text-lg font-semibold">WhatsApp</h1>
        <p className="mt-2 text-leise">
          Für den WhatsApp-Posteingang fehlt dir die Freigabe. Florian vergibt sie unter Zugänge.
        </p>
      </div>
    );
  }

  const { mit, fehler } = await searchParams;
  const gewaehlt = istKennung(mit) ? mit : null;

  if (gewaehlt) await alsGelesenMarkieren(gewaehlt, benutzer.name);

  const unterhaltungen = await holeUnterhaltungen();
  const aktuell = unterhaltungen.find((u) => u.waId === gewaehlt) ?? null;
  const verlauf = aktuell ? await holeVerlauf(aktuell.waId) : [];
  const eingerichtet = istEingerichtet();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Alles, was an 0731 7906110 geschrieben wird. Wer eine Unterhaltung öffnet, nimmt sie
            für alle aus „neu“. Bei jeder neuen Unterhaltung bekommt ihr zusätzlich eine Mail.
          </p>
        </div>
        <BenachrichtigungErlauben />
      </header>

      {!(eingerichtet.telefonId && eingerichtet.zugangstoken) && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>Noch nicht verbunden.</strong> Sobald die Nummer bei Meta angemeldet ist und die
          Schlüssel bei Vercel stehen, laufen die Nachrichten hier ein.
        </div>
      )}

      <Warnung unterhaltungen={unterhaltungen} />

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <Liste unterhaltungen={unterhaltungen} gewaehlt={gewaehlt} versteckt={Boolean(aktuell)} />

        {aktuell ? (
          <Verlauf unterhaltung={aktuell} verlauf={verlauf} fehler={fehler ?? null} />
        ) : (
          <div className="hidden rounded-lg border border-dashed border-linie p-10 text-center text-sm text-leise md:block">
            {unterhaltungen.length === 0
              ? "Noch keine Nachrichten."
              : "Links eine Unterhaltung auswählen."}
          </div>
        )}
      </div>
    </div>
  );
}

function name(u: Pick<Unterhaltung, "profilname" | "waId">): string {
  return u.profilname ?? kennungLesbar(u.waId);
}

/** "noch 3 Std." oder "seit 2 Std. vorbei". */
function restzeit(minuten: number): string {
  const betrag = Math.abs(minuten);
  const menge = betrag >= 90 ? `${Math.round(betrag / 60)} Std.` : `${Math.max(1, betrag)} Min.`;
  return minuten > 0 ? `noch ${menge}` : `seit ${menge} vorbei`;
}

/**
 * Das Kennzeichen für die Eile, in Liste und Kopf des Verlaufs.
 * Wartend nur als leiser Text, knapp gelb, abgelaufen rot.
 */
function Eile({ u }: { u: Unterhaltung }) {
  if (u.dringlichkeit === "keine" || u.restMinuten === null) return null;
  if (u.dringlichkeit === "wartet") {
    return <span className="shrink-0 text-xs text-leise">{restzeit(u.restMinuten)}</span>;
  }
  const knapp = u.dringlichkeit === "knapp";
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: knapp ? "var(--warnung-hell)" : "var(--blocker-hell)",
        color: knapp ? "var(--warnung)" : "var(--blocker)",
      }}
      title={knapp ? "Unbeantwortet, das 24-Stunden-Fenster schliesst bald" : "Unbeantwortet, die 24 Stunden sind vorbei"}
    >
      {knapp ? restzeit(u.restMinuten) : "unbeantwortet"}
    </span>
  );
}

/**
 * Oben auf der Seite, sobald eine Nachricht knapp wird oder schon drüber ist.
 *
 * Kosten entstehen durch Nichtantworten keine. Die Warnung ist für den Kunden
 * da: Nach 24 Stunden geht per WhatsApp nur noch eine bezahlte Vorlage, ein
 * Anruf dagegen immer.
 */
function Warnung({ unterhaltungen }: { unterhaltungen: Unterhaltung[] }) {
  const knapp = unterhaltungen.filter((u) => u.dringlichkeit === "knapp");
  const abgelaufen = unterhaltungen.filter((u) => u.dringlichkeit === "abgelaufen");
  if (knapp.length === 0 && abgelaufen.length === 0) return null;

  const liste = (us: Unterhaltung[]) =>
    us.map((u, i) => (
      <span key={u.waId}>
        {i > 0 && ", "}
        <Link href={`/whatsapp?mit=${u.waId}`} className="underline">
          {name(u)}
        </Link>
      </span>
    ));

  return (
    <div
      className="space-y-1 rounded-lg border px-4 py-3 text-sm"
      style={
        abgelaufen.length > 0
          ? { borderColor: "var(--blocker)", background: "var(--blocker-hell)" }
          : { borderColor: "var(--warnung)", background: "var(--warnung-hell)" }
      }
    >
      {knapp.length > 0 && (
        <p>
          <strong>Bald keine freie Antwort mehr möglich:</strong> {liste(knapp)}. In wenigen
          Stunden sind die 24 Stunden seit der letzten Nachricht vorbei.
        </p>
      )}
      {abgelaufen.length > 0 && (
        <p>
          <strong>Unbeantwortet, 24 Stunden vorbei:</strong> {liste(abgelaufen)}. Per WhatsApp geht
          jetzt nur noch eine bezahlte Vorlage. Am besten anrufen und danach als erledigt
          markieren.
        </p>
      )}
    </div>
  );
}

function Liste({
  unterhaltungen,
  gewaehlt,
  versteckt,
}: {
  unterhaltungen: Unterhaltung[];
  gewaehlt: string | null;
  /** Auf dem Handy weicht die Liste dem Verlauf. */
  versteckt: boolean;
}) {
  return (
    <nav
      className={`${versteckt ? "hidden md:block" : ""} max-h-[70vh] overflow-y-auto rounded-lg border border-linie bg-flaeche`}
      aria-label="Unterhaltungen"
    >
      {unterhaltungen.length === 0 && (
        <p className="p-4 text-sm text-leise">Noch keine Nachrichten.</p>
      )}
      {unterhaltungen.map((u) => (
        <Link
          key={u.waId}
          href={`/whatsapp?mit=${u.waId}`}
          className="block border-b border-linie px-4 py-3 last:border-0 hover:bg-gold-hell/40"
          style={u.waId === gewaehlt ? { background: "var(--gold-hell)" } : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate ${u.ungelesen ? "font-semibold" : ""}`}>{name(u)}</span>
            <span className="shrink-0 text-xs text-leise">
              {u.letzteNachrichtAm ? vorZeit(u.letzteNachrichtAm) : ""}
            </span>
          </div>
          {u.dringlichkeit !== "keine" && (
            <div className="mt-1">
              <Eile u={u} />
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {u.ungelesen && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--gut)" }}
                aria-label="neu"
              />
            )}
            <span className="truncate text-sm text-leise">
              {u.letzteRichtung === "aus" ? "Wir: " : ""}
              {u.letzterText ?? ""}
            </span>
          </div>
        </Link>
      ))}
    </nav>
  );
}

function Verlauf({
  unterhaltung,
  verlauf,
  fehler,
}: {
  unterhaltung: Unterhaltung;
  verlauf: Nachricht[];
  fehler: string | null;
}) {
  // Neueste unten. Umgekehrt in einen umgekehrten Stapel gelegt, damit der
  // Verlauf ohne Skript am unteren Ende beginnt.
  const umgekehrt = [...verlauf].reverse();

  return (
    <section className="flex flex-col rounded-lg border border-linie bg-flaeche">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linie px-4 py-3">
        <div>
          <Link href="/whatsapp" className="mr-3 text-sm text-leise underline md:hidden">
            Alle
          </Link>
          <span className="font-semibold">{name(unterhaltung)}</span>
          {istNummer(unterhaltung.waId) ? (
            <a
              href={`https://wa.me/${unterhaltung.waId}`}
              className="ml-2 text-sm text-leise hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {kennungLesbar(unterhaltung.waId)}
            </a>
          ) : (
            <span
              className="ml-2 text-sm text-leise"
              title="Der Kunde zeigt in WhatsApp einen Benutzernamen statt seiner Nummer. Antworten geht trotzdem."
            >
              Nummer verborgen
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Eile u={unterhaltung} />
          {unterhaltung.dringlichkeit !== "keine" && (
            <form action={anderweitigErledigt.bind(null, unterhaltung.waId)}>
              <button
                type="submit"
                className="rounded-md border border-linie px-3 py-1 text-xs hover:bg-gold-hell"
                title="Zum Beispiel angerufen oder per Mail geklärt. Nimmt die Warnung bis zur nächsten Nachricht weg."
              >
                Erledigt, anderweitig geklärt
              </button>
            </form>
          )}
          {unterhaltung.erledigtVon && (
            <span className="text-xs text-leise">anderweitig erledigt von {unterhaltung.erledigtVon}</span>
          )}
        </div>
      </header>

      <div className="flex max-h-[60vh] min-h-64 flex-col-reverse gap-2 overflow-y-auto px-4 py-4">
        {umgekehrt.map((n, i) => {
          const naechsterAelter = umgekehrt[i + 1];
          const neuerTag =
            !naechsterAelter ||
            isoDatum(new Date(naechsterAelter.zeitpunkt)) !== isoDatum(new Date(n.zeitpunkt));
          return (
            <div key={n.id} className="flex flex-col gap-2">
              {neuerTag && (
                <div className="my-1 text-center text-xs text-leise">
                  {datumMitWochentag(isoDatum(new Date(n.zeitpunkt)))}
                </div>
              )}
              <Blase nachricht={n} />
            </div>
          );
        })}
      </div>

      <Antwortfeld unterhaltung={unterhaltung} fehler={fehler} />
    </section>
  );
}

function Blase({ nachricht: n }: { nachricht: Nachricht }) {
  const ein = n.richtung === "ein";
  const wer =
    n.herkunft === "kunde"
      ? null
      : n.herkunft === "app"
        ? "aus der App"
        : n.herkunft === "automatik"
          ? "automatisch"
          : (n.gesendetVon ?? "Eventmanager");

  return (
    <div className={`flex ${ein ? "justify-start" : "justify-end"}`}>
      <div
        className="max-w-[80%] rounded-lg px-3 py-2 text-sm"
        style={
          ein
            ? { background: "var(--hintergrund)" }
            : { background: "var(--gut-hell)", border: "1px solid var(--gut)" }
        }
      >
        <p className="whitespace-pre-wrap break-words">{n.text || `[${n.typ}]`}</p>
        <div className="mt-1 flex justify-end gap-2 text-[11px] text-leise">
          {wer && <span>{wer}</span>}
          <span className="tabular-nums">{uhrzeit(new Date(n.zeitpunkt))}</span>
          {!ein && <Haken status={n.status} />}
        </div>
        {n.status === "failed" && (
          <p className="mt-1 text-xs" style={{ color: "var(--blocker)" }}>
            Nicht zugestellt{n.fehler ? `: ${n.fehler}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/** Wie in WhatsApp: ein Haken gesendet, zwei zugestellt, zwei farbige gelesen. */
function Haken({ status }: { status: string | null }) {
  if (status === "read") return <span style={{ color: "var(--gut)" }} title="gelesen">✓✓</span>;
  if (status === "delivered") return <span title="zugestellt">✓✓</span>;
  if (status === "sent") return <span title="gesendet">✓</span>;
  return null;
}

function Antwortfeld({ unterhaltung, fehler }: { unterhaltung: Unterhaltung; fehler: string | null }) {
  return (
    <div className="border-t border-linie p-4">
      {fehler && (
        <p
          className="mb-3 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          {fehler}
        </p>
      )}

      {unterhaltung.fensterOffen ? (
        <form action={antworten.bind(null, unterhaltung.waId)} className="space-y-2">
          <textarea
            name="text"
            rows={3}
            required
            placeholder={`Antwort an ${name(unterhaltung)}`}
            className="w-full rounded-md border border-linie px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-leise">Geht von 0731 7906110 hinaus.</span>
            <Absendeknopf text="Senden" laeuftText="Wird gesendet..." />
          </div>
        </form>
      ) : (
        <p className="text-sm text-leise">
          Die letzte Nachricht von {name(unterhaltung)} ist älter als 24 Stunden. WhatsApp erlaubt
          dann nur noch genehmigte Vorlagen. Ruf an, schreib eine Mail, oder antworte hier, sobald
          er sich wieder meldet.
        </p>
      )}
    </div>
  );
}
