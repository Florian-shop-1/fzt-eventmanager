import {
  holeShortcuts,
  shortcutAnlegen,
  shortcutEntfernen,
  shortcutSpeichern,
  type Shortcut,
} from "@/lib/db/shortcuts";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";

export const metadata = { title: "Shortcuts | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Links, die im Alltag ständig gebraucht werden.
 *
 * Sie stehen in der gemeinsamen Datenbank, nicht mehr im Browser. Alle
 * sehen dieselbe Liste, und sie überlebt einen Rechnerwechsel.
 *
 * Ändern darf sie das Büro, öffnen jeder, der die Seite sieht.
 */
export default async function ShortcutsSeite() {
  const benutzer = await angemeldeterBenutzer();
  const darfAendern = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
  const shortcuts = await holeShortcuts();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Shortcuts</h1>
        <p className="mt-1 text-sm text-leise">
          Schneller Zugriff auf die Tabellen und Werkzeuge, die täglich gebraucht werden.
          {darfAendern
            ? " Die Liste ist für alle gleich."
            : " Zum Öffnen. Geändert wird sie im Büro."}
        </p>
      </header>

      {shortcuts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">Noch keine Shortcuts angelegt</div>
          <p className="mt-1 text-leise">
            {darfAendern
              ? "Leg unten den ersten an."
              : "Sobald das Büro welche einträgt, stehen sie hier."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((s) => (
            <Karte key={s.id} shortcut={s} darfAendern={darfAendern} />
          ))}
        </div>
      )}

      {darfAendern && (
        <form action={shortcutAnlegen}>
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
          >
            Shortcut hinzufügen
          </button>
        </form>
      )}
    </div>
  );
}

function Karte({ shortcut, darfAendern }: { shortcut: Shortcut; darfAendern: boolean }) {
  // Nur ansehen: kein Formular, sondern der Link und die Notiz.
  if (!darfAendern) {
    return (
      <div className="flex flex-col rounded-lg border border-linie bg-flaeche p-4">
        <div className="font-medium">{shortcut.titel}</div>
        {shortcut.notiz && <div className="mt-0.5 text-xs text-leise">{shortcut.notiz}</div>}
        <div className="mt-3">
          {shortcut.url ? (
            <Oeffnen url={shortcut.url} />
          ) : (
            <span className="text-xs text-leise">Noch keine Adresse eingetragen</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-linie bg-flaeche p-4">
      <form action={shortcutSpeichern.bind(null, shortcut.id)} className="space-y-2">
        <input type="text" name="titel" defaultValue={shortcut.titel} className="font-medium" />
        <input
          type="url"
          name="url"
          placeholder="https://docs.google.com/..."
          defaultValue={shortcut.url}
        />
        <input
          type="text"
          name="notiz"
          placeholder="Wofür ist das?"
          defaultValue={shortcut.notiz}
          className="text-xs"
        />
        <button
          type="submit"
          className="w-full rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold"
        >
          Sichern
        </button>
      </form>

      <div className="mt-3 flex items-center justify-between border-t border-linie pt-3">
        {shortcut.url ? (
          <Oeffnen url={shortcut.url} />
        ) : (
          <span className="text-xs text-leise">Noch keine Adresse eingetragen</span>
        )}
        <form action={shortcutEntfernen.bind(null, shortcut.id)}>
          <button
            type="submit"
            title="Entfernen"
            className="rounded px-2 py-1 text-leise hover:bg-blocker-hell hover:text-blocker"
          >
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}

function Oeffnen({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
    >
      Öffnen
    </a>
  );
}
