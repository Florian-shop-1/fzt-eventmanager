"use client";

/**
 * Der Personalbogen in fünf kurzen Schritten, fürs Handy gebaut.
 *
 * Bewusst nichts im Browser gespeichert: Auf dem Foyer-iPad soll niemand
 * die IBAN des Vorgängers finden. Wer die Seite verlässt, fängt neu an.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUSBILDUNG, BESCHAEFTIGUNG, FAMILIENSTAND, KONFESSION, LEER, SCHULABSCHLUSS, STATUS_MINIJOB,
  STEUERKLASSE, istMinijob, minderjaehrig, pruefen, svHinweis, zeilen, type Personalbogen,
} from "@/lib/personal/personalbogen";
import { bogenEintragen, personalbogenAbsenden } from "@/app/personalbogen/aktionen";
import { ScanHase } from "@/components/ScanHase";

type Feld = keyof Personalbogen;

const SCHRITTE: Array<{ titel: string; felder: Feld[] }> = [
  { titel: "Du", felder: ["vorname", "nachname", "geburtsname", "geburtsdatum", "geburtsort", "familienstand", "staatsangehoerigkeit", "schwerbehindert"] },
  { titel: "Kontakt", felder: ["strasse", "plz", "ort", "email", "telefon"] },
  { titel: "Arbeit", felder: ["beschaeftigung", "eintrittsdatum", "berufsbezeichnung", "schulabschluss", "ausbildung", "statusMinijob", "rentenbefreiung"] },
  { titel: "Geld", felder: ["svNummer", "steuerId", "steuerklasse", "konfession", "krankenversicherung", "krankenkasse", "iban", "bic", "kontoinhaber", "kontoinhaberBezug"] },
  { titel: "Prüfen", felder: [] },
];

const KASSEN = ["AOK Baden-Württemberg", "AOK Bayern", "Techniker Krankenkasse (TK)", "Barmer", "DAK-Gesundheit", "IKK classic", "KKH", "hkk", "BKK Mobil", "Audi BKK", "SBK", "HEK"];
const BERUFE = ["Servicekraft", "Foyer / Einlass", "Küche", "Bar", "Technik", "Büro", "Künstler/in", "Reinigung"];

export function PersonalbogenFormular({
  vorname,
  nachname,
  email,
  ohneSvNummer = false,
  fuerBenutzerId,
}: {
  vorname: string;
  nachname: string;
  email: string;
  /** Für den, der noch keine Sozialversicherungsnummer hat (Florian, 01.10.2026). */
  ohneSvNummer?: boolean;
  /**
   * Gesetzt, wenn das Büro den Bogen für jemand anderen abtippt, etwa aus
   * der alten Mail ans Lohnbüro (Florian, 15.10.2026). Dann geht nichts
   * an das Lohnbüro hinaus, die Angaben werden nur abgelegt.
   */
  fuerBenutzerId?: string;
}) {
  const router = useRouter();
  const [b, setB] = useState<Personalbogen>({ ...LEER, vorname, nachname, email });
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [bestaetigt, setBestaetigt] = useState(false);
  // Laeuft das Konto auf jemand anderen? Siehe unten bei der Bankverbindung.
  const [fremdesKonto, setFremdesKonto] = useState(false);
  // "Ich habe noch keine Sozialversicherungsnummer", vom Mitarbeiter selbst.
  const [ohneSv, setOhneSv] = useState(ohneSvNummer);
  const [fertig, setFertig] = useState(false);

  const setze = (k: Feld, v: string) => {
    setB((alt) => ({ ...alt, [k]: v }));
    setFehler((alt) => ({ ...alt, [k]: "" }));
  };

  function weiter() {
    const alle = pruefen(b, { ohneSvNummer: ohneSvNummer || ohneSv });
    const hier = Object.fromEntries(Object.entries(alle).filter(([k]) => SCHRITTE[schritt].felder.includes(k as Feld)));
    if (Object.keys(hier).length > 0) {
      setFehler(hier);
      return;
    }
    setSchritt((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function absenden() {
    setSendet(true);
    setMeldung(null);
    const e = fuerBenutzerId
      ? await bogenEintragen(fuerBenutzerId, b)
      : await personalbogenAbsenden(b, ohneSv);
    setSendet(false);
    if (e.ok) {
      setFertig(true);
      return;
    }
    setMeldung(e.fehler);
    if (e.felder) {
      setFehler(e.felder);
      const erster = SCHRITTE.findIndex((s) => s.felder.some((f) => e.felder?.[f]));
      if (erster >= 0) setSchritt(erster);
    }
  }

  if (fertig && fuerBenutzerId) {
    return (
      <div className="rounded-lg border px-5 py-8 text-center" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
        <h2 className="text-xl font-semibold">Eingetragen</h2>
        <p className="mt-2 text-sm">
          Die Angaben von {b.vorname} {b.nachname} liegen jetzt in der Personalakte. An das Lohnbüro
          ist dabei nichts hinausgegangen.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/mitarbeiter/${fuerBenutzerId}`)}
          className="mt-5 rounded-md border border-gold bg-gold px-5 py-2.5 font-medium text-white"
        >
          Zur Personalakte
        </button>
      </div>
    );
  }

  if (fertig) {
    return (
      <div className="rounded-lg border px-5 py-8 text-center" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
        <h2 className="text-xl font-semibold">Danke, {b.vorname}!</h2>
        <p className="mt-2 text-sm">Dein Personalbogen ist bei unserem Lohnbüro. Eine kurze Bestätigung kommt per Mail.</p>
        <button type="button" onClick={() => router.push("/")} className="mt-5 rounded-md border border-gold bg-gold px-5 py-2.5 font-medium text-white">
          Zurück zum Eventmanager
        </button>
        <ScanHase stimmung="keks" text={`Geschafft, ${b.vorname}! Hier ist ein Keks für dich.`} dauer={4500} onWeg={() => {}} />
      </div>
    );
  }

  const text = (k: Feld, titel: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hinweis?: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{titel}</span>
      <input
        value={b[k]}
        onChange={(e) => setze(k, e.target.value)}
        className="w-full text-base"
        style={fehler[k] ? { borderColor: "var(--blocker)" } : undefined}
        {...extra}
      />
      {fehler[k] ? (
        <span className="mt-1 block text-xs" style={{ color: "var(--blocker)" }}>{fehler[k]}</span>
      ) : (
        hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>
      )}
    </label>
  );

  const auswahl = (k: Feld, titel: string, werte: string[], hinweis?: string) => (
    <fieldset className="block">
      <legend className="mb-1.5 text-sm font-medium">{titel}</legend>
      <div className="flex flex-wrap gap-2">
        {werte.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setze(k, w)}
            className="rounded-full border px-3.5 py-2 text-sm"
            style={
              b[k] === w
                ? { borderColor: "var(--gold)", background: "var(--gold-hell)", color: "var(--gold-dunkel)", fontWeight: 600 }
                : { borderColor: fehler[k] ? "var(--blocker)" : "var(--linie)" }
            }
          >
            {w}
          </button>
        ))}
      </div>
      {fehler[k] ? (
        <span className="mt-1 block text-xs" style={{ color: "var(--blocker)" }}>{fehler[k]}</span>
      ) : (
        hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>
      )}
    </fieldset>
  );

  const sv = svHinweis(b);

  return (
    <div className="space-y-5">
      <ol className="flex gap-1.5" aria-label="Fortschritt">
        {SCHRITTE.map((s, i) => (
          <li key={s.titel} className="flex-1">
            <div className="h-1.5 rounded-full" style={{ background: i <= schritt ? "var(--gold)" : "var(--linie)" }} />
            <span className={`mt-1 block text-center text-xs ${i === schritt ? "font-semibold" : "text-leise"}`}>{s.titel}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-4 rounded-lg border border-linie bg-flaeche p-5">
        {schritt === 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("vorname", "Vorname", { autoComplete: "given-name" })}
              {text("nachname", "Nachname", { autoComplete: "family-name" })}
            </div>
            {text("geburtsname", "Geburtsname", {}, "Nur wenn er anders ist als dein Nachname, sonst leer lassen.")}
            <div className="grid gap-4 sm:grid-cols-2">
              {text("geburtsdatum", "Geburtsdatum", { type: "date", autoComplete: "bday" })}
              {text("geburtsort", "Geburtsort")}
            </div>
            {auswahl("familienstand", "Familienstand", FAMILIENSTAND)}
            {text("staatsangehoerigkeit", "Staatsangehörigkeit")}
            {auswahl("schwerbehindert", "Schwerbehindert", ["nein", "ja"])}
          </>
        )}

        {schritt === 1 && (
          <>
            {text("strasse", "Straße und Hausnummer", { autoComplete: "street-address" })}
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              {text("plz", "PLZ", { inputMode: "numeric", autoComplete: "postal-code" })}
              {text("ort", "Ort", { autoComplete: "address-level2" })}
            </div>
            {text("email", "E-Mail", { type: "email", autoComplete: "email", inputMode: "email" })}
            {text("telefon", "Handynummer (freiwillig)", { type: "tel", autoComplete: "tel" })}
          </>
        )}

        {schritt === 2 && (
          <>
            {auswahl("beschaeftigung", "Wie arbeitest du bei uns?", BESCHAEFTIGUNG)}
            {text("eintrittsdatum", "Erster Arbeitstag", { type: "date" }, "Falls du ihn nicht genau weißt, leer lassen.")}
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Berufsbezeichnung</span>
              <input list="berufe" value={b.berufsbezeichnung} onChange={(e) => setze("berufsbezeichnung", e.target.value)} className="w-full text-base" placeholder="zum Beispiel Servicekraft" />
              <datalist id="berufe">{BERUFE.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            {auswahl("schulabschluss", "Höchster Schulabschluss", SCHULABSCHLUSS)}
            {auswahl("ausbildung", "Höchste Berufsausbildung", AUSBILDUNG)}
            {istMinijob(b) && (
              <div className="space-y-4 rounded-md border border-dashed border-linie p-4">
                <p className="text-xs text-leise">Nur für Minijobber:</p>
                {auswahl("statusMinijob", "Was machst du hauptsächlich?", STATUS_MINIJOB)}
                {auswahl(
                  "rentenbefreiung",
                  "Möchtest du dich von der Rentenversicherung befreien lassen?",
                  ["ja", "nein"],
                  "Minijobber zahlen einen kleinen Rentenbeitrag. Mit „ja“ entfällt er, du bekommst dafür etwas weniger Rente. Im Zweifel „nein“.",
                )}
              </div>
            )}
          </>
        )}

        {schritt === 3 && (
          <>
            {/*
              Wer noch keine 18 ist, kann manches gar nicht wissen.

              "einige Dinge konnte sie im Personalbogen nicht ausfuellen,
              da minderjaehrig" (Florian, 14.10.2026). Statt sie raten zu
              lassen, sagen wir, dass Luecken in Ordnung sind.
            */}
            {minderjaehrig(b) && (
              <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
                Du bist noch keine 18. Was du nicht weißt, zum Beispiel Steuerklasse oder Ausbildung,
                lass einfach frei. Das Lohnbüro ergänzt es.
              </p>
            )}
            {text(
              "svNummer",
              "Sozialversicherungsnummer",
              { autoCapitalize: "characters", placeholder: "65 170839 J 003" },
              "Steht auf deinem Sozialversicherungsausweis oder deiner Krankenkassenkarte (Rückseite, „Rentenversicherungsnummer“).",
            )}
            {sv && !fehler.svNummer && <p className="-mt-2 text-xs" style={{ color: "var(--warnung)" }}>{sv}</p>}

            {/*
              Wer noch keine Nummer hat, kommt sonst nicht weiter.

              Beim ersten Job vergibt sie die Krankenkasse erst mit der
              Anmeldung. Anita stand genau davor (Florian, 14.10.2026).
            */}
            {!b.svNummer.trim() && (
              <label className="-mt-2 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ohneSv}
                  onChange={(e) => {
                    setOhneSv(e.target.checked);
                    if (e.target.checked) setze("svNummer", "");
                  }}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Ich habe noch keine Sozialversicherungsnummer
                  <span className="block text-xs text-leise">
                    Beim ersten Job normal. Lass das Feld dann frei, wir fragen später noch einmal nach.
                  </span>
                </span>
              </label>
            )}
            {text(
              "steuerId",
              "Steuer-Identifikationsnummer",
              { inputMode: "numeric", placeholder: "11 Ziffern" },
              "Steht auf deinem Steuerbescheid oder deiner Lohnsteuerbescheinigung. Nicht verwechseln mit der Steuernummer.",
            )}
            {auswahl("steuerklasse", "Steuerklasse", STEUERKLASSE, "Bei Minijob ist sie meist egal, dann „weiß ich nicht“.")}
            {auswahl("konfession", "Konfession (für die Kirchensteuer)", KONFESSION)}
            {auswahl("krankenversicherung", "Krankenversicherung", ["gesetzlich", "privat"])}
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name der Krankenkasse</span>
              <input
                list="kassen"
                value={b.krankenkasse}
                onChange={(e) => setze("krankenkasse", e.target.value)}
                className="w-full text-base"
                style={fehler.krankenkasse ? { borderColor: "var(--blocker)" } : undefined}
              />
              <datalist id="kassen">{KASSEN.map((x) => <option key={x} value={x} />)}</datalist>
              {fehler.krankenkasse && <span className="mt-1 block text-xs" style={{ color: "var(--blocker)" }}>{fehler.krankenkasse}</span>}
            </label>
            {text("iban", "IBAN", { autoCapitalize: "characters", placeholder: "DE.. .... .... .... .... ..", inputMode: "text" }, "Für deinen Lohn. Steht auf deiner Bankkarte oder im Online-Banking.")}
            {text("bic", "BIC (freiwillig)", { autoCapitalize: "characters" })}

            {/*
              Das Konto laeuft nicht immer auf die Person selbst.

              Bei Minderjaehrigen gehoert es oft den Eltern. Das Lohnbuero
              muss es wissen, sonst sieht die Ueberweisung nach einem
              Fehler aus (Florian, 14.10.2026).
            */}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={fremdesKonto}
                onChange={(e) => {
                  setFremdesKonto(e.target.checked);
                  if (!e.target.checked) {
                    setze("kontoinhaber", "");
                    setze("kontoinhaberBezug", "");
                  }
                }}
                className="mt-1 h-4 w-4"
              />
              <span>
                Das Konto läuft auf jemand anderen
                <span className="block text-xs text-leise">
                  Zum Beispiel auf ein Elternteil. Dann geht dein Lohn dorthin.
                </span>
              </span>
            </label>

            {fremdesKonto && (
              <div className="grid gap-4 sm:grid-cols-2">
                {text("kontoinhaber", "Kontoinhaber", {}, "Vor- und Nachname, so wie bei der Bank.")}
                {text("kontoinhaberBezug", "Verhältnis zu dir", { placeholder: "Mutter" }, "Für das Lohnbüro.")}
              </div>
            )}
          </>
        )}

        {schritt === 4 && (
          <>
            <p className="text-sm text-leise">Bitte einmal drüberschauen. Mit „Absenden“ geht alles an unser Lohnbüro.</p>
            {zeilen(b).map((g) => (
              <div key={g.gruppe}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-leise">{g.gruppe}</h3>
                <dl className="divide-y divide-linie text-sm">
                  {g.felder.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-leise">{k}</dt>
                      <dd className="text-right font-medium">{v || "-"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} className="mt-0.5 h-5 w-5" />
              Meine Angaben sind richtig und vollständig. Ändert sich etwas, sage ich im Büro Bescheid.
            </label>
            <p className="text-xs text-leise">
              Deine Angaben gehen per E-Mail direkt an unser Lohnbüro und werden im Eventmanager nicht gespeichert.
            </p>
          </>
        )}
      </div>

      {meldung && (
        <p className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)", color: "var(--blocker)" }}>
          {meldung}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {schritt > 0 ? (
          <button type="button" onClick={() => setSchritt((s) => s - 1)} className="rounded-md border border-linie px-4 py-2.5">
            Zurück
          </button>
        ) : (
          <span />
        )}
        {schritt < SCHRITTE.length - 1 ? (
          <button type="button" onClick={weiter} className="rounded-md border border-gold bg-gold px-6 py-2.5 font-medium text-white">
            Weiter
          </button>
        ) : (
          <button
            type="button"
            onClick={absenden}
            disabled={!bestaetigt || sendet}
            className="rounded-md border border-gold bg-gold px-6 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {sendet ? "Wird gesendet..." : "Absenden"}
          </button>
        )}
      </div>
    </div>
  );
}
