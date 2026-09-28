"use client";

import { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { tippLoeschenAktion, tippSpeichern } from "@/app/tipps/aktionen";
import { tippsFiltern, type Tipp } from "@/lib/tipps/filter";

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
  darfHochladen,
  darfLoeschen,
}: {
  tipps: Tipp[];
  darfHochladen: boolean;
  darfLoeschen: boolean;
}) {
  const [suche, setSuche] = useState("");
  const gefiltert = useMemo(() => tippsFiltern(tipps, suche), [tipps, suche]);

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

      {darfHochladen && <HochladenFormular />}

      {gefiltert.length === 0 ? (
        <p className="text-sm text-leise">
          {tipps.length === 0 ? "Noch keine Tipps hochgeladen." : "Nichts gefunden."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gefiltert.map((t) => (
            <TippKarte key={t.id} tipp={t} darfLoeschen={darfLoeschen} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TippKarte({ tipp, darfLoeschen }: { tipp: Tipp; darfLoeschen: boolean }) {
  return (
    <li className="space-y-2 rounded-lg border border-linie bg-flaeche p-3">
      <video controls preload="metadata" className="w-full rounded-md bg-black" src={tipp.videoUrl} />
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
    if (!(datei instanceof File) || datei.size === 0) {
      setFehler("Bitte ein Video auswählen.");
      return;
    }
    if (!titel) {
      setFehler("Bitte einen Titel eintragen.");
      return;
    }

    setLaeuft(true);
    setFortschritt(0);
    try {
      const blob = await upload(datei.name, datei, {
        access: "public",
        handleUploadUrl: "/tipps/hochladen",
        onUploadProgress: (p) => setFortschritt(Math.round(p.percentage)),
      });
      const speichern = new FormData();
      speichern.set("titel", titel);
      speichern.set("beschreibung", String(daten.get("beschreibung") ?? ""));
      speichern.set("schlagworte", String(daten.get("schlagworte") ?? ""));
      speichern.set("videoUrl", blob.url);
      speichern.set("videoTyp", blob.contentType ?? datei.type);
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
        + Video hochladen
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={absenden}
      className="space-y-3 rounded-lg border border-linie bg-flaeche p-4"
    >
      <h2 className="font-semibold">Video hochladen</h2>
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
        <span className="mb-1 block text-xs text-leise">Video</span>
        <input type="file" name="video" accept="video/*" required />
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
