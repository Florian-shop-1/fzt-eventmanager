"use client";

/**
 * Eine Karte, bei der ein Mensch entscheiden muss.
 *
 * Links das Foto (antippen öffnet es groß zum Zoomen), rechts die Felder.
 * Rot markiert ist, was unsicher war. Unter der Adresse stehen die
 * Vorschläge der Leser zum Antippen, damit man nicht tippen muss.
 */

import { useState } from "react";
import type { ScanKarte } from "@/lib/db/scanner";
import { karteBestaetigen, karteVerwerfen, erneutUebertragen } from "@/app/scanner/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

export function KartePruefen({ karte }: { karte: ScanKarte }) {
  const [email, setEmail] = useState(karte.email);
  const l = karte.lesungen;
  const vorschlaege = [
    l.emailVorschlag,
    l.claude?.email,
    ...(l.claude?.alternativen ?? []),
    l.azure?.email,
  ]
    .map((x) => (x ?? "").toLowerCase().replace(/\s+/g, ""))
    .filter((x, i, alle) => x.includes("@") && x !== email && alle.indexOf(x) === i);

  const rot = (feld: string) =>
    karte.unsicher.includes(feld) ? { borderColor: "var(--blocker)", background: "var(--blocker-hell)" } : undefined;
  const fehler = karte.status === "fehler";

  return (
    <article id={`karte-${karte.id}`} className="grid gap-4 rounded-lg border border-linie bg-flaeche p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        {karte.hatFoto ? (
          <a href={`/scanner/foto/${karte.id}`} target="_blank" rel="noopener" title="Groß öffnen">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/scanner/foto/${karte.id}`} alt="Foto der Karte" loading="lazy" className="w-full rounded-md border border-linie" />
          </a>
        ) : (
          <div className="rounded-md border border-dashed border-linie p-6 text-center text-sm text-leise">Foto bereits gelöscht</div>
        )}
        <p className="mt-1 text-xs text-leise">Antippen zum Vergrößern · gescannt von {karte.erstelltVon}</p>
      </div>

      <div className="space-y-3 text-sm">
        {(karte.grund || karte.brevoFehler) && (
          <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
            {fehler ? karte.brevoFehler : karte.grund}
          </p>
        )}

        <form action={fehler ? erneutUebertragen : karteBestaetigen} className="space-y-3">
          <input type="hidden" name="id" value={karte.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Vorname</span>
              <input name="vorname" defaultValue={karte.vorname} style={rot("vorname")} readOnly={fehler} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Nachname</span>
              <input name="nachname" defaultValue={karte.nachname} style={rot("nachname")} readOnly={fehler} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-leise">E-Mail</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={rot("email")}
              readOnly={fehler}
              className="font-mono"
            />
          </label>

          {!fehler && vorschlaege.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-leise">Vorschläge:</span>
              {vorschlaege.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEmail(v)}
                  className="rounded-full border border-linie px-2.5 py-1 font-mono text-xs hover:bg-gold-hell"
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {!fehler && karte.unsicher.includes("email") && (
            <label className="flex items-center gap-2 text-xs text-leise">
              <input type="checkbox" name="trotzdem" value="ja" className="h-4 w-4" />
              Trotzdem übernehmen, die Adresse steht genau so auf der Karte
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-leise">Telefon (freiwillig)</span>
            <input name="telefon" type="tel" defaultValue={karte.telefon || l.claude?.telefon || l.azure?.telefon || ""} style={rot("telefon")} readOnly={fehler} />
          </label>

          {l.claude?.hinweis && <p className="text-xs text-leise">Claude: {l.claude.hinweis}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <Absendeknopf text={fehler ? "Erneut an Brevo" : "Passt, an Brevo"} laeuftText="Wird eingetragen..." />
          </div>
        </form>

        <form action={karteVerwerfen}>
          <input type="hidden" name="id" value={karte.id} />
          <button type="submit" className="text-xs text-leise underline hover:text-text">
            Verwerfen (leer, unleserlich oder keine Karte)
          </button>
        </form>
      </div>
    </article>
  );
}
