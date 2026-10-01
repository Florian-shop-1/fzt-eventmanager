import { absageLesen, gastPerToken } from "@/lib/absage/db";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import { alternativenAufteilen } from "@/lib/absage/mailtext";
import { datumLang } from "@/lib/zeit";
import { FARBEN, GastSeite, Kasten, Kontaktzeile, Wortzeile } from "@/components/GastSeite";
import { Absendeknopf } from "@/components/Absendeknopf";
import { rueckrufErbitten, terminWaehlen } from "./aktionen";

export const metadata = { title: "Euer Ausweichtermin | Florian Zimmer Theater" };
export const dynamic = "force-dynamic";

/**
 * Der Gast wählt seinen Ausweichtermin, nachdem seine Show ausgefallen
 * ist. Ohne Anmeldung erreichbar, wie /warum/[token] und /angebot/[token]
 * (Florian, 29.09.2026).
 */
export default async function AlternativeSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gast = await gastPerToken(token);

  if (!gast) {
    return (
      <Rahmen>
        <h1 className="mt-4 text-3xl">Diesen Link kennen wir nicht.</h1>
        <p className="mt-4 text-sm leading-relaxed">
          Vielleicht ist er nicht mehr gültig. Meldet euch gern bei uns, wir kümmern uns direkt.
        </p>
        <Kontaktzeile />
      </Rahmen>
    );
  }

  const absage = await absageLesen(gast.absageId);
  if (!absage) {
    return (
      <Rahmen>
        <h1 className="mt-4 text-3xl">Da ist etwas schiefgelaufen.</h1>
        <p className="mt-4 text-sm leading-relaxed">Meldet euch gern bei uns, wir kümmern uns direkt.</p>
        <Kontaktzeile />
      </Rahmen>
    );
  }

  if (gast.gewaehltAm) {
    return (
      <Rahmen>
        <h1 className="mt-4 text-3xl">Alles klar, danke!</h1>
        <p className="mt-4 text-sm leading-relaxed">
          Ihr habt euch für diesen Termin entschieden:
        </p>
        <Kasten gold className="mt-5">
          <p className="text-lg font-semibold" style={{ color: FARBEN.goldHell }}>
            {gast.gewaehlterTerminName}
          </p>
        </Kasten>
        <p className="mt-5 text-sm leading-relaxed">
          Wir buchen euch dort um und melden uns, sobald das erledigt ist. Passt doch etwas nicht, ruft uns
          an oder lasst euch zurückrufen.
        </p>
        <Rueckruf token={token} nummer={gast.rueckrufNummer} gebetenAm={gast.rueckrufAm} />
        <Kontaktzeile />
      </Rahmen>
    );
  }

  const kommende = await kommendeTermine(120);
  const abgesagterTermin = {
    ditixEventId: absage.ditixEventId,
    datum: absage.datum,
    uhrzeit: absage.uhrzeit,
    name: absage.show,
    ausverkauft: false,
    beginn: new Date(),
  };
  // Auf der Seite steht der ganze Showkalender, nicht nur eine Auswahl:
  // "oder natürlich auch jeder andere termin aus dem showkalender"
  // (Florian, 01.10.2026).
  const { selberTag, tagDavor, tagDanach, weitere } = alternativenAufteilen(
    abgesagterTermin,
    kommende,
    120,
  );

  return (
    <Rahmen>
      <h1 className="mt-4 text-3xl">Eure Show fällt leider aus.</h1>
      <p className="mt-4 text-sm leading-relaxed">
        {datumLang(absage.datum)}, {absage.uhrzeit} Uhr ({absage.show}) kann {absage.grund} nicht stattfinden. Das
        tut uns wirklich leid. Wählt unten euren neuen Termin, den Rest übernehmen wir.
      </p>

      <Kasten gold className="mt-6">
        <p className="text-sm">Als Ausgleich:</p>
        <p className="mt-1 text-xl font-semibold" style={{ color: FARBEN.goldHell }}>
          {gast.kompensationArt === "upgrade"
            ? `Upgrade auf ${gast.neueKategorie}`
            : gast.plaetze === 1
              ? "ein Souvenirglas"
              : `${gast.plaetze} Souvenirgläser`}
        </p>
      </Kasten>

      <Terminblock titel="Noch am selben Tag" termine={selberTag} token={token} />
      <Terminblock titel="Der Abend davor" termine={tagDavor} token={token} />
      <Terminblock titel="Der Tag danach" termine={tagDanach} token={token} />
      <Terminblock titel="Alle weiteren Termine" termine={weitere} token={token} />

      {selberTag.length === 0 && tagDavor.length === 0 && tagDanach.length === 0 && weitere.length === 0 && (
        <p className="mt-6 text-sm leading-relaxed">
          Gerade sehen wir keine passenden Termine. Meldet euch bei uns, wir finden gemeinsam einen Abend.
        </p>
      )}

      <Rueckruf token={token} nummer={gast.rueckrufNummer} gebetenAm={gast.rueckrufAm} />

      <Kontaktzeile />
    </Rahmen>
  );
}

/**
 * Ein Block Termine mit Überschrift. Ist er leer, steht er gar nicht da.
 */
function Terminblock({
  titel,
  termine,
  token,
}: {
  titel: string;
  termine: Array<{ ditixEventId: string; datum: string; uhrzeit: string; name: string }>;
  token: string;
}) {
  if (termine.length === 0) return null;
  return (
    <div className="mt-8 text-left">
      <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
        {titel}
      </p>
      <div className="mt-3 space-y-3">
        {termine.map((t) => (
          <TerminZeile
            key={t.ditixEventId}
            token={token}
            ditixEventId={t.ditixEventId}
            datum={t.datum}
            uhrzeit={t.uhrzeit}
            name={t.name}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Lieber sprechen als klicken.
 *
 * "Rückrufmöglichkeit usw." (Florian, 01.10.2026): Manchen passt keiner
 * der Termine, manche haben Fragen, die eine Liste nicht beantwortet. Die
 * sollen nicht in der Warteschleife landen, sondern eine Nummer
 * hinterlassen können.
 */
function Rueckruf({
  token,
  nummer,
  gebetenAm,
}: {
  token: string;
  nummer: string;
  gebetenAm: string | null;
}) {
  if (gebetenAm) {
    return (
      <Kasten className="mt-8 text-left">
        <p className="text-sm">
          Wir rufen euch zurück{nummer ? ` unter ${nummer}` : ""}. Meist noch am selben Tag, spätestens am
          nächsten Werktag.
        </p>
      </Kasten>
    );
  }

  return (
    <div className="mt-10 text-left">
      <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
        Lieber persönlich?
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        Passt kein Termin oder habt ihr Fragen? Hinterlasst uns eure Nummer, wir rufen zurück.
      </p>
      <form action={rueckrufErbitten} className="mt-3 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input
          name="nummer"
          inputMode="tel"
          required
          maxLength={40}
          placeholder="Eure Telefonnummer"
          className="w-full rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: FARBEN.linie, background: FARBEN.karte, color: FARBEN.weiss }}
        />
        <input
          name="notiz"
          maxLength={300}
          placeholder="Wann erreichen wir euch am besten? (freiwillig)"
          className="w-full rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: FARBEN.linie, background: FARBEN.karte, color: FARBEN.weiss }}
        />
        <Absendeknopf text="Bitte ruft uns zurück" laeuftText="Wird gesendet..." />
      </form>
    </div>
  );
}

function TerminZeile({
  token,
  ditixEventId,
  datum,
  uhrzeit,
  name,
}: {
  token: string;
  ditixEventId: string;
  datum: string;
  uhrzeit: string;
  name: string;
}) {
  return (
    <form action={terminWaehlen}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="ditixEventId" value={ditixEventId} />
      <input type="hidden" name="terminName" value={`${datumLang(datum)}, ${uhrzeit} Uhr – ${name}`} />
      <button
        type="submit"
        className="w-full rounded-lg border px-4 py-3 text-left text-sm"
        style={{ borderColor: FARBEN.linie, background: FARBEN.karte, color: FARBEN.weiss }}
      >
        <span className="font-medium">{datumLang(datum)}</span>
        <span style={{ color: FARBEN.leise }}> · {uhrzeit} Uhr · {name}</span>
      </button>
    </form>
  );
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <GastSeite>
      <Wortzeile />
      {children}
    </GastSeite>
  );
}
