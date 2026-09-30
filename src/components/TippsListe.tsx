"use client";

import { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { reiheSpeichern, reiheWeg, tippLoeschenAktion, tippSpeichern } from "@/app/tipps/aktionen";
import { tippsFiltern, type Tipp } from "@/lib/tipps/filter";

/** Eine mehrteilige Anleitung, wie sie von der Seite hereinkommt. */
export interface ReiheAnsicht {
  id: string;
  titel: string;
  beschreibung: string;
  schlagworte: string;
  erstelltVon: string;
  schritte: Tipp[];
}

/**
 * Tipps & Tricks: Suche, Videos ansehen, neue hochladen.
 *
 * Der Upload läuft direkt vom Browser zu Vercel Blob (siehe
 * app/tipps/hochladen/route.ts), an diesem Server vorbei: Videos sind
 * dafür zu groß. Erst wenn die Datei oben ist, legt eine Server-Aktion
 * den Eintrag mit der fertigen Adresse an (Florian, 28.09.2026).
 */
export function TippsListe({
  tipps,
  reihen = [],
  darfHochladen,
  darfLoeschen,
}: {
  tipps: Tipp[];
  reihen?: ReiheAnsicht[];
  darfHochladen: boolean;
  darfLoeschen: boolean;
}) {
  const [suche, setSuche] = useState("");
  const gefiltert = useMemo(() => tippsFiltern(tipps, suche), [tipps, suche]);
  /*
    Die Anleitungen durchsucht dieselbe Suche.

    Gesucht wird ueber Titel, Beschreibung, Schlagworte und zusaetzlich
    ueber die Titel der einzelnen Schritte: Wer "Pult" eingibt, soll die
    Anleitung "Show einschalten" finden, auch wenn das Wort nur in einem
    ihrer Schritte vorkommt (Florian, 29.09.2026).
  */
  const reihenGefiltert = useMemo(() => {
    const woerter = suche.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (woerter.length === 0) return reihen;
    return reihen.filter((r) => {
      const text = `${r.titel} ${r.beschreibung} ${r.schlagworte} ${r.schritte
        .map((s) => s.titel)
        .join(" ")}`.toLowerCase();
      return woerter.every((x) => text.includes(x));
    });
  }, [reihen, suche]);

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="Suchen, z. B. „Akku laden“"
        className="w-full max-w-sm"
        aria-label="Tipps durchsuchen"
      />

      {darfHochladen && (
        <div className="flex flex-wrap gap-3">
          <HochladenFormular />
          <ReiheFormular />
        </div>
      )}

      {/* Die Anleitungen zuerst: Sie sind das, was man wirklich lernen muss. */}
      {reihenGefiltert.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
            Anleitungen in mehreren Schritten
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reihenGefiltert.map((r) => (
              <ReihenKarte key={r.id} reihe={r} darfLoeschen={darfLoeschen} />
            ))}
          </ul>
        </section>
      )}

      {reihenGefiltert.length > 0 && gefiltert.length > 0 && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Einzelne Videos</h2>
      )}

      {gefiltert.length === 0 && reihenGefiltert.length === 0 ? (
        <p className="text-sm text-leise">
          {tipps.length === 0 && reihen.length === 0
            ? "Noch keine Tipps hochgeladen."
            : "Nichts gefunden."}
        </p>
      ) : (
        gefiltert.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gefiltert.map((t) => (
              <TippKarte key={t.id} tipp={t} darfLoeschen={darfLoeschen} />
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function TippKarte({ tipp, darfLoeschen }: { tipp: Tipp; darfLoeschen: boolean }) {
  return (
    <li className="space-y-2 rounded-lg border border-linie bg-flaeche p-3">
      <TippInhalt tipp={tipp} />
      <div>
        <h3 className="font-semibold leading-snug">{tipp.titel}</h3>
        {tipp.beschreibung && <p className="mt-1 text-sm text-leise">{tipp.beschreibung}</p>}
      </div>
      <p className="text-xs text-leise">von {tipp.erstelltVon}</p>
      {darfLoeschen && (
        <form action={tippLoeschenAktion}>
          <input type="hidden" name="id" value={tipp.id} />
          <button type="submit" className="text-xs text-leise underline">
            löschen
          </button>
        </form>
      )}
    </li>
  );
}

function HochladenFormular() {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [fehler, setFehler] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function absenden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFehler("");
    const form = e.currentTarget;
    const daten = new FormData(form);
    const datei = daten.get("video");
    const titel = String(daten.get("titel") ?? "").trim();
    const notiz = String(daten.get("notiz") ?? "").trim();
    const hatDatei = datei instanceof File && datei.size > 0;

    if (!titel) {
      setFehler("Bitte einen Titel eintragen.");
      return;
    }
    /*
      Datei oder Text, eines von beiden muss da sein.

      Nicht zu jeder Anleitung gehoert ein Video: Manchmal ist es ein PDF,
      manchmal nur ein Text, den jemand herauskopiert hat
      (Florian, 30.09.2026).
    */
    if (!hatDatei && !notiz) {
      setFehler("Bitte eine Datei auswählen oder einen Text schreiben.");
      return;
    }

    setLaeuft(true);
    setFortschritt(0);
    try {
      const speichern = new FormData();
      if (hatDatei) {
        const blob = await upload(datei.name, datei, {
          access: "public",
          handleUploadUrl: "/tipps/hochladen",
          onUploadProgress: (p) => setFortschritt(Math.round(p.percentage)),
        });
        speichern.set("videoUrl", blob.url);
        speichern.set("videoTyp", blob.contentType ?? datei.type);
        speichern.set("dateiName", datei.name);
      }
      speichern.set("titel", titel);
      speichern.set("notiz", notiz);
      speichern.set("beschreibung", String(daten.get("beschreibung") ?? ""));
      speichern.set("schlagworte", String(daten.get("schlagworte") ?? ""));
      await tippSpeichern(speichern);
      // tippSpeichern leitet bei Erfolg um (redirect), das Zurücksetzen
      // hier greift nur, wenn die Umleitung aus irgendeinem Grund ausbleibt.
      form.reset();
      setOffen(false);
    } catch (f) {
      // redirect() wirft technisch einen Fehler, um die Navigation
      // auszulösen: Den nicht als echten Fehler behandeln.
      if (f instanceof Error && f.message === "NEXT_REDIRECT") throw f;
      setFehler(f instanceof Error ? f.message : "Hochladen fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
      >
        + Video, Datei oder Notiz
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={absenden}
      className="space-y-3 rounded-lg border border-linie bg-flaeche p-4"
    >
      <h2 className="font-semibold">Video, Datei oder Notiz</h2>
      <p className="text-xs text-leise">
        Ein Video, ein PDF wie ein Datenblatt, oder einfach ein Text zum Hineinkopieren. Eines von beidem
        reicht.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Titel</span>
        <input name="titel" required maxLength={200} placeholder="z. B. 12-V-Akkus laden" className="w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Beschreibung, freiwillig</span>
        <textarea name="beschreibung" maxLength={2000} rows={2} className="w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Schlagworte, freiwillig, mit denen man das Video finden soll (z. B. „Akku Batterie Blei LiPo laden“)
        </span>
        <input name="schlagworte" maxLength={500} className="w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Video oder Datei, freiwillig</span>
        <input type="file" name="video" accept="video/*,application/pdf,image/*,.doc,.docx,.xlsx,.csv,.txt" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Text, freiwillig. Hier kannst du auch etwas hineinkopieren.
        </span>
        <textarea name="notiz" maxLength={20000} rows={4} className="w-full" />
      </label>

      {laeuft && (
        <div className="h-2 overflow-hidden rounded-full bg-linie">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${fortschritt}%` }}
          />
        </div>
      )}
      {fehler && <p className="text-sm" style={{ color: "var(--blocker)" }}>{fehler}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={laeuft}
          className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {laeuft ? `Wird hochgeladen... ${fortschritt}%` : "Hochladen"}
        </button>
        <button type="button" onClick={() => setOffen(false)} disabled={laeuft} className="text-sm text-leise underline">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

/**
 * Eine Anleitung in der Uebersicht.
 *
 * Kein Video zum Abspielen, sondern der Weg hinein: Wer "Show einschalten"
 * sucht, will nicht das dritte Video sehen, sondern anfangen.
 */
function ReihenKarte({ reihe, darfLoeschen }: { reihe: ReiheAnsicht; darfLoeschen: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-gold bg-gold-hell p-4">
      <Link href={`/tipps/reihe/${reihe.id}`} className="space-y-1">
        <h3 className="font-semibold leading-snug">{reihe.titel}</h3>
        <p className="text-sm">
          {reihe.schritte.length} {reihe.schritte.length === 1 ? "Schritt" : "Schritte"} nacheinander
        </p>
        {reihe.beschreibung && <p className="text-sm text-leise">{reihe.beschreibung}</p>}
      </Link>
      <ol className="mt-1 space-y-0.5 text-xs text-leise">
        {reihe.schritte.slice(0, 4).map((s, i) => (
          <li key={s.id}>
            {i + 1}. {s.titel}
          </li>
        ))}
        {reihe.schritte.length > 4 && <li>und {reihe.schritte.length - 4} weitere</li>}
      </ol>
      <div className="mt-auto flex items-center justify-between pt-2">
        <Link href={`/tipps/reihe/${reihe.id}`} className="text-sm font-medium underline">
          Anleitung starten
        </Link>
        {darfLoeschen && (
          <form action={reiheWeg}>
            <input type="hidden" name="id" value={reihe.id} />
            <button type="submit" className="text-xs text-leise underline">
              löschen
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * Mehrere Videos auf einmal hochladen, als Anleitung in Schritten.
 *
 * Die Reihenfolge kommt aus den Dateinamen, denn so werden solche Videos
 * aufgenommen: "1 Strom an.mp4", "2 Pult hochfahren.mp4". Verschieben geht
 * trotzdem, und der Titel jedes Schritts laesst sich vorher aendern
 * (Florian, 29.09.2026).
 */
function ReiheFormular() {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [stand, setStand] = useState("");
  const [fortschritt, setFortschritt] = useState(0);
  const [fehler, setFehler] = useState("");
  // Ein Schritt ist entweder eine Datei oder ein Text.
  const [dateien, setDateien] = useState<Array<{ datei: File | null; titel: string; notiz: string }>>([]);

  function dateienWaehlen(liste: FileList | null) {
    if (!liste) return;
    /*
      Nach Dateinamen sortieren, mit Zahlen als Zahlen.

      Sonst stuende "10 Licht" vor "2 Pult", und genau dieser Fehler faellt
      erst auf, wenn jemand die Anleitung durchgeht.
    */
    const sortiert = [...liste].sort((a, b) =>
      a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }),
    );
    setDateien(
      sortiert.map((datei) => ({
        datei,
        notiz: "",
        // Nummer und Endung weg, Unterstriche zu Leerzeichen: Aus
        // "1_strom_an.mp4" wird "strom an".
        titel: datei.name
          .replace(/\.[^.]+$/, "")
          .replace(/^[\s\d._-]+/, "")
          .replace(/[_-]+/g, " ")
          .trim(),
      })),
    );
  }

  function verschieben(i: number, richtung: -1 | 1) {
    const ziel = i + richtung;
    if (ziel < 0 || ziel >= dateien.length) return;
    const neu = [...dateien];
    [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
    setDateien(neu);
  }

  async function absenden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFehler("");
    const form = e.currentTarget;
    const daten = new FormData(form);
    const titel = String(daten.get("titel") ?? "").trim();

    if (!titel) {
      setFehler("Bitte einen Titel für die Anleitung eintragen.");
      return;
    }
    if (dateien.length === 0) {
      setFehler("Bitte die Videos auswählen oder einen Textschritt hinzufügen.");
      return;
    }
    if (dateien.some((d) => !d.datei && !d.notiz.trim())) {
      setFehler("Ein Textschritt ohne Text geht nicht. Bitte ausfüllen oder entfernen.");
      return;
    }

    setLaeuft(true);
    try {
      const schritte: Array<{
        titel: string;
        videoUrl: string;
        videoTyp: string;
        notiz: string;
        dateiName: string;
      }> = [];
      for (const [i, d] of dateien.entries()) {
        if (!d.datei) {
          // Ein reiner Textschritt wird nicht hochgeladen, er steht gleich da.
          schritte.push({
            titel: d.titel || `Schritt ${i + 1}`,
            videoUrl: "",
            videoTyp: "",
            notiz: d.notiz,
            dateiName: "",
          });
          continue;
        }
        setStand(`Datei ${i + 1} von ${dateien.length}`);
        setFortschritt(0);
        const blob = await upload(d.datei.name, d.datei, {
          access: "public",
          handleUploadUrl: "/tipps/hochladen",
          onUploadProgress: (p) => setFortschritt(Math.round(p.percentage)),
        });
        schritte.push({
          titel: d.titel || `Schritt ${i + 1}`,
          videoUrl: blob.url,
          videoTyp: blob.contentType ?? d.datei.type,
          notiz: d.notiz,
          dateiName: d.datei.name,
        });
      }

      setStand("Wird gespeichert...");
      const speichern = new FormData();
      speichern.set("titel", titel);
      speichern.set("beschreibung", String(daten.get("beschreibung") ?? ""));
      speichern.set("schlagworte", String(daten.get("schlagworte") ?? ""));
      speichern.set("schritte", JSON.stringify(schritte));
      await reiheSpeichern(speichern);
      form.reset();
      setDateien([]);
      setOffen(false);
    } catch (f) {
      if (f instanceof Error && f.message === "NEXT_REDIRECT") throw f;
      setFehler(f instanceof Error ? f.message : "Hochladen fehlgeschlagen.");
    } finally {
      setLaeuft(false);
      setStand("");
    }
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
      >
        + Anleitung in mehreren Schritten
      </button>
    );
  }

  return (
    <form onSubmit={absenden} className="w-full space-y-3 rounded-lg border border-linie bg-flaeche p-4">
      <h2 className="font-semibold">Anleitung in mehreren Schritten</h2>
      <p className="text-xs text-leise">
        Für alles, was man nicht in einem Video erklären kann. Die Videos werden nacheinander angesehen,
        deshalb zählt die Reihenfolge.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">Titel der Anleitung</span>
        <input name="titel" required maxLength={200} placeholder="z. B. Show einschalten" className="w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Worum geht es, freiwillig</span>
        <textarea name="beschreibung" maxLength={2000} rows={2} className="w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Schlagworte, freiwillig, mit denen man die Anleitung finden soll
        </span>
        <input name="schlagworte" maxLength={500} placeholder="Show Start Pult Licht Ton anschalten" className="w-full" />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Videos und Dateien, alle auf einmal auswählen. Die Reihenfolge kommt aus den Dateinamen und lässt
          sich unten ändern. Ein PDF geht genauso wie ein Video.
        </span>
        <input
          type="file"
          accept="video/*,application/pdf,image/*,.doc,.docx,.xlsx,.csv,.txt"
          multiple
          onChange={(e) => dateienWaehlen(e.target.files)}
        />
      </label>

      <button
        type="button"
        onClick={() =>
          setDateien((alt) => [...alt, { datei: null, titel: "", notiz: "" }])
        }
        disabled={laeuft}
        className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
      >
        + Schritt nur mit Text
      </button>

      {dateien.length > 0 && (
        <ol className="space-y-2">
          {dateien.map((d, i) => (
            <li key={(d.datei?.name ?? "text") + i} className="flex flex-wrap items-center gap-2 rounded-md border border-linie px-3 py-2">
              <span className="w-6 text-center font-semibold tabular-nums">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <input
                  value={d.titel}
                  onChange={(e) => {
                    const neu = [...dateien];
                    neu[i] = { ...neu[i], titel: e.target.value };
                    setDateien(neu);
                  }}
                  maxLength={200}
                  placeholder={d.datei ? "Titel" : "Titel des Textschritts"}
                  className="min-w-0"
                  aria-label={`Titel von Schritt ${i + 1}`}
                />
                {!d.datei && (
                  <textarea
                    value={d.notiz}
                    onChange={(e) => {
                      const neu = [...dateien];
                      neu[i] = { ...neu[i], notiz: e.target.value };
                      setDateien(neu);
                    }}
                    rows={3}
                    maxLength={20000}
                    placeholder="Text, den man in diesem Schritt lesen soll"
                    className="w-full text-sm"
                  />
                )}
              </span>
              <span className="text-xs text-leise">
                {d.datei ? `${Math.max(1, Math.round(d.datei.size / 1024 / 1024))} MB` : "Text"}
              </span>
              <button
                type="button"
                onClick={() => setDateien(dateien.filter((_, x) => x !== i))}
                disabled={laeuft}
                className="rounded border border-linie px-2 text-sm disabled:opacity-40"
                aria-label="Schritt entfernen"
              >
                &times;
              </button>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => verschieben(i, -1)}
                  disabled={i === 0 || laeuft}
                  className="rounded border border-linie px-2 text-sm disabled:opacity-40"
                  aria-label="nach oben"
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  onClick={() => verschieben(i, 1)}
                  disabled={i === dateien.length - 1 || laeuft}
                  className="rounded border border-linie px-2 text-sm disabled:opacity-40"
                  aria-label="nach unten"
                >
                  &darr;
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {laeuft && (
        <div className="space-y-1">
          <p className="text-xs text-leise">{stand}</p>
          <div className="h-2 overflow-hidden rounded-full bg-linie">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${fortschritt}%` }} />
          </div>
        </div>
      )}
      {fehler && <p className="text-sm" style={{ color: "var(--blocker)" }}>{fehler}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={laeuft}
          className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {laeuft
            ? stand || "Wird hochgeladen..."
            : `${dateien.length || ""} Schritte speichern`.trim()}
        </button>
        <button type="button" onClick={() => setOffen(false)} disabled={laeuft} className="text-sm text-leise underline">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

/**
 * Der Inhalt eines Eintrags: Video, Datei oder Notiz.
 *
 * Zu einer Anleitung gehoert nicht immer ein Video. Das Datenblatt als PDF
 * und der Text, den jemand irgendwo herauskopiert hat, gehoeren genauso
 * dazu (Florian, 30.09.2026).
 */
export function TippInhalt({ tipp }: { tipp: Tipp }) {
  if (tipp.art === "notiz") {
    return (
      <div className="whitespace-pre-line rounded-md border border-linie bg-flaeche p-3 text-sm">
        {tipp.notiz}
      </div>
    );
  }

  if (tipp.art === "datei") {
    const pdf = (tipp.videoTyp ?? "").includes("pdf");
    return (
      <div className="space-y-2">
        <a
          href={tipp.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-linie px-3 py-3 hover:bg-gold-hell"
        >
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-md text-xs font-semibold"
            style={{ background: "var(--gold-hell)", color: "var(--gold-dunkel)" }}
          >
            {pdf ? "PDF" : "Datei"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{tipp.dateiName || "Datei öffnen"}</span>
            <span className="text-xs text-leise">zum Ansehen antippen</span>
          </span>
        </a>
        {tipp.notiz && <p className="whitespace-pre-line text-sm text-leise">{tipp.notiz}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video controls preload="metadata" className="w-full rounded-md bg-black" src={tipp.videoUrl} />
      {tipp.notiz && <p className="whitespace-pre-line text-sm text-leise">{tipp.notiz}</p>}
    </div>
  );
}
