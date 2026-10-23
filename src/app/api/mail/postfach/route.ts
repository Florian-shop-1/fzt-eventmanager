import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { GRAPH_BASIS, graphToken } from "@/lib/mail/versand";

/**
 * In die Postfächer des Hauses hineinsehen.
 *
 * Der Eventmanager liest heute schon mit, aber immer nur den schmalen
 * Ausschnitt, für den er gebaut wurde: die Rechnungsanhänge, die
 * Anwaltspost. Florian am 22.10.2026: "lass uns tickets@ kevin.steele@
 * und info@ so konfigurieren, dass du alles lesen kannst". Dafür ist
 * diese Adresse da.
 *
 * Die Berechtigung bei Microsoft gibt es längst, es fehlte nur die Tür.
 * Deshalb ist die Tür eng gebaut:
 *
 *  - Nur GET, nur mit MAIL_SENDE_SCHLUESSEL im Kopf x-mail-schluessel,
 *    derselbe Schlüssel wie beim Versand. Fehlt er in der Umgebung, ist
 *    die Adresse zu und nicht offen.
 *  - Nur die Postfächer aus MAIL_POSTFAECHER. Was nicht in der Liste
 *    steht, wird abgewiesen, auch wenn Microsoft es erlauben würde.
 *  - Ausschliesslich lesend. Es wird nichts beantwortet, nichts
 *    verschoben, nichts gelöscht und nichts als gelesen markiert. Wer in
 *    dem Postfach arbeitet, merkt davon nichts.
 */

export const dynamic = "force-dynamic";

/** Postfächer, in die hineingesehen werden darf. */
const VOREINSTELLUNG =
  "info@florianzimmer.com,tickets@florianzimmer.com,rechnung@florianzimmer.com,kevin.steele@florianzimmer.com";

function erlaubte(): string[] {
  return (process.env.MAIL_POSTFAECHER ?? VOREINSTELLUNG)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

/*
  Microsoft kennt seine eigenen Ordner nur unter festen Kurznamen.
  "Sent Items" oder "Gesendete Elemente" quittiert es mit "Id is
  malformed" (geprüft am 22.10.2026). Deshalb übersetzen wir die
  gebräuchlichen Namen, alles andere geht unverändert durch.
*/
function ordnerName(wunsch: string): string {
  const k = wunsch.trim().toLowerCase().replace(/\s+/g, "");
  const bekannt: Record<string, string> = {
    posteingang: "inbox",
    inbox: "inbox",
    gesendet: "sentitems",
    gesendeteelemente: "sentitems",
    sentitems: "sentitems",
    entwuerfe: "drafts",
    "entwürfe": "drafts",
    drafts: "drafts",
    geloeschteelemente: "deleteditems",
    "gelöschteelemente": "deleteditems",
    papierkorb: "deleteditems",
    deleteditems: "deleteditems",
    archiv: "archive",
    archive: "archive",
    junk: "junkemail",
    junkemail: "junkemail",
    spam: "junkemail",
  };
  return bekannt[k] ?? wunsch;
}

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function graph<T>(pfad: string): Promise<T> {
  const zugang = await graphToken();
  const antwort = await fetch(`${GRAPH_BASIS}${pfad}`, {
    headers: { Authorization: `Bearer ${zugang}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    if (antwort.status === 403) {
      throw new Error(
        "Die Anwendung darf dieses Postfach nicht lesen. In Microsoft Entra fehlt die " +
          "Berechtigung Mail.Read, oder eine Zugriffsregel schliesst das Postfach aus.",
      );
    }
    if (antwort.status === 404) throw new Error("Dieses Postfach gibt es nicht.");
    throw new Error(`Microsoft antwortet mit ${antwort.status}: ${text.slice(0, 300)}`);
  }
  return (await antwort.json()) as T;
}

interface GraphNachricht {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
}

function kurz(n: GraphNachricht) {
  return {
    id: n.id,
    betreff: n.subject ?? "",
    am: n.receivedDateTime ?? "",
    von: n.from?.emailAddress?.address ?? "",
    vonName: n.from?.emailAddress?.name ?? "",
    an: (n.toRecipients ?? []).map((e) => e.emailAddress?.address ?? "").filter(Boolean),
    gelesen: Boolean(n.isRead),
    anhaenge: Boolean(n.hasAttachments),
    anriss: n.bodyPreview ?? "",
  };
}

export async function GET(request: Request) {
  const erwartet = (process.env.MAIL_SENDE_SCHLUESSEL ?? "").trim();
  if (erwartet.length < 16) {
    return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  }
  if (!gleich((request.headers.get("x-mail-schluessel") ?? "").trim(), erwartet)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const u = new URL(request.url);
  const aktion = u.searchParams.get("aktion") ?? "liste";

  if (aktion === "postfaecher") {
    return NextResponse.json({ ok: true, postfaecher: erlaubte() });
  }

  const postfach = (u.searchParams.get("postfach") ?? "").trim().toLowerCase();
  if (!postfach) return NextResponse.json({ ok: false, fehler: "postfach fehlt" }, { status: 400 });
  if (!erlaubte().includes(postfach)) {
    return NextResponse.json(
      { ok: false, fehler: `Für ${postfach} ist diese Tür nicht freigegeben.` },
      { status: 403 },
    );
  }
  const wer = encodeURIComponent(postfach);

  try {
    if (aktion === "liste") {
      const anzahl = Math.min(Math.max(Number(u.searchParams.get("anzahl") ?? 25), 1), 100);
      const suche = (u.searchParams.get("suche") ?? "").trim();
      const ordner = (u.searchParams.get("ordner") ?? "").trim();
      const ab = (u.searchParams.get("ab") ?? "").trim();
      const bis = (u.searchParams.get("bis") ?? "").trim();

      /*
        Suchen und Filtern schliessen sich bei Microsoft gegenseitig aus:
        Wer sucht, bekommt keine Sortierung und keinen Zeitraum. Deshalb
        entweder das eine oder das andere, nicht beides.
      */
      const teile: string[] = [`$top=${anzahl}`];
      if (suche) {
        teile.push(`$search=${encodeURIComponent(`"${suche}"`)}`);
      } else {
        const wo: string[] = [];
        if (ab) wo.push(`receivedDateTime ge ${ab}T00:00:00Z`);
        if (bis) wo.push(`receivedDateTime le ${bis}T23:59:59Z`);
        if (wo.length) teile.push(`$filter=${encodeURIComponent(wo.join(" and "))}`);
        teile.push("$orderby=receivedDateTime desc");
      }
      teile.push(
        "$select=id,subject,receivedDateTime,from,toRecipients,isRead,hasAttachments,bodyPreview",
      );

      const basis = ordner
        ? `/users/${wer}/mailFolders/${encodeURIComponent(ordnerName(ordner))}/messages`
        : `/users/${wer}/messages`;
      const d = await graph<{ value: GraphNachricht[] }>(`${basis}?${teile.join("&")}`);
      console.log("[postfach] gelesen:", postfach, aktion, d.value.length, "Nachrichten");
      return NextResponse.json({
        ok: true,
        postfach,
        anzahl: d.value.length,
        mails: d.value.map(kurz),
      });
    }

    /*
      Einen Anhang herausgeben, so wie er ist.

      Gedacht fuer die Belegarbeit: Die Rechnung von Make, Anthropic oder
      Celonis haengt als PDF an der Mail, und wer sie der Buchhaltung
      weitergeben will, braucht die Datei und nicht ihren Namen. Es wird
      nur gelesen; in der Mail aendert sich nichts.
    */
    if (aktion === "anhang") {
      const id = (u.searchParams.get("id") ?? "").trim();
      const nr = Number(u.searchParams.get("nr") ?? 0);
      if (!id) return NextResponse.json({ ok: false, fehler: "id fehlt" }, { status: 400 });

      const a = await graph<{
        value: Array<{
          "@odata.type"?: string;
          name?: string;
          contentType?: string;
          contentBytes?: string;
        }>;
      }>(`/users/${wer}/messages/${encodeURIComponent(id)}/attachments`);

      const dateien = a.value.filter((x) => (x["@odata.type"] ?? "").includes("fileAttachment"));
      const gewaehlt = dateien[Number.isFinite(nr) ? nr : 0];
      if (!gewaehlt?.contentBytes) {
        return NextResponse.json(
          { ok: false, fehler: `Anhang ${nr} gibt es nicht (${dateien.length} vorhanden).` },
          { status: 404 },
        );
      }
      console.log("[postfach] Anhang geholt:", postfach, gewaehlt.name);
      const inhalt = Buffer.from(gewaehlt.contentBytes, "base64");
      return new NextResponse(new Uint8Array(inhalt), {
        headers: {
          "content-type": gewaehlt.contentType ?? "application/octet-stream",
          "content-disposition": `attachment; filename="${(gewaehlt.name ?? "anhang").replace(/[^A-Za-z0-9._ +-]/g, "_")}"`,
        },
      });
    }

    if (aktion === "mail") {
      const id = (u.searchParams.get("id") ?? "").trim();
      if (!id) return NextResponse.json({ ok: false, fehler: "id fehlt" }, { status: 400 });
      const n = await graph<GraphNachricht>(`/users/${wer}/messages/${encodeURIComponent(id)}`);
      let anhaenge: Array<{ name: string; art: string; groesse: number }> = [];
      if (n.hasAttachments) {
        const a = await graph<{
          value: Array<{ name?: string; contentType?: string; size?: number }>;
        }>(
          `/users/${wer}/messages/${encodeURIComponent(id)}/attachments?$select=name,contentType,size`,
        );
        anhaenge = a.value.map((x) => ({
          name: x.name ?? "",
          art: x.contentType ?? "",
          groesse: Number(x.size ?? 0),
        }));
      }
      console.log("[postfach] Mail gelesen:", postfach, n.subject);
      return NextResponse.json({
        ok: true,
        postfach,
        mail: { ...kurz(n), inhalt: n.body?.content ?? "", inhaltsart: n.body?.contentType ?? "" },
        anhaenge,
      });
    }

    return NextResponse.json({ ok: false, fehler: "Unbekannte Aktion." }, { status: 400 });
  } catch (f) {
    console.error("[postfach] Fehler:", postfach, f);
    return NextResponse.json({ ok: false, fehler: (f as Error).message }, { status: 502 });
  }
}
