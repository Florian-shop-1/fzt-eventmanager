import { euro, type Bewirtung } from "@/lib/bewirtung/db";

function datumLang(iso: string | null): string {
  if (!iso) return "";
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

function zeitpunkt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
}

/**
 * Der Bewirtungsbeleg, wie ihn das Steuerbüro bekommt: links die Angaben
 * nach § 4 Abs. 5 Nr. 2 EStG, rechts das Foto des Restaurantbelegs.
 * Eine Seite je Beleg beim Drucken.
 */
export function BewirtungsBlatt({ b }: { b: Bewirtung }) {
  const netto = (b.bruttoCent ?? 0) - b.mwst7Cent - b.mwst19Cent;
  const bezahlt = `${b.zahlweg === "bar" ? "bar" : b.zahlweg === "karte" ? "Karte" : "unbekannt"}${b.zahlart ? ` (${b.zahlart})` : ""}${b.privatAusgelegt ? ", privat ausgelegt, von der Firma zu erstatten" : ""}`;
  const zeilen: Array<[string, string]> = b.art === "einkauf" ? [
    ["Beleg-Nr.", b.nummer ?? "Entwurf"],
    ["Datum", datumLang(b.datum)],
    ["Geschäft", [b.restaurant, b.anschrift].filter(Boolean).join(", ")],
    ["Was und wofür", b.zweck],
    ["Kategorie", b.kategorie],
    ["Betrag (brutto)", euro(b.bruttoCent)],
    ["davon Umsatzsteuer 7 %", euro(b.mwst7Cent)],
    ["davon Umsatzsteuer 19 %", euro(b.mwst19Cent)],
    ["Nettobetrag", euro(netto)],
    ["Bezahlt", bezahlt],
    ["Eingekauft von", b.bewirtender],
  ] : [
    ["Beleg-Nr.", b.nummer ?? "Entwurf"],
    ["Tag der Bewirtung", datumLang(b.datum)],
    ["Ort der Bewirtung", [b.restaurant, b.ortDerBewirtung || b.anschrift].filter(Boolean).join(", ")],
    ["Bewirtete Personen", b.teilnehmer],
    ["Anlass der Bewirtung", b.anlass],
    ["Rechnungsbetrag (brutto)", euro(b.bruttoCent)],
    ["davon Umsatzsteuer 7 %", euro(b.mwst7Cent)],
    ["davon Umsatzsteuer 19 %", euro(b.mwst19Cent)],
    ["Nettobetrag", euro(netto)],
    ["Trinkgeld", euro(b.trinkgeldCent)],
    ["Gesamtaufwand", euro((b.bruttoCent ?? 0) + b.trinkgeldCent)],
    ["Bezahlt", bezahlt],
    ["Bewirtende Person", b.bewirtender],
  ];
  return (
    <article className="bewirtungsblatt grid gap-6 md:grid-cols-2 print:grid-cols-2">
      <div>
        <h2 className="mb-3 text-lg font-semibold">{b.art === "einkauf" ? "Beleg Einkauf" : "Bewirtungsbeleg"}</h2>
        <p className="mb-3 text-xs text-leise">
          Florian Zimmer Theater GmbH, Neu-Ulm
          {b.art === "bewirtung" && " · Angaben nach § 4 Abs. 5 Satz 1 Nr. 2 EStG"}
        </p>
        <table className="w-full text-sm">
          <tbody>
            {zeilen.map(([k, v]) => (
              <tr key={k} className="border-b border-linie align-top last:border-0">
                <td className="w-44 py-1.5 pr-3 text-leise">{k}</td>
                <td className="py-1.5 whitespace-pre-line">{v || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {b.notiz && <p className="mt-3 text-xs text-leise">Notiz: {b.notiz}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-leise">
          Digital erfasst von {b.erstelltVon} am {zeitpunkt(b.erstelltAm)}
          {b.festgeschriebenAm && `, festgeschrieben von ${b.festgeschriebenVon} am ${zeitpunkt(b.festgeschriebenAm)}`}.
          Fingerabdruck des Belegfotos (SHA-256): <span className="break-all font-mono">{b.fotoHash}</span>
          {b.status === "storniert" &&
            ` STORNIERT am ${zeitpunkt(b.storniertAm)} von ${b.storniertVon}: ${b.stornoGrund}`}
        </p>
      </div>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/bewirtung/foto/${b.id}`}
          alt={`Beleg ${b.restaurant}`}
          className="max-h-[80vh] w-full rounded-lg border border-linie object-contain print:max-h-[250mm]"
        />
      </div>
    </article>
  );
}
