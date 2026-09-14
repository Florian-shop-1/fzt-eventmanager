/**
 * Liest, was WhatsApp über den Webhook meldet.
 *
 * Absichtlich ohne Datenbank und ohne Netz: nur ein Päckchen rein, eine
 * Liste von Ereignissen raus. So lässt es sich mit Beispielpäckchen prüfen,
 * ohne dass eine echte Nachricht nötig ist (scripts/test-whatsapp.ts).
 *
 * Das Format ist das von Meta:
 *
 *   entry[].changes[].field = "messages"
 *     value.contacts[]   wer schreibt, mit seinem Profilnamen
 *     value.messages[]   Nachrichten vom Kunden
 *     value.statuses[]   Zustellung unserer Nachrichten
 *
 *   entry[].changes[].field = "smb_message_echoes"
 *     value.message_echoes[]  was jemand in der Business App geschrieben hat.
 *     Kommt nur, solange eine Nummer zugleich in der App läuft. Seit dem
 *     Umzug ganz zu Meta (migrations/031) nicht mehr, gelesen wird es
 *     trotzdem, falls die Nummer je wieder in die App geht.
 *
 * Alles andere wird still übergangen. WhatsApp schickt auch Meldungen zu
 * Kontosynchronisation und Vorlagen, die hier niemand braucht, und ein
 * Fehler an der Stelle würde nur dazu führen, dass Meta dasselbe
 * Päckchen immer wieder schickt.
 */

import { istKennung } from "./kennung";

export type Ereignis =
  | {
      art: "nachricht";
      waId: string;
      profilname: string | null;
      metaId: string;
      zeitpunkt: Date;
      typ: string;
      text: string;
      roh: unknown;
    }
  | {
      art: "echo";
      waId: string;
      metaId: string;
      zeitpunkt: Date;
      typ: string;
      text: string;
      roh: unknown;
    }
  | {
      art: "status";
      waId: string | null;
      metaId: string;
      status: string;
      fehler: string | null;
    };

type Objekt = Record<string, unknown>;

const objekt = (w: unknown): Objekt => (w && typeof w === "object" ? (w as Objekt) : {});
const liste = (w: unknown): unknown[] => (Array.isArray(w) ? w : []);
const text = (w: unknown): string => (typeof w === "string" ? w : "");

/** WhatsApp liefert Sekunden seit 1970 als Text. */
function zeit(w: unknown): Date {
  const sekunden = Number(w);
  return Number.isFinite(sekunden) && sekunden > 0 ? new Date(sekunden * 1000) : new Date();
}

/** Nur Ziffern: So steht die Nummer in wa_id, egal wie sie gemeldet wurde. */
function nummer(w: unknown): string {
  return text(w).replace(/\D/g, "");
}

/**
 * Die Kennung des Kunden: seine Nummer, oder, wenn er sie hinter einem
 * Benutzernamen verbirgt, die Kennung, die Meta nur für uns vergibt.
 * Siehe kennung.ts.
 */
function kunde(telefon: unknown, nutzerId: unknown): string {
  const n = nummer(telefon);
  if (n) return n;
  const k = text(nutzerId).trim();
  return istKennung(k) ? k : "";
}

/**
 * Was von einer Nachricht im Posteingang zu lesen ist.
 *
 * Bilder, Sprachnachrichten und Dateien zeigt der Posteingang vorerst nicht
 * selbst an, sondern nennt sie. Wer sie sehen muss, schaut in die App; dort
 * sind sie ja weiterhin.
 */
export function lesbarerText(nachricht: unknown): { typ: string; text: string } {
  const n = objekt(nachricht);
  const typ = text(n.type) || "unbekannt";
  const teil = objekt(n[typ]);
  const beschriftung = text(teil.caption);
  const mit = (hinweis: string) => (beschriftung ? `${hinweis} ${beschriftung}` : hinweis);

  switch (typ) {
    case "text":
      return { typ, text: text(teil.body) };
    case "image":
      return { typ, text: mit("[Bild]") };
    case "video":
      return { typ, text: mit("[Video]") };
    case "sticker":
      return { typ, text: "[Sticker]" };
    case "audio":
      return { typ, text: "[Sprachnachricht]" };
    case "document":
      return { typ, text: mit(`[Datei${text(teil.filename) ? ": " + text(teil.filename) : ""}]`) };
    case "location": {
      const ort = [text(teil.name), text(teil.address)].filter(Boolean).join(", ");
      return { typ, text: ort ? `[Standort] ${ort}` : "[Standort]" };
    }
    case "contacts":
      return { typ, text: "[Kontakt geteilt]" };
    case "reaction":
      return { typ, text: text(teil.emoji) ? `reagiert mit ${text(teil.emoji)}` : "[Reaktion entfernt]" };
    case "button":
      return { typ, text: text(teil.text) || "[Knopf gedrückt]" };
    case "interactive": {
      const antwort = objekt(teil.button_reply).title ?? objekt(teil.list_reply).title;
      return { typ, text: text(antwort) || "[Auswahl]" };
    }
    default:
      return { typ, text: `[${typ}]` };
  }
}

export function ereignisseLesen(paeckchen: unknown): Ereignis[] {
  const ereignisse: Ereignis[] = [];

  for (const eintrag of liste(objekt(paeckchen).entry)) {
    for (const aenderung of liste(objekt(eintrag).changes)) {
      const feld = text(objekt(aenderung).field);
      const wert = objekt(objekt(aenderung).value);

      if (feld === "messages") {
        // Profilnamen gehören zu den Nachrichten desselben Päckchens.
        const namen = new Map<string, string>();
        for (const k of liste(wert.contacts)) {
          const kontakt = objekt(k);
          const name = text(objekt(kontakt.profile).name) || text(kontakt.username);
          if (!name) continue;
          // Unter beiden Schlüsseln merken: Die Nachricht nennt die Nummer
          // oder nur die Nutzerkennung, je nachdem, was Meta hat.
          if (nummer(kontakt.wa_id)) namen.set(nummer(kontakt.wa_id), name);
          if (text(kontakt.user_id)) namen.set(text(kontakt.user_id), name);
        }

        for (const m of liste(wert.messages)) {
          const n = objekt(m);
          const waId = kunde(n.from, n.from_user_id);
          const metaId = text(n.id);
          if (!waId || !metaId) continue;
          ereignisse.push({
            art: "nachricht",
            waId,
            profilname: namen.get(waId) ?? namen.get(text(n.from_user_id)) ?? null,
            metaId,
            zeitpunkt: zeit(n.timestamp),
            ...lesbarerText(n),
            roh: n,
          });
        }

        for (const s of liste(wert.statuses)) {
          const st = objekt(s);
          const metaId = text(st.id);
          if (!metaId) continue;
          const erster = objekt(liste(st.errors)[0]);
          const fehler = [text(erster.title), text(objekt(erster.error_data).details)]
            .filter(Boolean)
            .join(": ");
          ereignisse.push({
            art: "status",
            waId: kunde(st.recipient_id, st.recipient_user_id) || null,
            metaId,
            status: text(st.status),
            fehler: fehler || null,
          });
        }
      }

      if (feld === "smb_message_echoes") {
        for (const m of liste(wert.message_echoes)) {
          const n = objekt(m);
          // Beim Echo ist der Kunde der Empfänger, nicht der Absender.
          const waId = kunde(n.to, n.to_user_id);
          const metaId = text(n.id);
          if (!waId || !metaId) continue;
          ereignisse.push({
            art: "echo",
            waId,
            metaId,
            zeitpunkt: zeit(n.timestamp),
            ...lesbarerText(n),
            roh: n,
          });
        }
      }
    }
  }

  return ereignisse;
}
