import { antwortAufPruefung, nimmAn } from "@/lib/ditix/annahme";

/**
 * Dieselbe Annahme wie /api/ditix/verkauf, mit dem Schlüssel als letztem
 * Teil des Pfads: /api/ditix/verkauf/<schluessel>. Für den Fall, dass
 * Ditix eine Adresse mit "?" nicht annimmt oder abschneidet.
 */

export const dynamic = "force-dynamic";

type Kontext = { params: Promise<{ schluessel: string }> };

export async function POST(request: Request, { params }: Kontext) {
  return nimmAn(request, { pfadSchluessel: (await params).schluessel });
}

// Ditix lässt POST oder PUT einstellen. Beides gilt als Meldung.
export async function PUT(request: Request, { params }: Kontext) {
  return nimmAn(request, { pfadSchluessel: (await params).schluessel });
}

export async function GET(request: Request, { params }: Kontext) {
  return antwortAufPruefung(request, { pfadSchluessel: (await params).schluessel });
}
