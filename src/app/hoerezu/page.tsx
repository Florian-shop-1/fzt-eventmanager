import { HoereZu } from "@/components/HoereZu";

export const metadata = { title: "Höre zu | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Live-Stichwort-Erkennung für den Bühnentechniker backstage. Die Logik
 * steckt in components/HoereZu.tsx (Mikrofon, Spracherkennung, Wake
 * Lock) und lib/hoerezu (Claude-Auswertung), diese Seite reicht die
 * Zugriffsprüfung aus dem Layout nur durch.
 */
export default function HoereZuSeite() {
  return <HoereZu />;
}
