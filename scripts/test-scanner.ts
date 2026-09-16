/**
 * Prüft die Bausteine des Kartenscanners ohne Azure, Claude oder Brevo.
 * Aufruf: npm run test:scanner
 */
import { zuordnen } from "../src/lib/scanner/azure";
import { emailPruefen, nameSchoen, telefonSchoen, domainVorschlag } from "../src/lib/scanner/pruefen";

let fehler = 0;
function gleich(was: string, ist: unknown, soll: unknown) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"} ${was}${ok ? "" : `: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
}

// Eine Karte wie auf Florians Foto: Beschriftungen unter den Balken, Handschrift darüber.
type P = { x: number; y: number };
function wort(text: string, x: number, y: number, c = 0.99, dreh?: (p: P) => P) {
  const box = [{ x: x - 30, y: y - 10 }, { x: x + 30, y: y - 10 }, { x: x + 30, y: y + 10 }, { x: x - 30, y: y + 10 }];
  return { text, confidence: c, boundingPolygon: dreh ? box.map(dreh) : box };
}
function karte(dreh?: (p: P) => P) {
  const w = (t: string, x: number, y: number, c?: number) => wort(t, x, y, c, dreh);
  return [
    { text: "", words: [w("FLO-ZIRKUS", 500, 960), w("am", 600, 960), w("Sonntag", 700, 960)] },
    { text: "", words: [w("Anna-Lena", 300, 1065, 0.97), w("MÜLLER", 780, 1062, 0.95)] },
    { text: "", words: [w("Vorname", 338, 1130), w("Nachname", 800, 1128)] },
    { text: "", words: [w("anna.mueller", 290, 1220, 0.98), w("@gmx.de", 420, 1220, 0.97), w("0171", 700, 1222, 0.9), w("1234567", 800, 1222, 0.92)] },
    { text: "", words: [w("E-Mail", 325, 1283), w("Telefonnummer", 800, 1283)] },
  ];
}
const gerade = zuordnen(karte());
gleich("Vorname", gerade.vorname.text, "Anna-Lena");
gleich("Nachname", gerade.nachname.text, "MÜLLER");
gleich("E-Mail", gerade.email.text, "anna.mueller@gmx.de");
gleich("Telefon", gerade.telefon.text, "01711234567");
gleich("Sicherheit E-Mail", gerade.email.sicherheit, 0.97);

// Um 90 Grad gedreht und verschoben, wie ein quer gehaltenes Handy.
const quer = zuordnen(karte((p) => ({ x: 3000 - p.y, y: p.x + 50 })));
gleich("gedreht: Vorname", quer.vorname.text, "Anna-Lena");
gleich("gedreht: E-Mail", quer.email.text, "anna.mueller@gmx.de");
gleich("gedreht: Telefon", quer.telefon.text, "01711234567");

// Leicht schräg (15 Grad).
const w = (15 * Math.PI) / 180;
const schraeg = zuordnen(karte((p) => ({ x: p.x * Math.cos(w) - p.y * Math.sin(w), y: p.x * Math.sin(w) + p.y * Math.cos(w) })));
gleich("schräg: Nachname", schraeg.nachname.text, "MÜLLER");
gleich("schräg: E-Mail", schraeg.email.text, "anna.mueller@gmx.de");

gleich("ohne Beschriftung", zuordnen([{ text: "", words: [wort("hallo", 1, 1)] }]).gefunden, false);

gleich("Name schön", nameSchoen("anna-lena MÜLLER"), "Anna-Lena Müller");
gleich("Name mit von", nameSchoen("KARL von der heide"), "Karl von der Heide");
gleich("Telefon 0171", telefonSchoen("0171 / 123 45 67"), { telefon: "+491711234567", ok: true });
gleich("Telefon 0043", telefonSchoen("0043 664 1234567"), { telefon: "+436641234567", ok: true });
gleich("Telefon Unsinn", telefonSchoen("12").ok, false);
gleich("Domain gmial", domainVorschlag("gmial.com"), "gmail.com");
gleich("Domain web.de", domainVorschlag("web.de"), null);
gleich("Domain wev.de", domainVorschlag("wev.de"), "web.de");

async function netz() {
  const gut = await emailPruefen(" Anna.Mueller @GMX.de ");
  gleich("E-Mail gut", [gut.email, gut.ok], ["anna.mueller@gmx.de", true]);
  const tipp = await emailPruefen("anna@gmial.com");
  gleich("E-Mail Tippfehler", [tipp.ok, tipp.vorschlag], [false, "anna@gmail.com"]);
  const weg = await emailPruefen("anna@gibtsnicht-xq7zz.de");
  gleich("E-Mail Domain gibt es nicht", weg.ok, false);
  const form = await emailPruefen("anna@@web");
  gleich("E-Mail kaputt", form.ok, false);
}

netz().then(() => {
  console.log(fehler === 0 ? "\nAlles bestanden." : `\n${fehler} Fehler.`);
  process.exit(fehler ? 1 : 0);
});
