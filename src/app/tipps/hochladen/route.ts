import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { angemeldeterBenutzer, darfTipps } from "@/lib/auth/sitzung";

/**
 * Gibt dem Browser ein Token, mit dem er das Video direkt zu Vercel Blob
 * hochlädt, an diesem Server vorbei. Videos sind zu groß für den
 * normalen Weg über eine API-Route (die hat ein Limit von wenigen MB),
 * deshalb dieser Umweg über ein Token (Florian, 28.09.2026).
 */

export const dynamic = "force-dynamic";

const ERLAUBT = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const HOECHSTENS = 1024 * 1024 * 1024; // 1 GB

export async function POST(request: Request): Promise<NextResponse> {
  const b = await angemeldeterBenutzer();
  if (!darfTipps(b)) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 401 });

  const body = (await request.json()) as HandleUploadBody;

  try {
    const antwort = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ERLAUBT,
        maximumSizeInBytes: HOECHSTENS,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(antwort);
  } catch (f) {
    return NextResponse.json({ error: f instanceof Error ? f.message : "Unbekannter Fehler" }, { status: 400 });
  }
}
