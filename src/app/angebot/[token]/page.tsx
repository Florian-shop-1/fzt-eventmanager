import { buchungPerToken } from "@/lib/abbrecher/db";
import { geschenkZurBuchung, GESCHENK_BILD, GESCHENK_ERKLAERUNG, GESCHENK_TEXT } from "@/lib/abbrecher/geschenk";
import { datumLang, korbText, zurueckLink } from "@/lib/abbrecher/mails";
import { Countdown } from "@/components/Countdown";
import { FARBEN, GastSeite, GoldKnopf, Kasten, Kontaktzeile, Wortzeile } from "@/components/GastSeite";

export const metadata = { title: "Dein Angebot | Florian Zimmer Theater" };
export const dynamic = "force-dynamic";

/**
 * Die Seite hinter dem Knopf in der Angebotsmail.
 *
 * Hier läuft die Uhr wirklich, Sekunde für Sekunde. In einer E-Mail geht
 * das nicht, dort läuft kein Javascript, und ein gemaltes Bild friert
 * ein, sobald ein Mailprogramm es zwischenspeichert. Deshalb steht in der
 * Mail die Frist im Klartext, und der Kauf passiert hier (Florian,
 * 23.09.2026).
 *
 * Im Look des Shops, nicht im Look des Eventmanagers: Der Gast kommt aus
 * einer schwarz-goldenen Mail und geht gleich weiter in den Shop. Siehe
 * components/GastSeite.tsx.
 *
 * Ohne Anmeldung erreichbar: Der lange Schlüssel im Link ist der Nachweis.
 * Deshalb steht hier nichts Internes, kein Betrag, keine anderen Gäste.
 */
export default async function AngebotSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const buchung = await buchungPerToken(token).catch(() => null);
  const geschenk = buchung ? await geschenkZurBuchung(buchung.id).catch(() => null) : null;

  if (!buchung) {
    return (
      <GastSeite>
        <Wortzeile />
        <h1 className="mt-4 text-3xl">Diesen Link kennen wir nicht mehr</h1>
        <p className="mt-3 text-sm" style={{ color: FARBEN.leise }}>
          Vielleicht ist er zu alt. Ruf uns einfach an unter 0731 7906 110, wir kümmern uns.
        </p>
        <Kontaktzeile />
      </GastSeite>
    );
  }

  const art = geschenk?.art ?? "glas";
  const bis = geschenk?.giltBis ?? null;
  const abgelaufen = bis !== null && Date.parse(bis) <= Date.now();
  const weiter = zurueckLink(buchung);

  return (
    <GastSeite>
      <Wortzeile />

      <h1 className="mt-4 text-3xl">
        {abgelaufen ? "Das Angebot ist abgelaufen" : `Für dich hinterlegt: ${GESCHENK_TEXT[art]}`}
      </h1>

      {abgelaufen ? (
        <p className="mt-4 text-sm leading-relaxed" style={{ color: FARBEN.leise }}>
          Schade, die 24 Stunden sind vorbei. Deine Plätze kannst du natürlich trotzdem buchen, und wenn du
          anrufst, finden wir sicher eine Lösung: 0731 7906 110.
        </p>
      ) : (
        <>
          {/* Das Foto aus dem Shop: Wer sieht, was auf ihn wartet, klickt
              eher weiter als bei einer reinen Beschreibung. */}
          {GESCHENK_BILD[art] && (
            <div className="mt-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={GESCHENK_BILD[art]!}
                alt={GESCHENK_TEXT[art]}
                width={260}
                height={260}
                className="rounded"
                style={{
                  maxWidth: "min(260px, 70%)",
                  height: "auto",
                  border: `1px solid ${FARBEN.linie}`,
                  background: FARBEN.karte,
                }}
              />
            </div>
          )}

          <p className="mt-6 leading-relaxed">
            {geschenk?.anzahl && geschenk.anzahl > 1 ? `Für alle ${geschenk.anzahl} Gäste` : "Für dich"} und ohne
            Aufpreis. {GESCHENK_ERKLAERUNG[art]}
          </p>

          {bis && (
            <Kasten gold className="mt-7">
              <p className="mb-4 text-[11px] uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
                Dein Angebot endet in
              </p>
              <Countdown bis={bis} />
            </Kasten>
          )}
        </>
      )}

      <Kasten className="mt-6 text-left">
        <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
          Dein Abend
        </p>
        <p className="mt-2 text-xl" style={{ fontFamily: "var(--fzt-serif), Georgia, serif" }}>
          {buchung.show}
        </p>
        <p className="text-sm">{datumLang(buchung.datum, buchung.uhrzeit)}</p>
        <p className="mt-3 text-sm" style={{ color: FARBEN.leise }}>
          Zuletzt im Warenkorb: {korbText(buchung)}
        </p>
      </Kasten>

      <p className="mt-8">
        <GoldKnopf text="Plätze jetzt sichern" ziel={weiter} />
      </p>

      <p className="mt-4 text-sm leading-relaxed" style={{ color: FARBEN.leise }}>
        Die Plätze aus deinem alten Warenkorb sind nach kurzer Zeit wieder freigegeben worden, deshalb wählst
        du sie neu. Dein Abend ist schon vorausgewählt.
      </p>

      {!abgelaufen && (
        <p className="mt-6 text-sm leading-relaxed">
          Du musst nichts ausdrucken und nichts eingeben: Das Geschenk ist auf deinen Namen hinterlegt. Meldet
          euch am Abend einfach an der Magic-Bar im Foyer.
        </p>
      )}

      <Kontaktzeile />
    </GastSeite>
  );
}
