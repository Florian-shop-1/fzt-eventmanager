import { buchungenFuerTag, type ShopBuchung } from "@/lib/db/shop-buchungen";
import { alleWidersprueche } from "@/lib/db/werbewiderspruch";
import { baueVorfreudemail } from "@/lib/mail/vorfreude";
import { zieldatum, VORLAUF_TAGE } from "@/lib/mail/vorfreudelauf";
import { Absendeknopf } from "@/components/Absendeknopf";
import { datumMitWochentag, zeitpunkt } from "@/lib/zeit";
import {
  jetztVerschicken,
  probemailSchicken,
  widerspruchVonHand,
  widerspruchAufheben,
} from "./aktionen";

export const metadata = { title: "Vorfreude-Mail | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Vorfreude-Mail, eine Woche vor der Show.
 *
 * Diese Seite ist die Kontrolle über einen Ablauf, der sonst von selbst läuft:
 * Jeden Morgen um zehn schaut die Uhr bei Vercel nach, welche Shows in einer
 * Woche stattfinden, und schreibt den Gästen, die dafür bezahlt haben.
 *
 * Was hier zu sehen ist:
 *  - wer heute an der Reihe wäre und wer nicht, jeweils mit Grund
 *  - der Text, den ein bestimmter Gast bekommen würde, im Wortlaut
 *  - der Knopf, um einen Tag von Hand nachzuholen
 *  - die Liste derer, die keine Werbung mehr wollen
 *
 * Der Wortlaut ist Absicht und kein Beiwerk. Wer eine Mail an Gäste
 * verantwortet, muss sie lesen können, bevor sie rausgeht, und danach sehen,
 * was tatsächlich rausging.
 */

/** Der Tag, um den es geht: aus der Adresse oder der von heute an in einer Woche. */
function gewaehlterTag(tag: string | undefined): string {
  return tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : zieldatum();
}

function status(b: ShopBuchung, abgemeldet: Set<string>) {
  if (b.mailGesendetAm) {
    return { text: `Verschickt am ${zeitpunkt(b.mailGesendetAm)}`, ton: "fertig" as const };
  }
  if (!b.bestaetigt) return { text: "Nicht bezahlt", ton: "aus" as const };
  if (!b.email || !b.email.includes("@")) return { text: "Keine Adresse", ton: "aus" as const };
  if (abgemeldet.has(b.email.trim().toLowerCase())) {
    return { text: "Abgemeldet", ton: "aus" as const };
  }
  return { text: "Steht an", ton: "offen" as const };
}

export default async function VorfreudeSeite({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; meldung?: string; text?: string }>;
}) {
  const { tag, meldung, text } = await searchParams;
  const datum = gewaehlterTag(tag);

  const buchungen = await buchungenFuerTag(datum);
  const widersprueche = await alleWidersprueche();
  const abgemeldet = new Set(widersprueche.map((w) => w.email));

  const offen = buchungen.filter((b) => status(b, abgemeldet).ton === "offen");
  // Der Wortlaut, den ein bestimmter Gast bekäme. Ohne Auswahl der erste, der
  // ansteht: Man will den Text sehen, ohne erst suchen zu müssen.
  const beispiel = buchungen.find((b) => b.id === text) ?? offen[0] ?? buchungen[0] ?? null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Vorfreude-Mail</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          {VORLAUF_TAGE} Tage vor der Show bekommen Gäste, die bezahlt haben, eine persönliche
          Erinnerung mit dem Angebot, was zum selben Abend noch dazugehören kann. Das läuft jeden
          Morgen von selbst. Hier siehst du, was passiert, und kannst nachhelfen.
        </p>
      </header>

      {meldung && (
        <div className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">{meldung}</div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">
            Showtag {datumMitWochentag(datum)}
            {datum === zieldatum() && (
              <span className="ml-2 text-sm font-normal text-leise">heute an der Reihe</span>
            )}
          </h2>
          <form className="flex items-center gap-2">
            <label htmlFor="tag" className="text-sm text-leise">
              Anderer Tag
            </label>
            <input
              id="tag"
              type="date"
              name="tag"
              defaultValue={datum}
              className="rounded-md border border-linie bg-flaeche px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-md border border-linie px-3 py-1 text-sm">
              Anzeigen
            </button>
          </form>
        </div>

        {buchungen.length === 0 ? (
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-6 text-sm text-leise">
            Für diesen Tag liegen keine Shop-Buchungen vor. Erfasst werden sie erst seit dem
            Umbau im Herbst; für ältere Shows steht hier nichts.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-linie bg-flaeche">
            <table className="w-full text-sm">
              <thead className="border-b border-linie text-left text-leise">
                <tr>
                  <th className="px-4 py-2 font-medium">Gast</th>
                  <th className="px-4 py-2 font-medium">Gebucht</th>
                  <th className="px-4 py-2 font-medium">Mail bietet an</th>
                  <th className="px-4 py-2 font-medium">Stand</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {buchungen.map((b) => {
                  const s = status(b, abgemeldet);
                  const mail = baueVorfreudemail(b);
                  return (
                    <tr key={b.id} className="border-b border-linie last:border-0 align-top">
                      <td className="px-4 py-2">
                        {b.email || <span className="text-leise">ohne Adresse</span>}
                        {b.uhrzeit && <div className="text-leise">{b.uhrzeit} Uhr</div>}
                      </td>
                      <td className="px-4 py-2 text-leise">
                        {b.posten.length === 0
                          ? "keine Posten erfasst"
                          : b.posten.map((p) => `${p.anzahl}× ${p.name}`).join(", ")}
                      </td>
                      <td className="px-4 py-2">
                        {mail.angeboten.length === 0 ? (
                          <span className="text-leise">nur Erinnerung</span>
                        ) : (
                          mail.angeboten.join(", ")
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={s.ton === "aus" ? "text-leise" : undefined}>{s.text}</span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <a
                          href={`/vorfreude?tag=${datum}&text=${b.id}`}
                          className="text-sm underline"
                        >
                          Text ansehen
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {offen.length > 0 && (
          <form action={jetztVerschicken} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="datum" value={datum} />
            <Absendeknopf
              text={`${offen.length} Mail(s) jetzt verschicken`}
              laeuftText="Wird verschickt..."
            />
            <span className="text-sm text-leise">
              Sonst passiert das am {datumMitWochentag(zieldatum())} ohnehin von selbst. Dieser
              Knopf ist zum Nachholen.
            </span>
          </form>
        )}
      </section>

      {beispiel && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            Wortlaut für {beispiel.email || "diesen Gast"}
          </h2>
          <pre className="overflow-x-auto rounded-lg border border-linie bg-flaeche p-4 text-sm whitespace-pre-wrap">
            {`Betreff: ${baueVorfreudemail(beispiel).betreff}`}
            {"\n\n"}
            {baueVorfreudemail(beispiel).text}
          </pre>
          <form action={probemailSchicken}>
            <input type="hidden" name="datum" value={datum} />
            <input type="hidden" name="buchung" value={beispiel.id} />
            <Absendeknopf text="Diese Mail an mich schicken" laeuftText="Wird geschickt..." />
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Keine Werbung mehr</h2>
        <p className="max-w-prose text-sm text-leise">
          Jede Mail enthält einen Abmeldelink. Wer darauf klickt, landet hier und bekommt nie
          wieder eine. Ruft jemand stattdessen an oder antwortet, trag die Adresse selbst ein.
        </p>

        <form action={widerspruchVonHand} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="datum" value={datum} />
          <input
            type="email"
            name="email"
            required
            placeholder="adresse@beispiel.de"
            className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm"
          />
          <Absendeknopf text="Eintragen" laeuftText="Wird eingetragen..." />
        </form>

        {widersprueche.length === 0 ? (
          <p className="text-sm text-leise">Bisher hat niemand widersprochen.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-linie bg-flaeche">
            <table className="w-full text-sm">
              <tbody>
                {widersprueche.map((w) => (
                  <tr key={w.email} className="border-b border-linie last:border-0">
                    <td className="px-4 py-2">{w.email}</td>
                    <td className="px-4 py-2 text-leise">
                      {w.quelle === "link" ? "selbst abgemeldet" : "von Hand eingetragen"},{" "}
                      {zeitpunkt(w.eingetragenAm)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={widerspruchAufheben}>
                        <input type="hidden" name="datum" value={datum} />
                        <input type="hidden" name="email" value={w.email} />
                        <button type="submit" className="text-sm text-leise underline">
                          aufheben
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
