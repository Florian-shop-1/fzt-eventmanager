/**
 * Der Weg einer Karte vom Foto bis Brevo.
 *
 *   Foto -> Azure -> eindeutig? -> Brevo
 *                 -> unklar     -> Claude (nachts) -> sicher? -> Brevo
 *                                                  -> unklar  -> Mensch prüft -> Brevo
 *
 * "Eindeutig" ist streng: Jedes Feld hat eine hohe Lesesicherheit, die
 * Adresse hat eine gültige Form, ihre Domain nimmt Mails an und sieht nicht
 * nach Tippfehler eines bekannten Anbieters aus. Florian: "Wenn immer es
 * unklar ist, muss Claude übernehmen."
 *
 * Fehlt ein Dienst (noch kein Schlüssel), rückt die Karte eine Stufe weiter:
 * ohne Azure direkt zu Claude, ohne Claude direkt zum Menschen.
 */

import { createHash } from "node:crypto";
import { azureEingerichtet, azureLesen, AzureAusgelastet, type AzureLesung } from "./azure";
import { batchAbholen, batchAbschicken, claudeEingerichtet, type ClaudeLesung } from "./claude";
import { kontaktEintragen } from "./brevo";
import { emailFormOk, emailNormalisieren, emailPruefen, nameSchoen, telefonSchoen } from "./pruefen";
import {
  alteFotosLoeschen, batchVermerken, brevoVermerken, claudeVermerken, einstellung, ergebnisSpeichern,
  fotoBase64, karte, karteAnlegen, karten, offeneBatches, schonUebertragen, type Handelnder, type ScanKarte,
} from "@/lib/db/scanner";

/*
  Schwellen für die Lesesicherheit von Azure, gemessen an Florians ersten
  echten Karten (17.09.2026):

  - Namen: "Mustermann" richtig gelesen mit nur 0,67. Ein Name ist nie
    kritisch, deshalb großzügig.
  - E-Mail: Azure behandelt die ganze Adresse als ein Wort und gibt ihr fast
    immer um 0,7, ob richtig ("test@thorsten.de", 0,73) oder falsch
    ("Fest@Magier.de" statt "test@", 0,74). Der Wert trennt also nicht.
    Deshalb bleibt die Schwelle hoch: Eine Adresse geht praktisch immer
    noch über Claude, ehe sie zu Brevo darf.
*/
const AZURE_NAME = 0.6;
const AZURE_EMAIL = 0.95;
const AZURE_TELEFON = 0.85;

/** Wohin eine unklare Karte als Nächstes geht. */
function unklar(): "wartet_claude" | "pruefen" {
  return claudeEingerichtet() ? "wartet_claude" : "pruefen";
}

export interface Felder {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
}

/** Trägt eine fertige Karte bei Brevo ein. */
export async function abschliessen(id: string, f: Felder): Promise<void> {
  const email = emailNormalisieren(f.email);
  await ergebnisSpeichern(id, { status: "pruefen", ...f, email, unsicher: [], grund: null });
  if (await schonUebertragen(email, id)) {
    await ergebnisSpeichern(id, { status: "doppelt", grund: "Diese Adresse wurde schon früher eingetragen." });
    return;
  }
  const listen = await einstellung();
  const ids = [listen.newsletter, listen.emoji].filter((x): x is number => typeof x === "number");
  if (ids.length === 0) {
    await brevoVermerken(id, "Auf der Scanner-Seite sind noch keine Brevo-Listen gewählt.");
    return;
  }
  try {
    await kontaktEintragen({ email, vorname: f.vorname, nachname: f.nachname, telefon: f.telefon }, ids);
    await brevoVermerken(id, null);
  } catch (e) {
    await brevoVermerken(id, e instanceof Error ? e.message : "Unbekannter Fehler bei Brevo");
  }
}

async function nachAzure(id: string, a: AzureLesung): Promise<void> {
  const lesungen = {
    azure: { vorname: a.vorname.text, nachname: a.nachname.text, email: a.email.text, telefon: a.telefon.text, problem: a.problem },
  };
  if (!a.gefunden) {
    await ergebnisSpeichern(id, { status: unklar(), grund: a.problem ?? "Karte nicht erkannt", lesungen });
    return;
  }

  const befund = await emailPruefen(a.email.text);
  const tel = telefonSchoen(a.telefon.text);
  const f: Felder = {
    vorname: nameSchoen(a.vorname.text),
    nachname: nameSchoen(a.nachname.text),
    email: befund.email,
    telefon: tel.telefon,
  };

  const unsicher: string[] = [];
  const gruende: string[] = [];
  if (!f.vorname || a.vorname.sicherheit < AZURE_NAME) unsicher.push("vorname");
  if (!f.nachname || a.nachname.sicherheit < AZURE_NAME) unsicher.push("nachname");
  if (!befund.ok || a.email.sicherheit < AZURE_EMAIL) {
    unsicher.push("email");
    gruende.push(...befund.maengel);
  }
  if (a.telefon.text && (!tel.ok || a.telefon.sicherheit < AZURE_TELEFON)) unsicher.push("telefon");

  const alle = { ...lesungen, emailMaengel: befund.maengel, emailVorschlag: befund.vorschlag };
  if (unsicher.length > 0) {
    await ergebnisSpeichern(id, {
      status: unklar(),
      ...f,
      unsicher,
      lesungen: alle,
      grund: gruende[0] ?? `Azure ist sich nicht sicher: ${unsicher.join(", ")}`,
    });
    return;
  }
  await ergebnisSpeichern(id, { status: "pruefen", lesungen: alle });
  await abschliessen(id, f);
}

async function nachClaude(id: string, c: ClaudeLesung): Promise<void> {
  const vorher = await karte(id);
  const befund = await emailPruefen(c.email.text);
  const tel = telefonSchoen(c.telefon.text);
  const telefonUnklar = c.telefon.sicherheit === "unsicher" || !tel.ok;

  const f: Felder = {
    vorname: nameSchoen(c.vorname.text),
    nachname: nameSchoen(c.nachname.text),
    email: befund.email,
    // Eine unklare Nummer wird weggelassen statt die Karte aufzuhalten. Sie
    // ist für den Newsletter nicht nötig und bleibt unten in den Lesungen stehen.
    telefon: telefonUnklar ? "" : tel.telefon,
  };

  const lesungen = {
    claude: {
      vorname: c.vorname.text, nachname: c.nachname.text, email: c.email.text, telefon: c.telefon.text,
      sicherheit: {
        vorname: c.vorname.sicherheit, nachname: c.nachname.sicherheit,
        email: c.email.sicherheit, telefon: c.telefon.sicherheit,
      },
      alternativen: c.email_alternativen.map(emailNormalisieren).filter((x) => x && x !== befund.email),
      hinweis: c.hinweis,
    },
    emailMaengel: befund.maengel,
    emailVorschlag: befund.vorschlag,
  };

  if (!c.karte_ok) {
    await ergebnisSpeichern(id, {
      status: "pruefen", ...f, unsicher: ["email"], lesungen,
      grund: c.hinweis || "Claude erkennt hier keine ausgefüllte Karte. Verwerfen oder von Hand eintragen.",
    });
    return;
  }

  const unsicher: string[] = [];
  const gruende: string[] = [];
  if (c.vorname.sicherheit === "unsicher") unsicher.push("vorname");
  if (c.nachname.sicherheit === "unsicher") unsicher.push("nachname");
  if (c.email.sicherheit !== "sicher" || !befund.ok) {
    unsicher.push("email");
    gruende.push(c.email.sicherheit === "leer" ? "Keine E-Mail auf der Karte" : (befund.maengel[0] ?? c.hinweis) || "Claude ist bei der Adresse unsicher");
  }
  const azureEmail = emailNormalisieren(vorher?.lesungen.azure?.email ?? "");
  if (!unsicher.includes("email") && emailFormOk(azureEmail) && azureEmail !== befund.email) {
    unsicher.push("email");
    gruende.push(`Azure liest „${azureEmail}“, Claude „${befund.email}“`);
  }

  if (unsicher.length > 0) {
    await ergebnisSpeichern(id, {
      status: "pruefen", ...f, unsicher, lesungen,
      grund: gruende[0] ?? `Claude ist sich nicht sicher: ${unsicher.join(", ")}`,
    });
    return;
  }
  await ergebnisSpeichern(id, { status: "pruefen", lesungen });
  await abschliessen(id, f);
}

export type UploadErgebnis = { doppeltesFoto: true } | { doppeltesFoto: false; karte: ScanKarte | null; hinweis?: string };

/** Nimmt ein Foto an und liest es sofort mit Azure, wenn möglich. */
export async function fotoVerarbeiten(fotoB64: string, von: Handelnder): Promise<UploadErgebnis> {
  const hash = createHash("sha256").update(fotoB64).digest("hex");
  const id = await karteAnlegen(fotoB64, hash, von);
  if (!id) return { doppeltesFoto: true };

  let hinweis: string | undefined;
  if (azureEingerichtet()) {
    try {
      await nachAzure(id, await azureLesen(Buffer.from(fotoB64, "base64")));
    } catch (e) {
      if (e instanceof AzureAusgelastet) {
        hinweis = e.message + " Die Karte wird nachts gelesen.";
      } else {
        hinweis = e instanceof Error ? e.message : "Azure hat nicht geantwortet.";
      }
      await ergebnisSpeichern(id, { status: unklar(), grund: hinweis });
    }
  } else {
    await ergebnisSpeichern(id, { status: unklar(), grund: "Azure ist noch nicht eingerichtet." });
  }
  return { doppeltesFoto: false, karte: await karte(id), hinweis };
}

export interface Nachtlauf {
  abgeholt: number;
  abgeschickt: number;
  fotosGeloescht: number;
  fehler: string[];
}

/** Holt fertige Claude-Ergebnisse ab, schickt neue unklare Karten los, räumt Fotos auf. */
export async function nachtlauf(): Promise<Nachtlauf> {
  const lauf: Nachtlauf = { abgeholt: 0, abgeschickt: 0, fotosGeloescht: 0, fehler: [] };

  if (claudeEingerichtet()) {
    for (const batch of await offeneBatches()) {
      try {
        const ergebnisse = await batchAbholen(batch);
        if (!ergebnisse) continue;
        for (const r of ergebnisse) {
          lauf.abgeholt++;
          if (r.ok) {
            await claudeVermerken(r.id, r.kostenCent);
            await nachClaude(r.id, r.lesung);
          } else {
            await ergebnisSpeichern(r.id, {
              status: r.nochmal ? "wartet_claude" : "pruefen",
              grund: r.nochmal ? `${r.fehler}, wird erneut versucht` : r.fehler,
            });
          }
        }
      } catch (e) {
        lauf.fehler.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Karten, die Azure wegen Überlastung liegen ließ, gehen direkt zu Claude.
  for (const k of await karten(["neu"], 500)) {
    await ergebnisSpeichern(k.id, { status: unklar(), grund: k.grund ?? "Azure hatte keine Zeit" });
  }

  if (claudeEingerichtet()) {
    const warten = await karten(["wartet_claude"], 200);
    const mitFoto: Array<{ id: string; fotoBase64: string }> = [];
    for (const k of warten) {
      const b = await fotoBase64(k.id);
      if (b) mitFoto.push({ id: k.id, fotoBase64: b });
      else await ergebnisSpeichern(k.id, { status: "pruefen", grund: "Das Foto ist nicht mehr da." });
    }
    if (mitFoto.length > 0) {
      try {
        const batch = await batchAbschicken(mitFoto);
        await batchVermerken(mitFoto.map((k) => k.id), batch);
        lauf.abgeschickt = mitFoto.length;
      } catch (e) {
        lauf.fehler.push(e instanceof Error ? e.message : String(e));
      }
    }
  } else {
    for (const k of await karten(["wartet_claude"], 500)) {
      await ergebnisSpeichern(k.id, { status: "pruefen", grund: k.grund ?? "Claude ist noch nicht eingerichtet." });
    }
  }

  lauf.fotosGeloescht = await alteFotosLoeschen(30);
  return lauf;
}
