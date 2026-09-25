import { redirect } from "next/navigation";
import { buchungPerToken, grundMerken, GRUENDE } from "@/lib/abbrecher/db";
import { datumLang, zurueckLink } from "@/lib/abbrecher/mails";
import { HAUS_TEXT, RABATT, rabattBis } from "@/lib/abbrecher/rabatt";
import { notieren, rueckrufGewuenscht } from "@/lib/abbrecher/vertrieb";
import { abbrecherMeldung } from "@/lib/abbrecher/posteingang";
import { textSchicken } from "./aktionen";
import { FARBEN, GastSeite, GoldKnopf, Kasten, Kontaktzeile, Wortzeile } from "@/components/GastSeite";

export const metadata = { title: "Danke | Florian Zimmer Theater" };
export const dynamic = "force-dynamic";

const TELEFON = "0731 7906 110";
const TELEFON_LINK = "tel:+497317906110";
const MAIL = "tickets@florianzimmer.com";
const SPIELPLAN = "https://shop.florianzimmertheater.de/spielplan";

/**
 * Die Antwort auf "Was hat dich abgehalten?".
 *
 * Ein Klick in der Mail landet hier, die Antwort ist damit gespeichert.
 * Wichtig ist, was danach kommt: Eine reine Dankesseite ist eine
 * Sackgasse. Jeder Grund bekommt deshalb seine eigene Fortsetzung, und
 * die ist immer dasselbe Dreierlei: eine ehrliche Antwort, ein Weg zurück
 * in die Buchung und ein Mensch, den man erreicht (Florian, 23.09.2026).
 *
 * Der erste Klick zählt, und nur der. Wer danach in die Mail zurückgeht
 * und die anderen Knöpfe durchprobiert, landet im Shop statt auf einer
 * neuen Fassung dieser Seite. Sonst könnte jeder durch Ausprobieren
 * herausfinden, was bei "zu teuer" steht, und der Nachlass wäre nichts
 * mehr wert (Florian, 23.09.2026). Denselben Grund noch einmal aufrufen
 * ist erlaubt: Der Gast soll seinen Code wiederfinden.
 *
 * Ohne Anmeldung erreichbar, deshalb steht hier nichts Internes: kein
 * Betrag, keine anderen Gäste, keine Notizen aus dem Haus.
 */
export default async function WarumSeite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ grund?: string; danke?: string }>;
}) {
  const { token } = await params;
  const { grund, danke } = await searchParams;

  const gewuenscht = GRUENDE.some((g) => g.wert === grund) ? grund! : null;
  const a = await buchungPerToken(token).catch(() => null);
  const schon = a?.abbruchGrund ?? null;

  // Zweiter, abweichender Klick: raus in den Shop, ohne Umweg.
  if (gewuenscht && schon && schon !== gewuenscht) redirect(SPIELPLAN);

  if (gewuenscht && !schon) {
    await grundMerken(token, gewuenscht, "").catch(() => false);
    // Beim technischen Problem ist "wir melden uns" ein Versprechen. Damit
    // es eingehalten wird, landet der Vorgang auf der Anrufliste.
    if (grund === "technik" && a) {
      await rueckrufGewuenscht(a.id, "Technisches Problem beim Buchen gemeldet. Rückruf zugesagt.").catch(
        () => undefined,
      );
      // Und sofort in den Posteingang, auch ohne dass der Gast etwas
      // schreibt. Sonst sieht es niemand, siehe posteingang.ts.
      await abbrecherMeldung({ buchung: a, grund: "technik", dringend: true }).catch(() => undefined);
    }
    // Ein Nachlass, der hinausgeht, gehört in die Akte.
    if (gewuenscht === "preis" && a && RABATT.aktiv) {
      await notieren(a.id, "System", `Nachlass ${RABATT.prozent} % gezeigt, Code ${RABATT.code}`).catch(
        () => undefined,
      );
    }
  }

  const aktuell = schon ?? gewuenscht;
  const termin = a && a.datum ? datumLang(a.datum, a.uhrzeit) : null;
  const zurueck = a ? zurueckLink(a) : SPIELPLAN;

  const texte: Record<string, { titel: string; absatz: string; knopf: string; ziel: string; frage: string }> = {
    technik: {
      titel: "Das tut uns leid. Wir kümmern uns darum.",
      absatz:
        "Wenn die Buchung hakt, liegt das an uns und nicht an dir. Wir schauen uns das an und melden uns bei dir. Wenn es schneller gehen soll: Ruf uns an, wir buchen dich von Hand ein, das dauert zwei Minuten.",
      knopf: "Nochmal versuchen",
      ziel: zurueck,
      frage: "Was genau ist passiert, und war es am Handy oder am Computer?",
    },
    preis: {
      titel: "Danke für die Ehrlichkeit.",
      absatz: HAUS_TEXT,
      knopf: "Plätze und Preise ansehen",
      ziel: zurueck,
      frage: "Was wäre für dich der richtige Rahmen gewesen?",
    },
    termin: {
      titel: "Dann finden wir einen anderen Abend.",
      absatz: termin
        ? `${termin} passt also nicht. Kein Problem, wir spielen regelmäßig, und im Spielplan stehen alle weiteren Termine.`
        : "Kein Problem, wir spielen regelmäßig. Im Spielplan stehen alle weiteren Termine.",
      knopf: "Zum Spielplan",
      ziel: SPIELPLAN,
      frage: "Welcher Wochentag oder Zeitraum wäre dir lieber?",
    },
    ruecksprache: {
      titel: "Alles gut, lass dir Zeit.",
      absatz:
        "Wir halten die Plätze nicht zurück, das wäre den anderen gegenüber nicht fair. Beliebte Abende sind aber schnell voll. Wenn ihr euch einig seid, kommst du hier direkt zurück zu deinem Abend.",
      knopf: termin ? "Zurück zu meinem Abend" : "Zur Buchung",
      ziel: zurueck,
      frage: "Sollen wir dich in ein paar Tagen erinnern?",
    },
    anders: {
      titel: "Danke, das hilft uns wirklich.",
      absatz:
        "Wenn du magst, schreib uns kurz, was es war. Wir lesen jede Zeile selbst, und es ändert tatsächlich etwas.",
      knopf: "Zur Buchung",
      ziel: zurueck,
      frage: "Was hat dich abgehalten?",
    },
  };

  const t = aktuell ? texte[aktuell] : null;

  if (danke === "ja") {
    return (
      <Rahmen>
        <h1 className="mt-4 text-3xl">Angekommen, danke.</h1>
        {/* "erhalten", nicht "gelesen": Gelesen hat sie in dem Moment noch
            niemand, und ein Satz, der nicht stimmt, faellt auf (Florian,
            23.09.2026). */}
        <p className="mt-3 text-sm" style={{ color: FARBEN.leise }}>
          Wir haben deine Nachricht erhalten. Wenn eine Antwort nötig ist, melden wir uns.
        </p>
        <Knopf text="Zur Buchung" ziel={zurueck} />
        <Kontakt />
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      <h1 className="mt-4 text-3xl">{t ? t.titel : "Danke für deine Zeit."}</h1>

      <p className="mt-4 text-sm leading-relaxed">
        {t ? t.absatz : "Schreib uns gern, was wir besser machen können. Wir buchen dich auch von Hand ein."}
      </p>

      {/* Der Nachlass steht nur hier, nur einmal und nur für den, der
          wirklich "zu teuer" gesagt hat. */}
      {aktuell === "preis" &&
        (RABATT.aktiv ? (
          <Kasten gold className="mt-7">
            <p className="text-sm">Was wir tun können, und das gern:</p>
            <p className="mt-2 text-3xl font-semibold" style={{ color: FARBEN.goldHell }}>
              {RABATT.prozent} % auf deine Buchung
            </p>
            <p className="mt-4 text-sm">
              Gib beim Buchen diesen Code ein:
              <br />
              <span
                className="mt-2 inline-block rounded border border-dashed px-4 py-2 text-xl font-semibold tracking-[0.2em]"
                style={{ borderColor: FARBEN.gold, color: FARBEN.goldHell }}
              >
                {RABATT.code}
              </span>
            </p>
            <p className="mt-4 text-xs" style={{ color: FARBEN.leise }}>
              Gültig bis {rabattBis()}, einmal pro Buchung. Wenn es nicht klappt, ruf uns an, wir machen es von Hand.
            </p>
          </Kasten>
        ) : (
          <p className="mt-4 text-sm leading-relaxed">
            Was wir tun können: Ruf uns an. Wir haben günstigere Plätze in den hinteren Kategorien und Abende, die
            weniger gefragt sind, und finden mit dir zusammen den passenden.
          </p>
        ))}

      <Knopf text={t ? t.knopf : "Zum Spielplan"} ziel={t ? t.ziel : zurueck} />

      {/* Ein Satz vom Gast ist mehr wert als jede Auswertung der Klicks. */}
      <form action={textSchicken} className="mt-10 text-left">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="grund" value={aktuell ?? "anders"} />
        <label htmlFor="text" className="block text-sm font-medium">
          {t ? t.frage : "Magst du uns kurz schreiben, was los war?"}
        </label>
        <textarea
          id="text"
          name="text"
          rows={3}
          maxLength={500}
          className="mt-2 w-full rounded p-3 text-base"
          style={{ background: FARBEN.karte, border: `1px solid ${FARBEN.linie}`, color: FARBEN.weiss }}
          placeholder="Ein, zwei Sätze reichen."
        />
        <button
          type="submit"
          className="mt-3 w-full rounded px-5 py-3 text-base font-medium sm:w-auto"
          style={{ border: `1px solid ${FARBEN.gold}`, color: FARBEN.goldHell }}
        >
          Abschicken
        </button>
      </form>

      <Kontakt />
    </Rahmen>
  );
}

/* Im Look des Shops, siehe components/GastSeite.tsx. */
function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <GastSeite>
      <Wortzeile />
      {children}
    </GastSeite>
  );
}

/* Ein großer Knopf, weil die meisten das am Handy lesen. */
function Knopf({ text, ziel }: { text: string; ziel: string }) {
  return (
    <p className="mt-8">
      <GoldKnopf text={text} ziel={ziel} />
    </p>
  );
}

function Kontakt() {
  return (
    <p className="mt-10 text-sm" style={{ color: FARBEN.leise }}>
      Lieber persönlich?{" "}
      <a href={TELEFON_LINK} className="unterstrichen" style={{ color: FARBEN.goldHell }}>
        {TELEFON}
      </a>{" "}
      oder{" "}
      <a href={`mailto:${MAIL}`} className="unterstrichen" style={{ color: FARBEN.goldHell }}>
        {MAIL}
      </a>
      . Wir buchen dich auch von Hand ein.
    </p>
  );
}
