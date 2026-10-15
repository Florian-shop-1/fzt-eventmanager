import { redirect } from "next/navigation";

/**
 * Die Personalunterlagen sind in die Personalakte gewandert.
 *
 * "füge Personalakte und Personalunterlagen zusammen, alles in der
 * Personalakte reicht" (Florian, 15.10.2026). Die Seite bleibt als
 * Wegweiser stehen, weil der Link in alten Mails und Lesezeichen steht.
 */
export const dynamic = "force-dynamic";

export default function UnterlagenSeite() {
  redirect("/mitarbeiter");
}
