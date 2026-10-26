import { redirect } from "next/navigation";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { karten, kartenZahlen } from "@/lib/visitenkarte/db";
import { brevoBereit } from "@/lib/visitenkarte/brevo";
import { lesenEingerichtet } from "@/lib/visitenkarte/lesen";
import { VisitenkarteKamera } from "@/components/VisitenkarteKamera";
import { Absendeknopf } from "@/components/Absendeknopf";
import { datumKurz } from "@/components/Status";
import { karteUebernehmen, karteVerwerfen, karteZurueckholen } from "./aktionen";

export const metadata = { title: "Visitenkarten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Visitenkarten-Scanner.
 *
 * Oben fotografieren, darunter prüfen und übernehmen. Übernommen heißt:
 * Der Kontakt steht in Brevo und in den Magic News.
 *
 * Warum wir das dürfen, steht auf der Seite selbst, und zwar für den, der
 * davorsitzt: Die Karte wurde Florian persönlich gegeben, mit dem Wunsch,
 * von uns zu hören. Wer das nicht wollte, bekommt keine Mail, und deshalb
 * geht nichts ohne einen Menschen hinaus.
 */
export default async function VisitenkartenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; alle?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfKaufmaennisches(benutzer.rolle)) redirect("/");
  const { meldung, alle } = await searchParams;

  const [offen, erledigt, stand] = await Promise.all([
    karten(["neu"], 60),
    karten(["uebertragen", "verworfen"], alle === "ja" ? 120 : 12),
    kartenZahlen(),
  ]);

  return (
    <div className="space-y-6">
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Visitenkarten</h1>
        <p className="mt-1 text-sm text-leise">
          Karte fotografieren, fertig. Der Kontakt geht von selbst nach Brevo und in die Magic
          News. Hier unten steht nur, was dabei nicht durchgegangen ist.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {(!lesenEingerichtet() || !brevoBereit()) && (
        <p className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Noch nicht vollständig eingerichtet.</strong>{" "}
          {!lesenEingerichtet() && "Zum Lesen der Karten fehlt der Schlüssel für das Modell. "}
          {!brevoBereit() && "Für Brevo fehlt der API-Schlüssel."}
        </p>
      )}

      <VisitenkarteKamera />

      {/*
        Warum wir diese Leute anschreiben duerfen.

        Steht hier und nicht in einer Akte: Wer eine Karte uebernimmt,
        soll den Satz lesen, bevor er klickt (Florian, 25.10.2026).
      */}
      <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
        <strong>Warum das geht:</strong> Die Karte wurde uns persönlich überreicht, mit dem Wunsch,
        die Magic News zu bekommen. Das ist die mündliche Zustimmung, und an jeder Karte steht, wer
        sie wann gescannt hat. Abmelden kann sich jeder jederzeit über den Link in jeder Mail.
        <br />
        <strong>Deshalb gilt:</strong> Nur scannen, was auch in die Magic News soll. Wer das nicht
        wollte, wird gar nicht erst fotografiert. Ist doch eine Karte zu viel drin, nimm sie unter
        „Verteiler aufräumen“ wieder heraus.
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
          Liegengeblieben ({stand.neu})
        </h2>

        {offen.length === 0 ? (
          <p className="text-sm text-leise">
            Nichts liegengeblieben. Alles, was gescannt wurde, ist in den Magic News.
          </p>
        ) : (
          <ul className="space-y-4">
            {offen.map((k) => (
              <li key={k.id} className="rounded-lg border border-linie bg-flaeche p-4">
                <div className="flex flex-wrap items-start gap-4">
                  {k.bildUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={k.bildUrl}
                      alt="Visitenkarte"
                      className="w-56 rounded-md border border-linie"
                    />
                  )}

                  <form action={karteUebernehmen} className="min-w-[18rem] flex-1 space-y-2">
                    <input type="hidden" name="id" value={k.id} />

                    {k.sicherheit === "unsicher" && (
                      <p
                        className="rounded-md px-2 py-1 text-xs"
                        style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}
                      >
                        Bei der Adresse war das Lesen nicht eindeutig. Bitte gegen die Karte prüfen.
                      </p>
                    )}
                    {k.hinweis && <p className="text-xs text-leise">{k.hinweis}</p>}
                    {k.fehler && (
                      <p className="text-xs" style={{ color: "var(--blocker)" }}>
                        Letzter Versuch: {k.fehler}
                      </p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Vorname</span>
                        <input name="vorname" defaultValue={k.vorname} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Nachname</span>
                        <input name="nachname" defaultValue={k.nachname} className="w-full" />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs text-leise">E-Mail</span>
                        <input name="email" defaultValue={k.email} className="w-full" required />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Firma</span>
                        <input name="firma" defaultValue={k.firma} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Position</span>
                        <input name="position" defaultValue={k.position} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Telefon</span>
                        <input name="telefon" defaultValue={k.telefon} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Webseite</span>
                        <input name="webseite" defaultValue={k.webseite} className="w-full" />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs text-leise">
                          Notiz (nur intern, zum Beispiel wo ihr euch getroffen habt)
                        </span>
                        <input name="notiz" defaultValue={k.notiz} className="w-full" />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Absendeknopf text="Berichtigen und an Brevo schicken" laeuftText="..." />
                      <span className="text-xs text-leise">
                        gescannt von {k.gescanntVon || "unbekannt"} am {datumKurz(k.erstelltAm.slice(0, 10))}
                      </span>
                    </div>
                  </form>
                </div>

                <form action={karteVerwerfen} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={k.id} />
                  <input
                    name="grund"
                    placeholder="Warum nicht? (freiwillig)"
                    className="w-64"
                    maxLength={200}
                  />
                  <button type="submit" className="text-sm text-leise underline">
                    wegwerfen, keine Mail
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
          Schon erledigt ({stand.uebertragen} übernommen, {stand.verworfen} weggelegt)
        </h2>

        {/*
          Auch eine uebertragene Karte laesst sich berichtigen.

          Wer unten merkt, dass eine Adresse falsch gelesen wurde, klappt
          sie auf und schickt sie noch einmal. Die falsche bleibt in
          Brevo stehen und faellt dort als Ruecklaeufer auf.
        */}
        {erledigt.length === 0 ? (
          <p className="text-sm text-leise">Hier steht noch nichts.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {erledigt.map((k) => (
                <tr key={k.id} className="border-b border-linie last:border-0">
                  <td className="py-2">
                    <div className="font-medium">
                      {[k.vorname, k.nachname].filter(Boolean).join(" ") || k.email || "ohne Namen"}
                      {k.firma && <span className="text-leise"> · {k.firma}</span>}
                    </div>
                    <div className="text-xs text-leise">
                      {k.email}
                      {k.notiz ? ` · ${k.notiz}` : ""}
                    </div>
                  </td>
                  <td className="w-44 py-2 text-xs">
                    {k.status === "uebertragen" ? (
                      <span style={{ color: "var(--gut)" }}>
                        ✓ in den Magic News
                        {k.uebertragenAm ? `, ${datumKurz(k.uebertragenAm.slice(0, 10))}` : ""}
                      </span>
                    ) : (
                      <span className="text-leise">weggelegt{k.fehler ? `: ${k.fehler}` : ""}</span>
                    )}
                  </td>
                  <td className="w-28 py-2 text-xs">
                    {k.status === "verworfen" ? (
                      <form action={karteZurueckholen}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="text-leise underline">
                          zurückholen
                        </button>
                      </form>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-leise underline">berichtigen</summary>
                        <form action={karteUebernehmen} className="mt-2 space-y-2">
                          <input type="hidden" name="id" value={k.id} />
                          <input name="vorname" defaultValue={k.vorname} placeholder="Vorname" className="w-full" />
                          <input name="nachname" defaultValue={k.nachname} placeholder="Nachname" className="w-full" />
                          <input name="email" defaultValue={k.email} placeholder="E-Mail" className="w-full" required />
                          <input name="firma" defaultValue={k.firma} placeholder="Firma" className="w-full" />
                          <input name="telefon" defaultValue={k.telefon} placeholder="Telefon" className="w-full" />
                          <Absendeknopf text="Noch einmal an Brevo" laeuftText="..." />
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
