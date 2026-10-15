import { Absendeknopf } from "@/components/Absendeknopf";
import { StellenWahl } from "@/components/StellenWahl";
import { SPIELZEIT_ENDE } from "@/lib/personal/arbeitsvertrag";
import { HASE_ERHOEHUNG, HASE_VERTRAG } from "@/lib/personal/hasensatz";
import { vertragErstellen } from "@/app/vertraege/aktionen";

/**
 * Einen Arbeitsvertrag für eine bestimmte Person anlegen.
 *
 * Steht in deren Personalakte: "bitte die Arbeitsverträge der einzelnen
 * Mitarbeiter in deren Personalakte packen, es braucht dann den extra
 * Punkt nicht mehr" (Florian, 15.10.2026). Die Auswahlliste "für wen"
 * fällt damit weg, man ist ja schon bei der Person.
 *
 * Es entsteht ein Entwurf, den nur das Büro sieht. Erst die Freigabe
 * macht ihn für den Mitarbeiter sichtbar.
 */
export function VertragAnlegen({ benutzerId, name }: { benutzerId: string; name: string }) {
  return (
    <form action={vertragErstellen} className="space-y-4">
      <input type="hidden" name="benutzerId" value={benutzerId} />

      <p className="text-sm text-leise">
        Hat {name.split(" ")[0]} schon einen Vertrag, ersetzt der neue ihn, sobald unterschrieben
        ist. Bis dahin gilt der alte weiter. Für eine Gehaltserhöhung legst du also einfach einen
        neuen an.
      </p>

      <label className="block sm:w-1/2">
        <span className="mb-1 block text-xs text-leise">Art des Vertrags</span>
        <select name="art" defaultValue="kurzfristig">
          <option value="kurzfristig">Kurzfristige Beschäftigung (70 Tage)</option>
          <option value="minijob">Minijob (geringfügig entlohnt)</option>
          <option value="teilzeit">Teilzeit / Saison mit Festgehalt</option>
        </select>
      </label>

      {/*
        Stelle wählen, Tätigkeit und Aufgaben füllen sich mit den
        Formulierungen, die Florian vorgegeben hat. Ändern geht
        weiterhin (Florian, 01.10.2026).
      */}
      <StellenWahl />

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Vertragsbeginn</span>
          <input type="date" name="beginn" required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Vertragsende</span>
          <input type="date" name="ende" defaultValue={SPIELZEIT_ENDE} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Stundenlohn € (kurzfristig, Minijob)</span>
          <input name="stundenlohn" inputMode="decimal" placeholder="14,50" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Probezeit in Monaten (Teilzeit)</span>
          <input name="probezeit" inputMode="numeric" placeholder="3" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Monatsstunden (Teilzeit, Minijob)</span>
          <input name="monatsstunden" inputMode="decimal" placeholder="80" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Monatliches Bruttogehalt € (Teilzeit)</span>
          <input name="festgehalt" inputMode="decimal" placeholder="1.300,00" />
        </label>
      </div>

      {/*
        Anschrift und Geburtsdatum kommen aus der Geheimhaltung, dort hat
        sie die Person selbst eingetragen. Fehlen sie, trägt das Büro sie
        hier ein; im Entwurf fällt jede Lücke rot auf.
      */}
      <details className="rounded-lg border border-linie px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Personalien von Hand eintragen (nur nötig, wenn sie fehlen)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Name</span>
            <input name="name" maxLength={120} defaultValue={name} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Anschrift</span>
            <input name="anschrift" maxLength={200} placeholder="Straße 1, 89231 Neu-Ulm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Geburtsdatum</span>
            <input name="geburtsdatum" placeholder="TT.MM.JJJJ" maxLength={10} />
          </label>
        </div>
      </details>

      {/*
        Was der Hase sagt, wenn der Vertrag bereitliegt. Leer heißt: der
        Standardsatz, und bei einer Erhöhung freut er sich von selbst.
      */}
      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Botschaft vom Hasi individualisieren (freiwillig)
        </span>
        <input
          name="hasenText"
          maxLength={300}
          placeholder={`Ohne Eintrag sagt er: „${HASE_VERTRAG}“ oder bei mehr Lohn „${HASE_ERHOEHUNG}“`}
        />
      </label>

      <Absendeknopf text="Entwurf anlegen und ansehen" laeuftText="Wird angelegt..." />
    </form>
  );
}
