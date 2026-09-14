/**
 * Prüft, ob der WhatsApp-Eingang die Päckchen von Meta richtig liest.
 * Ohne Datenbank und ohne Netz.
 *
 * Aufruf: npm run test:whatsapp
 *
 * Die Beispiele folgen dem Format aus der Dokumentation von Meta. Kommt
 * später ein echtes Päckchen, das hier anders aussieht, gehört es als
 * weiterer Fall hierher.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ereignisseLesen, lesbarerText } from "../src/lib/whatsapp/eingang";
import { unterschriftStimmt } from "../src/lib/whatsapp/unterschrift";
import { dringlichkeit } from "../src/lib/whatsapp/eile";

const KUNDE = "4917612345678";
const WIR = "497317906110";

function paeckchen(feld: string, wert: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: feld,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: WIR, phone_number_id: "123" },
              ...wert,
            },
          },
        ],
      },
    ],
  };
}

let faelle = 0;
function fall(name: string, pruefung: () => void) {
  pruefung();
  faelle += 1;
  console.log("  ok  " + name);
}

console.log("WhatsApp-Eingang");

fall("Textnachricht mit Profilname", () => {
  const e = ereignisseLesen(
    paeckchen("messages", {
      contacts: [{ profile: { name: "Anna Muster" }, wa_id: KUNDE }],
      messages: [
        { from: KUNDE, id: "wamid.1", timestamp: "1757840000", type: "text", text: { body: "Habt ihr am Samstag noch Plätze?" } },
      ],
    }),
  );
  assert.equal(e.length, 1);
  const n = e[0];
  assert.equal(n.art, "nachricht");
  if (n.art !== "nachricht") return;
  assert.equal(n.waId, KUNDE);
  assert.equal(n.profilname, "Anna Muster");
  assert.equal(n.text, "Habt ihr am Samstag noch Plätze?");
  assert.equal(n.zeitpunkt.getTime(), 1757840000 * 1000);
});

fall("Echo aus der Business App zählt beim Kunden, nicht bei uns", () => {
  const e = ereignisseLesen(
    paeckchen("smb_message_echoes", {
      message_echoes: [
        { from: WIR, to: KUNDE, id: "wamid.2", timestamp: "1757840100", type: "text", text: { body: "Ja, noch vier." } },
      ],
    }),
  );
  assert.equal(e.length, 1);
  assert.equal(e[0].art, "echo");
  assert.equal(e[0].waId, KUNDE);
});

fall("Zustellstatus mit Fehler", () => {
  const e = ereignisseLesen(
    paeckchen("messages", {
      statuses: [
        {
          id: "wamid.3",
          status: "failed",
          timestamp: "1757840200",
          recipient_id: KUNDE,
          errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "Mehr als 24 Stunden" } }],
        },
      ],
    }),
  );
  assert.equal(e.length, 1);
  const s = e[0];
  assert.equal(s.art, "status");
  if (s.art !== "status") return;
  assert.equal(s.status, "failed");
  assert.equal(s.fehler, "Re-engagement message: Mehr als 24 Stunden");
});

fall("Mehrere Nachrichten und Status in einem Päckchen", () => {
  const e = ereignisseLesen(
    paeckchen("messages", {
      messages: [
        { from: KUNDE, id: "a", timestamp: "1", type: "text", text: { body: "eins" } },
        { from: KUNDE, id: "b", timestamp: "2", type: "text", text: { body: "zwei" } },
      ],
      statuses: [{ id: "c", status: "read", timestamp: "3", recipient_id: KUNDE }],
    }),
  );
  assert.deepEqual(e.map((x) => x.art), ["nachricht", "nachricht", "status"]);
});

fall("Medien werden genannt statt verschluckt", () => {
  assert.equal(lesbarerText({ type: "image", image: { caption: "Unser Tisch" } }).text, "[Bild] Unser Tisch");
  assert.equal(lesbarerText({ type: "audio", audio: {} }).text, "[Sprachnachricht]");
  assert.equal(lesbarerText({ type: "document", document: { filename: "Rechnung.pdf" } }).text, "[Datei: Rechnung.pdf]");
  assert.equal(lesbarerText({ type: "location", location: { name: "Theater", address: "Neu-Ulm" } }).text, "[Standort] Theater, Neu-Ulm");
  assert.equal(lesbarerText({ type: "reaction", reaction: { emoji: "👍" } }).text, "reagiert mit 👍");
  assert.equal(lesbarerText({ type: "interactive", interactive: { list_reply: { title: "Samstag" } } }).text, "Samstag");
  assert.equal(lesbarerText({ type: "neuartig" }).text, "[neuartig]");
});

fall("Unbekannte Felder und Unsinn werfen nicht", () => {
  assert.deepEqual(ereignisseLesen(paeckchen("account_update", { irgendwas: 1 })), []);
  assert.deepEqual(ereignisseLesen(null), []);
  assert.deepEqual(ereignisseLesen({ entry: "kaputt" }), []);
  assert.deepEqual(ereignisseLesen(paeckchen("messages", { messages: [{ type: "text" }] })), []);
});

fall("Nummer wird auf Ziffern gebracht", () => {
  const e = ereignisseLesen(
    paeckchen("messages", {
      messages: [{ from: "+49 176 12345678", id: "x", timestamp: "1", type: "text", text: { body: "hi" } }],
    }),
  );
  assert.equal(e[0].waId, KUNDE);
});

fall("Unterschrift von Meta: echt, gefälscht, fehlend", () => {
  const geheimnis = "app-geheimnis-zum-testen";
  const koerper = Buffer.from(JSON.stringify(paeckchen("messages", { messages: [] })));
  const echt = "sha256=" + createHmac("sha256", geheimnis).update(koerper).digest("hex");

  assert.equal(unterschriftStimmt(koerper, echt, geheimnis), true);
  assert.equal(unterschriftStimmt(koerper, echt, "anderes-geheimnis"), false);
  assert.equal(unterschriftStimmt(Buffer.from(koerper.toString() + " "), echt, geheimnis), false);
  assert.equal(unterschriftStimmt(koerper, "sha256=abc", geheimnis), false);
  assert.equal(unterschriftStimmt(koerper, "sha256=zz", geheimnis), false);
  assert.equal(unterschriftStimmt(koerper, echt.replace("sha256=", ""), geheimnis), false);
  assert.equal(unterschriftStimmt(koerper, null, geheimnis), false);
  // Ohne gesetztes Geheimnis nie offen, auch nicht mit leerer Unterschrift.
  assert.equal(unterschriftStimmt(koerper, echt, undefined), false);
  assert.equal(unterschriftStimmt(koerper, "sha256=" + createHmac("sha256", "").update(koerper).digest("hex"), ""), false);
});

fall("Eile: wartet, knapp, abgelaufen, erledigt", () => {
  const jetzt = Date.UTC(2026, 8, 14, 12, 0);
  const vor = (stunden: number) => new Date(jetzt - stunden * 3600_000);

  assert.equal(dringlichkeit(null, false, jetzt).stufe, "keine");
  assert.equal(dringlichkeit(vor(1), true, jetzt).stufe, "keine");
  assert.deepEqual(dringlichkeit(vor(1), false, jetzt), { stufe: "wartet", restMinuten: 23 * 60 });
  assert.equal(dringlichkeit(vor(19.9), false, jetzt).stufe, "wartet");
  assert.deepEqual(dringlichkeit(vor(21), false, jetzt), { stufe: "knapp", restMinuten: 180 });
  assert.equal(dringlichkeit(vor(23.99), false, jetzt).stufe, "knapp");
  assert.deepEqual(dringlichkeit(vor(26), false, jetzt), { stufe: "abgelaufen", restMinuten: -120 });
  assert.equal(dringlichkeit(vor(24 + 24 * 6), false, jetzt).stufe, "abgelaufen");
  // Eine Woche nach Ablauf ist es Vergangenheit, sonst stünde die Warnung ewig da.
  assert.equal(dringlichkeit(vor(24 + 24 * 7 + 1), false, jetzt).stufe, "keine");
});

fall("Kunde mit verborgener Nummer: Kennung statt Telefonnummer", () => {
  // Aufbau nach der Dokumentation von Meta zu "business-scoped user IDs".
  const e = ereignisseLesen(
    paeckchen("messages", {
      contacts: [{ profile: { name: "Anna" }, username: "anna.ulm", user_id: "DE.13491208655302741918" }],
      messages: [
        { from_user_id: "DE.13491208655302741918", id: "wamid.bsuid", timestamp: "1757840000", type: "text", text: { body: "Hallo" } },
      ],
      statuses: [{ id: "wamid.x", status: "read", recipient_user_id: "DE.13491208655302741918" }],
    }),
  );
  assert.equal(e.length, 2, "die Nachricht darf nicht verschwinden");
  const n = e[0];
  assert.equal(n.art, "nachricht");
  if (n.art !== "nachricht") return;
  assert.equal(n.waId, "DE.13491208655302741918");
  assert.equal(n.profilname, "Anna");
  assert.equal(e[1].waId, "DE.13491208655302741918");

  // Hat der Kunde nur einen Benutzernamen und keinen Profilnamen, steht der Benutzername da.
  const nurName = ereignisseLesen(
    paeckchen("messages", {
      contacts: [{ username: "anna.ulm", user_id: "DE.1" }],
      messages: [{ from_user_id: "DE.1", id: "w", timestamp: "1", type: "text", text: { body: "x" } }],
    }),
  );
  assert.equal(nurName[0].art === "nachricht" && nurName[0].profilname, "anna.ulm");

  // Nummer und Kennung zugleich: die Nummer gewinnt, damit alte Verläufe weiterlaufen.
  const beides = ereignisseLesen(
    paeckchen("messages", {
      messages: [{ from: KUNDE, from_user_id: "DE.1", id: "w2", timestamp: "1", type: "text", text: { body: "x" } }],
    }),
  );
  assert.equal(beides[0].waId, KUNDE);

  // Unsinn als Kennung wird nicht übernommen.
  assert.deepEqual(
    ereignisseLesen(paeckchen("messages", { messages: [{ from_user_id: "<script>", id: "w3", timestamp: "1", type: "text" }] })),
    [],
  );
});

console.log(`${faelle} Fälle bestanden.`);
