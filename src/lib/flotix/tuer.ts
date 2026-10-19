/**
 * Die Tür zu FloTix.
 *
 * Bisher kamen Gäste, Menüs, Parkplätze und der Gutscheinversand aus vier
 * Google-Tabellen, die der alte Shop befüllt hat. FloTix befüllt sie
 * nicht, hat die Daten aber vollständig in seiner eigenen Datenbank
 * (Florian, 20.10.2026: "wir möchten dich umstellen, so dass du alle
 * Infos bezüglich der Tickets aus unserem neuen FloTix-Shop bekommst").
 *
 * Diese Datei ist die einzige Stelle, an der der Eventmanager etwas von
 * FloTix weiß. Umgelegt wird mit einer einzigen Umgebungsvariablen:
 *
 *   QUELLE=flotix   plus FLOTIX_KEY
 *
 * Fehlt eine der beiden, bleibt alles beim alten Weg. Zurückgeschaltet
 * wird genauso: Variable weg, neu veröffentlichen, eine Minute. Das ist
 * bewusst dieselbe Mechanik, mit der Julian den Shop umschaltet.
 *
 * Gelesen wird nur. In FloTix schreibt der Eventmanager nichts.
 */

const FLOTIX_URL = process.env.FLOTIX_URL ?? "https://flotix.florianzimmertheater.de";

/** Unter diesem Kennzeichen liegt alles, was von FloTix kommt. */
export const KENNZEICHEN = "flotix";

/** Liest der Eventmanager seine Ticketdaten aus FloTix? */
export function flotixQuelle(): boolean {
  return (
    (process.env.QUELLE ?? "").trim().toLowerCase() === "flotix" &&
    (process.env.FLOTIX_KEY ?? "").trim().length > 15
  );
}

/**
 * Eine Position einer Bestellung, so wie sie verkauft wurde.
 *
 * Absichtlich ungedeutet: Was ein Menü ist, was ein Ticket und was ein
 * Parkplatz, entscheidet weiterhin der Eventmanager anhand der
 * Bezeichnung, genau wie bei der Tabelle. Damit bleibt diese Erkennung an
 * einer Stelle im Haus, und solange beide Quellen parallel laufen,
 * vergleichen wir wirklich dasselbe.
 */
export interface FlotixPosition {
  bezeichnung: string;
  menge: number;
  einzelpreisCent: number;
  /** true bei einem Platz im Saal. */
  mitPlatz: boolean;
  /** FloTix' eigene Einordnung: "admission", "addon" oder leer. */
  art: string;
  geschenk: boolean;
  allergien: unknown;
}

export interface FlotixBestellung {
  id: string;
  bestellnummer: string;
  status: string;
  eingegangen: string;
  bezahltAm: string | null;
  storniertAm: string | null;
  herkunft: string;
  freikarte: boolean;
  freikarteGrund: string | null;
  allergien: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  firma: string | null;
  /** Kennung der Vorstellung in FloTix. Tritt an die Stelle der Ditix-Kennung. */
  vorstellungId: string;
  /** Dieselbe Vorstellung in Ditix, falls sie von dort übernommen wurde. */
  ditixEventId: string | null;
  beginn: string;
  vorstellungStatus: string;
  showTitel: string;
  positionen: FlotixPosition[];
}

export interface FlotixVorstellung {
  /** Kennung in FloTix. */
  id: string;
  /** Die alte Ditix-Kennung, unter der die Buchungen in den Tabellen stehen. */
  ditixEventId: string | null;
  beginn: string;
  status: string;
  showTitel: string;
}

export interface FlotixSendung {
  id: string;
  bestellnummer: string;
  status: string;
  kaufdatum: string;
  bezahltAm: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  betragCents: number;
  versandCents: number;
  zustellung: string;
  motiv: string;
  fuer: string | null;
  von: string | null;
  widmung: string | null;
  empfaenger: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  versandGemeldetAm: string | null;
  versendetAm: string | null;
  notiz: string | null;
}

/*
  Was FloTix schickt, kommt in Schlangenschrift (starts_at, show_titel).
  Umbenannt wird genau hier, damit der Rest des Programms aussieht wie
  bisher.
*/
function alsBestellung(r: Record<string, unknown>): FlotixBestellung {
  const t = (w: unknown): string => (w === null || w === undefined ? "" : String(w));
  const roh = Array.isArray(r.positionen) ? (r.positionen as Array<Record<string, unknown>>) : [];

  return {
    id: t(r.id),
    bestellnummer: t(r.bestellnummer),
    status: t(r.status),
    eingegangen: t(r.eingegangen),
    bezahltAm: r.bezahlt_am ? t(r.bezahlt_am) : null,
    storniertAm: r.storniert_am ? t(r.storniert_am) : null,
    herkunft: t(r.herkunft),
    freikarte: r.freikarte === true,
    freikarteGrund: r.freikarte_grund ? t(r.freikarte_grund) : null,
    allergien: r.allergien ? t(r.allergien) : null,
    vorname: r.vorname ? t(r.vorname) : null,
    nachname: r.nachname ? t(r.nachname) : null,
    email: r.email ? t(r.email) : null,
    telefon: r.telefon ? t(r.telefon) : null,
    firma: r.firma ? t(r.firma) : null,
    vorstellungId: t(r.vorstellung_id),
    beginn: t(r.beginn),
    vorstellungStatus: t(r.vorstellung_status),
    ditixEventId: r.ditix_event_id ? t(r.ditix_event_id) : null,
    showTitel: t(r.show_titel),
    positionen: roh.map((p) => ({
      bezeichnung: t(p.bezeichnung),
      menge: Number(p.menge ?? 0),
      einzelpreisCent: Number(p.einzelpreisCent ?? 0),
      mitPlatz: p.mitPlatz === true,
      art: t(p.art),
      geschenk: p.geschenk === true,
      allergien: p.allergien ?? null,
    })),
  };
}

async function holen(aktion: string): Promise<Record<string, unknown>> {
  const schluessel = (process.env.FLOTIX_KEY ?? "").trim();
  if (!schluessel) throw new Error("FLOTIX_KEY fehlt. Ohne Schlüssel antwortet FloTix nicht.");

  /*
    Zwischenspeicher mit Kennzeichen, nicht nur mit Uhr.

    Dieselbe Seite fragt mehrmals nach (Sitzplan, Küche, Foyer), und jede
    Anfrage kostet den Weg nach draußen. Deshalb wird gespeichert. Damit
    eine neue Buchung trotzdem ohne Wartezeit erscheint, meldet FloTix
    sie uns sofort: Die Meldung landet auf /api/flotix/meldung, wirft den
    Speicher unter diesem Kennzeichen weg, und die nächste Liste ist
    frisch (Florian, 20.10.2026: "möglichst schnell ohne delay").

    Die Minute darunter ist nur das Netz: Bleibt eine Meldung einmal
    aus, hängt nichts länger als eine Minute hinterher.
  */
  const antwort = await fetch(`${FLOTIX_URL}/api/eventmanager?aktion=${aktion}`, {
    headers: { "x-eventmanager-key": schluessel },
    next: { revalidate: 60, tags: [KENNZEICHEN, `${KENNZEICHEN}:${aktion}`] },
    signal: AbortSignal.timeout(25000),
  });

  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    throw new Error(
      `FloTix antwortet nicht (${antwort.status}) auf "${aktion}". ` +
        (text.slice(0, 200) || `Ist ${FLOTIX_URL} erreichbar?`),
    );
  }

  return (await antwort.json()) as Record<string, unknown>;
}

/** Alle Bestellungen, die FloTix kennt, mit ihren Positionen. */
export async function flotixBestellungen(): Promise<FlotixBestellung[]> {
  const d = await holen("bestellungen");
  const liste = Array.isArray(d.bestellungen)
    ? (d.bestellungen as Array<Record<string, unknown>>)
    : [];
  return liste.map(alsBestellung);
}

/** Die Gutscheine, die per Post gehen. */
export async function flotixSendungen(): Promise<FlotixSendung[]> {
  const d = await holen("gutscheinversand");
  const liste = Array.isArray(d.sendungen) ? (d.sendungen as Array<Record<string, unknown>>) : [];
  const t = (w: unknown): string | null => (w === null || w === undefined ? null : String(w));

  return liste.map((r) => ({
    id: String(r.id),
    bestellnummer: String(r.bestellnummer ?? ""),
    status: String(r.status ?? ""),
    kaufdatum: String(r.kaufdatum ?? ""),
    bezahltAm: t(r.bezahlt_am),
    vorname: t(r.vorname),
    nachname: t(r.nachname),
    email: t(r.email),
    betragCents: Number(r.betrag_cents ?? 0),
    versandCents: Number(r.versand_cents ?? 0),
    zustellung: String(r.zustellung ?? ""),
    motiv: String(r.motiv ?? ""),
    fuer: t(r.fuer),
    von: t(r.von),
    widmung: t(r.widmung),
    empfaenger: t(r.empfaenger),
    strasse: t(r.strasse),
    plz: t(r.plz),
    ort: t(r.ort),
    versandGemeldetAm: t(r.versand_gemeldet_am),
    versendetAm: t(r.versendet_am),
    notiz: t(r.notiz),
  }));
}

/** Lebenszeichen, für die Einstellungsseite und den Vergleichslauf. */
export async function flotixProbe(): Promise<Record<string, unknown>> {
  return holen("probe");
}

/** Alle Vorstellungen, die FloTix kennt, mit ihrer alten Ditix-Kennung. */
export async function flotixVorstellungen(): Promise<FlotixVorstellung[]> {
  const d = await holen("vorstellungen");
  const liste = Array.isArray(d.vorstellungen)
    ? (d.vorstellungen as Array<Record<string, unknown>>)
    : [];

  return liste.map((r) => ({
    id: String(r.id),
    ditixEventId: r.ditix_event_id ? String(r.ditix_event_id) : null,
    beginn: String(r.beginn ?? ""),
    status: String(r.status ?? ""),
    showTitel: String(r.show_titel ?? ""),
  }));
}

/**
 * Die Brücke von der alten Kennung zur neuen.
 *
 * Die Buchungen in den Google-Tabellen stehen unter der Ditix-Kennung der
 * Vorstellung, die aus FloTix unter deren eigener. Ohne diese Brücke lägen
 * die Gäste eines Abends auf zwei verschiedenen Vorstellungen, und im Haus
 * fehlte die Hälfte (Florian, 20.10.2026: "es darf nichts verloren gehen,
 * was in Ditix gebucht wurde").
 *
 * Geraten wird dabei nichts: FloTix hat beim Import aus Ditix am
 * 24.09.2026 die alte Kennung je Vorstellung mitgespeichert.
 */
export async function flotixZuordnung(): Promise<Map<string, string>> {
  const paare = new Map<string, string>();
  for (const v of await flotixVorstellungen()) {
    if (v.ditixEventId) paare.set(v.ditixEventId, v.id);
  }
  return paare;
}

/**
 * Ein Testkauf, der in keiner Liste im Haus etwas zu suchen hat.
 *
 * Aus der Abnahme liegen in FloTix Käufe auf @example.com, auf
 * julian+test… und mit "Test" im Namen. Sie bleiben in FloTix liegen, bis
 * das Steuerbüro wegen der verbrauchten Rechnungsnummern geantwortet hat
 * (siehe UMSCHALTTAG.md im Backend), aber im Funktionsheet, auf dem
 * Küchenblatt und in der Einlassliste haben sie nichts zu tun.
 *
 * Soll man sie trotzdem sehen, hilft FLOTIX_TESTKAEUFE=zeigen.
 */
export function istTestkauf(b: {
  email: string | null;
  vorname: string | null;
  nachname: string | null;
}): boolean {
  if ((process.env.FLOTIX_TESTKAEUFE ?? "").trim().toLowerCase() === "zeigen") return false;

  const mail = (b.email ?? "").toLowerCase();
  const name = `${b.vorname ?? ""} ${b.nachname ?? ""}`.toLowerCase();

  return (
    mail.endsWith("@example.com") ||
    mail.endsWith("@example.org") ||
    mail.includes("+test") ||
    /test(s|kauf|buchung)?/.test(name) ||
    /flotix/.test(name)
  );
}
