import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { holeLeads, istStoerung, type Lead } from "@/lib/shop/leads";
import { listen, type BrevoListe } from "@/lib/marketing/brevo-kontakte";
import { probelauf, uebertragen } from "./aktionen";

export const metadata = { title: "Anfragen zu Brevo | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Anfragen als Kontakte nach Brevo.
 *
 * Die Anfragen stehen in der Tabelle, der Versand sitzt in Brevo. Solange
 * beides getrennt ist, tippt jemand Adressen ab (Florian, 29.09.2026).
 *
 * Erst ein Probelauf, der nur rechnet, dann das Übertragen. Was in einer
 * Brevo-Liste steht, bekommt dort Mails, sobald jemand eine Kampagne
 * startet; das soll niemand aus Versehen auslösen.
 */
export default async function BrevoSeite({
  searchParams,
}: {
  searchParams: Promise<{ liste?: string; nur?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle)) redirect("/");

  const { liste: gewaehlteListe, nur, meldung } = await searchParams;
  const auswahl = nur === "gewonnen" || nur === "offen" ? nur : "alle";

  let leads: Lead[] = [];
  let leadFehler: string | null = null;
  try {
    leads = (await holeLeads()).filter((l) => !istStoerung(l));
  } catch (e) {
    leadFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  let brevoListen: BrevoListe[] = [];
  let brevoFehler: string | null = null;
  try {
    brevoListen = await listen();
  } catch (e) {
    brevoFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const passend =
    auswahl === "gewonnen"
      ? leads.filter((l) => /gewonnen/i.test(l.status))
      : auswahl === "offen"
        ? leads.filter((l) => /eingegangen|kontakt|erreichbar|angebot/i.test(l.status))
        : leads;

  const mitMail = passend.filter((l) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((l.email ?? "").trim()));
  const eindeutig = new Set(mitMail.map((l) => l.email.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anfragen zu Brevo</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Überträgt die Anfragen als Kontakte in eine Brevo-Liste, mit Anfragetyp, Stand, Herkunft und
            Wunschdatum als Merkmale. Verschickt wird dabei nichts, das entscheidest du in Brevo.
          </p>
        </div>
        <Link href="/leads" className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
          Zu den Anfragen
        </Link>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {leadFehler && (
        <p className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          Die Anfragen sind nicht lesbar: {leadFehler}
        </p>
      )}

      <section className="flex flex-wrap gap-4">
        <Kachel zahl={String(passend.length)} was="Anfragen in der Auswahl" />
        <Kachel zahl={String(eindeutig.size)} was="Kontakte für Brevo" hinweis="ohne Doppelte" betont />
        <Kachel
          zahl={String(passend.length - mitMail.length)}
          was="ohne Mailadresse"
          hinweis="werden ausgelassen"
        />
      </section>

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["alle", "Alle Anfragen"],
          ["offen", "Noch in Bearbeitung"],
          ["gewonnen", "Nur gewonnene"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={`/leads/brevo?nur=${wert}${gewaehlteListe ? `&liste=${gewaehlteListe}` : ""}`}
            className={`rounded-md px-3 py-1.5 ${
              auswahl === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      <section className="space-y-4 rounded-lg border border-linie bg-flaeche px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">In welche Liste?</h2>

        {brevoFehler ? (
          <p className="text-sm" style={{ color: "var(--blocker)" }}>
            Die Listen aus Brevo sind nicht lesbar: {brevoFehler}
          </p>
        ) : brevoListen.length === 0 ? (
          <p className="text-sm text-leise">In Brevo gibt es noch keine Liste. Leg dort eine an.</p>
        ) : (
          <>
            <form action={probelauf} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="nur" value={auswahl} />
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Brevo-Liste</span>
                <select name="liste" defaultValue={gewaehlteListe ?? ""} className="w-72">
                  <option value="">bitte wählen</option>
                  {brevoListen.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.anzahl} Kontakte)
                    </option>
                  ))}
                </select>
              </label>
              <Absendeknopf text="Probelauf" laeuftText="Wird gerechnet..." />
            </form>

            {/*
              Das Übertragen steht getrennt und erst unter dem Probelauf:
              Ein Klick zu viel ist hier besser als einer zu wenig.
            */}
            <form action={uebertragen} className="flex flex-wrap items-end gap-3 border-t border-linie pt-4">
              <input type="hidden" name="nur" value={auswahl} />
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Wirklich übertragen in</span>
                <select name="liste" defaultValue={gewaehlteListe ?? ""} className="w-72">
                  <option value="">bitte wählen</option>
                  {brevoListen.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.anzahl} Kontakte)
                    </option>
                  ))}
                </select>
              </label>
              <Absendeknopf text={`${eindeutig.size} Kontakte übertragen`} laeuftText="Wird übertragen..." />
            </form>
          </>
        )}

        <p className="text-xs text-leise">
          Bestehende Kontakte werden aktualisiert, nicht doppelt angelegt. Übertragen werden Vorname,
          Nachname, Telefon, Anfragetyp, Stand, Eingangsdatum, Wunschdatum, Teilnehmerzahl und Herkunft.
          Störungsmeldungen bleiben außen vor: Wer einen Fehler meldet, hat sich nicht für Werbung gemeldet.
        </p>
      </section>
    </div>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
}: {
  zahl: string;
  was: string;
  hinweis?: string;
  betont?: boolean;
}) {
  return (
    <div
      className="min-w-44 rounded-lg border px-4 py-3"
      style={{
        borderColor: betont ? "var(--gold)" : "var(--linie)",
        background: betont ? "var(--gold-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      {hinweis && <div className="text-xs text-leise">{hinweis}</div>}
    </div>
  );
}
