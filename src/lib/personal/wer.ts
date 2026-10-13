/**
 * Wer gerade am geteilten Zugang arbeitet.
 *
 * Am Foyer-Tablet meldet sich niemand persönlich an. Trotzdem soll an
 * jedem erledigten Versand ein Name stehen: "Mitarbeiter soll sich
 * identifizieren, wer er ist, wenn er es macht" (Florian, 12.10.2026).
 *
 * Dafür ein Keks statt einer Anmeldung. Er hält einen Tag und steht auf
 * dem Gerät, nicht an der Person: Am nächsten Abend fragt das Programm
 * neu, und das ist richtig so, weil dann jemand anderes dort steht.
 *
 * An einem persönlichen Zugang passiert nichts davon. Dort ist der Name
 * bekannt.
 */

import { cookies } from "next/headers";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";

export const WER_KEKS = "fzt_wer";

/** Der Zusatz macht später klar, dass der Name von Hand gewählt wurde. */
const ZUSATZ = " (Foyer-Zugang)";

/** Wer gerade arbeitet, oder "" wenn es am geteilten Zugang noch offen ist. */
export async function werArbeitet(): Promise<string> {
  const b = await angemeldeterBenutzer();
  if (!b) return "";
  if (!b.geteilt) return b.name;
  const gewaehlt = (await cookies()).get(WER_KEKS)?.value?.trim() ?? "";
  return gewaehlt ? gewaehlt.slice(0, 60) + ZUSATZ : "";
}

/** Wie werArbeitet, nur mit klarer Ansage statt leerem Namen. */
export async function verlangeWer(): Promise<string> {
  const name = await werArbeitet();
  if (!name) throw new Error("Bitte oben auswählen, wer gerade hier arbeitet.");
  return name;
}

/** Nur der gewählte Name, ohne Zusatz: für die Anzeige. */
export async function gewaehlterName(): Promise<string> {
  const b = await angemeldeterBenutzer();
  if (!b?.geteilt) return "";
  return (await cookies()).get(WER_KEKS)?.value?.trim() ?? "";
}
