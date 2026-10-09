import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfSelbstauskunftUebernehmen, darfStempeln, darfZeitenAendern } from "@/lib/auth/sitzung";
import { StempelUhr } from "@/components/StempelUhr";
import { geraetPruefen } from "@/lib/stempel/geraet";
import { NurAmHandy } from "@/components/NurAmHandy";
import { WerIstDaLive } from "@/components/WerIstDaLive";
import {
  antraege,
  antraegeVon,
  einstellungLesen,
  minutenOhnePause,
  pausengrundHeute,
  standVon,
  stempelAmTag,
  stempelDesMonats,
  stempelnde,
  stunden,
  werIstDa,
  type Stempel,
} from "@/lib/stempel/db";
import { aenderungenAmTag, antraegeAmTag, schichtAmTag, tagInWorten } from "@/lib/stempel/db";
import { alleKontostaende } from "@/lib/lohn/konto";
import { PAUSE_NACH_MINUTEN } from "@/lib/stempel/wache";
import { nachtschichtenAnhaengen, tagRechnen } from "@/lib/stempel/tag";
import { nachFamilienname } from "@/lib/domain/namen";
import {
  antragBeantworten,
  antragUebernehmenAktion,
  korrekturBeantragen,
  nachmeldungSenden,
  pausengrundSenden,
  sollzeitEintragen,
  sollzeitLoeschen,
  standortSpeichern,
  stempelLoeschen,
  stempelNachtragen,
  tagBerichtigenAktion,
  zeitKorrigieren,
} from "./aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

export const metadata = { title: "Stempeluhr | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const heuteBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

const BEZEICHNUNG: Record<Stempel["art"], string> = {
  kommen: "EIN-gestempelt",
  pause_start: "Pause begonnen",
  pause_ende: "Pause beendet",
  gehen: "AUS-gestempelt",
};

/**
 * Stempeluhr: EIN-stempeln, Pause, AUS-stempeln. Für interne Mitarbeiter.
 *
 * Die Mitarbeiter sehen bewusst nur ihren Zustand, keine Stunden und keine
 * Summen (Florian, 21.09.2026). Ändern dürfen die Zeiten Werner, Kevin und
 * Florian; alle anderen stellen einen Änderungswunsch.
 */
export default async function StempeluhrSeite({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; meldung?: string; wer?: string; tag?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  const { monat, meldung, wer, tag } = await searchParams;
  const buero = darfZeitenAendern(b);
  const stempelt = darfStempeln(b);
  // Gestempelt wird nur am Handy, siehe lib/stempel/geraet.ts.
  const kennung = (await headers()).get("user-agent");
  const amHandy = geraetPruefen(kennung).handy;
  /*
    Die Gerätekennung steht im Hinweis, gekürzt.

    Ohne sie ist "geht nicht" nicht zu klären: Am Telefon kann niemand
    sagen, als was sich sein Browser meldet (Florian, 27.09.2026).
  */
  const geraetekennung = (kennung ?? "unbekannt").slice(0, 120);
  if (!stempelt && !buero) redirect("/");

  const stand = stempelt ? await standVon(b.id) : null;
  const pauseFaellig = stand ? minutenOhnePause(stand) >= PAUSE_NACH_MINUTEN : false;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Stempeluhr</h1>
        <p className="mt-1 text-sm text-leise">
          {stempelt
            ? "Arbeitszeit und Pause stempeln. Das geht nur auf dem Gelände, dafür fragt das Programm deinen Standort ab."
            : "Zeiten der Mitarbeiter ansehen und korrigieren."}
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {stempelt && stand && (
        /*
          Am Rechner und am Tablet wird nicht gestempelt: Dort koennte jemand
          fuer einen anderen stempeln, und der Standort eines fest stehenden
          Geraets sagt nichts darueber aus, wer da ist (Florian, 23.09.2026).

          Ob es ein Handy ist, entscheidet zuerst der Server an der
          Browserkennung. Wo die danebenliegt, etwa beim iPhone mit
          eingeschalteter Desktop-Ansicht, sieht der Browser selbst nach
          (Florian, 27.09.2026).
        */
        <NurAmHandy
          vomServer={amHandy}
          sonst={
            <div
              className="rounded-lg border px-5 py-4"
              style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
            >
              <strong>Stempeln geht nur am Handy.</strong>
              <p className="mt-1 text-sm">
                Am Rechner und am Tablet ist das Stempeln abgeschaltet. Nimm dein Handy, melde dich dort an und
                stempel darüber ein und aus. Alles andere auf dieser Seite kannst du hier weiter benutzen.
              </p>
              <p className="mt-1 text-sm">
                Du bist am Handy und liest das trotzdem? Dann steht dein Browser auf Desktop-Ansicht. In Safari
                tippst du oben links auf &bdquo;AA&ldquo; und dann auf &bdquo;Mobile Website anfordern&ldquo;.
              </p>
              <p className="mt-1 text-sm text-leise">
                Du bist gerade {stand.zustand === "aus" ? "ausgestempelt" : stand.zustand === "pause" ? "in der Pause" : "eingestempelt"}.
              </p>
              <p className="mt-2 text-xs text-leise">Erkanntes Gerät: {geraetekennung}</p>
            </div>
          }
        >
          <StempelUhr start={stand.zustand} pauseFaellig={pauseFaellig} />
        </NurAmHandy>
      )}
      {stempelt && <PausenGrund benutzerId={b.id} offen={pauseFaellig} />}
      {stempelt && <Nachmeldung benutzerId={b.id} tag={tag} />}
      {stempelt && <MeineAntraege benutzerId={b.id} />}

      {buero && <WerIstDaKasten />}
      {buero && <Antraege duerfenUebernehmen={darfSelbstauskunftUebernehmen(b)} />}
      {buero && <Korrektur wer={wer} tag={tag} />}
      {buero && <Arbeitszeitkonto />}
      {buero && <Monatsuebersicht monat={monat} />}
      {b.rolle === "chef" && <Einrichtung />}
    </div>
  );
}

/**
 * Wer gerade da ist.
 *
 * Eigener Baustein, damit das Warten auf diese Liste nicht die ganze
 * Seite aufhaelt. Stand vorher ein `await` mitten in der Seite, begannen
 * die uebrigen Kaesten erst danach zu laden; als eigener Baustein laedt
 * er neben ihnen (Florian, 30.09.2026).
 */
async function WerIstDaKasten() {
  return <WerIstDaLive start={await werIstDa()} />;
}

/** "Warum ist die Pause ausgefallen?" Der Mitarbeiter schreibt es selbst dazu. */
async function PausenGrund({ benutzerId, offen }: { benutzerId: string; offen: boolean }) {
  const schonGeschrieben = await pausengrundHeute(benutzerId);
  return (
    <details id="pause" open={offen && !schonGeschrieben} className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Pause ist heute ausgefallen? Kurz erklären</summary>
      <p className="mt-2 text-leise">
        Länger als sechs Stunden ohne Pause ist in Deutschland nicht erlaubt (§ 4 Arbeitszeitgesetz). Daran müssen wir
        uns als Betrieb halten. Wenn es trotzdem einmal nicht anders ging, schreib bitte kurz dazu, woran es lag.
      </p>
      {schonGeschrieben && <p className="mt-2 text-leise">Für heute hast du schon etwas eingetragen. Danke!</p>}
      <form action={pausengrundSenden} className="mt-3 space-y-2">
        <textarea name="text" rows={3} maxLength={1000} placeholder="Zum Beispiel: Aufbau für die Firmenfeier, wir waren zu zweit." />
        <Absendeknopf text="Abschicken" laeuftText="..." />
      </form>
    </details>
  );
}

/** Wie ein Tag wirklich lief, nach einem vergessenen Ausstempeln. */
async function Nachmeldung({ benutzerId, tag }: { benutzerId: string; tag?: string }) {
  const derTag = /^\d{4}-\d{2}-\d{2}$/.test(tag ?? "") ? tag! : heuteBerlin();
  const stempelDesTages = await stempelAmTag(benutzerId, derTag);
  const kommen = stempelDesTages.find((s) => s.art === "kommen");
  const gehen = [...stempelDesTages].reverse().find((s) => s.art === "gehen");

  return (
    <details
      id="nachmelden"
      open={Boolean(tag)}
      className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm"
    >
      <summary className="cursor-pointer font-medium">Ausstempeln vergessen? Eintragen, wie es wirklich war</summary>
      <p className="mt-2 text-leise">
        Trag ein, wann du wirklich gegangen bist und ob du eine Pause gemacht hast. Florian oder Kevin übernehmen
        das dann mit einem Klick, ohne dass du lange schreiben musst.
      </p>
      <form action={nachmeldungSenden} className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Um welchen Tag geht es?</span>
          <input type="date" name="tag" defaultValue={derTag} required />
        </label>
        <p className="text-xs text-leise">
          {kommen
            ? `Eingestempelt hast du an dem Tag um ${uhr(kommen.zeitpunkt)} Uhr.`
            : "Für diesen Tag steht noch kein Einstempeln."}
          {gehen && ` Zuletzt (automatisch) ausgestempelt um ${uhr(gehen.zeitpunkt)} Uhr.`}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Wann bist du tatsächlich gegangen?</span>
          <input type="time" name="gehen" defaultValue={gehen ? uhr(gehen.zeitpunkt) : ""} required />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Pause von (falls gemacht)</span>
            <input type="time" name="pauseVon" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Pause bis</span>
            <input type="time" name="pauseBis" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Noch etwas dazu? (freiwillig)</span>
          <textarea name="text" rows={2} maxLength={500} placeholder="Zum Beispiel: Akku war leer." />
        </label>
        <Absendeknopf text="Abschicken" laeuftText="..." />
      </form>
    </details>
  );
}

/** Der Mitarbeiter bittet um eine Korrektur. Ändern darf er nichts selbst. */
async function MeineAntraege({ benutzerId }: { benutzerId: string }) {
  const meine = await antraegeVon(benutzerId, 6);
  const aenderungen = meine.filter((a) => a.art === "aenderung");
  return (
    <details id="antrag" className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Stimmt eine Zeit nicht? Änderung beantragen</summary>
      <p className="mt-2 text-leise">
        Schreib einfach, was nicht stimmt. Das Büro schaut es sich an und ändert es. Du bekommst eine Mail, sobald es
        erledigt ist.
      </p>
      <form action={korrekturBeantragen} className="mt-3 space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Um welchen Tag geht es?</span>
          <input type="date" name="tag" defaultValue={heuteBerlin()} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Was soll geändert werden?</span>
          <textarea
            name="text"
            rows={3}
            maxLength={1000}
            placeholder="Zum Beispiel: Ich habe um 23:30 Feierabend gemacht, das AUS-stempeln habe ich vergessen."
            required
          />
        </label>
        <Absendeknopf text="An das Büro schicken" laeuftText="Wird geschickt..." />
      </form>

      {aenderungen.length > 0 && (
        <ul className="mt-4 divide-y divide-linie border-t border-linie text-sm">
          {aenderungen.map((a) => (
            <li key={a.id} className="py-2">
              <span className="text-leise">{a.tag.split("-").reverse().join(".")}:</span> {a.text}
              <span className="block text-xs text-leise">
                {a.status === "offen"
                  ? "Liegt beim Büro."
                  : a.status === "angenommen"
                    ? `Angenommen${a.entschiedenVon ? ` von ${a.entschiedenVon}` : ""}.`
                    : `Abgelehnt${a.entschiedenVon ? ` von ${a.entschiedenVon}` : ""}.`}
                {a.antwort && ` ${a.antwort}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}


/** Offene Änderungswünsche und die Begründungen zu fehlenden Pausen. */
async function Antraege({ duerfenUebernehmen }: { duerfenUebernehmen: boolean }) {
  const alle = await antraege();
  const offen = alle.filter((a) => a.status === "offen");
  const gruende = alle.filter((a) => a.art === "pausengrund").slice(0, 8);

  return (
    <section id="antraege" className="scroll-mt-24 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
        Änderungswünsche{offen.length > 0 && ` (${offen.length} offen)`}
      </h2>
      {offen.length === 0 ? (
        <p className="text-sm text-leise">Nichts offen.</p>
      ) : (
        <div className="space-y-3">
          {offen.map((a) => {
            // Hat der Mitarbeiter Uhrzeiten angegeben (Nachmeldung), statt
            // nur einen freien Text zu schreiben?
            const zeiten = [
              a.vorschlagKommen && `Kommen ${uhr(a.vorschlagKommen)}`,
              a.vorschlagPauseStart && a.vorschlagPauseEnde && `Pause ${uhr(a.vorschlagPauseStart)}–${uhr(a.vorschlagPauseEnde)}`,
              a.vorschlagGehen && `Gehen ${uhr(a.vorschlagGehen)}`,
            ].filter(Boolean);

            return (
              <div key={a.id} className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
                <p className="font-medium">
                  {a.name} · {a.tag.split("-").reverse().join(".")}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{a.text}</p>

                {zeiten.length > 0 && (
                  <p className="mt-2 rounded-md px-3 py-2 text-sm font-medium" style={{ background: "var(--gold-hell)" }}>
                    Angegeben: {zeiten.join(" · ")}
                  </p>
                )}

                {zeiten.length > 0 && duerfenUebernehmen && (
                  <form action={antragUebernehmenAktion} className="mt-3">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-lg px-4 py-2 font-medium text-white" style={{ background: "var(--gut)" }}>
                      Übernehmen und bestätigen
                    </button>
                    <span className="ml-2 text-xs text-leise">Trägt die Zeiten direkt ein, mit Vermerk „Selbstauskunft“.</span>
                  </form>
                )}

                <form action={antragBeantworten} className="mt-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input name="antwort" maxLength={500} placeholder="Antwort (freiwillig)" className="mt-1" />
                  <div className="mt-2 flex gap-2">
                    <button name="status" value="angenommen" className="rounded-lg border border-linie px-4 py-2 font-medium">
                      Nur annehmen
                    </button>
                    <button name="status" value="abgelehnt" className="rounded-lg border border-linie px-4 py-2 font-medium">
                      Ablehnen
                    </button>
                  </div>
                  {zeiten.length === 0 && (
                    <p className="mt-2 text-xs text-leise">
                      Nach dem Annehmen die Zeit unten unter „Zeiten korrigieren“ eintragen.
                    </p>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      )}

      {gruende.length > 0 && (
        <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <summary className="cursor-pointer font-medium">Gemeldete Gründe für fehlende Pausen</summary>
          <ul className="mt-2 divide-y divide-linie">
            {gruende.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-leise">
                  {a.tag.split("-").reverse().join(".")} · {a.name}:
                </span>{" "}
                {a.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Zeiten einer Person an einem Tag ändern, nachtragen oder löschen. */
/** "+0:25 Stunden" oder "−0:10 Stunden", sonst "gleich geblieben". */
function unterschiedText(minuten: number): string {
  if (minuten === 0) return "gleich geblieben";
  const v = Math.abs(minuten);
  const zahl = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  return `${minuten > 0 ? "+" : "−"}${zahl} Stunden`;
}

async function Korrektur({ wer, tag }: { wer?: string; tag?: string }) {
  const leute = await stempelnde();
  const person = leute.find((p) => p.id === wer) ?? leute[0];
  const derTag = /^\d{4}-\d{2}-\d{2}$/.test(tag ?? "") ? tag! : heuteBerlin();
  // Die ganze Schicht, auch wenn sie nach Mitternacht endet: Bei
  // Showabenden ist das der Regelfall, nicht die Ausnahme.
  const [liste, aenderungen, kommentare] = person
    ? await Promise.all([
        schichtAmTag(person.id, derTag),
        aenderungenAmTag(person.id, derTag),
        antraegeAmTag(person.id, derTag),
      ])
    : [[], [], []];

  /*
    Was an diesem Tag gestempelt wurde, in einem Satz, und als Vorbelegung
    fuer das Tagesformular. Wer nur das Ausstempeln vergessen hat, muss das
    Kommen nicht noch einmal abtippen.
  */
  const roh = liste.map((x) => ({ art: x.art, ms: Date.parse(x.zeitpunkt), geaendertVon: x.geaendertVon }));
  const rechnung = tagRechnen(derTag, roh);
  const gestempelt = tagInWorten(roh, rechnung);
  /*
    Vorbelegt wird mit dem Gestempelten. Wo ein Stempel fehlt, springt
    die Zeit ein, die der Mitarbeiter selbst angegeben hat -- das ist
    genau der Fall, in dem er schreibt, er habe das Ausstempeln
    vergessen. Ein vorhandener Stempel wird dadurch nie ueberschrieben:
    Geaendert wird nur, was Florian selbst eintippt.
  */
  /*
    Sichtbar bleiben die Kommentare, bis der Tag wirklich berichtigt ist.

    Ein angenommener Antrag heisst noch nicht, dass die Zeiten stimmen:
    Steht keine Uhrzeit darin, aendert das Annehmen gar nichts. Genau so
    ist Olenas Hinweis zum 08.10. verschwunden, bevor er gebraucht wurde
    (Florian, 09.10.2026).
  */
  const tagBerichtigt = aenderungen.some((a) => a.was === "tag_berichtigt");
  const offeneKommentare = tagBerichtigt ? [] : kommentare;

  const angabe = kommentare.find(
    (k) => k.vorschlagKommen || k.vorschlagGehen || k.vorschlagPauseStart || k.vorschlagPauseEnde,
  );
  const vorschlag = {
    kommen: uhr(liste.find((x) => x.art === "kommen")?.zeitpunkt ?? "") || uhr(angabe?.vorschlagKommen ?? ""),
    pauseVon: uhr(liste.find((x) => x.art === "pause_start")?.zeitpunkt ?? "") || uhr(angabe?.vorschlagPauseStart ?? ""),
    pauseBis: uhr(liste.find((x) => x.art === "pause_ende")?.zeitpunkt ?? "") || uhr(angabe?.vorschlagPauseEnde ?? ""),
    gehen: uhr([...liste].reverse().find((x) => x.art === "gehen")?.zeitpunkt ?? "") || uhr(angabe?.vorschlagGehen ?? ""),
  };

  return (
    <section id="korrektur" className="scroll-mt-24 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Zeiten korrigieren</h2>

      <form method="get" action="/stempeluhr" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Wer</span>
          <select name="wer" defaultValue={person?.id}>
            {leute.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Tag</span>
          <input type="date" name="tag" defaultValue={derTag} />
        </label>
        <button className="rounded-lg border border-linie px-4 py-2 font-medium">Anzeigen</button>
      </form>

      {person && (
        <div className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          {liste.length === 0 ? (
            <p className="text-leise">
              {person.name} hat am {derTag.split("-").reverse().join(".")} nicht gestempelt.
            </p>
          ) : (
            <ul className="divide-y divide-linie">
              {liste.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-40">{BEZEICHNUNG[s.art]}</span>
                  {/*
                    Aendern heisst: Tag und Uhrzeit. Ein Stempel am
                    falschen Tag laesst sich so hinueberschieben, statt
                    ihn zu loeschen und neu anzulegen (Florian,
                    30.09.2026).
                  */}
                  <form action={zeitKorrigieren} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="tag" value={derTag} />
                    <input type="hidden" name="wer" value={person.id} />
                    <input type="date" name="neuerTag" defaultValue={derTag} className="w-40" aria-label="Tag" />
                    <input type="time" name="uhrzeit" defaultValue={uhr(s.zeitpunkt)} className="w-28" />
                    <input
                      name="grund"
                      placeholder="Grund (z. B. falscher Tag)"
                      maxLength={200}
                      className="w-56 text-sm"
                      aria-label="Grund der Änderung"
                    />
                    <button className="rounded-lg border border-linie px-3 py-1.5">Ändern</button>
                  </form>
                  <form action={stempelLoeschen} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="tag" value={derTag} />
                    <input type="hidden" name="wer" value={person.id} />
                    <input
                      name="grund"
                      placeholder="Grund"
                      maxLength={200}
                      className="w-40 text-sm"
                      aria-label="Grund der Löschung"
                    />
                    <button className="rounded-lg border border-linie px-3 py-1.5" style={{ color: "var(--blocker)" }}>
                      Löschen
                    </button>
                  </form>
                  {!s.imHaus && (
                    <span className="text-xs" style={{ color: "var(--warnung)" }}>
                      außerhalb{s.entfernungM ? `, ${s.entfernungM} m` : ""}
                    </span>
                  )}
                  {s.geaendertVon && <span className="text-xs text-leise">geändert von {s.geaendertVon}</span>}
                </li>
              ))}
            </ul>
          )}

          {/*
            Der ganze Tag auf einmal.

            Wer das Einstempeln vergisst, vergisst meistens auch das
            Ausstempeln und die Pause. Jeden Stempel einzeln zu reparieren
            sind dann sechs Formulare fuer einen Abend
            (Florian, 09.10.2026).

            Oben steht, was gestempelt wurde, damit der Unterschied beim
            Eintragen schon zu sehen ist und nicht erst hinterher.
          */}
          <div className="mt-4 rounded-lg border p-4"
               style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
            <div className="text-sm font-medium">Ganzen Tag eintragen, wie er war</div>
            <p className="mt-1 text-xs text-leise">
              Für Abende, an denen mehreres fehlt. Was hier steht, ersetzt alle Stempel dieses
              Tages. Die gestempelte Fassung bleibt im Änderungsbuch stehen.
            </p>

            <p className="mt-2 text-sm">
              <span className="text-leise">Gestempelt:</span>{" "}
              <span className="tabular-nums">{gestempelt}</span>
            </p>

            <form action={tagBerichtigenAktion} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="benutzerId" value={person.id} />
              <input type="hidden" name="tag" value={derTag} />
              <input type="hidden" name="wer" value={person.id} />
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Gekommen</span>
                <input type="time" name="kommen" className="w-28" defaultValue={vorschlag.kommen} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Pause von</span>
                <input type="time" name="pauseVon" className="w-28" defaultValue={vorschlag.pauseVon} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">bis</span>
                <input type="time" name="pauseBis" className="w-28" defaultValue={vorschlag.pauseBis} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Gegangen</span>
                <input type="time" name="gehen" className="w-28" defaultValue={vorschlag.gehen} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Grund</span>
                <input name="grund" maxLength={200} required
                       placeholder="z. B. Ausstempeln vergessen"
                       className="w-64" />
              </label>
              <Absendeknopf text="Tag so übernehmen" laeuftText="..." />
            </form>
            <p className="mt-2 text-xs text-leise">
              Geht die Schicht über Mitternacht, trägst du die Uhrzeit einfach ein: Alles, was vor
              der vorherigen Zeit liegt, zählt zum nächsten Tag.
            </p>

            {/*
              Was der Mitarbeiter selbst zu diesem Tag geschrieben hat.

              Es steht hier, wo korrigiert wird, und nicht in einer
              eigenen Liste woanders: Wer den Tag anfasst, soll den Grund
              vor Augen haben. Sobald der Tag berichtigt ist, ist der
              Kommentar beantwortet und verschwindet (Florian, 09.10.2026).
            */}
            {offeneKommentare.length > 0 && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                <div className="text-xs font-medium">
                  {offeneKommentare.length === 1
                    ? `Das hat ${person.name.split(" ")[0]} dazu geschrieben`
                    : `Das hat ${person.name.split(" ")[0]} dazu geschrieben (${offeneKommentare.length})`}
                </div>
                <ul className="mt-2 space-y-2">
                  {offeneKommentare.map((k) => (
                    <li key={k.id} className="rounded-md bg-flaeche px-3 py-2 text-sm">
                      <div className="text-xs text-leise">
                        {k.art === "pausengrund" ? "Zur fehlenden Pause" : "Bitte um Korrektur"} ·{" "}
                        <span className="tabular-nums">
                          {new Date(k.erstelltAm).toLocaleString("de-DE", {
                            timeZone: "Europe/Berlin",
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        {/* Angenommen heisst nicht korrigiert: Steht keine Uhrzeit im
                            Antrag, aendert das Annehmen nichts an den Stempeln. */}
                        {k.status === "angenommen" && (
                          <span> · schon angenommen, die Zeiten stehen aber noch</span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{k.text}</p>
                      {(k.vorschlagKommen || k.vorschlagGehen || k.vorschlagPauseStart || k.vorschlagPauseEnde) && (
                        <p className="mt-1 text-xs text-leise">
                          Angegeben:{" "}
                          {[
                            k.vorschlagKommen && `gekommen ${uhr(k.vorschlagKommen)}`,
                            k.vorschlagPauseStart && `Pause ab ${uhr(k.vorschlagPauseStart)}`,
                            k.vorschlagPauseEnde && `Pause bis ${uhr(k.vorschlagPauseEnde)}`,
                            k.vorschlagGehen && `gegangen ${uhr(k.vorschlagGehen)}`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-leise">
                  Sobald du den Tag übernimmst, gilt das als beantwortet und der Kommentar
                  verschwindet hier.
                </p>
              </div>
            )}
          </div>

          <form action={stempelNachtragen} className="mt-4 flex flex-wrap items-end gap-2 border-t border-linie pt-4">
            <input type="hidden" name="benutzerId" value={person.id} />
            <input type="hidden" name="tag" value={derTag} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Nachtragen</span>
              <select name="art" defaultValue="kommen">
                <option value="kommen">EIN-stempeln</option>
                <option value="pause_start">Pause begonnen</option>
                <option value="pause_ende">Pause beendet</option>
                <option value="gehen">AUS-stempeln</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Uhrzeit</span>
              <input type="time" name="uhrzeit" className="w-28" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Grund</span>
              <input name="grund" maxLength={200} placeholder="z. B. Stempeluhr streikte" className="w-64" />
            </label>
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
          <p className="mt-2 text-xs text-leise">
            Jede Änderung wird mit Namen, Uhrzeit und Grund festgehalten, die ursprüngliche Zeit bleibt
            gespeichert. Auch eine Löschung bleibt im Änderungsbuch stehen.
          </p>

          {/*
            Das Aenderungsbuch dieses Tages.

            Ohne diese Liste waere ein geloeschter Stempel spurlos weg, und
            im Zweifel koennte niemand sagen, ob er je da war. Arbeitszeit
            ist nachweispflichtig (Florian, 30.09.2026).
          */}
          {aenderungen.length > 0 && (
            <div className="mt-4 border-t border-linie pt-3">
              <div className="text-xs font-medium">Was an diesem Tag korrigiert wurde</div>
              <ul className="mt-1 space-y-1 text-xs text-leise">
                {aenderungen.map((a) => (
                  <li key={a.id}>
                    <span className="tabular-nums">{new Date(a.wann).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}</span> ·{" "}
                    {a.was === "tag_berichtigt"
                      ? (
                        <>
                          <strong className="text-text">Ganzer Tag berichtigt</strong> von {a.wer}
                          {a.grund && <span> · {a.grund}</span>}
                          <div className="mt-0.5">
                            gestempelt: {a.altText || "nichts"} · eingetragen: {a.neuText}
                            {a.altMinuten !== null && a.neuMinuten !== null && (
                              <> · <strong style={{ color: a.neuMinuten === a.altMinuten ? undefined : "var(--warnung)" }}>
                                {unterschiedText(a.neuMinuten - a.altMinuten)}
                              </strong></>
                            )}
                          </div>
                        </>
                      )
                      : a.was === "geloescht"
                      ? `${BEZEICHNUNG[a.art as keyof typeof BEZEICHNUNG] ?? a.art} um ${uhr(a.altZeitpunkt ?? "")} gelöscht`
                      : a.was === "nachgetragen"
                        ? `${BEZEICHNUNG[a.art as keyof typeof BEZEICHNUNG] ?? a.art} um ${uhr(a.neuZeitpunkt ?? "")} nachgetragen`
                        : `${BEZEICHNUNG[a.art as keyof typeof BEZEICHNUNG] ?? a.art} von ${uhr(a.altZeitpunkt ?? "")} auf ${uhr(a.neuZeitpunkt ?? "")} geändert`}
                    {a.was !== "tag_berichtigt" && (
                      <>
                        {" "}von {a.wer}
                        {a.grund && <span> · {a.grund}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Das Arbeitszeitkonto der Festangestellten.
 *
 * Nur fuer die Festangestellten, denn nur sie schulden Monatsstunden:
 * Ben 80, Olena 60 (Florian, 30.09.2026). Wer weniger schafft, baut
 * Minusstunden auf, und die rufen wir ab. Mehrarbeit bis zehn Prozent
 * ist mit dem Gehalt abgegolten und ergibt keine Plusstunden, so steht
 * es im Teilzeitvertrag unter § 5.
 *
 * Eingeklappt, weil es im Alltag nicht stoeren soll: "so dass man es
 * auch anklicken kann bei der stundenmeldung".
 */
async function Arbeitszeitkonto() {
  const [staende, leute] = await Promise.all([alleKontostaende(), stempelnde()]);
  const schonDrin = new Set(staende.map((k) => k.person.benutzerId));
  const offen = leute.filter((p) => !schonDrin.has(p.id));
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const laufend = heute.slice(0, 7);

  const stunden = (min: number) => {
    const v = Math.abs(min);
    return `${min < 0 ? "-" : ""}${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  };

  return (
    <details id="konto" className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Arbeitszeitkonto der Festangestellten
        {staende.length > 0 && (
          <span className="text-leise">
            {" "}
            (
            {staende
              .map((k) => `${k.person.name.split(" ")[0]} ${stunden(k.saldoMinuten)}`)
              .join(", ")}
            )
          </span>
        )}
      </summary>

      <p className="mt-2 max-w-prose text-xs text-leise">
        Gerechnet wird nach Kalendermonaten. Mehrarbeit bis zum Korridor ist mit dem Gehalt abgegolten und
        ergibt keine Plusstunden. Wer unter seiner Regelarbeitszeit bleibt, sammelt Minusstunden, die
        stehen bleiben, bis sie abgearbeitet sind. Der laufende Monat ist noch nicht fertig und deshalb
        grau.
      </p>

      {staende.length === 0 && (
        <p className="mt-3 text-leise">Für niemanden wird gerade ein Arbeitszeitkonto geführt.</p>
      )}

      {staende.map((k) => (
        <div key={k.person.benutzerId} className="mt-4 border-t border-linie pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <strong>{k.person.name}</strong>{" "}
              <span className="text-leise">
                {k.person.monatsStunden.toString().replace(".00", "")} Stunden im Monat, Korridor{" "}
                {k.person.korridorProzent} % (
                {stunden(Math.round((k.person.monatsStunden * 60 * k.person.korridorProzent) / 100))} Stunden),
                seit {k.person.seit.split("-").reverse().join(".")}
              </span>
            </div>
            <div
              className="rounded-md px-3 py-1 font-semibold tabular-nums"
              style={{
                background: k.saldoMinuten < 0 ? "var(--warnung-hell)" : "var(--gut-hell)",
                color: k.saldoMinuten < 0 ? "var(--warnung)" : "var(--gut)",
              }}
            >
              {k.saldoMinuten < 0
                ? `${stunden(k.saldoMinuten)} Stunden schuldig`
                : `${stunden(k.saldoMinuten)} Stunden Guthaben`}
            </div>
          </div>

          <table className="mt-2 w-full text-xs">
            <thead className="text-left text-leise">
              <tr>
                <th className="py-1 font-medium">Monat</th>
                <th className="py-1 text-right font-medium">Soll</th>
                <th className="py-1 text-right font-medium">Ist</th>
                <th className="py-1 text-right font-medium">abgegolten</th>
                <th className="py-1 text-right font-medium">Plus</th>
                <th className="py-1 text-right font-medium">Minus</th>
                <th className="py-1 text-right font-medium">Stand</th>
              </tr>
            </thead>
            <tbody>
              {k.monate.map((m) => (
                <tr key={m.monat} className={m.monat === laufend ? "text-leise" : ""}>
                  <td className="py-1">
                    {m.monat.split("-").reverse().join(".")}
                    {m.monat === laufend && " (läuft noch)"}
                  </td>
                  <td className="py-1 text-right tabular-nums">{stunden(m.sollMinuten)}</td>
                  <td className="py-1 text-right tabular-nums">{stunden(m.istMinuten)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {m.abgegoltenMinuten > 0 ? stunden(m.abgegoltenMinuten) : "-"}
                  </td>
                  <td className="py-1 text-right tabular-nums" style={{ color: m.plusMinuten ? "var(--gut)" : undefined }}>
                    {m.plusMinuten > 0 ? stunden(m.plusMinuten) : "-"}
                  </td>
                  <td className="py-1 text-right tabular-nums" style={{ color: m.minusMinuten ? "var(--warnung)" : undefined }}>
                    {m.minusMinuten > 0 ? stunden(m.minusMinuten) : "-"}
                  </td>
                  <td className="py-1 text-right font-medium tabular-nums">{stunden(m.saldoMinuten)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form action={sollzeitEintragen} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="benutzerId" value={k.person.benutzerId} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Stunden im Monat</span>
              <input name="stunden" defaultValue={String(k.person.monatsStunden).replace(".00", "")} className="w-24" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Korridor %</span>
              <input name="korridor" defaultValue={k.person.korridorProzent} className="w-20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Zählt ab</span>
              <input type="date" name="seit" defaultValue={k.person.seit} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Notiz</span>
              <input name="notiz" defaultValue={k.person.notiz} className="w-56" />
            </label>
            <Absendeknopf text="Speichern" laeuftText="..." />
          </form>

          {/*
            Das Loeschen steht bewusst neben dem Formular und nicht darin:
            Ein Formular im Formular ist keine gueltige Seite, der Browser
            wirft das innere weg und der Knopf tut dann nichts.
          */}
          <form action={sollzeitLoeschen} className="mt-1">
            <input type="hidden" name="benutzerId" value={k.person.benutzerId} />
            <button type="submit" className="text-xs text-leise underline">
              Konto nicht mehr führen
            </button>
          </form>
        </div>
      ))}

      {offen.length > 0 && (
        <form action={sollzeitEintragen} className="mt-4 flex flex-wrap items-end gap-2 border-t border-linie pt-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Weitere Person</span>
            <select name="benutzerId" defaultValue="">
              <option value="" disabled>
                bitte wählen
              </option>
              {offen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Stunden im Monat</span>
            <input name="stunden" placeholder="80" className="w-24" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Korridor %</span>
            <input name="korridor" defaultValue={10} className="w-20" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Zählt ab</span>
            <input type="date" name="seit" defaultValue={`${laufend}-01`} />
          </label>
          <Absendeknopf text="Konto führen" laeuftText="..." />
        </form>
      )}
    </details>
  );
}

/** Summen je Person für einen Monat, als Grundlage fürs Lohnbüro. */
async function Monatsuebersicht({ monat }: { monat?: string }) {
  const jetzt = new Date();
  const m = /^\d{4}-\d{2}$/.test(monat ?? "") ? monat! : `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
  const [j, mm] = m.split("-").map(Number);
  const vorher = `${mm === 1 ? j - 1 : j}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const danach = `${mm === 12 ? j + 1 : j}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
  const stempel = await stempelDesMonats(m);

  /*
    Je Person und Tag rechnen, dann zusammenzählen.

    Gerechnet wird in tagRechnen(), derselben Stelle wie in der
    Lohnauswertung: Fehlstempel fallen heraus, unplausible Tage zählen
    erst, wenn das Büro sie bestätigt hat (Florian, 29.09.2026). Zwei
    Rechenwege für dieselbe Zahl waren einer zu viel.
  */
  const jePerson = new Map<
    string,
    { name: string; minuten: number; pause: number; tage: Set<string>; offen: number; unplausibel: number }
  >();
  const jeTag = new Map<string, Map<string, Stempel[]>>();
  for (const s of stempel) {
    const tag = s.zeitpunkt.slice(0, 10);
    const tage = jeTag.get(s.benutzerId) ?? new Map<string, Stempel[]>();
    jeTag.set(s.benutzerId, tage);
    tage.set(tag, [...(tage.get(tag) ?? []), s]);
  }

  for (const [id, tage] of jeTag) {
    // Eine Schicht ueber Mitternacht gehoert zum Vortag, nicht zu zwei
    // halben Tagen (Florian, 29.09.2026).
    const gruppen = nachtschichtenAnhaengen(
      [...tage].map(([datum, liste]) => ({
        datum,
        stempel: liste.map((x) => ({
          art: x.art,
          ms: Date.parse(x.zeitpunkt),
          geaendertVon: x.geaendertVon,
          name: x.name,
        })),
      })),
    );

    for (const g of gruppen) {
      const e = jePerson.get(id) ?? {
        name: g.stempel[0]?.name ?? "",
        minuten: 0,
        pause: 0,
        tage: new Set<string>(),
        offen: 0,
        unplausibel: 0,
      };
      const r = tagRechnen(g.datum, g.stempel);
      if (r.gewertet) {
        e.minuten += r.arbeitMinuten;
        e.pause += r.pauseMinuten;
        e.tage.add(g.datum);
      }
      if (r.offen) e.offen += 1;
      if (r.unplausibel && !r.bestaetigt) e.unplausibel += 1;
      jePerson.set(id, e);
    }
  }

  // Nach Familienname, wie überall im Programm (Florian, 29.09.2026).
  const zeilen = [...jePerson.values()].sort(nachFamilienname);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
          Zeiten {MONATE[mm - 1]} {j}
        </h2>
        <span className="flex gap-3 text-sm">
          <a href={`/stempeluhr?monat=${vorher}`} className="underline">
            Vormonat
          </a>
          <a href={`/stempeluhr?monat=${danach}`} className="underline">
            Folgemonat
          </a>
        </span>
      </div>
      {zeilen.length === 0 ? (
        <p className="text-sm text-leise">In diesem Monat wurde noch nicht gestempelt.</p>
      ) : (
        <table className="w-full rounded-lg border border-linie bg-flaeche text-sm">
          <thead className="border-b border-linie text-left text-xs text-leise">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 text-right font-normal">Tage</th>
              <th className="px-4 py-2 text-right font-normal">Pause</th>
              <th className="px-4 py-2 text-right font-normal">Arbeitszeit</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.name} className="border-b border-linie last:border-0">
                <td className="px-4 py-2">
                  {z.name}
                  {(z.offen > 0 || z.unplausibel > 0) && (
                    <div className="text-xs" style={{ color: "var(--warnung)" }}>
                      {[
                        z.offen > 0 ? `${z.offen} Tage ohne Ausstempeln` : "",
                        z.unplausibel > 0 ? `${z.unplausibel} Tage noch zu bestätigen` : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      , nicht gezählt
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{z.tage.size}</td>
                <td className="px-4 py-2 text-right tabular-nums">{stunden(z.pause)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{stunden(z.minuten)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Wo das Haus steht und wie weit man sich entfernen darf. Nur Florian. */
async function Einrichtung() {
  const e = await einstellungLesen();
  return (
    <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
      <summary className="cursor-pointer font-medium">Einrichtung der Stempeluhr</summary>
      <form action={standortSpeichern} className="mt-3 space-y-3">
        <p className="text-leise">
          Der Mittelpunkt ist die Grethe-Weiser-Straße 2. Passt der Standort beim Einstempeln nicht zum Umkreis oder
          fehlt er ganz (kein GPS-Signal), wird trotzdem eingestempelt: Ihr bekommt eine Mail und prüft die Zeit
          später in „Zeiten korrigieren“. Blockiert wird niemand mehr, das war zu oft der Grund, warum jemand am
          Einlass hängen blieb (Florian, 28.09.2026).
        </p>
        <p className="text-leise">
          Wer eingestempelt bleibt, obwohl er vermutlich nicht mehr arbeitet, wird nur noch gemeldet, nicht mehr
          selbst ausgestempelt (Florian, 29.09.2026): Meldet das Handy, dass jemand das Gelände verlassen hat, oder
          ist jemand nach der Stundengrenze unten oder über Nacht noch offen, bekommt er eine Erinnerung und ihr
          eine Kopie. Die Zeit zählt erst, wenn der Mitarbeiter über die Nachmeldung sagt, wann er wirklich gegangen
          ist, oder ihr sie einträgt. So wird niemandem eine Zeit gutgeschrieben, die nicht stimmt, etwa weil noch
          jemand auf einen Drink dablieb.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Breitengrad</span>
            <input name="lat" defaultValue={String(e.lat)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Längengrad</span>
            <input name="lon" defaultValue={String(e.lon)} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Umkreis in Metern</span>
            <input name="radius" type="number" min={30} max={2000} defaultValue={e.radiusM} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Erinnern, wenn länger als so viele Stunden eingestempelt</span>
            <input name="maxStunden" type="number" min={1} max={24} defaultValue={e.maxStunden} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="aktiv" defaultChecked={e.aktiv} />
          Standort beim Stempeln prüfen (ausschalten nur im Notfall)
        </label>
        <Absendeknopf text="Speichern" laeuftText="..." />
      </form>
    </details>
  );
}
