"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Postkarten einscannen, eine nach der anderen.
 *
 * "beim postkarten scannen, bitte so, dass ich eine nach der anderen
 * scannen kann.. nicht immer immer wieder button drücken" (Florian,
 * 30.10.2026).
 *
 * Vorher führte jede Karte durch die Kamera-App des Telefons: Knopf
 * drücken, auslösen, bestätigen, warten, wieder von vorne. Bei dreißig
 * Karten sind das hundertzwanzig Griffe.
 *
 * Jetzt läuft die Kamera in der Seite weiter. Karte hinlegen,
 * auslösen, nächste Karte hinlegen. Das Hochladen passiert im
 * Hintergrund, es hält nichts auf. Wer mag, schaltet die automatische
 * Auslösung dazu: Dann genügt es, die Karten nacheinander unter die
 * Kamera zu legen.
 *
 * Der Weg über den Dateiauswahl-Knopf bleibt daneben bestehen. Am
 * Schreibtisch mit einem Dokumentenscanner ist er der schnellere.
 *
 * Verkleinert wird im Browser, bevor etwas hochgeht: Ein Handyfoto hat
 * zwölf Megapixel, die Handschrift ist bei 1600 Pixeln Breite genauso
 * gut zu lesen. Das Bild geht als JPEG hinaus und landet in der
 * Datenbank, nicht im öffentlichen Speicher.
 */

const BREITE = 1600;

/**
 * Das Seitenverhaeltnis einer Postkarte, hochkant.
 *
 * "der scanner bei postkarten sollte auf postkartenformat eingestellt
 * sein. aktuell links und rechts ein schwarzer balken" und "die
 * scanneransicht bitte hochformat postkarte" (Florian, 02.11.2026).
 *
 * A6 misst 105 auf 148 Millimeter. Der Ausschnitt zeigt genau diesen
 * Streifen, und aufgenommen wird derselbe: Was man sieht, ist was
 * gespeichert wird.
 *
 * Hochkant passt zum Telefon, das ohnehin so in der Hand liegt. Wer
 * eine quer beschriebene Karte hat, dreht sie unter der Kamera.
 */
const POSTKARTE = 105 / 148;

interface Ergebnis {
  id: number;
  ok: boolean;
  text: string;
  bewertung?: number;
  zitat?: string;
  /** Die Kennung der abgelegten Karte, fuer "Nochmal aufnehmen". */
  kartenId?: string;
}

async function verkleinern(datei: Blob): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, BREITE / Math.max(bild.width, bild.height));
  const b = Math.round(bild.width * faktor);
  const h = Math.round(bild.height * faktor);
  const leinwand = document.createElement("canvas");
  leinwand.width = b;
  leinwand.height = h;
  const stift = leinwand.getContext("2d");
  if (!stift) throw new Error("Der Browser kann das Bild nicht verkleinern.");
  stift.drawImage(bild, 0, 0, b, h);
  bild.close();
  return await new Promise<Blob>((fertig, schief) =>
    leinwand.toBlob((x) => (x ? fertig(x) : schief(new Error("Kein Bild"))), "image/jpeg", 0.88),
  );
}

/**
 * Der Teil des Kamerabilds, der im Postkartenrahmen zu sehen ist.
 *
 * Das Bild der Kamera hat ein anderes Mass als die Karte. Gezeigt und
 * aufgenommen wird deshalb ein mittiger Ausschnitt, und dieselbe
 * Rechnung braucht auch die automatische Auslösung.
 */
function sichtbarerStreifen(v: HTMLVideoElement): { x: number; y: number; b: number; h: number } {
  const breit = v.videoWidth / v.videoHeight > POSTKARTE;
  const b = breit ? v.videoHeight * POSTKARTE : v.videoWidth;
  const h = breit ? v.videoHeight : v.videoWidth / POSTKARTE;
  return { x: (v.videoWidth - b) / 2, y: (v.videoHeight - h) / 2, b, h };
}


/*
  Keine Frage nach der Einwilligung beim Scannen.

  "wir legen gar keine aus ohne dass das geklaert ist. beim scan ist es
  nicht mehr entscheidend. der mitarbeiter kriegt nur welche die OK
  sind" (Florian, 27.10.2026). Die Karten im Foyer tragen den Hinweis
  also schon, und wer im Foyer steht, soll nicht etwas bestaetigen,
  das laengst entschieden ist.
*/
export function PostkartenScanner() {
  const router = useRouter();

  const [kameraAn, setKameraAn] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offen, setOffen] = useState(0);
  const [fertig, setFertig] = useState(0);
  const [liste, setListe] = useState<Ergebnis[]>([]);
  const [blitz, setBlitz] = useState(false);
  /*
    Die Rueckmeldung nach einer gelesenen Karte.

    "wenn gescannt wurde, es geklappt hat, muss ein feedback kommen.
    z.b. daumen hoch oder was auch immer.. dann scannt man nicht
    zweimal die selbe karte" (Florian, 02.11.2026).

    Die Liste darunter waechst zwar, aber wer die Karte unter die
    Kamera haelt, schaut auf die Kamera und nicht auf eine Zeile Text.
    Deshalb gross, mitten ins Bild, und nach ein paar Sekunden wieder
    weg.
  */
  const [quittung, setQuittung] = useState<Ergebnis | null>(null);
  /*
    Die zuletzt gespeicherte Karte, zum Verwerfen.

    "es braucht auch einen zurück (bzw. nochmal) button, wenn man mit
    der aufnahme nicht zufrieden ist! bitte einblenden nach dem scan"
    (Florian, 02.11.2026).

    Seit die Karten nachts gelesen werden, sieht beim Scannen niemand
    mehr, ob das Foto etwas taugt. Verwackelt, Schatten quer ueber der
    Schrift, Finger im Bild: Das faellt sonst erst am naechsten Morgen
    auf, und dann liegt die Karte nicht mehr auf dem Tisch.

    Der Knopf bleibt stehen, bis die naechste Karte aufgenommen ist.
    Die Quittung im Bild ist nach zwei Sekunden weg, und so lange
    bekommt niemand eine Entscheidung hin.
  */
  const [letzte, setLetzte] = useState<string | null>(null);
  const [verwirft, setVerwirft] = useState(false);
  /*
    Wie oft hintereinander es schiefging.

    Am 02.11.2026 stand im Foyer fuenfmal untereinander derselbe
    Fehler: Das Guthaben beim Lesedienst war leer, und die automatische
    Ausloesung schoss munter weiter. Nach drei Fehlschlaegen in Folge
    schaltet sie sich deshalb selbst ab. Ein Fehler, der sich nicht von
    allein behebt, wird durch Wiederholen nur teurer.
  */
  const [pannen, setPannen] = useState(0);

  const video = useRef<HTMLVideoElement | null>(null);
  const feld = useRef<HTMLInputElement | null>(null);
  const strom = useRef<MediaStream | null>(null);
  /* Die Hochladungen laufen nacheinander, damit das Lesen am Server
     nicht fuenf Karten gleichzeitig bekommt. */
  const schlange = useRef<Promise<void>>(Promise.resolve());
  const naechsteId = useRef(0);

  /** Eine Aufnahme in die Warteschlange legen. */
  const hochladen = useCallback(
    (bild: Blob) => {
      const id = naechsteId.current++;
      setOffen((n) => n + 1);
      schlange.current = schlange.current.then(async () => {
        try {
          const klein = await verkleinern(bild);
          const form = new FormData();
          form.append("foto", new File([klein], "karte.jpg", { type: "image/jpeg" }));
          form.append("einwilligung", "erteilt");

          const antwort = await fetch("/postkarten/hochladen", { method: "POST", body: form });
          const d = (await antwort.json()) as {
            ok: boolean;
            gelesen?: boolean;
            dublette?: boolean;
            wartet?: boolean;
            karte?: { id?: string };
            fehler?: string;
            hinweis?: string;
          };

          let e: Ergebnis;
          if (!d.ok) {
            e = { id, ok: false, text: d.fehler ?? "Fehler" };
          } else if (!d.gelesen) {
            e = { id, ok: false, text: d.hinweis ?? "Keine Postkarte erkannt." };
          } else if (d.dublette) {
            e = { id, ok: true, text: "Diese Karte ist schon da." };
          } else if (d.wartet) {
            /*
              Gelesen wird nachts (Florian, 02.11.2026). Hier steht
              deshalb kein Zitat mehr, sondern nur, dass die Karte
              sicher liegt.
            */
            e = {
              id,
              ok: true,
              text: "Gespeichert. Gelesen wird sie heute Nacht.",
              kartenId: d.karte?.id,
            };
          } else {
            /* Seit der Nachtlesung sollte dieser Fall nicht mehr vorkommen. */
            e = { id, ok: true, text: "Gespeichert.", kartenId: d.karte?.id };
          }
          setListe((l) => [e, ...l]);
          setQuittung(e);
          if (e.kartenId) setLetzte(e.kartenId);
          if (e.ok) {
            setFertig((n) => n + 1);
            setPannen(0);
          } else {
            setPannen((n) => {
              /* Nach drei Fehlschlaegen in Folge loest nichts mehr von
                 selbst aus: Ein Fehler, der sich nicht von allein
                 behebt, wird durch Wiederholen nur teurer. */
              return n + 1;
            });
          }
        } catch (f) {
          const schiefgegangen: Ergebnis = {
            id,
            ok: false,
            text: f instanceof Error ? f.message : "Fehler beim Hochladen",
          };
          setListe((l) => [schiefgegangen, ...l]);
          setQuittung(schiefgegangen);
          setPannen((n) => {
            return n + 1;
          });
        } finally {
          setOffen((n) => n - 1);
        }
      });
    },
    [],
  );

  /** Das laufende Bild festhalten. */
  const ausloesen = useCallback(() => {
    const v = video.current;
    if (!v || v.videoWidth === 0) return;
    /*
      Aufgenommen wird genau der Streifen, der zu sehen ist.

      Das Bild der Kamera hat ein anderes Mass als die Karte. Ohne
      diesen Zuschnitt lieferte die Aufnahme den vollen Kamerablick
      samt Tischkante, waehrend auf dem Bildschirm die Karte
      formatfuellend stand (Florian, 02.11.2026).
    */
    const a = sichtbarerStreifen(v);
    const leinwand = document.createElement("canvas");
    leinwand.width = Math.round(a.b);
    leinwand.height = Math.round(a.h);
    const stift = leinwand.getContext("2d");
    if (!stift) return;
    stift.drawImage(v, a.x, a.y, a.b, a.h, 0, 0, leinwand.width, leinwand.height);
    setBlitz(true);
    window.setTimeout(() => setBlitz(false), 180);
    leinwand.toBlob((b) => b && hochladen(b), "image/jpeg", 0.92);
  }, [hochladen]);

  /* Die Kamera an- und wieder ausschalten. */
  useEffect(() => {
    if (!kameraAn) return;
    let abgebrochen = false;

    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 } },
          audio: false,
        });
        if (abgebrochen) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        strom.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
      } catch {
        setMeldung(
          "Die Kamera lässt sich nicht öffnen. Erlaube den Zugriff im Browser, oder nimm den "
          + "Knopf darunter und fotografiere wie bisher.",
        );
        setKameraAn(false);
      }
    })();

    return () => {
      abgebrochen = true;
      strom.current?.getTracks().forEach((t) => t.stop());
      strom.current = null;
    };
  }, [kameraAn]);


  /*
    Die Quittung bleibt ein paar Sekunden stehen.

    Lang genug, um sie im Vorbeigehen zu sehen, kurz genug, um die
    naechste Karte nicht zu verdecken. Bei einem Fehler laenger: Den
    soll man wirklich lesen.
  */
  useEffect(() => {
    if (!quittung) return;
    const t = window.setTimeout(() => setQuittung(null), quittung.ok ? 2200 : 5000);
    return () => window.clearTimeout(t);
  }, [quittung]);

  /* Die Liste unten zeigt neue Karten erst nach dem Nachladen. */
  useEffect(() => {
    if (fertig === 0 || offen > 0) return;
    const t = window.setTimeout(() => router.refresh(), 1200);
    return () => window.clearTimeout(t);
  }, [fertig, offen, router]);

  async function ausDateien(dateien: File[]) {
    for (const d of dateien) hochladen(d);
    if (feld.current) feld.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold bg-gold-hell/40 p-4">
      {/*
        Welche Karten ueberhaupt gescannt werden.

        "schreib bei den postkarten rein, dass bitte außergewöhnlich
        lobende Karten, besonders aussehende usw. gescannt werden. nur
        viele grüße - oder war toll ist zu wenig!" (Florian,
        02.11.2026).

        Steht ganz oben und nicht unter "So werden die Karten am besten
        lesbar": Das dort beantwortet, WIE fotografiert wird. Hier geht
        es um die Frage davor, ob diese Karte ueberhaupt eine ist. Wer
        jede Karte scannt, fuellt die Liste mit "War schoen" und die
        wirklich guten gehen darin unter.
      */}
      <div className="rounded-md border border-gold bg-flaeche px-3 py-2 text-sm">
        <strong>Welche Karten kommen hier hinein?</strong> Die außergewöhnlichen: wer
        schwärmt, wer eine Geschichte erzählt, wer schreibt, was der Abend mit ihm gemacht
        hat. Auch die besonders schön gestalteten, mit Zeichnung oder in bunter Schrift.
        <div className="mt-1 text-leise">
          Nicht jede Karte. &bdquo;Viele Grüße&ldquo; oder &bdquo;war toll&ldquo; ist zu wenig,
          das steht auf hunderten. Lieber fünf Karten, die man gerne liest, als fünfzig, die
          niemand zu Ende liest.
        </div>
      </div>

      {meldung && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          {meldung}
        </p>
      )}

      {kameraAn && (
        <div className="space-y-2">
          {/*
            Der Rahmen hat das Format einer Postkarte, hochkant.

            So fuellt die Karte das Bild aus, und es bleibt kein Schwarz
            mehr stehen (Florian, 02.11.2026). Hochkant, weil das Telefon
            ohnehin so in der Hand liegt.
            Aufgenommen wird genau dieser Streifen, siehe ausloesen.
          */}
          <div
            className="relative overflow-hidden rounded-lg bg-black"
            style={{ aspectRatio: "105 / 148", maxHeight: "65vh", margin: "0 auto" }}
          >
            <video
              ref={video}
              playsInline
              muted
              className="block h-full w-full object-cover"
            />
            {blitz && <div className="absolute inset-0 bg-white/70" />}
            {/* Die Hilfslinie sitzt knapp innen: Legt man die Karte daran
                aus, ist sie ganz drauf und nichts wird abgeschnitten. */}
            <div className="pointer-events-none absolute inset-3 rounded-md border-2 border-white/40" />

            {/*
              Der Haken ueber dem Bild, gross genug fuers Foyer.

              "wenn gescannt wurde, es geklappt hat, muss ein feedback
              kommen. z.b. daumen hoch oder was auch immer.. dann scannt
              man nicht zweimal die selbe karte" (Florian, 02.11.2026).

              Gezeichnet, nicht als Zeichen aus der Schrift: Ein Haken,
              der sich selbst malt, sieht man auch aus zwei Metern und
              mit dem Telefon in der Hand.
            */}
            {quittung && (
              <div
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
                style={{ background: quittung.ok ? "rgba(21,128,61,.82)" : "rgba(153,27,27,.82)" }}
              >
                <svg width="104" height="104" viewBox="0 0 48 48" aria-hidden="true">
                  <circle cx="24" cy="24" r="21" fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.65" />
                  {quittung.ok ? (
                    <path
                      d="M14 24.5 L21 31.5 L34.5 17"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: "fzt-haken .35s ease-out forwards" }}
                    />
                  ) : (
                    <g stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
                      <path d="M16 16 L32 32" />
                      <path d="M32 16 L16 32" />
                    </g>
                  )}
                </svg>
                <div className="px-6 text-white">
                  <p className="text-2xl font-semibold">
                    {quittung.ok ? "Karte gelesen" : "Nicht gelesen"}
                  </p>
                  <p className="mt-1 text-sm opacity-90">{quittung.text}</p>
                  <p className="mt-2 text-sm font-medium">
                    {quittung.ok
                      ? "Die nächste Karte kann darüber."
                      : "Bitte noch einmal fotografieren."}
                  </p>
                </div>
                <style>{"@keyframes fzt-haken{to{stroke-dashoffset:0}}"}</style>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={ausloesen}
              className="rounded-md border border-gold bg-flaeche px-5 py-2.5 text-sm font-medium hover:bg-gold-hell"
            >
              Jetzt aufnehmen
            </button>
            {/*
              Nicht zufrieden? Die letzte Aufnahme wieder weg.

              "es braucht auch einen zurück (bzw. nochmal) button, wenn
              man mit der aufnahme nicht zufrieden ist! bitte einblenden
              nach dem scan" (Florian, 02.11.2026).
            */}
            {letzte && (
              <button
                type="button"
                disabled={verwirft}
                onClick={() => {
                  const id = letzte;
                  setVerwirft(true);
                  void fetch("/postkarten/nochmal", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id }),
                  })
                    .then(async (a) => {
                      const d = (await a.json().catch(() => ({}))) as { ok?: boolean; fehler?: string };
                      if (!a.ok || !d.ok) throw new Error(d.fehler ?? "Das ging nicht.");
                      setLetzte(null);
                      setListe((l) => l.filter((x) => x.kartenId !== id));
                      setFertig((n) => Math.max(0, n - 1));
                      setQuittung({
                        id: Date.now(),
                        ok: true,
                        text: "Aufnahme verworfen. Bitte noch einmal fotografieren.",
                      });
                    })
                    .catch((f: unknown) =>
                      setMeldung(f instanceof Error ? f.message : "Das ging nicht."),
                    )
                    .finally(() => setVerwirft(false));
                }}
                className="rounded-md border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
              >
                {verwirft ? "wird verworfen..." : "Letzte Aufnahme verwerfen"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setKameraAn(false)}
              className="text-sm text-leise underline"
            >
              Kamera schließen
            </button>
            {offen > 0 && (
              <span className="text-sm text-leise">
                {offen} {offen === 1 ? "Karte wird" : "Karten werden"} gelesen...
              </span>
            )}
          </div>

          {pannen >= 3 && (
            <p
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
            >
              <strong>Dreimal hintereinander ging es schief.</strong> Die automatische Auslösung
              ist aus, damit nicht weiter ins Leere fotografiert wird. Lies die Meldung darunter,
              und versuch es danach von Hand noch einmal.
            </p>
          )}

          {/*
            Nur noch auf Knopfdruck.

            "diese automatisch scannen funktion ist nicht gut - schau
            mal rein, es sind einige scans die schrott sind - diese
            bitte raus wo in die luft gescant wurde. bitte nur noch auf
            knopfdruck scannen" (Florian, 02.11.2026).

            Die Automatik loeste aus, sobald das Bild stillstand und
            anders aussah als bei der letzten Aufnahme. Beides stimmte
            auch dann, wenn gerade gar keine Karte dalag: Der leere
            Tisch steht still und sieht anders aus als die Karte davor.
            So entstanden Aufnahmen von nichts, und die kosten in der
            Nachtlesung dasselbe wie eine echte Karte.
          */}
          <p className="text-xs text-leise">
            Leg eine Karte hin und tippe auf aufnehmen. Die Kamera bleibt offen, die nächste
            Karte kommt einfach darüber.
          </p>
        </div>
      )}

      {!kameraAn && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMeldung(null);
              setKameraAn(true);
            }}
            className="rounded-md border border-gold bg-flaeche px-4 py-2 text-sm font-medium hover:bg-gold-hell"
          >
            Kamera öffnen und Karte für Karte scannen
          </button>

          <label className="cursor-pointer text-sm text-leise underline">
            <input
              ref={feld}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const dateien = Array.from(e.target.files ?? []);
                if (dateien.length > 0) void ausDateien(dateien);
              }}
            />
            oder Bilder vom Gerät auswählen
          </label>

          {offen > 0 && (
            <span className="text-sm text-leise">
              {offen} {offen === 1 ? "Karte wird" : "Karten werden"} gelesen...
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-leise">
        Die Bilder werden im Browser verkleinert und gespeichert. Gelesen und bewertet werden
        sie in der Nacht, am nächsten Morgen stehen die Ergebnisse unter &bdquo;Postkarten&ldquo;.
        Das Original bleibt intern, öffentlich wird später nur eine geschwärzte Fassung.
      </p>

      {/*
        Wie man eine Handschrift fotografiert, damit sie lesbar wird
        (Florian, 27.10.2026, zur Frage nach dem Blitz). Der Blitz steht
        bewusst nicht an erster Stelle: Auf glattem Karton wirft er einen
        hellen Fleck mitten ins Bild, und genau dort steht oft der beste
        Satz. Helles Zimmerlicht schlaegt den Blitz fast immer.
      */}
      <details className="text-xs text-leise">
        <summary className="cursor-pointer">So werden die Karten am besten lesbar</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Helles Licht von vorne oder von der Seite, am besten Tageslicht am Fenster.</li>
          <li>
            Nicht über die Karte beugen: Der eigene Schatten liegt sonst genau auf der Schrift.
          </li>
          <li>Die Karte soll das Bild möglichst ganz ausfüllen, gerade von oben fotografiert.</li>
          <li>
            Blitz nur, wenn es wirklich dunkel ist, und dann schräg von der Seite. Direkt von
            vorne macht er auf glattem Karton einen weißen Fleck, und die Stelle ist weg.
          </li>
          <li>Bleistift und helle Tinte: lieber zweimal fotografieren, das Lesen ist dort schwer.</li>
        </ul>
      </details>

      {liste.length > 0 && (
        <ul className="space-y-1 text-sm">
          {liste.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2">
              <span style={{ color: e.ok ? "var(--gut)" : "var(--blocker)" }}>
                {e.ok ? "gelesen" : "nicht gelesen"}
              </span>
              <span className="text-leise">{e.text}</span>
              {e.zitat && <span className="italic">„{e.zitat.slice(0, 90)}“</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
