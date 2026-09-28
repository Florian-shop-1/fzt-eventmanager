import { absageLesen, gastPerToken } from "@/lib/absage/db";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import { alternativenAufteilen } from "@/lib/absage/mailtext";
import { datumLang } from "@/lib/zeit";
import { FARBEN, GastSeite, Kasten, Kontaktzeile, Wortzeile } from "@/components/GastSeite";
import { terminWaehlen } from "./aktionen";

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
          Wir buchen euch dort in den nächsten Tagen von Hand um und melden uns, falls es Fragen gibt.
        </p>
        <Kontaktzeile />
      </Rahmen>
    );
  }

  const kommende = await kommendeTermine(60);
  const abgesagterTermin = {
    ditixEventId: absage.ditixEventId,
    datum: absage.datum,
    uhrzeit: absage.uhrzeit,
    name: absage.show,
    ausverkauft: false,
    beginn: new Date(),
  };
  const { selberTag, weitere } = alternativenAufteilen(abgesagterTermin, kommende);

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

      {selberTag.length > 0 && (
        <div className="mt-8 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
            Noch am selben Tag
          </p>
          <div className="mt-3 space-y-3">
            {selberTag.map((t) => (
              <TerminZeile key={t.ditixEventId} token={token} ditixEventId={t.ditixEventId} datum={t.datum} uhrzeit={t.uhrzeit} name={t.name} />
            ))}
          </div>
        </div>
      )}

      {weitere.length > 0 && (
        <div className="mt-8 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: FARBEN.gold }}>
            Die nächsten Termine
          </p>
          <div className="mt-3 space-y-3">
            {weitere.map((t) => (
              <TerminZeile key={t.ditixEventId} token={token} ditixEventId={t.ditixEventId} datum={t.datum} uhrzeit={t.uhrzeit} name={t.name} />
            ))}
          </div>
        </div>
      )}

      {selberTag.length === 0 && weitere.length === 0 && (
        <p className="mt-6 text-sm leading-relaxed">
          Gerade sehen wir keine passenden Termine. Meldet euch bei uns, wir finden gemeinsam einen Abend.
        </p>
      )}

      <Kontaktzeile />
    </Rahmen>
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
