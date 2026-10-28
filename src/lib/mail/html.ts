/**
 * Aus getipptem Text eine Mail mit anklickbarem Link machen.
 *
 * Eigene Datei, weil mailversand.ts mit "use server" beginnt: Dort darf
 * nur stehen, was eine Serveraktion ist, und das hier ist schlichtes
 * Rechnen mit Zeichenketten.
 */

/** Zeichen, die in HTML etwas anderes bedeuten. */
function entschaerfen(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Aus dem getippten Text eine Mail mit anklickbarem Link.
 *
 * "Der link in der Mail von Kevin war nicht anklickbar" (Florian,
 * 28.10.2026). Die Mail ging bisher als reiner Text hinaus, und ob ein
 * Mailprogramm daraus einen Link macht, entscheidet es selbst. Outlook
 * tut es nicht zuverlässig, und dann steht da eine Adresse, die der
 * Kunde von Hand abtippen müsste. Genau an der Stelle, an der er zusagen
 * soll.
 *
 * Deshalb geht jetzt zusätzlich eine Fassung mit Formatierung hinaus:
 * dieselben Worte, aber jede Webadresse als echter Link, und der Link
 * zum Angebot zusätzlich als Knopf. Der reine Text bleibt daneben
 * stehen, für Programme, die kein HTML zeigen.
 */
export function alsHtml(text: string, link?: string): string {
  const sicher = link ? entschaerfen(link.trim()) : "";

  /*
    Die nackte Adresse fliegt aus der Fassung mit Formatierung raus.

    "ich würde dem gast auch nicht so einen langen link zeigen in der
    mail" (Florian, 28.10.2026). Recht hat er: Eine Zeile wie
    .../ihr-angebot/wb94Lbt9SC9xv9UykjjKt9ic3xyl4Ngj sieht nach
    Maschine aus, nicht nach Einladung. Stattdessen steht dort der
    Knopf. Im reinen Text bleibt die Adresse stehen, denn dort ist sie
    der einzige Weg zum Angebot.

    Die Leerzeile, die dabei entsteht, wird gleich mit eingezogen.
  */
  const zeilen = entschaerfen(text)
    .split(/\r?\n/)
    .filter((zeile) => !sicher || zeile.trim() !== sicher);

  const absaetze: string[] = [];
  for (const zeile of zeilen) {
    const leer = zeile.trim() === "";
    if (leer && absaetze.length > 0 && absaetze[absaetze.length - 1].trim() === "") continue;
    absaetze.push(zeile);
  }

  const koerper = absaetze
    .map((zeile) =>
      zeile.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#8a6a1f">${u}</a>`),
    )
    .join("<br>")
    .replace(/(<br>)+$/, "");

  const knopf = link
    ? `<p style="margin:28px 0 0"><a href="${sicher}" ` +
      `style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;` +
      `padding:12px 20px;border-radius:6px;font-weight:600">Angebot ansehen und zusagen</a></p>`
    : "";

  return (
    `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">` +
    `<p style="margin:0">${koerper}</p>${knopf}</div>`
  );
}
