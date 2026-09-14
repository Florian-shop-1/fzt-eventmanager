/**
 * Prüft, ob ein Päckchen wirklich von Meta kommt.
 *
 * Meta unterschreibt jeden Webhook mit dem App-Geheimnis und schickt die
 * Unterschrift im Kopf mit: "X-Hub-Signature-256: sha256=<hex>". Wer die
 * Adresse kennt, aber das Geheimnis nicht, kann keine gültige Unterschrift
 * erzeugen und damit auch keine Nachrichten in den Posteingang schmuggeln.
 *
 * Wichtig ist, über die rohen Bytes zu rechnen, so wie sie ankamen. Ein
 * JSON, das gelesen und neu geschrieben wurde, sieht anders aus und fiele
 * durch.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function unterschriftStimmt(
  koerper: Buffer,
  kopf: string | null,
  geheimnis: string | undefined,
): boolean {
  if (!geheimnis || !kopf?.startsWith("sha256=")) return false;

  const erwartet = createHmac("sha256", geheimnis).update(koerper).digest();
  let gesendet: Buffer;
  try {
    gesendet = Buffer.from(kopf.slice("sha256=".length), "hex");
  } catch {
    return false;
  }
  return gesendet.length === erwartet.length && timingSafeEqual(gesendet, erwartet);
}
