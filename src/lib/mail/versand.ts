/**
 * Mailversand über das Microsoft-365-Postfach.
 *
 * Verschickt wird nicht über einen externen Dienst, sondern über das
 * echte Postfach tickets@florianzimmer.com. Das hat drei Gründe, und
 * alle drei sind im Alltag wichtiger als sie klingen:
 *
 *  - Die Mail steht danach unter "Gesendete Elemente". Wer nachsehen
 *    will, was der Kunde bekommen hat, findet es dort, wo er es sucht.
 *  - Antwortet der Kunde, landet die Antwort im normalen Posteingang und
 *    nicht in einem Dienst, in den niemand hineinschaut.
 *  - Am DNS ist nichts zu ändern. Der SPF-Eintrag der Domain erlaubt
 *    Microsoft ohnehin, und er endet auf "-all". An dieser Zeile etwas
 *    zu verstellen, legt im Zweifel den Mailverkehr der Firma lahm.
 *
 * Angemeldet wird als Anwendung, nicht als Mensch. Ein Zugang, der an
 * einer Anmeldung hängt, läuft regelmässig ab, und zwar erfahrungsgemäss
 * genau dann, wenn ein Angebot raus muss.
 */

const ANMELDUNG = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

export interface Mail {
  an: string | string[];
  betreff: string;
  /** Reiner Text. Pflicht, denn nicht jedes Programm zeigt HTML. */
  text: string;
  /** Fassung mit Formatierung. Fehlt sie, geht der Text raus. */
  html?: string;
  /** Wohin Antworten gehen sollen, falls nicht an den Absender. */
  antwortAn?: string;
  /** Stille Kopie, etwa an das eigene Postfach. */
  blindkopie?: string | string[];
}

interface Einstellungen {
  mandant: string;
  anwendung: string;
  geheimnis: string;
  absender: string;
}

/**
 * Liest die Zugangsdaten und sagt deutlich, was fehlt.
 *
 * Eine Mail, die nicht ankommt, ist schlimmer als eine Fehlermeldung.
 * Deshalb wird hier abgebrochen und nicht stillschweigend nichts getan.
 */
function einstellungen(): Einstellungen {
  const mandant = process.env.MS_MANDANT_ID ?? "";
  const anwendung = process.env.MS_ANWENDUNG_ID ?? "";
  const geheimnis = process.env.MS_GEHEIMNIS ?? "";
  const absender = process.env.MAIL_ABSENDER ?? "";

  const fehlt = [
    !mandant && "MS_MANDANT_ID",
    !anwendung && "MS_ANWENDUNG_ID",
    !geheimnis && "MS_GEHEIMNIS",
    !absender && "MAIL_ABSENDER",
  ].filter(Boolean);

  if (fehlt.length > 0) {
    throw new Error(
      `Der Mailversand ist noch nicht eingerichtet. Es fehlt: ${fehlt.join(", ")}. ` +
        `Die Werte gehören bei Vercel unter Settings, Environment Variables.`,
    );
  }

  return { mandant, anwendung, geheimnis, absender };
}

/**
 * Das Zugangstoken, zwischengespeichert.
 *
 * Microsoft gibt es für eine Stunde aus. Es bei jeder Mail neu zu holen
 * wäre eine zusätzliche Anfrage nach draussen und ein zusätzlicher Weg,
 * auf dem etwas schiefgehen kann.
 */
let token: { wert: string; gueltigBis: number } | null = null;

async function zugangstoken(e: Einstellungen): Promise<string> {
  // Eine Minute Sicherheitsabstand, damit ein Token nicht mitten im
  // Versand abläuft.
  if (token && token.gueltigBis > Date.now() + 60_000) return token.wert;

  const antwort = await fetch(`${ANMELDUNG}/${e.mandant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.anwendung,
      client_secret: e.geheimnis,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(15000),
  });

  const daten = (await antwort.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!antwort.ok || !daten.access_token) {
    // Die häufigsten Fälle beim Namen nennen, statt Microsofts
    // Rohmeldung durchzureichen.
    const roh = daten.error_description ?? daten.error ?? `HTTP ${antwort.status}`;
    if (/AADSTS7000215/.test(roh)) {
      throw new Error(
        "Das Client-Geheimnis stimmt nicht. Wurde es bei Vercel vollständig eingetragen? " +
          "Microsoft zeigt es nur einmal an, danach lässt es sich nur neu erzeugen.",
      );
    }
    if (/AADSTS700016|AADSTS90002/.test(roh)) {
      throw new Error(
        "Anwendungs-ID oder Verzeichnis-ID stimmen nicht. Beide stehen in Entra " +
          "auf der Übersichtsseite der App-Registrierung.",
      );
    }
    if (/expired|AADSTS7000222/.test(roh)) {
      throw new Error(
        "Das Client-Geheimnis ist abgelaufen. In Entra unter Zertifikate & Geheimnisse " +
          "ein neues anlegen und bei Vercel eintragen.",
      );
    }
    throw new Error(`Anmeldung bei Microsoft fehlgeschlagen: ${roh}`);
  }

  token = {
    wert: daten.access_token,
    gueltigBis: Date.now() + (daten.expires_in ?? 3600) * 1000,
  };
  return token.wert;
}

/** Aus einer oder mehreren Adressen die Form, die Graph erwartet. */
function empfaenger(wer: string | string[] | undefined) {
  if (!wer) return undefined;
  const liste = Array.isArray(wer) ? wer : [wer];
  return liste
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => ({ emailAddress: { address: a } }));
}

/**
 * Verschickt eine Mail.
 *
 * Wirft bei jedem Fehler, statt still zu scheitern. Wer eine Mail
 * abschickt, muss wissen, ob sie weg ist.
 */
export async function mailVerschicken(mail: Mail): Promise<void> {
  const e = einstellungen();
  const zugang = await zugangstoken(e);

  const antwort = await fetch(`${GRAPH}/users/${encodeURIComponent(e.absender)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${zugang}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: mail.betreff,
        body: mail.html
          ? { contentType: "HTML", content: mail.html }
          : { contentType: "Text", content: mail.text },
        toRecipients: empfaenger(mail.an),
        bccRecipients: empfaenger(mail.blindkopie),
        replyTo: empfaenger(mail.antwortAn),
      },
      // Die Mail soll im Postfach unter "Gesendete Elemente" landen.
      // Das ist der halbe Grund, warum wir diesen Weg gewählt haben.
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (antwort.status === 202) return;

  const roh = await antwort.text();

  if (antwort.status === 403) {
    throw new Error(
      "Microsoft lehnt den Versand ab. Wahrscheinlich fehlt die Administratorzustimmung " +
        "für Mail.Send, oder die Zugriffsrichtlinie erlaubt das Postfach " +
        `${e.absender} nicht. Antwort von Microsoft: ${roh.slice(0, 300)}`,
    );
  }
  if (antwort.status === 404) {
    throw new Error(
      `Das Postfach ${e.absender} wurde nicht gefunden. Stimmt die Adresse in MAIL_ABSENDER?`,
    );
  }
  throw new Error(`Der Versand ist fehlgeschlagen (${antwort.status}). ${roh.slice(0, 300)}`);
}

/**
 * Prüft die Einrichtung, ohne eine Mail zu verschicken.
 *
 * Gedacht für eine Einstellungsseite: Man will wissen, ob es geht,
 * bevor das erste Angebot an einen Kunden rausgeht.
 */
export async function versandPruefen(): Promise<{ gut: boolean; meldung: string }> {
  try {
    const e = einstellungen();
    await zugangstoken(e);
    return {
      gut: true,
      meldung: `Anmeldung bei Microsoft erfolgreich. Absender: ${e.absender}.`,
    };
  } catch (f) {
    return { gut: false, meldung: f instanceof Error ? f.message : "Unbekannter Fehler" };
  }
}
