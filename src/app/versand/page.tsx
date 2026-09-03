import Link from "next/link";
import {
  brauchtKlaerung,
  gehtInDiePost,
  holeSendungen,
  postempfaenger,
  type Sendung,
} from "@/lib/shop/versand";
import {
  gutscheincodeSetzen,
  versandAbhaken,
  versandStaende,
  widmungSpeichern,
  type VersandStand,
} from "@/lib/db/buero";
import { DruckKnopf } from "@/components/DruckKnopf";
import { SofortDrucken } from "@/components/SofortDrucken";
import { datumLang } from "@/lib/zeit";
import { eur } from "@/lib/domain/pricing";
import {
  ABSENDERZEILE,
  ANSCHREIBEN_ABSAETZE,
  ANSCHREIBEN_UEBERSCHRIFT,
  GRUSSFORMEL,
  KONTAKTZEILE,
  UNTERSCHRIFT_ROLLE,
  anrede,
  einloesesatz,
} from "@/lib/shop/anschreiben";

export const metadata = { title: "Versand | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Gutscheinversand, wie Kevin ihn täglich abarbeitet.
 *
 * Drei Dinge nimmt die Seite ihm ab. Sie zeigt, was heute rausgeht, statt
 * ihn eine Tabelle durchsuchen zu lassen. Sie druckt Adressaufkleber und
 * Begleitschreiben mit der Widmung, die bisher von Hand geschrieben oder
 * einzeln zusammenkopiert wurden. Und sie merkt sich, was schon weg ist.
 *
 * Der Stand steht in unserer Datenbank, nicht in der Google-Tabelle: Dort
 * hat das Programm keinen Schreibzugriff, und die Tabelle soll die Quelle
 * bleiben.
 */
export default async function VersandSeite({
  searchParams,
}: {
  searchParams: Promise<{
    zeige?: string;
    nur?: string;
    drucken?: string;
    sofort?: string;
  }>;
}) {
  const { zeige, nur, drucken, sofort } = await searchParams;
  const alleZeigen = zeige === "alle";

  /*
    Anschreiben und Gutschein werden getrennt gedruckt, nicht zusammen.

    Der Grund liegt im Papier: Das Anschreiben kommt auf weißes Papier und
    passt mit der Anschrift ins Fenster des Umschlags, der Gutschein auf
    das goldschimmernde. Steckte beides in einem Auftrag, müsste bei jedem
    Umschlag die Kassette gewechselt werden. So wechselt man einmal.
  */
  const druckeGutschein = drucken === "gutschein";
  const druckeAnschreiben = drucken !== "gutschein";

  // Aus einer einzelnen Sendung heraus soll das Druckfenster von selbst
  // aufgehen. Die Reiter oben tun das nicht: Dort wird erst gewählt.
  const sofortDrucken = sofort === "1";

  let sendungen: Sendung[] = [];
  let fehler: string | null = null;
  try {
    sendungen = await holeSendungen();
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const staende = await versandStaende();
  const istErledigt = (s: Sendung) =>
    Boolean(staende.get(s.bestellnummer)?.erledigtAm) || /versendet/i.test(s.status);

  const offen = sendungen.filter((s) => !istErledigt(s));

  // Eine einzelne Sendung: Das ist der Weg nach dem Eintragen des Codes.
  // Gedruckt wird dann genau dieser Umschlag, nicht der ganze Stapel.
  const einzeln = nur ? sendungen.filter((s) => s.bestellnummer === nur) : null;

  const sichtbar = einzeln ?? (alleZeigen ? sendungen : offen);
  const zuDrucken = (einzeln ?? offen).filter(gehtInDiePost);
  const klaerung = offen.filter((s) => brauchtKlaerung(s));
  // Ohne Gutscheincode kann kein Gutschein gedruckt werden. Ditix gibt ihn
  // nicht über die Schnittstelle heraus, er muss von Hand herüber.
  const ohneCode = zuDrucken.filter((s) => !staende.get(s.bestellnummer)?.gutscheincode);

  return (
    <div className="space-y-6">
      {sofortDrucken && <SofortDrucken />}

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Versand</h1>
          <p className="mt-1 text-sm text-leise">
            Gutscheine, die in die Post müssen. Anschreiben und Gutschein zum Drucken.
          </p>
        </div>
        {zuDrucken.length > 0 && (
          <Druckwahl
            anzahl={zuDrucken.length}
            mitGutschein={zuDrucken.filter((s) => staende.get(s.bestellnummer)?.gutscheincode).length}
            nur={nur}
            drucken={drucken}
          />
        )}
      </header>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm print:hidden">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      <section className={`flex flex-wrap gap-4 print:hidden ${einzeln ? "hidden" : ""}`}>
        <Kachel zahl={offen.length} was="offen" hinweis="noch nicht raus" betont />
        <Kachel zahl={zuDrucken.length} was="in die Post" hinweis="Umschlag oder Box" />
        <Kachel
          zahl={ohneCode.length}
          was="ohne Code"
          hinweis="Code aus Ditix fehlt noch"
          warnung={ohneCode.length > 0}
        />
        <Kachel
          zahl={klaerung.length}
          was="zu klären"
          hinweis="fehlende Angaben"
          warnung={klaerung.length > 0}
        />
      </section>

      {einzeln && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm print:hidden">
          <span>
            Nur diese eine Sendung.{" "}
            {sofortDrucken
              ? "Das Druckfenster geht gleich von selbst auf."
              : "Oben wählst du, was gedruckt wird."}
          </span>
          <Link href="/versand" className="underline">
            Zurück zur Liste
          </Link>
        </div>
      )}

      <nav className={`flex gap-2 text-sm print:hidden ${einzeln ? "hidden" : ""}`}>
        <Link
          href="/versand"
          className={`rounded-md border px-3 py-1.5 ${!alleZeigen ? "border-gold bg-gold-hell" : "border-linie"}`}
        >
          Nur offene
        </Link>
        <Link
          href="/versand?zeige=alle"
          className={`rounded-md border px-3 py-1.5 ${alleZeigen ? "border-gold bg-gold-hell" : "border-linie"}`}
        >
          Alle ({sendungen.length})
        </Link>
      </nav>

      {sichtbar.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm print:hidden">
          <div className="font-medium">
            {alleZeigen ? "Keine Sendungen in der Liste" : "Nichts offen"}
          </div>
          <p className="mt-1 text-leise">
            {alleZeigen
              ? "Sobald ein Gutschein bestellt wird, erscheint er hier."
              : "Alle Gutscheine sind raus. Gut gemacht."}
          </p>
        </div>
      ) : (
        <div className="space-y-3 print:hidden">
          {sichtbar.map((s) => (
            <Karte
              key={s.bestellnummer}
              sendung={s}
              stand={staende.get(s.bestellnummer)}
              erledigt={istErledigt(s)}
            />
          ))}
        </div>
      )}

      {/*
        Der Druckbereich. Was hier steht, hängt davon ab, welches Papier
        gerade in der Kassette liegt.
      */}
      <div className="briefseiten hidden print:block">
        {zuDrucken.map((s) => (
          <div key={s.bestellnummer}>
            {druckeAnschreiben && <Begleitschreiben sendung={s} />}
            {druckeGutschein && <Gutschein sendung={s} stand={staende.get(s.bestellnummer)} />}
          </div>
        ))}
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
  return (
    <div
      className="rounded-lg border px-5 py-4"
      style={{
        borderColor: warnung ? "var(--warnung)" : betont ? "var(--gold)" : "var(--linie)",
        background: warnung ? "var(--warnung-hell)" : betont ? "var(--gold-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-4xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm font-medium">{was}</div>
      <div className="mt-0.5 text-xs text-leise">{hinweis}</div>
    </div>
  );
}

/** Eine Sendung mit allem, was zum Packen gebraucht wird. */
function Karte({
  sendung,
  stand,
  erledigt,
}: {
  sendung: Sendung;
  stand: VersandStand | undefined;
  erledigt: boolean;
}) {
  const problem = brauchtKlaerung(sendung);
  const post = gehtInDiePost(sendung);

  return (
    <article
      className={`rounded-lg border bg-flaeche p-5 ${erledigt ? "opacity-60" : ""}`}
      style={{ borderColor: problem && !erledigt ? "var(--warnung)" : "var(--linie)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{postempfaenger(sendung)}</h2>
            {!post && (
              <span className="rounded-full border border-linie px-2 py-px text-xs text-leise">
                Selbstausdruck, kein Versand
              </span>
            )}
            {erledigt && (
              <span className="text-xs" style={{ color: "var(--gut)" }}>
                erledigt
                {stand?.erledigtVon && ` von ${stand.erledigtVon}`}
              </span>
            )}
          </div>

          {post && (
            <address className="mt-1 not-italic text-sm text-leise">
              {sendung.strasse}
              {sendung.strasse && <br />}
              {sendung.plz} {sendung.ort}
            </address>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-leise">
            {sendung.zustellart && <span>{sendung.zustellart}</span>}
            {sendung.motiv && <span>Motiv {sendung.motiv}</span>}
            {sendung.versandAn && <span>{sendung.versandAn}</span>}
            <span>bestellt von {sendung.kundenname}</span>
          </div>

          <Grusswortfeld sendung={sendung} stand={stand} />

          {problem && !erledigt && (
            <p className="mt-3 text-sm" style={{ color: "var(--warnung)" }}>
              <strong>Zu klären:</strong> {problem}
            </p>
          )}

          {stand?.notiz && <p className="mt-2 text-xs text-leise">Notiz: {stand.notiz}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <form action={versandAbhaken.bind(null, sendung.bestellnummer, erledigt)}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: erledigt ? "var(--linie)" : "var(--gold)",
                background: erledigt ? "transparent" : "var(--gold-hell)",
                color: erledigt ? "var(--text-leise)" : "var(--gold-dunkel)",
              }}
            >
              {erledigt ? "doch nicht raus" : "als verschickt abhaken"}
            </button>
          </form>
        </div>
      </div>

      {post && <Codeschritte sendung={sendung} code={stand?.gutscheincode ?? null} />}
    </article>
  );
}

/**
 * Der Gutscheincode, Schritt für Schritt.
 *
 * Ditix gibt den Code nicht über die Schnittstelle heraus. Jemand muss ihn
 * aus dem Backend holen. Das lässt sich nicht wegprogrammieren, aber der
 * Weg lässt sich kurz halten: ein Klick öffnet die Bestellung, ein Feld
 * nimmt den Code auf, danach steht er auf dem Ausdruck.
 *
 * Deshalb hier ausdrücklich als nummerierter Ablauf und nicht als Feld
 * unter vielen: Wer die Seite zum ersten Mal sieht, soll ohne Erklärung
 * wissen, was zu tun ist.
 */
function Codeschritte({ sendung, code }: { sendung: Sendung; code: string | null }) {
  if (code) {
    return (
      <div
        className="mt-4 rounded border p-3"
        style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span style={{ color: "var(--gut)" }}>Gutscheincode liegt vor:</span>
          <strong className="font-mono text-base tracking-wider">{code}</strong>
          <details className="ml-auto">
            <summary className="cursor-pointer text-xs text-leise">ändern</summary>
            <form
              action={gutscheincodeSetzen.bind(null, sendung.bestellnummer)}
              className="mt-2 flex gap-2"
            >
              <input type="text" name="code" defaultValue={code} className="font-mono" />
              <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-xs">
                Sichern
              </button>
            </form>
          </details>
        </div>

        {/*
          Der nächste Schritt, ausdrücklich benannt. Ohne ihn steht man
          nach dem Eintragen des Codes vor einer Karte, die zwar grün ist,
          aber nicht sagt, wie es weitergeht.
        */}
        <ol className="mt-3 space-y-2 border-t pt-3 text-sm" style={{ borderColor: "var(--gut)" }}>
          <li className="flex flex-wrap items-center gap-3">
            <Schrittzahl n={4} gut />
            <Link
              href={`/versand?nur=${sendung.bestellnummer}&drucken=anschreiben&sofort=1`}
              className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 font-medium text-gold-dunkel hover:bg-gold hover:text-white"
            >
              Anschreiben drucken
            </Link>
            <span className="text-leise">auf weißes Papier</span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Schrittzahl n={5} gut />
            <Link
              href={`/versand?nur=${sendung.bestellnummer}&drucken=gutschein&sofort=1`}
              className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 font-medium text-gold-dunkel hover:bg-gold hover:text-white"
            >
              Gutschein drucken
            </Link>
            <span className="text-leise">auf das goldschimmernde Papier</span>
          </li>
          <li className="flex items-center gap-3">
            <Schrittzahl n={6} gut />
            <span>
              Beides in den Fensterumschlag, das Anschreiben mit der Anschrift nach vorn. Danach
              oben rechts <strong>als verschickt abhaken</strong>.
            </span>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded border p-3"
      style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
    >
      <p className="mb-3 text-sm font-medium">
        Gutscheincode fehlt noch. Ditix gibt ihn leider nicht automatisch heraus.
      </p>

      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <Schrittzahl n={1} />
          <span>
            {sendung.linkZurBestellung ? (
              <>
                <a
                  href={sendung.linkZurBestellung}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md border border-gold bg-gold-hell px-3 py-1.5 font-medium text-gold-dunkel hover:bg-gold hover:text-white"
                >
                  Bestellung in Ditix öffnen
                </a>
                <span className="ml-2 text-leise">öffnet sich in einem neuen Fenster</span>
              </>
            ) : (
              <span className="text-leise">
                Für diese Bestellung ist kein Ditix-Link hinterlegt. Suche sie im Backend über
                den Kundennamen.
              </span>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          <Schrittzahl n={2} />
          <span>Dort den Gutscheincode markieren und kopieren.</span>
        </li>
        <li className="flex gap-3">
          <Schrittzahl n={3} />
          <form
            action={gutscheincodeSetzen.bind(null, sendung.bestellnummer)}
            className="flex flex-wrap items-center gap-2"
          >
            <label>
              Code hier einfügen:{" "}
              <input
                type="text"
                name="code"
                placeholder="z.B. F8F4WULBGA"
                autoComplete="off"
                className="ml-1 inline-block w-48 font-mono uppercase"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
            >
              Sichern
            </button>
          </form>
        </li>
      </ol>

      <p className="mt-3 text-xs text-leise">
        Danach steht der Code auf dem gedruckten Gutschein. Abtippen musst du ihn kein zweites
        Mal.
      </p>
    </div>
  );
}

function Schrittzahl({ n, gut }: { n: number; gut?: boolean }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: gut ? "var(--gut)" : "var(--warnung)" }}
    >
      {n}
    </span>
  );
}

/**
 * Das Begleitschreiben, eine Seite je Sendung.
 *
 * Gestaltung, Wortlaut und Maße sind eins zu eins aus den bestehenden
 * Google-Dokumenten übernommen, nicht nachempfunden:
 *
 *   Seite      210 x 297 mm
 *   Ränder     oben und unten 5 mm, links und rechts 19 mm
 *   Datum      9 pt, rechtsbündig
 *   Absender   8 pt
 *   Anschrift  12 pt, endet an der Goldlinie des Briefbogens bei 75 mm
 *   Überschrift 16 pt
 *   Fließtext  12 pt, 5,6 mm Abstand zwischen den Absätzen
 *   Rolle      9 pt
 *
 * Das Anschriftenfeld sitzt damit im Fenster des Umschlags. Deshalb feste
 * Millimeter statt gestapelter Abstände: Verrutscht es, ist der Brief
 * unbrauchbar.
 */
function Begleitschreiben({ sendung }: { sendung: Sendung }) {
  const istGutschein = !/ticket|karte/i.test(sendung.ditixVariante);
  // Wer den Umschlag bekommt, nicht wer beschenkt wird.
  const empfaenger = postempfaenger(sendung);

  return (
    <div
      className="relative"
      style={{
        width: "210mm",
        height: "297mm",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
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
        <div>Bestellnummer: {sendung.bestellnummer}</div>
      </div>

      {/* Anschriftenfeld: links 19 mm, endet an der Goldlinie bei 75 mm. */}
      <div className="absolute" style={{ left: "19mm", top: "50mm", width: "105mm" }}>
        <div className="text-[8pt] leading-tight text-leise">{ABSENDERZEILE}</div>
        <address className="not-italic text-[12pt] leading-snug" style={{ marginTop: "2.5mm" }}>
          <div>{empfaenger}</div>
          <div>{sendung.strasse}</div>
          <div>
            {sendung.plz} {sendung.ort}
          </div>
        </address>
      </div>

      <div
        className="absolute"
        style={{ left: "19mm", right: "19mm", top: "88mm", bottom: "30mm" }}
      >
        <h2 className="text-[16pt]">{ANSCHREIBEN_UEBERSCHRIFT}</h2>

        <p className="text-[12pt]" style={{ marginTop: "8.5mm" }}>
          {anrede(empfaenger)}
        </p>

        <div className="text-[12pt] leading-relaxed">
          {[...ANSCHREIBEN_ABSAETZE, einloesesatz(istGutschein), GRUSSFORMEL].map((absatz, i) => (
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

      {/* Unter der unteren Goldlinie des Briefbogens. */}
      <div
        className="absolute text-center text-[8pt] leading-snug text-leise"
        style={{ left: "19mm", right: "19mm", top: "281mm" }}
      >
        <div>{ABSENDERZEILE}</div>
        <div>{KONTAKTZEILE}</div>
      </div>
    </div>
  );
}

/**
 * Der Gutschein zum Ausdrucken.
 *
 * Eins zu eins aus dem bestehenden Dokument, samt der Grußworte. Die
 * hatte ich zuerst übersehen: Auf dem Gutschein steht nicht nur der Code,
 * sondern auch, für wen er ist, was der Käufer geschrieben hat und von
 * wem er kommt. Genau das ist das Persönliche daran.
 *
 * Reihenfolge und Schriftgrößen wie im Original:
 *   GUTSCHEIN                 40 pt
 *   Betrag, Code              14 pt
 *   Einlösen auf ...          12 pt
 *   Ein Abend voller Magie    14 pt, zwei Zeilen
 *   Für ... / Widmung / Von   12 pt
 *   Gültig bis                12 pt
 *   Anschrift und Kontakt      8 pt, ganz unten
 *
 * Gedruckt wird er auf das goldschimmernde Papier, deshalb in einem
 * eigenen Druckauftrag und nicht zusammen mit dem Anschreiben.
 *
 * Ohne Gutscheincode entsteht keine Seite: Ein Gutschein ohne Code wäre
 * wertlos, und ein leerer Ausdruck fällt später niemandem mehr auf.
 */
function Gutschein({ sendung, stand }: { sendung: Sendung; stand: VersandStand | undefined }) {
  const code = stand?.gutscheincode;
  if (!code) return null;

  const g = gruesse(sendung, stand);
  const cent = stand?.betragCent ?? Math.round(Number(sendung.betrag.replace(",", ".")) * 100);
  const betrag = Number.isFinite(cent) && cent > 0 ? gutscheinbetrag(cent) : null;

  return (
    <div
      className="relative"
      style={{
        width: "210mm",
        height: "297mm",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bilder/gutscheinbogen.jpg"
        alt=""
        className="absolute inset-0"
        style={{ width: "210mm", height: "297mm" }}
      />

      {/*
        Ein zusammenhängender Block statt gestapelter Positionen: Sonst
        überlappen sich die Zeilen, sobald eine Widmung länger ist als
        erwartet.

        Verteilt wird wie in der Vorlage: oben Betrag und Code, in der
        Mitte der Satz und die Grußworte, unten die Gültigkeit. Im
        Originaldokument steht zwischen diesen Gruppen jeweils ein
        großer Abstand, hier entsteht er dadurch, dass die drei Gruppen
        den festen Platz unter sich aufteilen.
      */}
      <div
        className="absolute flex flex-col justify-between overflow-hidden text-center"
        style={{ left: "22mm", right: "22mm", top: "193mm", height: "88mm" }}
      >
        <div>
          <div className="text-[40pt] leading-none">GUTSCHEIN</div>
          {betrag && <div className="text-[14pt]" style={{ marginTop: "3mm" }}>{betrag}</div>}
          <div className="text-[14pt]">
            Code: <span className="font-mono tracking-[0.12em]">{code}</span>
          </div>
          <div className="text-[12pt]" style={{ marginTop: "3.5mm" }}>
            Einlösen auf www.florianzimmertheater.de
          </div>
        </div>

        <div>
          <div className="text-[14pt] leading-snug">
            Ein Abend voller Magie,
            <br />
            den man nicht vergisst.
          </div>

          {(g.fuer || g.text || g.von) && (
            <div
              className="leading-snug"
              style={{ marginTop: "4mm", fontSize: widmungsgroesse(g.text) }}
            >
              {g.fuer && <div>Für {g.fuer}</div>}
              {g.text && <div>„{g.text}“</div>}
              {g.von && <div>Von {g.von}</div>}
            </div>
          )}
        </div>

        <div className="text-[11pt]">
          Gültig bis: {stand?.gueltigBis?.trim() || "Unbegrenzt"}
        </div>
      </div>

      <div
        className="absolute text-center text-[8pt] leading-snug text-leise"
        style={{ left: "19mm", right: "19mm", top: "281mm" }}
      >
        <div>{ABSENDERZEILE}</div>
        <div>{KONTAKTZEILE}</div>
      </div>
    </div>
  );
}

/**
 * Der Betrag, wie er auf dem Gutschein steht.
 *
 * In der Vorlage stehen volle Euro ohne Nachkommastellen: "150 €", nicht
 * "150,00 €". Ein Gutschein über einen krummen Betrag käme zwar selten
 * vor, soll dann aber trotzdem stimmen, deshalb die Ausnahme.
 */
function gutscheinbetrag(cent: number): string {
  return cent % 100 === 0
    ? `${cent / 100} €`
    : eur(cent);
}

/**
 * Wie groß darf die Widmung sein?
 *
 * Auf dem Bogen ist der Platz zwischen dem Foto und der Fußzeile fest.
 * Kurze Widmungen dürfen groß stehen, lange werden kleiner gesetzt,
 * damit sie ganz draufpassen statt abgeschnitten zu werden.
 */
function widmungsgroesse(text: string): string {
  const zeichen = text.trim().length;
  if (zeichen <= 90) return "11pt";
  if (zeichen <= 160) return "10pt";
  return "9pt";
}

/**
 * Die Grußworte einer Sendung.
 *
 * Was im Programm geändert wurde, gilt; sonst der Wert aus der Tabelle.
 * Ein einzelnes Minuszeichen heißt ausdrücklich "soll leer bleiben",
 * sonst könnte man eine Widmung nie wieder loswerden.
 */
function gruesse(sendung: Sendung, stand: VersandStand | undefined) {
  const nimm = (geaendert: string | null | undefined, ausTabelle: string) => {
    const wert = (geaendert ?? "").trim();
    if (wert === "-") return "";
    return wert || ausTabelle.trim();
  };

  return {
    fuer: nimm(stand?.widmungFuer, sendung.empfaenger),
    text: nimm(stand?.widmungText, sendung.widmung),
    von: nimm(stand?.widmungVon, sendung.absender),
  };
}

/**
 * Die Wahl, was gedruckt wird.
 *
 * Zwei Wege statt einem Knopf, weil zwei Sorten Papier im Spiel sind.
 * Wer weißes Papier eingelegt hat, druckt die Anschreiben; wer das
 * goldschimmernde eingelegt hat, die Gutscheine. So wird die Kassette
 * einmal am Tag gewechselt und nicht bei jedem Umschlag.
 */
function Druckwahl({
  anzahl,
  mitGutschein,
  nur,
  drucken,
}: {
  anzahl: number;
  mitGutschein: number;
  nur: string | undefined;
  drucken: string | undefined;
}) {
  const grund = nur ? `?nur=${nur}&` : "?";
  const aufGutschein = drucken === "gutschein";

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/versand${grund}drucken=anschreiben`}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            aufGutschein ? "border-linie bg-flaeche" : "border-gold bg-gold-hell text-gold-dunkel"
          }`}
        >
          Anschreiben ({anzahl})
        </Link>
        <Link
          href={`/versand${grund}drucken=gutschein`}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            aufGutschein ? "border-gold bg-gold-hell text-gold-dunkel" : "border-linie bg-flaeche"
          }`}
        >
          Gutscheine ({mitGutschein})
        </Link>
      </div>

      <div className="mt-2">
        <DruckKnopf
          text={aufGutschein ? "Gutscheine drucken" : "Anschreiben drucken"}
          hinweis={
            aufGutschein ? "auf das goldschimmernde Papier" : "auf normales weißes Papier"
          }
        />
      </div>
    </div>
  );
}

/**
 * Die Grußworte, so wie sie auf dem Gutschein landen, und änderbar.
 *
 * Der Käufer gibt sie im Shop ein, meistens passt alles. Manchmal fehlt
 * ein Punkt, ein Name ist falsch geschrieben oder die Anrede stimmt
 * nicht. Bisher ließ sich das nur in der Google-Tabelle richten, und
 * niemand hat es gemacht.
 *
 * Deshalb steht der Text hier so, wie er gedruckt wird, mit einem
 * Aufklapper zum Ändern daneben. Ein leeres Feld heißt "Wert aus der
 * Tabelle", ein Minuszeichen heißt "soll weg".
 */
function Grusswortfeld({
  sendung,
  stand,
}: {
  sendung: Sendung;
  stand: VersandStand | undefined;
}) {
  const g = gruesse(sendung, stand);
  const geaendert = Boolean(stand?.widmungFuer || stand?.widmungText || stand?.widmungVon);

  if (!g.fuer && !g.text && !g.von) {
    return (
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-leise">
          Keine Grußworte. Welche hinzufügen?
        </summary>
        <Grussformular sendung={sendung} stand={stand} />
      </details>
    );
  }

  return (
    <div className="mt-3 border-l-4 border-gold pl-3 text-sm">
      {g.fuer && <div className="text-leise">Für {g.fuer}</div>}
      {g.text && <div className="italic">„{g.text}“</div>}
      {g.von && <div className="text-leise">Von {g.von}</div>}
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-leise">
          Grußworte ändern{geaendert ? " (bereits angepasst)" : ""}
        </summary>
        <Grussformular sendung={sendung} stand={stand} />
      </details>
    </div>
  );
}

function Grussformular({
  sendung,
  stand,
}: {
  sendung: Sendung;
  stand: VersandStand | undefined;
}) {
  const g = gruesse(sendung, stand);

  return (
    <form
      action={widmungSpeichern.bind(null, sendung.bestellnummer)}
      className="mt-2 max-w-xl space-y-2 rounded border border-linie p-3"
    >
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Für wen ist der Gutschein?</span>
        <input type="text" name="fuer" defaultValue={g.fuer} placeholder="z.B. Angelika" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Die Widmung</span>
        <textarea
          name="widmung"
          rows={3}
          defaultValue={g.text}
          placeholder="Der persönliche Text, so wie er auf dem Gutschein steht"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Von wem?</span>
        <input type="text" name="von" defaultValue={g.von} placeholder="z.B. Astrid Klaiber" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Gültig bis</span>
        <input
          type="text"
          name="gueltig_bis"
          defaultValue={stand?.gueltigBis ?? ""}
          placeholder="Unbegrenzt"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          Grußworte sichern
        </button>
        <span className="text-xs text-leise">
          Leer lassen nimmt den Wert aus der Tabelle. Ein Minuszeichen entfernt die Zeile.
        </span>
      </div>
    </form>
  );
}
