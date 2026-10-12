import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { darfGeschenkEintragen, geschenke, geschenkText } from "@/lib/abbrecher/geschenk";
import { namenZuGeschenken } from "@/lib/abbrecher/gastname";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { ausgegeben, dochNicht, vonHandEintragen } from "./aktionen";

export const metadata = { title: "Geschenke | FZT Eventmanager" };

/**
 * Ein Name, mit dem das Foyer etwas anfangen kann.
 *
 * Leer kommt aus der Abbrecher-Strecke, "Gast" aus der Absage-Strecke.
 * Beides sagt nichts, und dann ist die Mailadresse die bessere Angabe.
 */
function echterName(name: string): string | null {
  const n = name.trim();
  return n && n.toLowerCase() !== "gast" ? n : null;
}
export const dynamic = "force-dynamic";

/**
 * Was an der Magic-Bar für einen Gast bereitliegt.
 *
 * Gäste, die im Warenkorb stehen geblieben sind, bekommen von uns ein
 * Geschenk und danach doch gebucht haben. In Ditix steht davon nichts,
 * das Geschenk ist auf den Namen hinterlegt (Florian, 23.09.2026).
 *
 * Gedacht fürs Foyer am Abend: Name suchen, ausgeben, abhaken. Deshalb
 * große Zeilen, wenig Text und der Name zuerst.
 */
export default async function GeschenkeSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeige?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");

  /*
    Im Foyer zaehlt nur der Abend, der gerade laeuft. Alles andere ist
    Suchen in einer Liste, waehrend jemand vor einem steht
    (Florian, 23.09.2026). Deshalb ist "Heute" die Vorgabe.
  */
  const { zeige, meldung } = await searchParams;
  const ansicht = zeige === "offen" || zeige === "ausgegeben" ? zeige : "heute";
  /*
    "bei ausgegeben sollte nur ausgegebene stehen" (Florian,
    12.10.2026). Vorher standen unter "Auch schon ausgegeben" auch alle
    offenen mit drin, und weil bis dahin noch nie jemand abgehakt hatte,
    sah die Liste aus wie ein Archiv, das keines war.
  */
  const roh = await geschenke(ansicht === "ausgegeben");
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const heuteListe = roh.filter((g) => g.gebuchtDatum === heute && !g.eingeloestAm);
  /*
    Der Name steht nicht am Geschenk, nur die Adresse. Geholt wird er
    aus den Bestellungen des Abends, siehe lib/abbrecher/gastname.
  */
  const namen = await namenZuGeschenken(roh).catch(() => new Map<string, string>());

  const liste =
    ansicht === "heute"
      ? roh.filter((g) => g.gebuchtDatum === heute)
      : ansicht === "ausgegeben"
        ? roh.filter((g) => g.eingeloestAm)
        : roh;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Geschenke an der Magic-Bar</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Diese Gäste haben von uns etwas geschenkt bekommen, weil ihre Buchung zuerst abgebrochen war. Sie
          melden sich an der Bar, du gibst es aus und hakst ab. In Ditix steht davon nichts, es läuft nur über
          diese Liste.
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

      {darfGeschenkEintragen(b) && (
        <details className="rounded-lg border border-linie bg-flaeche px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Geschenk von Hand eintragen</summary>
          <p className="mt-2 max-w-prose text-xs text-leise">
            Für Gäste, die nicht über den Shop gebucht haben: telefonisch gebucht, oder weil wir jemandem
            einfach etwas Gutes tun wollen. Der Abend gehört dazu, damit der Gast am richtigen Tag in
            dieser Liste steht. Für mehrere Sachen am selben Abend trägst du sie einzeln ein, dann kann
            die Bar jede für sich abhaken.
          </p>
          <form action={vonHandEintragen} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              {/* Es muss kein Gast sein: Kevin hinterlegt auch mal ein
                  Kontingent für einen Abend (12.10.2026). */}
              <span className="mb-1 block text-xs text-leise">Für wen ist es?</span>
              <input name="name" required placeholder="Name des Gastes, oder wofür" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">E-Mail (falls bekannt)</span>
              <input name="email" type="email" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Geschenk</span>
              <select name="art" defaultValue="glas" className="w-44">
                <option value="glas">Souvenir-Glas</option>
                <option value="zauberstab">Zauberstab</option>
                <option value="baendchen">VIP-Bändchen</option>
                <option value="getraenk">Freigetränk</option>
                <option value="popcorn">Popcorn</option>
                <option value="sonstiges">etwas anderes</option>
              </select>
            </label>
            <label className="block">
              {/* Was auf keine Kachel passt, steht hier im Klartext.
                  Die Bar muss wissen, was sie herausgibt. */}
              <span className="mb-1 block text-xs text-leise">Wenn etwas anderes: was genau?</span>
              <input name="eigenes" maxLength={120} placeholder="zum Beispiel: Eis für die Kinder" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Anzahl</span>
              <input name="anzahl" type="number" min={1} max={50} defaultValue={1} className="w-20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Abend</span>
              <input name="datum" type="date" required className="w-40" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Uhrzeit</span>
              <input name="uhrzeit" placeholder="19:30" className="w-24" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Show</span>
              <input name="show" className="w-56" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Warum (nur intern)</span>
              <input name="notiz" className="w-64" />
            </label>
            {/*
              Am geteilten Foyer-Zugang weiss sonst niemand, wer das
              Geschenk zugesagt hat: "wenn sie es vom eigenen account
              machen, dann sind sie ja identifiziert" (Florian,
              12.10.2026).
            */}
            {b.geteilt && (
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Wer trägt es ein?</span>
                <input name="wer" required minLength={2} maxLength={60} placeholder="dein Name" className="w-44" />
              </label>
            )}
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
        </details>
      )}

      {heuteListe.length > 0 && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
          <strong>Heute Abend erwartet:</strong> {heuteListe.length}{" "}
          {heuteListe.length === 1 ? "Gast" : "Gäste"} mit einem Geschenk.
        </p>
      )}

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["heute", `Heute (${heuteListe.length})`],
          ["offen", "Alle offenen"],
          ["ausgegeben", "Ausgegeben"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={wert === "heute" ? "/geschenke" : `/geschenke?zeige=${wert}`}
            className={`rounded-md px-3 py-1.5 ${ansicht === wert ? "bg-text text-flaeche" : "border border-linie"}`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          {ansicht === "heute"
            ? "Für heute Abend liegt nichts bereit. Wenn jemand trotzdem danach fragt, schau unter „Alle offenen“."
            : ansicht === "ausgegeben"
              ? "Hier steht, was schon über die Bar gegangen ist. Bisher ist noch nichts abgehakt."
              : "Gerade liegt nichts bereit."}
        </p>
      ) : (
        <ul className="space-y-2">
          {liste.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3"
              style={{
                borderColor: g.eingeloestAm ? "var(--linie)" : "var(--gold)",
                background: g.eingeloestAm ? "var(--flaeche)" : "var(--gold-hell)",
                opacity: g.eingeloestAm ? 0.6 : 1,
              }}
            >
              <div className="min-w-48 flex-1">
                {/*
                  Oben steht, was sicher stimmt: der eingetragene Name,
                  sonst die Adresse. "zeig dann einfach die email
                  adresse an, die hast du ja" (Florian, 12.10.2026).
                  "Gast" zaehlt dabei nicht als Name, das ist nur ein
                  Platzhalter aus der Absage-Strecke.
                */}
                <div className="break-all text-lg font-semibold">{echterName(g.name) ?? g.email}</div>
                {/* Der Name aus der Ditix-Bestellung steht darunter und
                    als Vermutung: Er ist über die Adresse gefunden,
                    nicht vom Gast selbst eingetragen. */}
                {!echterName(g.name) && namen.get(g.id) && (
                  <div className="text-xs text-leise">vermutlich {namen.get(g.id)}</div>
                )}
                <div className="text-sm">
                  <strong>{g.gilt}</strong> × {geschenkText(g)}
                </div>
                {/* Hat er am Ende weniger Plätze gebucht, gibt es auch
                    weniger. Die Zahl steht trotzdem dabei, damit im Foyer
                    niemand rätselt (Florian, 23.09.2026). */}
                {g.gebuchtPlaetze !== null && g.gilt !== g.anzahl && (
                  <div className="text-xs" style={{ color: "var(--warnung)" }}>
                    {g.anzahl} waren versprochen, gebucht hat er {g.gebuchtPlaetze}
                    {g.gebuchtPlaetze === 1 ? " Platz" : " Plätze"}
                  </div>
                )}
                {/* Hier steht nur noch, wer wirklich gebucht hat, siehe
                    lib/abbrecher/geschenk.ts. */}
                <div className="text-xs text-leise">
                  {g.gebuchtShow} am {g.gebuchtDatum?.split("-").reverse().join(".")}
                  {g.gebuchtUhrzeit ? `, ${g.gebuchtUhrzeit} Uhr` : ""}
                </div>
                {/* Von Hand eingetragen: Dann gibt es keine Buchung im
                    Shop, an der jemand nachsehen könnte. Deshalb steht
                    hier, wer es eingetragen hat und warum. */}
                {g.vonHand && (
                  <div className="text-xs text-leise">
                    von Hand eingetragen{g.erfasstVon ? ` von ${g.erfasstVon}` : ""}
                    {g.notiz ? `: ${g.notiz}` : ""}
                  </div>
                )}
                {g.eingeloestAm && (
                  <div className="text-xs font-medium" style={{ color: "var(--gut)" }}>
                    ✓ ausgegeben {vorZeit(g.eingeloestAm)}
                    {g.eingeloestVon ? ` von ${g.eingeloestVon}` : ""}
                  </div>
                )}
              </div>

              {g.eingeloestAm ? (
                <form action={dochNicht}>
                  <input type="hidden" name="id" value={g.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    doch nicht
                  </button>
                </form>
              ) : (
                /*
                  An der Bar hängen oft mehrere Leute am selben Zugang.
                  Deshalb steht neben dem Knopf, wer es ausgibt: Der
                  Name ist vorbelegt und kann überschrieben werden
                  (Florian, 12.10.2026).
                */
                <form action={ausgegeben} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <label className="block">
                    <span className="sr-only">Wer gibt es aus?</span>
                    {/* Am geteilten Zugang ist der vorbelegte Name
                        keiner, deshalb dort leer und Pflicht. */}
                    <input
                      name="wer"
                      defaultValue={b.geteilt ? "" : b.name}
                      required={b.geteilt}
                      placeholder="dein Name"
                      maxLength={60}
                      className="w-32 text-sm"
                    />
                  </label>
                  <Absendeknopf text="Ausgegeben" laeuftText="..." />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
