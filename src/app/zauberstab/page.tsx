import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { DruckKnopf } from "@/components/DruckKnopf";
import { datumLang, zeitpunkt } from "@/lib/zeit";
import { ABSENDERZEILE, KONTAKTZEILE, UNTERSCHRIFT_ROLLE } from "@/lib/shop/anschreiben";
import {
  ZAUBERSTAB_ABSAETZE,
  ZAUBERSTAB_GRUSS,
  ZAUBERSTAB_UEBERSCHRIFT,
  zauberstabAnrede,
} from "@/lib/shop/zauberstab-brief";
import { brauchtKlaerung, zauberstaebe, type Zauberstab } from "@/lib/shop/zauberstab";
import { abhaken, dochNicht, vonHand } from "./aktionen";

export const metadata = { title: "Zauberstäbe | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Zauberstäbe, die in die Post müssen.
 *
 * Wer beim Eurowings-Gewinnspiel mitmacht, bekommt einen erscheinenden
 * Zauberstab nach Hause geschickt. Die Anschrift kommt aus dem Shop, hier
 * steht sie in einer Liste zum Abarbeiten: Päckchen packen, Schreiben
 * dazulegen, abhaken (Florian, 30.09.2026).
 *
 * Aufgebaut wie der Gutscheinversand, damit niemand zweierlei lernen muss.
 */
export default async function ZauberstabSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeige?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");

  const { zeige, meldung } = await searchParams;
  const alleZeigen = zeige === "alle";
  const liste = await zauberstaebe(alleZeigen);
  const offen = liste.filter((z) => !z.versendetAm);
  const klaerung = offen.filter((z) => brauchtKlaerung(z));
  const zuDrucken = offen.filter((z) => !brauchtKlaerung(z));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Zauberstäbe</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Teilnehmer des Gewinnspiels bekommen einen erscheinenden Zauberstab mit der Post. Hier steht,
            was noch raus muss, samt Begleitschreiben zum Ausdrucken.
          </p>
        </div>
        {zuDrucken.length > 0 && (
          <DruckKnopf
            text={`${zuDrucken.length} ${zuDrucken.length === 1 ? "Schreiben" : "Schreiben"} drucken`}
            hinweis="je eine Seite, mit Anschrift für den Fensterumschlag"
          />
        )}
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      <section className="flex flex-wrap gap-4 print:hidden">
        <Kachel zahl={offen.length} was="offen" hinweis="noch nicht raus" betont={offen.length > 0} />
        <Kachel zahl={zuDrucken.length} was="bereit" hinweis="Anschrift vollständig" />
        <Kachel
          zahl={klaerung.length}
          was="zu klären"
          hinweis="Anschrift unvollständig"
          warnung={klaerung.length > 0}
        />
      </section>

      <nav className="flex flex-wrap gap-1 text-sm print:hidden">
        {[
          ["", `Offen (${offen.length})`],
          ["alle", "Auch verschickte"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={wert ? `/zauberstab?zeige=${wert}` : "/zauberstab"}
            className={`rounded-md px-3 py-1.5 ${
              (zeige ?? "") === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise print:hidden">
          Gerade wartet niemand auf einen Zauberstab.
        </p>
      ) : (
        <ul className="space-y-2 print:hidden">
          {liste.map((z) => (
            <Zeile key={z.id} z={z} />
          ))}
        </ul>
      )}

      {/* Von Hand nachtragen, etwa wenn jemand anruft. */}
      <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm print:hidden">
        <summary className="cursor-pointer font-medium">Anschrift von Hand eintragen</summary>
        <form action={vonHand} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Name</span>
            <input name="name" required className="w-52" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">E-Mail, freiwillig</span>
            <input name="email" type="email" className="w-52" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Straße und Hausnummer</span>
            <input name="strasse" required className="w-60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">PLZ</span>
            <input name="plz" required className="w-24" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Ort</span>
            <input name="ort" required className="w-44" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Warum, nur intern</span>
            <input name="notiz" placeholder="am Telefon zugesagt" className="w-56" />
          </label>
          <Absendeknopf text="Eintragen" laeuftText="..." />
        </form>
      </details>

      {/* Die Schreiben. Am Bildschirm unsichtbar, im Druck je eine Seite. */}
      <div className="hidden print:block">
        {zuDrucken.map((z) => (
          <Begleitschreiben key={z.id} z={z} />
        ))}
      </div>
    </div>
  );
}

function Zeile({ z }: { z: Zauberstab }) {
  const fehlt = brauchtKlaerung(z);
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3"
      style={{
        borderColor: z.versendetAm ? "var(--linie)" : fehlt ? "var(--warnung)" : "var(--gold)",
        background: z.versendetAm ? "var(--flaeche)" : fehlt ? "var(--warnung-hell)" : "var(--gold-hell)",
        opacity: z.versendetAm ? 0.6 : 1,
      }}
    >
      <div className="min-w-56 flex-1">
        <div className="font-semibold">{z.name || z.email || "ohne Namen"}</div>
        <div className="text-sm">
          {z.strasse || <span style={{ color: "var(--warnung)" }}>Straße fehlt</span>}
          {(z.plz || z.ort) && `, ${z.plz} ${z.ort}`}
        </div>
        <div className="text-xs text-leise">
          {z.email}
          {z.quelle && ` · ${z.quelle}`}
          {z.notiz && ` · ${z.notiz}`}
        </div>
        {fehlt && !z.versendetAm && (
          <div className="text-xs" style={{ color: "var(--warnung)" }}>
            {fehlt}
          </div>
        )}
        {z.versendetAm && (
          <div className="text-xs" style={{ color: "var(--gut)" }}>
            verschickt {zeitpunkt(new Date(z.versendetAm))}
            {z.versendetVon ? ` von ${z.versendetVon}` : ""}
          </div>
        )}
      </div>

      {z.versendetAm ? (
        <form action={dochNicht}>
          <input type="hidden" name="id" value={z.id} />
          <button type="submit" className="text-xs text-leise underline">
            doch nicht
          </button>
        </form>
      ) : (
        <form action={abhaken}>
          <input type="hidden" name="id" value={z.id} />
          <Absendeknopf text="Ist raus" laeuftText="..." />
        </form>
      )}
    </li>
  );
}

/**
 * Das Begleitschreiben, eine A4-Seite auf dem Briefbogen.
 *
 * Aufgebaut wie das Schreiben beim Gutscheinversand, mit denselben Maßen:
 * Anschriftenfeld für den Fensterumschlag, Text dazwischen, Unterschrift.
 */
function Begleitschreiben({ z }: { z: Zauberstab }) {
  return (
    <div className="druckblatt relative overflow-hidden" style={{ width: "210mm", height: "296.9mm" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bilder/briefbogen.jpg"
        alt=""
        className="absolute inset-0"
        style={{ width: "210mm", height: "297mm" }}
      />

      <div
        className="absolute text-right text-[9pt] leading-snug text-leise"
        style={{ right: "19mm", top: "41mm" }}
      >
        <div>Neu-Ulm, {datumLang(new Date().toISOString().slice(0, 10))}</div>
      </div>

      <div className="absolute" style={{ left: "19mm", top: "50mm", width: "105mm" }}>
        <div className="text-[8pt] leading-tight text-leise">{ABSENDERZEILE}</div>
        <address className="not-italic text-[12pt] leading-snug" style={{ marginTop: "2.5mm" }}>
          <div>{z.name}</div>
          <div>{z.strasse}</div>
          <div>
            {z.plz} {z.ort}
          </div>
        </address>
      </div>

      <div className="absolute" style={{ left: "19mm", right: "19mm", top: "88mm", bottom: "30mm" }}>
        <h2 className="text-[16pt]">{ZAUBERSTAB_UEBERSCHRIFT}</h2>

        <p className="text-[12pt]" style={{ marginTop: "8.5mm" }}>
          {zauberstabAnrede(z.vorname || z.name)}
        </p>

        <div className="text-[12pt] leading-relaxed">
          {[...ZAUBERSTAB_ABSAETZE, ZAUBERSTAB_GRUSS].map((absatz, i) => (
            <p key={i} style={{ marginTop: "5.6mm" }}>
              {absatz}
            </p>
          ))}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bilder/unterschrift.png"
          alt="Florian Zimmer"
          style={{ height: "16mm", marginTop: "3mm" }}
        />
        <p className="text-[9pt] text-leise">{UNTERSCHRIFT_ROLLE}</p>
      </div>

      <div
        className="absolute text-center text-[8pt] text-leise"
        style={{ left: "19mm", right: "19mm", top: "278.6mm", lineHeight: 1.25 }}
      >
        <div>{ABSENDERZEILE}</div>
        <div>{KONTAKTZEILE}</div>
      </div>
    </div>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
  warnung,
}: {
  zahl: number;
  was: string;
  hinweis: string;
  betont?: boolean;
  warnung?: boolean;
}) {
  const farbe = warnung ? "var(--warnung)" : betont ? "var(--gold)" : "var(--linie)";
  return (
    <div
      className="min-w-44 rounded-lg border px-4 py-3"
      style={{ borderColor: farbe, background: "var(--flaeche)" }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
