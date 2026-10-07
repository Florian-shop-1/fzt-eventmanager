import { notFound } from "next/navigation";
import { PutzUhr } from "@/components/PutzUhr";
import { firmaZuSchluessel, staende } from "@/lib/stempel/putzlink";

export const metadata = { title: "Stempeln" };
export const dynamic = "force-dynamic";

/**
 * Die Stempeluhr der Putzfirma, ohne Anmeldung.
 *
 * Wer putzt, hat keinen Zugang zum Eventmanager und soll auch keinen
 * brauchen. Er öffnet den Link, tippt auf seinen Namen und stempelt.
 * Kommt jemand Neues, schreibt er sich einmal hinein (Florian,
 * 07.10.2026).
 *
 * Hinter dem Link steht nichts außer dieser Uhr: keine Gästedaten, keine
 * Zahlen, kein Weg in den Eventmanager. Der lange Zufallsschlüssel ist
 * der Nachweis, wie bei der Angebotsseite für Kunden.
 */
export default async function PutzSeite({
  params,
}: {
  params: Promise<{ schluessel: string }>;
}) {
  const { schluessel } = await params;
  const firma = await firmaZuSchluessel(schluessel);
  if (!firma) notFound();

  const leute = await staende(firma.firmaId);

  return (
    <div className="mx-auto max-w-md space-y-5 p-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{firma.firma}</h1>
        <p className="mt-1 text-sm text-leise">
          Tipp auf deinen Namen, wenn du anfängst, und noch einmal, wenn du gehst.
        </p>
      </header>

      <PutzUhr schluessel={schluessel} leute={leute} />

      <p className="text-center text-xs text-leise">
        Gestempelt werden kann nur am Theater. Dafür muss der Standort freigegeben sein.
      </p>
    </div>
  );
}
