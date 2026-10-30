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
export function alsHtml(
  text: string,
  o: {
    /** Das Angebot. Wird zum schwarzen Knopf. */
    link?: string;
    /** Die Fusszeile unter der Mail, fertiges HTML. */
    fuss?: string;
    /** Ein zweiter, leiser Weg daneben, etwa der Aenderungswunsch. */
    nebenlink?: { href: string; text: string };
    /**
     * Mehrere Angebote in einer Mail, je eines mit eigenem Knopf.
     *
     * "schreib klar drüber Angebot 1, Angebot 2 z.b. gerne aber auch
     * was das angebot näher beschreibt (sonntags show.. etc)"
     * (Florian, 30.10.2026). Steht hier etwas, tritt es an die Stelle
     * des einzelnen Knopfes.
     */
    angebote?: Array<{ titel: string; href: string }>;
  } = {},
): string {
  const { link, fuss, nebenlink, angebote } = o;
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

  /*
    Mehrere Angebote stehen untereinander, jedes mit seiner Ueberschrift.

    Eine Liste von Knoepfen ohne Beschriftung waere fuer den Kunden ein
    Raten, welcher welcher ist. Deshalb steht ueber jedem, worum es
    geht, und der Knopf traegt nur noch "ansehen und zusagen".
  */
  const knopf = angebote?.length
    ? angebote
        .map(
          (a) =>
            `<table role="presentation" style="margin:24px 0 0;border-collapse:collapse"><tr><td ` +
            `style="border-left:3px solid #c9a84c;padding:2px 0 2px 14px">` +
            `<div style="font-weight:600;font-size:16px">${entschaerfen(a.titel)}</div>` +
            `<p style="margin:10px 0 0"><a href="${entschaerfen(a.href)}" ` +
            `style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;` +
            `padding:10px 18px;border-radius:6px;font-weight:600">Ansehen und zusagen</a></p>` +
            `</td></tr></table>`,
        )
        .join("")
    : link
      ? `<p style="margin:28px 0 0"><a href="${sicher}" ` +
        `style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;` +
        `padding:12px 20px;border-radius:6px;font-weight:600">Angebot ansehen und zusagen</a></p>`
      : "";

  /*
    Daneben der zweite Weg (Florian, 28.10.2026): "soll er auch gleich
    was klicken koennen dafuer in der mail". Bewusst leiser gesetzt als
    der Knopf, denn die Zusage bleibt das Ziel. Aber sichtbar, sonst
    landet ein Aenderungswunsch als Absage bei uns.
  */
  const neben = nebenlink
    ? `<p style="margin:10px 0 0;font-size:13px"><a href="${entschaerfen(nebenlink.href)}" ` +
      `style="color:#6b6457">${entschaerfen(nebenlink.text)}</a></p>`
    : "";

  return (
    `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">` +
    `<p style="margin:0">${koerper}</p>${knopf}${neben}${fuss ?? ""}</div>`
  );
}
