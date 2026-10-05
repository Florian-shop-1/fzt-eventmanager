import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { bereicheFuer, reiheLesen } from "@/lib/tipps/db";
import { ReihenAnsicht } from "@/components/ReihenAnsicht";

export const dynamic = "force-dynamic";

/**
 * Eine Anleitung, Schritt für Schritt.
 *
 * Eigene Seite statt alles in der Übersicht: Wer eine Anleitung durchgeht,
 * soll nichts anderes sehen, und der Link lässt sich weitergeben
 * (Florian, 29.09.2026).
 */
export default async function ReihenSeite({ params }: { params: Promise<{ id: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");

  const { id } = await params;
  const reihe = await reiheLesen(id);
  if (!reihe) notFound();

  /*
    Auch ueber den Link nur den eigenen Bereich.

    Die Uebersicht zeigt dem Foyer nur Foyer-Anleitungen. Ein
    weitergegebener Link waere sonst die Hintertuer (Florian, 05.10.2026).
  */
  if (!bereicheFuer(benutzer.rolle).includes(reihe.bereich)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link href="/tipps" className="text-sm text-leise underline">
          zurück zu Tipps &amp; Tricks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{reihe.titel}</h1>
        {reihe.beschreibung && <p className="max-w-prose text-sm text-leise">{reihe.beschreibung}</p>}
        <p className="text-xs text-leise">
          {reihe.schritte.length} {reihe.schritte.length === 1 ? "Schritt" : "Schritte"} · von {reihe.erstelltVon}
        </p>
      </header>

      <ReihenAnsicht reiheId={reihe.id} titel={reihe.titel} schritte={reihe.schritte} />
    </div>
  );
}
