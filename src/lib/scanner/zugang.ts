import { angemeldeterBenutzer, type AngemeldeterBenutzer } from "@/lib/auth/sitzung";

/** Scannen und prüfen dürfen Geschäftsführung, Team und Foyer. */
export async function scannerBenutzer(): Promise<AngemeldeterBenutzer | null> {
  const b = await angemeldeterBenutzer();
  return b && ["chef", "team", "foyer"].includes(b.rolle) ? b : null;
}
