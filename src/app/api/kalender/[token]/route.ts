import { kalenderText, schluesselPasst } from "@/lib/personal/kalenderfeed";

export const dynamic = "force-dynamic";

/**
 * Der abonnierbare Kalender, siehe lib/personal/kalenderfeed. Geschützt über den geheimen Schlüssel in der Adresse, nicht über
 * die Anmeldung: Outlook kann sich nicht anmelden.
 */
export async function GET(_anfrage: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!schluesselPasst(token.replace(/\.ics$/i, ""))) return new Response("Nicht gefunden", { status: 404 });
  return new Response(await kalenderText(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="fzt-termine.ics"',
    },
  });
}
