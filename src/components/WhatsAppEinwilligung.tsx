import { Absendeknopf } from "@/components/Absendeknopf";
import { whatsappJa, whatsappNein } from "@/app/einwilligung/aktionen";

/**
 * Die Frage nach der Einwilligung, einmal je Person.
 *
 * Sie steht im Weg, aber sie versperrt nichts: Wer sie wegklickt, sieht
 * sie beim nächsten Mal wieder, kommt aber überall hin. Eine
 * Einwilligung, ohne die man nicht arbeiten kann, wäre nicht
 * freiwillig und damit nichts wert.
 */
export function WhatsAppEinwilligung({ handy }: { handy: string }) {
  return (
    <section
      className="mx-auto mb-4 max-w-3xl rounded-lg border px-5 py-4 text-sm"
      style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
    >
      <h2 className="font-semibold">Dürfen wir dir Dienstliches per WhatsApp schicken?</h2>
      <p className="mt-1 max-w-prose">
        Es geht um kurze Hinweise rund um deinen Dienst, zum Beispiel wenn du nach der Pause noch
        eingestempelt bist. Keine Werbung, nichts Privates, und nur, wenn es wirklich etwas zu sagen gibt.
      </p>
      <p className="mt-2 max-w-prose text-xs text-leise">
        Das ist freiwillig. Sagst du nein, bekommst du dieselben Hinweise per Mail und hast keinerlei
        Nachteil. Du kannst es jederzeit wieder zurücknehmen, sag einfach im Büro Bescheid.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form action={whatsappJa} className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Deine Handynummer</span>
            <input
              name="handy"
              defaultValue={handy}
              required
              placeholder="0176 1234567"
              maxLength={30}
              className="w-44 text-sm"
            />
          </label>
          <Absendeknopf text="Ja, gern per WhatsApp" laeuftText="..." />
        </form>

        <form action={whatsappNein}>
          <button type="submit" className="rounded-md border border-linie bg-flaeche px-4 py-2 text-sm">
            Nein danke, lieber per Mail
          </button>
        </form>
      </div>
    </section>
  );
}
