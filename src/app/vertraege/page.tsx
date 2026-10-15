import { redirect } from "next/navigation";

/**
 * Die Arbeitsverträge stehen jetzt in der Personalakte.
 *
 * "bitte die Arbeitsverträge der einzelnen Mitarbeiter in deren
 * Personalakte packen, es braucht dann den extra Punkt nicht mehr"
 * (Florian, 15.10.2026). Anlegen, ansehen und freigeben geht dort bei
 * der jeweiligen Person. Diese Seite bleibt als Wegweiser, weil der Link
 * in alten Mails steht.
 */
export const dynamic = "force-dynamic";

export default function VertraegeSeite() {
  redirect("/mitarbeiter");
}
