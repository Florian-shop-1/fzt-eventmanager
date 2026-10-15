import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { akte } from "@/lib/personal/akte";
import { PersonalbogenFormular } from "@/components/PersonalbogenFormular";

export const metadata = { title: "Personalbogen eintragen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Den Personalbogen für jemand anderen eintragen.
 *
 * "Personalbogen wurde wohl nicht aufbewahrt, bitte speicher diese online
 * im Eventmanager beim Mitarbeiter in der Akte" (Florian, 15.10.2026).
 * Wer vor dem 1. Oktober 2026 ausgefüllt hat, dessen Angaben gingen nur
 * als Mail an das Lohnbüro. Das Büro hat diese Mail und tippt sie hier
 * ab, statt den Mitarbeiter ein zweites Mal zu fragen.
 */
export default async function BogenEintragenSeite({ params }: { params: Promise<{ id: string }> }) {
  const b = await angemeldeterBenutzer();
  if (!darfVertraege(b)) redirect("/");

  const { id } = await params;
  const a = await akte(id);
  if (!a) notFound();

  const [vorname, ...rest] = a.name.split(" ");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Personalbogen von {a.name}</h1>
        <p className="mt-1 text-sm text-leise">
          Für den Mitarbeiter eingetragen, zum Beispiel aus der alten Mail an das Lohnbüro oder vom
          Papierbogen. Es geht dabei keine Mail hinaus, die Angaben werden nur in der Personalakte
          abgelegt.
        </p>
        <p className="mt-2 text-sm">
          <Link href={`/mitarbeiter/${a.id}`} className="underline">
            Zurück zur Personalakte
          </Link>
        </p>
      </header>

      <PersonalbogenFormular
        vorname={vorname ?? ""}
        nachname={rest.join(" ")}
        email={a.email}
        fuerBenutzerId={a.id}
      />
    </div>
  );
}
