"use client";

/**
 * Der Angebotsbereich im Vorgang: erzeugen, Link weitergeben, Öffnungen
 * verfolgen, Mailtext übernehmen.
 *
 * Das Öffnungs-Tracking läuft über den persönlichen Link, nicht über ein
 * Zählpixel in der Mail. Der Grund: Apple und Outlook laden Bilder
 * inzwischen selbst oder gar nicht, ein Pixel würde also falsche oder gar
 * keine Zahlen liefern. Ein Klick auf den Link ist eindeutig.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  angeboteErzeugen,
  angebotLoeschen,
  angebotVersendet,
  positionOptional,
  positionPreisSetzen,
  positionRabattSetzen,
  positionEntfernen,
  positionenErgaenzen,
  positionHinzufuegen,
  positionText,
} from "@/lib/angebot/speichern";
import { VARIANTEN, wochentagName, type Variante } from "@/lib/angebot/ablaufplan";
import { angebotPerMail, angebotePerMail } from "@/lib/angebot/mailversand";
import { MailVorschau } from "@/components/MailVorschau";
import { rechnungErzeugen } from "@/lib/rechnung/mailversand";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import { eur } from "@/lib/domain/pricing";
import {
  artikel,
  artikelDerGruppe,
  GRUPPENFOLGE,
  GRUPPENTITEL,
  THEATER_SITZPLAETZE,
} from "@/lib/domain/artikel";
import type { AngebotDetail } from "@/lib/angebot/lesen";
import { FUSSZEILE_TEXT } from "@/lib/mail/fusszeile";

const TICKETS = artikelDerGruppe("ticket");
const GETRAENKE = artikelDerGruppe("getraenke");
const EXKLUSIV = artikelDerGruppe("exklusiv");
const WOCHENTAGE = [0, 1, 2, 3, 4, 5, 6].map(wochentagName);

/**
 * Den Wochentag aus dem Wunsch des Kunden lesen.
 *
 * Im Wunschzeitraum steht, was der Kunde angegeben hat, etwa
 * "Donnerstag, In 1 bis 3 Monaten". Gefunden wird der erste genannte
 * Wochentag, auch verkuerzt geschrieben.
 */
function wochentagAusWunsch(wunsch?: string | null): number | null {
  const text = (wunsch ?? "").toLowerCase();
  if (!text) return null;
  const kurz = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
  let treffer: { nummer: number; wo: number } | null = null;
  for (let i = 0; i < kurz.length; i++) {
    const wo = text.indexOf(kurz[i]);
    if (wo >= 0 && (treffer === null || wo < treffer.wo)) treffer = { nummer: i, wo };
  }
  // Sonnabend sagt bei uns niemand, Sa und So waeren zu kurz zum Raten.
  return treffer?.nummer ?? null;
}

/** Face to Face, Aftershow, DJ: im Baukasten zum Anhaken. */
const HIGHLIGHTS = artikelDerGruppe("highlight");

/*
  Alles, was es im Haus gibt, zum Nachtragen an einem Angebot.

  "beim angebot (vorschau angebot) drunter soll man bitte auch alle
  dinge die es gibt klicken können. d.h. du musst auch alle anderen
  kategorien listen ... mach einfach alles rein was wir haben bis hin
  zum sovenier glas und bundle" (Florian, 30.10.2026).

  Vorher standen hier nur Highlights, Technik, Foyer, Loge und
  Sonstiges. Menues und Tickets fehlten, weil sie aus der Fassung
  kommen; wer aber nachtraeglich zwei Menues dazunehmen oder eine
  Kategorie als Wahlmoeglichkeit zeigen will, braucht sie genau hier.
  Nach Gruppen sortiert bleibt die Liste trotzdem uebersichtlich.
*/
/**
 * Die Positionen in der Reihenfolge, in der sie zum Aendern dastehen.
 *
 * "warum kann ich nicht in dieser liste einfach die preise der tickets
 * bestimmen, du siehst im screenshot, dass da keine weiteren
 * kategorien sind" (Florian, 30.10.2026).
 *
 * Die Wahlmoeglichkeiten, also die uebrigen Ticketkategorien, standen
 * zwar im Angebot beim Kunden, die Aenderungsliste hat sie aber
 * herausgefiltert. Kevin sah Kat. 2 und konnte den Preis der Golden
 * Seats nirgends anfassen.
 *
 * Jetzt steht jede Wahlmoeglichkeit direkt unter der Position, zu der
 * sie gehoert. Dadurch bleiben die Sitzplaetze beieinander, so wie im
 * Angebot selbst.
 */
function zumAendern(positionen: AngebotDetail["positionen"]) {
  const haupt = positionen.filter((p) => !p.istAlternativeZu);
  const weitere = positionen.filter((p) => p.istAlternativeZu);
  const geordnet = haupt.flatMap((h) => [
    h,
    ...weitere.filter((a) => a.istAlternativeZu === h.id),
  ]);
  /* Eine Wahlmoeglichkeit, deren Bezugszeile entfernt wurde, faellt
     sonst aus der Liste und waere nicht mehr zu erreichen. */
  const verwaist = weitere.filter((a) => !geordnet.includes(a));
  return [...geordnet, ...verwaist];
}

const ZUSATZARTIKEL = GRUPPENFOLGE.map((gruppe) => ({
  gruppe,
  titel: GRUPPENTITEL[gruppe],
  artikel: artikelDerGruppe(gruppe),
})).filter((g) => g.artikel.length > 0);

/**
 * Der Satz, der die LED-Fassade sauber vom Ticketpreis trennt.
 *
 * Gesiezt wie alles, was bei einer Firma landet (Florian, 28.10.2026):
 * "bitte umstellen auf sie, kevin findet das besser". Im Haus und im
 * Shop wird weiter geduzt, nur das Geschaeftliche nicht.
 */
const LED_TEXT =
  "Die LED-Fassade buchen Sie als eigenständige Werbeleistung mit eigenem Gegenwert. "
  + "Da wir Sie an diesem Abend ohnehin als Werbepartner begrüßen, kalkulieren wir das "
  + "Eventpaket mit unserem Partnerpreis, sodass Sie bei 110 Euro brutto je Person bleiben.";

/** Die drei Arten eines Angebots, wie sie in der Auswahl stehen. */
const ARTEN = [
  { wert: "einzelplaetze", text: "Einzelplätze mit Ticketkategorien", nummer: null, plaetze: 0 },
  { wert: "theater", text: "Exklusivevent: ganzes Theater", nummer: "EXKLTHEATER", plaetze: THEATER_SITZPLAETZE.gesamt },
  { wert: "parkett", text: "Exklusivevent: komplettes Parkett", nummer: "EXKLPARKETT", plaetze: THEATER_SITZPLAETZE.parkett },
] as const;

export function AngebotBereich({
  vorgangId,
  angebote,
  appUrl,
  kundeEmail,
  ansprechpartner,
  personen,
  terminDatum,
  terminZeit,
  wunschzeitraum,
  terminEventId,
  terminwahl,
}: {
  vorgangId: string;
  angebote: AngebotDetail[];
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
  /** Gaeste laut Gruppen des Vorgangs. Vorbelegung der Stueckzahlen. */
  personen: number;
  /** Termin des Vorgangs, falls einer feststeht. */
  terminDatum?: string | null;
  /** Was der Kunde sich gewuenscht hat, als Text aus der Anfrage. */
  wunschzeitraum?: string | null;
  /** Die Kennung der Vorstellung am Vorgang, fuer die Preisanzeige. */
  terminEventId?: string | null;
  /**
   * Die Terminwahl aus dem Spielplan, fertig vom Server.
   *
   * "es muss hier immer möglich sein den tag zu ändern" (Florian,
   * 30.10.2026). Sie steht sonst weiter oben auf der Seite, und wer
   * unten ein Angebot baut, sieht sie nicht.
   */
  terminwahl?: React.ReactNode;
  terminZeit?: string | null;
}) {
  const [laeuft, starte] = useTransition();
  /*
    Stueckzahl je Ticketkategorie.

    Vorbelegt ist Kat. 2 mit allen Gaesten, das ist der haeufigste Fall.
    Wer aufteilen will, traegt zwei Zahlen ein, etwa 20 Karten Kat. 1
    fuer die Geschaeftsleitung und 15 Karten Kat. 2 fuer den Rest
    (Florian, 15.10.2026).
  */
  const [mengen, setMengen] = useState<Record<string, number>>({ TK2: personen });
  const [rabatt, setRabatt] = useState(0);
  /*
    Einheitspreis je Sitzplatz, als Text, damit das Feld leer bleiben
    kann. Leer heisst: Kategoriepreise aus dem Ticketshop
    (Florian, 15.10.2026).
  */
  const [ticketpreis, setTicketpreis] = useState("");
  /*
    Einzelplaetze oder das Haus fuer sich allein.

    "gib die Moeglichkeit auch fuer Exklusivevent, da ist dann kein
    Ticket oder Sitzplatzwahl erforderlich" (Florian, 15.10.2026).
  */
  /*
    Die Arten, die der Kunde bekommen soll. Mehrere sind erlaubt, und
    jede wird ein eigenes Angebot mit eigener Nummer, eigenem Link und
    eigenem PDF (Florian, 28.10.2026): "es soll aber, wenn der kunde
    verschiedene angebote bekommen soll, auch einfach zwei links /
    zwei pdfs usw. sein".

    Vorher war es eine einzige Auswahl, und wer die Exklusivbuchung
    anklickte, bekam sie in derselben Liste wie das Menue.
  */
  const [arten, setArten] = useState<Array<"einzelplaetze" | "theater" | "parkett">>([
    "einzelplaetze",
  ]);
  /** Die erste gewaehlte Art steuert die Vorschau und die Felder darunter. */
  const art = arten[0] ?? "einzelplaetze";
  /*
    Welche Fassungen der Kunde bekommen soll.

    "es muss so sein, dass der Gast z.B. auch drei verschiedene Angebote
    bekommen kann" (Florian, 15.10.2026). Jede angekreuzte Kachel wird
    ein eigenes Angebot mit eigenem Link.
  */
  const [fassungen, setFassungen] = useState<Variante[]>(["menue"]);
  // Steht der Termin noch nicht fest, wird für einen Wochentag angeboten.
  const [terminOffen, setTerminOffen] = useState(!terminDatum);
  /*
    Der Wochentag kommt aus dem Wunsch des Kunden.

    "kevin hatte donnerstag eingegeben und im angebot hat es dann einen
    freitag draus gemacht" (Florian, 30.10.2026). Kevin hatte den
    Donnerstag oben beim Vorgang eingetragen, der Baukasten aber startete
    stur mit Freitag, und wer die Zeile nicht noch einmal anfasst,
    verschickt ein Angebot fuer den falschen Tag.

    Steht im Wunsch ein Wochentag, ist er hier vorgewaehlt. Steht keiner
    da, bleibt es bei Freitag, dem haeufigsten Abend.
  */
  const [wochentag, setWochentag] = useState(() => wochentagAusWunsch(wunschzeitraum) ?? 5);
  const [zeitraum, setZeitraum] = useState("");
  const [tageszeit, setTageszeit] = useState<"nachmittag" | "abend">(
    terminZeit && terminZeit < "17:00" ? "nachmittag" : "abend",
  );
  const [getraenke, setGetraenke] = useState<string[]>([]);
  /*
    Wie viele Flats je Pauschale (Florian, 28.10.2026): "wenn kinder
    dabei sind brauchen wir eine moeglichkeit, z.b. bei 12 teilnehmern
    10 bier wein flat und 2 softdrink flat". Steht hier nichts, gilt die
    Pauschale wie bisher fuer alle Teilnehmer.
  */
  const [getraenkeMengen, setGetraenkeMengen] = useState<Record<string, number>>({});
  const [mitEmpfang, setMitEmpfang] = useState(false);
  /*
    Wo gegessen wird, und ob die Loge als Wahlmoeglichkeit mitlaeuft
    (Florian, 28.10.2026). Platz im Saal und Platz am Tisch sind zwei
    verschiedene Dinge: Aus der Loge sieht man die Show nicht.
  */
  const [essplatz, setEssplatz] = useState<"automatisch" | "galerie" | "loge">("automatisch");
  const [logeDazu, setLogeDazu] = useState(false);

  /*
    Die drei Wege zur Loge, aus zwei Zustaenden abgelesen.

    "fest" heisst: alle essen in der Loge, essplatz steht auf "loge".
    "wahl" heisst: das Menue laeuft auf der Galerie, die Loge steht grau
    darunter. Mehr gibt es nicht, und beides zugleich waere Unsinn.
  */
  const logeModus: "keine" | "wahl" | "fest" =
    essplatz === "loge" ? "fest" : logeDazu ? "wahl" : "keine";

  const setzeLogeModus = (m: "keine" | "wahl" | "fest") => {
    if (m === "fest") {
      setEssplatz("loge");
      setLogeDazu(false);
      return;
    }
    // Zurueck aus der festen Loge: wieder der Sitzplan entscheidet.
    if (essplatz === "loge") setEssplatz("automatisch");
    setLogeDazu(m === "wahl");
  };
  /*
    Je Leistung: gar nicht, fest drin, oder drin und optional.

    "ich will dass es drin ist im angebot / ich will dass es drin ist,
    aber optional. optional ist immer in klammern dann beim kunden auf
    dem angebot" (Florian, 28.10.2026). Steht hier als eine Liste von
    Artikelnummern, damit dieselbe Entscheidung für jede Leistung gilt.
  */
  const [nurOptional, setNurOptional] = useState<string[]>([]);
  const [mitFassade, setMitFassade] = useState(false);
  /*
    Die Highlights beim Bauen, nicht erst als Nachtrag.

    "kann man face to face show mit anklicken für 1500 in der loge -
    das ist bei angeboterstellung auch wichtig. wo finde ich den punkt
    (kevin hatte ihn übersehen)" (Florian, 30.10.2026). Es gab sie nur
    unter "Position hinzufügen" an einem fertigen Angebot. Wer von vorn
    baute, sah sie nie.
  */
  const [highlights, setHighlights] = useState<string[]>([]);

  /*
    Die Preise des gewaehlten Abends, fuer die Anzeige im Baukasten.

    Gerechnet wird beim Erstellen auf dem Server, nach derselben Regel.
    Hier geht es nur darum, dass Kevin vorher sieht, womit gerechnet
    wird: "oben sagst du ja schon donnerstag (günstiger) - zeigst aber
    die preise vom samstag" (Florian, 30.10.2026).
  */
  const [abendpreise, setAbendpreise] = useState<Record<string, number>>({});
  /* Von welcher Vorstellung die Preise stammen, fuer die Kontrollzeile. */
  const [preisherkunft, setPreisherkunft] = useState<{ datum: string; show: string } | null>(null);
  /* Eigene Preise je Ticketkategorie, als getippter Text. */
  const [eigenePreise, setEigenePreise] = useState<Record<string, string>>({});
  /*
    Preise selbst eintragen statt vorbelegen.

    "Ich brauche bei den Sitzplätzen KEINE Voreingestellten Preise.
    Bevor die KI irgendwelche Preise erfindet, schreibe ich diese
    innerhalb von Sekunden selber ein!" (Kevin über Florian,
    30.10.2026).

    Erfunden war nichts: Die Preise kommen aus der Preisliste genau der
    Vorstellung. Wer sie trotzdem lieber selbst tippt, schaltet hier um.
    Die Felder stehen dann leer, und der Shoppreis steht nur noch klein
    daneben, als Anhalt und nicht als Vorgabe.
  */
  const [preiseSelbst, setPreiseSelbst] = useState(false);
  const [fassadeStunden, setFassadeStunden] = useState(1);
  /*
    Der Stundenpreis der LED-Fassade, aenderbar je Angebot (Florian,
    28.10.2026): "bitte die 350 eur pro stunde LED Fassade aenderbar
    machen". Vorbelegt mit dem Listenpreis, leer heisst Listenpreis.
  */
  const [fassadePreis, setFassadePreis] = useState(
    (artikel("LEDFASSADE").bruttoCent / 100).toFixed(2).replace(".", ","),
  );
  const istOptional = (nummer: string) => nurOptional.includes(nummer);
  const setzeOptional = (nummer: string, an: boolean) =>
    setNurOptional((bisher) =>
      an ? [...new Set([...bisher, nummer])] : bisher.filter((n) => n !== nummer),
    );

  /*
    Essen: gar nicht, zur Wahl oder fest.

    "Ich will zu allen Punkten die Möglichkeit haben, diese fest, oder
    optional zu haben. Oder auch GAR NICHT erwähnt im Angebot. Dies
    betrifft auch die Menüs!" (Kevin über Florian, 30.10.2026).

    "Gar nicht" gab es schon, aber an einer anderen Stelle: als Fassung
    "Nur die Show" ganz oben. Wer unten beim Menü stand, fand sie nicht.
    Der Schalter hier stellt genau diese Fassung um, denn ohne Essen
    gehören auch Empfang und Menü nicht mehr in den Ablauf. Die zuvor
    gewählten Fassungen werden gemerkt und kommen zurück, wenn das
    Essen wieder dazugehört.
  */
  const ESSENSFASSUNGEN: Variante[] = ["menue", "fingerfood", "exklusiv_show", "exklusiv_ohne_show"];
  const gemerkteFassungen = useRef<Variante[]>(["menue"]);

  const essenModus: "weg" | "wahl" | "fest" = !fassungen.some((f) => ESSENSFASSUNGEN.includes(f))
    ? "weg"
    : istOptional("4GANG")
      ? "wahl"
      : "fest";

  const setzeEssenModus = (w: "weg" | "wahl" | "fest") => {
    if (w === "weg") {
      const essen = fassungen.filter((f) => ESSENSFASSUNGEN.includes(f));
      if (essen.length > 0) gemerkteFassungen.current = essen;
      setFassungen(["nurshow"]);
      return;
    }
    if (essenModus === "weg") setFassungen(gemerkteFassungen.current);
    for (const n of ["4GANG", "4GANGLOGE", "FINGERFOOD"]) setzeOptional(n, w === "wahl");
  };


  // Aus dem getippten Euro-Text werden Cent. Komma und Punkt gehen beide.
  const preisCent = Math.round((Number(ticketpreis.replace(",", ".")) || 0) * 100);
  const fassadeCent = Math.round((Number(fassadePreis.replace(",", ".")) || 0) * 100);
  /** Der Preis, der am Ende gilt: der getippte, sonst der aus der Liste. */
  const fassadeGilt = fassadeCent > 0 ? fassadeCent : artikel("LEDFASSADE").bruttoCent;

  /*
    Nach dem Erstellen das frische Angebot zeigen.

    "wenn man auf Angebot erstellen klickt, dann sollte das angebot
    direkt darunter sichtbar auftauchen. man checkt ja gar nicht sonst,
    ob es geklappt hat" (Florian, 28.10.2026).

    Erster Versuch war ein Sprung nach oben zur Liste. Der ging ins
    Leere: Gesprungen wurde, sobald die Kennung da war, und das war
    haeufig, bevor die neue Karte ueberhaupt im Baum stand. Ein zweiter
    Versuch war nicht vorgesehen, der Sprung galt als erledigt. Wer
    unten am Knopf stand, sah also weiterhin nichts (Florian,
    29.10.2026: "das geht noch nicht").

    Jetzt wird nicht mehr gesprungen. Die frischen Angebote stehen
    unter dem Knopf, also dort, wo geklickt wurde, und in der Liste
    oben fehlen sie solange: Dasselbe Angebot zweimal auf einer Seite
    verwirrt mehr, als es hilft. Mit "oben einsortieren" wandern sie an
    ihren Platz, spaetestens beim naechsten Laden der Seite.

    Es sind mehrere Kennungen, nicht eine: Aus einem Klick koennen drei
    Angebote entstehen, und dann will man alle drei ansehen.
  */
  const [frisch, setFrisch] = useState<string[]>([]);
  const frischRef = useRef<HTMLDivElement | null>(null);

  /*
    Die Preise des gewaehlten Abends nachladen.

    Dieselbe Regel wie beim Erstellen: fester Termin, sonst die naechste
    Vorstellung an diesem Wochentag zur passenden Tageszeit. Kommt
    nichts zurueck, bleiben die Listenpreise stehen.
  */
  useEffect(() => {
    const frage = new URLSearchParams();
    if (!terminOffen && terminEventId) frage.set("vorstellung", terminEventId);
    else {
      frage.set("wochentag", String(wochentag));
      frage.set("tageszeit", tageszeit);
    }
    let abgebrochen = false;
    fetch(`/api/angebotspreise?${frage.toString()}`, { cache: "no-store" })
      .then((a) => a.json())
      .then((d: { preise?: Record<string, number>; herkunft?: { datum: string; show: string } | null }) => {
        if (abgebrochen) return;
        setAbendpreise(d.preise ?? {});
        setPreisherkunft(d.herkunft ?? null);
      })
      .catch(() => undefined);
    return () => {
      abgebrochen = true;
    };
  }, [terminOffen, terminEventId, wochentag, tageszeit]);

  useEffect(() => {
    if (frisch.length === 0) return;
    frischRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [frisch]);

  // Frische Angebote stehen unten beim Knopf, nicht noch einmal oben.
  const frischeAngebote = angebote.filter((a) => frisch.includes(a.id));
  const restliche = angebote.filter((a) => !frisch.includes(a.id));

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="mb-3 text-sm font-semibold">Angebote</h2>

      {angebote.length === 0 && (
        <p className="mb-4 text-sm text-leise">Noch kein Angebot erstellt.</p>
      )}

      {/*
        Mehrere Angebote, eine Mail.

        "es sollte auch möglich sein zwei angebote oder mehr zu
        erstellen und diese mit einer mail zu versenden (zwei links in
        der mail dann) ... schreib klar drüber Angebot 1, Angebot 2
        z.b. gerne aber auch was das angebot näher beschreibt (sonntags
        show.. etc)" (Florian, 30.10.2026).

        Vorher ging je Angebot eine eigene Mail hinaus, und der Kunde
        bekam zwei fast gleiche Briefe. Jetzt stehen sie untereinander
        in einer Mail, jedes mit eigener Ueberschrift und eigenem Knopf.
        Die Ueberschrift ist vorbelegt und laesst sich ueberschreiben.
      */}
      {angebote.length > 1 && (
        <details className="mb-5 rounded-md border border-gold bg-gold-hell/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gold-dunkel">
            Mehrere Angebote zusammen verschicken
          </summary>
          <SammelMail
            angebote={angebote}
            vorgangId={vorgangId}
            appUrl={appUrl}
            kundeEmail={kundeEmail}
            ansprechpartner={ansprechpartner}
          />
        </details>
      )}

      {restliche.length > 0 && (
        <div className="mb-5 space-y-3">
          {restliche.map((a) => (
            <AngebotKarte
              key={a.id}
              angebot={a}
              vorgangId={vorgangId}
              appUrl={appUrl}
              kundeEmail={kundeEmail}
              ansprechpartner={ansprechpartner}
              terminwahl={terminwahl}
            />
          ))}
        </div>
      )}

      <details id="angebot-bauen" className="scroll-mt-4 border-t border-linie pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          {angebote.length === 0 ? "Angebot erstellen" : "Weiteres Angebot erstellen"}
        </summary>

        <div className="mt-3 space-y-4">
          {/*
            Für wie viele Gäste gebaut wird, ganz oben.

            Die Zahl kommt aus den Gruppen des Vorgangs und stand bisher
            nur als Fließtext unter dem Erstellen-Knopf. Dort liest sie
            niemand, bevor er drückt. Genau daran ist Kevin am
            29.10.2026 gescheitert: kein Gast eingetragen, und damit
            fielen Menü, Empfang, Getränke und die Loge still aus dem
            Angebot. Jetzt steht sie vor allen Feldern, und bei null
            steht da, was zu tun ist.
          */}
          {personen > 0 ? (
            <p className="rounded-md border border-linie px-3 py-2 text-sm">
              Gebaut wird für <strong>{personen} {personen === 1 ? "Gast" : "Gäste"}</strong> aus
              den Gruppen des Vorgangs. Menü, Empfang und Getränke rechnen je Gast.
            </p>
          ) : (
            <p
              className="rounded-md border-2 px-3 py-2 text-sm"
              style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
            >
              <strong>Es ist noch kein Gast eingetragen.</strong> Dann fallen Menü, Empfang,
              Getränke und die Loge aus dem Angebot, weil sie an der Personenzahl hängen. Trage die
              Zahl oben bei der Teilnehmerzahl ein, bevor du hier weitermachst.
            </p>
          )}

          {/* ------------------------------------------------------------
              Schritt 1: Wann?
              ------------------------------------------------------------ */}
          <div className="rounded-md border border-linie p-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-leise">
              1. Wann
            </span>

            {/*
              Der Tag selbst, zum Aendern an Ort und Stelle.

              Nur beim festen Termin: Wer fuer einen Wochentag anbietet,
              braucht keinen Abend aus dem Spielplan, und zwei Stellen
              fuer dasselbe stiften mehr Verwirrung als Nutzen.
            */}
            {terminwahl && !terminOffen && <div className="mb-2">{terminwahl}</div>}

            {terminDatum && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!terminOffen}
                  onChange={() => setTerminOffen(false)}
                  className="h-4 w-4"
                />
                Fester Termin: {terminDatum.split("-").reverse().join(".")}
                {terminZeit ? `, ${terminZeit} Uhr` : ""}
              </label>
            )}

            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={terminOffen}
                onChange={() => setTerminOffen(true)}
                className="h-4 w-4"
              />
              Termin steht noch nicht fest
            </label>

            {/*
              Für einen Wochentag anbieten: "so dass der Kunde sieht,
              dass es Donnerstag günstiger wäre als Freitag oder Samstag,
              Sonntag übrigens auch" (Florian, 15.10.2026).
            */}
            {terminOffen && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Für welchen Wochentag</span>
                  <select value={wochentag} onChange={(e) => setWochentag(Number(e.target.value))}>
                    {[4, 5, 6, 0].map((n) => (
                      <option key={n} value={n}>
                        {WOCHENTAGE[n]}
                        {(n === 4 || n === 0) && " (günstiger)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Zeitraum (freiwillig)</span>
                  <input
                    value={zeitraum}
                    onChange={(e) => setZeitraum(e.target.value)}
                    placeholder="im November oder Dezember 2026"
                  />
                </label>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {([
                ["abend", "Abendshow, 20 Uhr"],
                ["nachmittag", "Nachmittagsshow, 15 Uhr"],
              ] as const).map(([wert, text]) => (
                <label key={wert} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={tageszeit === wert}
                    onChange={() => setTageszeit(wert)}
                    className="h-4 w-4"
                  />
                  {text}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-leise">
              Danach richtet sich der Ablauf im Angebot. Bei der Nachmittagsshow kommen Empfang und
              Menü nach der Show.
            </p>

            {/*
              Die Kontrollzeile.

              "was hier ausgewählt wird hat relevanz für das ganze
              angebot" (Florian, 30.10.2026). Genau deshalb steht hier,
              was oben im Angebot stehen wird. Ein falscher Tag faellt
              sonst erst auf, wenn der Kunde zurueckschreibt.
            */}
            <p
              className="mt-2 rounded-md px-3 py-2 text-xs"
              style={{ background: "var(--gold-hell)" }}
            >
              Im Angebot steht:{" "}
              <strong>
                {terminOffen
                  ? `Ihr Event an einem ${WOCHENTAGE[wochentag]}${zeitraum.trim() ? ` ${zeitraum.trim()}` : ""}`
                  : terminDatum
                    ? `Ihr Event am ${WOCHENTAGE[new Date(`${terminDatum}T12:00:00Z`).getUTCDay()]}, dem ${terminDatum
                        .split("-")
                        .reverse()
                        .join(".")}`
                    : "Ihr Event im Florian Zimmer Theater"}
              </strong>
              {terminOffen && (
                <>
                  {" "}
                  Für einen anderen Tag baust du einfach ein weiteres Angebot, der Kunde bekommt
                  dann beide in einer Mail.
                </>
              )}
              {/*
                Woher die Preise kommen.

                "das programm holt sich wohl immer noch die kindertickets"
                (Florian, 30.10.2026). Es waren keine Kindertickets,
                sondern ein Weihnachtsspecial: Das Programm nahm den
                naechstgelegenen Donnerstag als Massstab, und das war
                der 3. Dezember. Sondershows fallen jetzt heraus, und
                damit man es nachpruefen kann, steht hier, welcher Abend
                es geworden ist.
              */}
              {preisherkunft && (
                <span className="mt-1 block text-leise">
                  Preise vom {preisherkunft.datum.split("-").reverse().join(".")},{" "}
                  {preisherkunft.show}
                </span>
              )}
            </p>
          </div>

          {/* ------------------------------------------------------------
              Schritt 2: Welche Fassungen?
              ------------------------------------------------------------ */}
          <div className="rounded-md border border-linie p-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-leise">
              2. Was soll angeboten werden
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {VARIANTEN.map((v) => {
                const an = fassungen.includes(v.wert);
                return (
                  <label
                    key={v.wert}
                    className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
                    style={{
                      borderColor: an ? "var(--gold)" : "var(--linie)",
                      background: an ? "var(--gold-hell)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={an}
                      onChange={() =>
                        setFassungen(
                          an
                            ? fassungen.filter((x) => x !== v.wert)
                            : [...fassungen, v.wert],
                        )
                      }
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">{v.titel}</span>
                      <span className="block text-xs text-leise">{v.enthaelt}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-leise">
              {fassungen.length * arten.length > 1
                ? `Es entstehen ${fassungen.length * arten.length} Angebote nebeneinander, jedes mit eigener Nummer, eigenem Link und eigenem PDF.`
                : "Mehrere ankreuzen heißt: Der Kunde bekommt mehrere Angebote zur Auswahl."}
            </p>
          </div>

          <div>
            <span className="mb-1 block text-xs text-leise">
              Was angeboten wird. Jede Zeile wird ein eigenes Angebot.
            </span>
            <div className="space-y-1">
              {ARTEN.map((a) => {
                const an = arten.includes(a.wert);
                return (
                  <label key={a.wert} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={an}
                      onChange={() =>
                        setArten((bisher) => {
                          const neu = an
                            ? bisher.filter((x) => x !== a.wert)
                            : [...bisher, a.wert];
                          // Ganz ohne Art laesst sich nichts bauen.
                          return neu.length > 0 ? neu : bisher;
                        })
                      }
                      className="mt-0.5 h-auto w-auto"
                    />
                    <span>
                      {a.text}
                      {a.plaetze > 0 && (
                        <span className="text-leise"> ({a.plaetze} Plätze)</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {arten.length > 1 && (
              <p className="mt-1 text-xs text-leise">
                Die Felder darunter gelten für alle. Angezeigt wird die Vorschau für
                „{ARTEN.find((a) => a.wert === art)?.text}“.
              </p>
            )}
          </div>

          {art === "einzelplaetze" ? (
            <div>
              <span className="mb-1 block text-xs text-leise">
                Ticketkategorien und Stückzahl
              </span>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--gold-dunkel)]"
                    checked={preiseSelbst}
                    onChange={(e) => setPreiseSelbst(e.target.checked)}
                  />
                  Preise selbst eintragen
                </label>
                <span className="text-leise">
                  {preiseSelbst
                    ? "Die Felder bleiben leer. Was leer bleibt, wird mit dem Preis der Vorstellung gerechnet."
                    : "Vorbelegt mit den Preisen der gewählten Vorstellung."}
                </span>
              </div>
              <Kategorienwahl
                mengen={mengen}
                setzen={setMengen}
                personen={personen}
                preise={abendpreise}
                preiseSelbst={preiseSelbst}
                istOptional={istOptional}
                setzeOptional={setzeOptional}
                eigenePreise={eigenePreise}
                setzeEigenenPreis={(nummer, wert) =>
                  setEigenePreise((bisher) => ({ ...bisher, [nummer]: wert }))
                }
              />
            </div>
          ) : (
            <Exklusivhinweis art={art} preisCent={preisCent} personen={personen} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {/*
              Der Einheitspreis. Steht neben dem Rabatt, weil beides
              dasselbe Ziel hat und man eines von beidem nimmt.
            */}
            <label className="block">
              <span className="mb-1 block text-xs text-leise">
                {art === "einzelplaetze"
                  ? "Eigener Preis je Ticket in Euro"
                  : "Eigener Preis für die Exklusivbuchung in Euro"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="z.B. 99"
                value={ticketpreis}
                onChange={(e) => setTicketpreis(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-leise">Rabatt auf Tickets in Prozent</span>
              <input
                type="number"
                min={0}
                max={50}
                value={rabatt}
                onChange={(e) => setRabatt(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>

          <p className="text-xs text-leise">
            {art !== "einzelplaetze" ? (
              <>Der Rabatt gilt nur für Tickets und bleibt bei einer Exklusivbuchung ohne Wirkung.</>
            ) : preisCent > 0 ? (
              <>
                Jeder Sitzplatz kostet {eur(preisCent)}, egal welche Kategorie. Die
                Kategoriebezeichnung bleibt im Angebot stehen.
                {rabatt > 0 && " Der Rabatt kommt zusätzlich darauf, das ist selten gewollt."}
              </>
            ) : (
              <>Ohne eigenen Preis gelten die Kategoriepreise dieser Vorstellung.</>
            )}
          </p>

          <div>
            <span className="mb-1 block text-xs text-leise">Getränkepauschale</span>
            <Getraenkewahl
              gewaehlt={getraenke}
              setzen={setGetraenke}
              mengen={getraenkeMengen}
              setzeMengen={setGetraenkeMengen}
              personen={personen}
              istOptional={istOptional}
              setzeOptional={setzeOptional}
            />
          </div>

          {/*
            Die Highlights: Face to Face, Aftershow, DJ.

            Sie kosten einmal, nicht je Gast, und stehen deshalb als
            einfache Haken da. Wer eine andere Menge braucht, aendert
            sie danach an der Position.
          */}
          <fieldset className="rounded-md border border-linie px-3 py-2">
            <legend className="px-1 text-xs text-leise">Highlights</legend>
            {HIGHLIGHTS.map((h) => (
              <div key={h.nummer}>
                <label className="flex items-start gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--gold-dunkel)]"
                    checked={highlights.includes(h.nummer)}
                    onChange={(e) =>
                      setHighlights((bisher) =>
                        e.target.checked
                          ? [...new Set([...bisher, h.nummer])]
                          : bisher.filter((n) => n !== h.nummer),
                      )
                    }
                  />
                  <span>
                    {h.bezeichnung} ({eur(h.bruttoCent)})
                    <span className="block text-xs text-leise">{h.beschreibung}</span>
                  </span>
                </label>
                {highlights.includes(h.nummer) && (
                  <div className="mb-2 ml-6">
                    <DrinSchalter
                      optional={istOptional(h.nummer)}
                      setzen={(an) => setzeOptional(h.nummer, an)}
                    />
                  </div>
                )}
              </div>
            ))}
          </fieldset>

          {/*
            Das Logo auf der LED-Aussenfassade.

            Immer eine Wahlmoeglichkeit: Das ist eine Werbepartnerschaft
            und keine Veranstaltungsleistung, sie wird getrennt
            ausgewiesen und abgerechnet (Florian, 28.10.2026).
          */}
          <div className="rounded-md border border-linie p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--gold-dunkel)]"
                checked={mitFassade}
                onChange={(e) => setMitFassade(e.target.checked)}
              />
              <span>
                Logo auf der LED-Außenfassade anbieten
                <span className="block text-xs text-leise">
                  {eur(artikel("LEDFASSADE").bruttoCent)} je Stunde zuzüglich 19 Prozent
                  Umsatzsteuer.
                </span>
              </span>
            </label>

            {mitFassade && (
              <div className="mt-3 space-y-2 border-t border-linie pt-3">
                <DrinSchalter
                  optional={istOptional("LEDFASSADE")}
                  setzen={(an) => setzeOptional("LEDFASSADE", an)}
                />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={fassadeStunden}
                      onChange={(e) => setFassadeStunden(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
                    />
                    <span>{fassadeStunden === 1 ? "Stunde" : "Stunden"} bespielen</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Preis je Stunde €</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fassadePreis}
                      onChange={(e) => setFassadePreis(e.target.value)}
                      className="w-24 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
                    />
                  </label>
                  <span className="pb-1 text-sm text-leise">
                    = {eur(fassadeGilt * fassadeStunden)} brutto
                    {fassadeCent > 0 && fassadeCent !== artikel("LEDFASSADE").bruttoCent && (
                      <> statt der üblichen {eur(artikel("LEDFASSADE").bruttoCent * fassadeStunden)}</>
                    )}
                  </span>
                </div>
                <p className="text-xs text-leise">
                  Unter dem Angebot steht dann, was eine Werbepartnerschaft bedeutet: dass
                  Werbe- und Veranstaltungsleistungen getrennt ausgewiesen und abgerechnet werden,
                  welche Partnerkonditionen daran hängen und dass wir das Logo spätestens eine
                  Woche vorher als JPG oder PNG brauchen.
                </p>
              </div>
            )}
          </div>

          {/*
            Wo gegessen wird. Steht neben den Ticketkategorien, weil es
            dieselbe Frage von der anderen Seite ist: Die Kategorie sagt,
            wo der Gast die Show sieht, das hier sagt, wo er isst.
          */}
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Wo gegessen wird</span>
            <select
              value={essplatz}
              onChange={(e) => setEssplatz(e.target.value as typeof essplatz)}
            >
              <option value="automatisch">Wie im Sitzplan hinterlegt</option>
              <option value="galerie">Alle auf der Eventgalerie</option>
            </select>
            <span className="mt-1 block text-xs text-leise">
              Der Platz am Tisch hat mit der Ticketkategorie nichts zu tun. Die Loge steht im
              Kasten darunter.
            </span>
          </label>

          {/*
            Das Menue, fest oder als Wahlmoeglichkeit.

            "es soll bei jeder position eine optionsmöglichkeit geben"
            (Florian, 30.10.2026). Bei Tickets, Getraenken, Empfang,
            Fassade und den Highlights gab es den Schalter, beim Menue
            fehlte er: Es haengt an der Fassung und war damit immer
            fest. Manche Firma will aber erst wissen, was der Abend ohne
            Essen kostet, und das Menue daneben in Klammern sehen.
          */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Essen im Angebot</span>
            <DreiWeg wert={essenModus} setzen={setzeEssenModus} weg="ohne Essen" />
          </div>
          {essenModus === "weg" && (
            <p className="text-xs text-leise">
              Das Angebot zeigt nur die Show. Im Ablauf oben stehen dann auch kein Empfang und
              kein Menü, denn es gibt ja keins.
            </p>
          )}

          {/*
            Die Loge: gar nicht, zur Wahl oder fest.

            "ich möchte loge nicht nur als Wahlmöglichkeit für den
            kunden, sondern auch 'loge fix machen'. dass er nur die loge
            angeboten bekommt" (Florian, 30.10.2026).

            Gehen tat das schon, aber über ein anderes Feld: "Alle in
            einer Loge" stand unter "Wo gegessen wird", und die
            Wahlmöglichkeit als Haken darunter. Zwei Stellen für
            dieselbe Frage, und wer die eine gewählt hatte, sah die
            andere nicht mehr. Jetzt steht beides nebeneinander, und
            "Wo gegessen wird" kümmert sich nur noch um den Rest.
          */}
          <fieldset className="rounded-md border border-linie px-3 py-2">
            <legend className="px-1 text-xs text-leise">Loge</legend>
            {([
              ["keine", "Keine Loge", "Alle essen auf der Eventgalerie oder wie im Sitzplan hinterlegt."],
              ["wahl", "Als Wahlmöglichkeit", "Steht im Angebot unter dem Menü, Preis in Klammern, nicht in der Summe."],
              ["fest", "Fest, nur die Loge", "Alle essen in der Loge. Es gibt nichts anderes zur Auswahl."],
            ] as const).map(([wert, titel, erklaerung]) => (
              <label key={wert} className="flex items-start gap-2 py-1 text-sm">
                <input
                  type="radio"
                  name="logemodus"
                  className="mt-1 h-4 w-4 accent-[var(--gold-dunkel)]"
                  checked={logeModus === wert}
                  onChange={() => setzeLogeModus(wert)}
                />
                <span>
                  {titel}
                  <span className="block text-xs text-leise">{erklaerung}</span>
                </span>
              </label>
            ))}
            {logeModus === "fest" && personen > 12 && (
              <p className="mt-1 text-xs" style={{ color: "var(--warnung)" }}>
                In die größte Loge passen zwölf Gäste. Bei {personen} Personen werden es zwei
                Logen, das Menü ist dasselbe.
              </p>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Magicuvée-Empfang</span>
            <DreiWeg
              wert={!mitEmpfang ? "weg" : istOptional("EMPFANG") ? "wahl" : "fest"}
              setzen={(w) => {
                setMitEmpfang(w !== "weg");
                setzeOptional("EMPFANG", w === "wahl");
              }}
            />
          </div>

          <button
            disabled={laeuft}
            onClick={() => {
              starte(async () => {
                const ergebnis = await angeboteErzeugen(
                  vorgangId,
                  {
                  art,
                  tageszeit,
                  wochentag: terminOffen ? wochentag : null,
                  zeitraum: terminOffen ? zeitraum : "",
                  showzeit: !terminOffen && terminZeit ? terminZeit : undefined,
                  ticket: "TK2",
                  kategorien:
                    art === "einzelplaetze"
                      ? TICKETS.map((t) => ({
                          nummer: t.nummer,
                          menge: mengen[t.nummer] ?? 0,
                        })).filter((k) => k.menge > 0)
                      : [],
                  ticketRabatt: rabatt,
                  ticketPreisCent: preisCent > 0 ? preisCent : undefined,
                  getraenkepauschalen: getraenke,
                  highlights,
                  getraenkeMengen,
                  optionalePositionen: nurOptional,
                  mitFassade,
                  fassadeStunden,
                  // Von Hand gesetzte Preise. Weitere Artikel lassen sich
                  // hier genauso dazunehmen, ohne dass der Rest etwas
                  // davon merken muss.
                  /*
                    Von Hand gesetzte Preise: die Fassade und, seit dem
                    30.10.2026, jede Ticketkategorie einzeln.
                  */
                  eigenePreise: (() => {
                    const liste: Record<string, number> = {};
                    if (fassadeCent > 0) liste.LEDFASSADE = fassadeCent;
                    for (const [nummer, text] of Object.entries(eigenePreise)) {
                      const zahl = Number(String(text).replace(",", "."));
                      if (text.trim() && Number.isFinite(zahl) && zahl > 0) {
                        liste[nummer] = Math.round(zahl * 100);
                      }
                    }
                    return Object.keys(liste).length > 0 ? liste : undefined;
                  })(),
                  essplatz,
                  logeDazu: logeDazu && essplatz !== "loge",
                  mitEmpfang,
                  // Bei einer Exklusivbuchung ist der ganze Saal bezahlt,
                  // leere Logenplaetze werden nicht noch einmal berechnet.
                  mitUnterbelegung: art === "einzelplaetze",
                  },
                  fassungen,
                  arten,
                );
                setFrisch(ergebnis.ids);
              });
            }}
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
          >
            {laeuft
              ? "wird erstellt..."
              : fassungen.length * arten.length > 1
                ? `${fassungen.length * arten.length} Angebote erstellen`
                : "Angebot erstellen"}
          </button>

          <p className="text-xs text-leise">
            Menüs und blockierte Logenplätze übernimmt das Programm aus den Gruppen des Vorgangs
            und dem Sitzplan. Die Zahl der Teilnehmer steht oben bei den Gruppen, von dort kommen
            die {personen} Gäste in dieser Vorbelegung. Menüs, Empfang und Getränke rechnen auch
            beim Exklusivevent je Gast.
          </p>

          {frisch.length > 0 && (
            <div ref={frischRef} className="scroll-mt-4 space-y-3 border-t border-linie pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--gut)" }}>
                  {frischeAngebote.length > 1
                    ? `${frischeAngebote.length} neue Angebote, bitte einmal durchsehen`
                    : "Das neue Angebot, bitte einmal durchsehen"}
                </p>
                <button
                  type="button"
                  onClick={() => setFrisch([])}
                  className="rounded-md border border-linie px-3 py-1 text-xs hover:border-gold hover:bg-gold-hell"
                >
                  oben einsortieren
                </button>
              </div>

              {frischeAngebote.length === 0 ? (
                <p className="text-sm text-leise">Angelegt. Das Angebot wird geladen.</p>
              ) : (
                frischeAngebote.map((a) => (
                  <AngebotKarte
                    key={a.id}
                    angebot={a}
                    vorgangId={vorgangId}
                    appUrl={appUrl}
                    kundeEmail={kundeEmail}
                    ansprechpartner={ansprechpartner}
                    terminwahl={terminwahl}
                    frisch
                  />
                ))
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

/**
 * Mehrere Angebote in einer Mail, mit Ueberschrift je Angebot.
 *
 * Vorbelegt ist "Angebot 1" plus, wenn der Termin feststeht, Wochentag
 * und Show: "Angebot 2: Sonntag, 08.11.2026, ULMFASSBAR". Mehr weiss
 * das Programm nicht ueber den Unterschied zweier Fassungen, und raten
 * soll es nicht. Kevin schreibt hin, worum es geht.
 */
/**
 * Das Regal mit allem, was wir anbieten.
 *
 * Ein Knopf je Leistung, nach Gruppen sortiert. Gold mit Haken heisst:
 * steht schon im Angebot, ein Klick nimmt sie wieder heraus. Grau mit
 * Pluszeichen heisst: noch nicht drin, ein Klick legt sie als optionale
 * Zeile dazu.
 *
 * Darueber der Knopf, der alles auf einmal hineinlegt. Wer ein Angebot
 * mit allen Moeglichkeiten bauen will, braucht dann nur noch zu
 * streichen, was nicht passt, statt vierzig Mal zu suchen.
 */
function Leistungsregal({
  angebot,
  vorgangId,
}: {
  angebot: AngebotDetail;
  vorgangId: string;
}) {
  const [laeuft, starte] = useTransition();
  const drin = new Set(angebot.positionen.map((p) => p.artikelNummer));
  const idVon = new Map(angebot.positionen.map((p) => [p.artikelNummer, p.id]));

  const alleNummern = ZUSATZARTIKEL.flatMap((g) => g.artikel.map((a) => a.nummer));
  const fehlende = alleNummern.filter((n) => !drin.has(n));

  return (
    <div className="mt-3 space-y-2 border-t border-linie pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Alles, was wir anbieten</span>
        <button
          type="button"
          disabled={laeuft || fehlende.length === 0}
          onClick={() => starte(() => positionenErgaenzen(angebot.id, vorgangId, fehlende))}
          className="rounded-md border border-gold bg-gold-hell px-2 py-0.5 text-xs font-medium text-gold-dunkel disabled:opacity-40"
        >
          {fehlende.length === 0
            ? "alles schon drin"
            : `alle ${fehlende.length} Optionen listen`}
        </button>
        {laeuft && <span className="text-xs text-leise">einen Moment...</span>}
      </div>

      {ZUSATZARTIKEL.map((g) => (
        <div key={g.titel} className="flex flex-wrap items-center gap-1.5">
          <span className="w-32 shrink-0 text-xs text-leise">{g.titel}</span>
          {g.artikel.map((a) => {
            const istDrin = drin.has(a.nummer);
            return (
              <button
                key={a.nummer}
                type="button"
                disabled={laeuft}
                title={
                  istDrin
                    ? "Steht im Angebot. Klicken nimmt die Zeile heraus."
                    : `${a.bezeichnung}: ${eur(a.bruttoCent)}. Klicken legt sie als Wahlmöglichkeit dazu.`
                }
                onClick={() =>
                  starte(() =>
                    istDrin
                      ? positionEntfernen(idVon.get(a.nummer)!, vorgangId)
                      : positionenErgaenzen(angebot.id, vorgangId, [a.nummer]),
                  )
                }
                className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-40"
                style={
                  istDrin
                    ? { borderColor: "var(--gold)", background: "var(--gold-hell)", fontWeight: 600 }
                    : { borderColor: "var(--linie)", color: "var(--text-leise)" }
                }
              >
                {istDrin ? "✓ " : "+ "}
                {a.bezeichnung.length > 26 ? `${a.bezeichnung.slice(0, 25)}…` : a.bezeichnung}
              </button>
            );
          })}
        </div>
      ))}

      <p className="text-xs text-leise">
        Gold mit Haken heißt: steht im Angebot. Ein Klick darauf nimmt die Zeile wieder heraus.
        Neue Zeilen kommen als Wahlmöglichkeit hinein, oben in der Liste stellst du sie auf fest.
        Mengen und Preise änderst du ebenfalls oben.
      </p>
    </div>
  );
}

function SammelMail({
  angebote,
  vorgangId,
  appUrl,
  kundeEmail,
  ansprechpartner,
}: {
  angebote: AngebotDetail[];
  vorgangId: string;
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
}) {
  const vorschlag = (a: AngebotDetail, i: number) => {
    const wann = a.vorstellung
      ? `${wochentagName(new Date(`${a.vorstellung.datum}T12:00:00Z`).getUTCDay())}, ` +
        `${a.vorstellung.datum.split("-").reverse().join(".")}, ${a.vorstellung.show}`
      : "";
    return `Angebot ${i + 1}${wann ? `: ${wann}` : ""}`;
  };

  const anrede = ansprechpartner ? `Hallo ${ansprechpartner},` : "Guten Tag,";
  const text = [
    anrede,
    "",
    "vielen Dank für Ihr Interesse an einem Abend bei uns. Wir haben Ihnen mehrere Möglichkeiten",
    "zusammengestellt, damit Sie in Ruhe vergleichen können.",
    "",
    "Jedes Angebot lässt sich einzeln ansehen und zusagen. Melden Sie sich gern, wenn etwas noch",
    "nicht passt, wir ändern es Ihnen.",
    "",
    "Herzliche Grüße",
  ].join(String.fromCharCode(10));

  return (
    <form action={angebotePerMail.bind(null, vorgangId)} className="mt-3 space-y-3">
      <div className="space-y-2">
        {angebote.map((a, i) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md bg-flaeche px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="angebot"
                value={a.id}
                defaultChecked={!a.versendetAm}
                className="h-4 w-4 accent-[var(--gold-dunkel)]"
              />
              <span className="font-medium tabular-nums">{a.nummer}</span>
            </label>
            <input
              name={`titel-${a.id}`}
              defaultValue={vorschlag(a, i)}
              maxLength={120}
              className="min-w-[16rem] flex-1 rounded-md border border-linie px-2 py-1 text-sm"
              placeholder="Überschrift in der Mail"
            />
            {a.versendetAm && <span className="text-xs text-leise">schon einmal verschickt</span>}
          </div>
        ))}
      </div>

      <label className="block text-xs">
        <span className="text-leise">An</span>
        <input
          type="email"
          name="an"
          defaultValue={kundeEmail}
          className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block text-xs">
        <span className="text-leise">Betreff</span>
        <input
          type="text"
          name="betreff"
          defaultValue="Ihre Angebote für den Abend im Florian Zimmer Theater"
          className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block text-xs">
        <span className="text-leise">Text</span>
        <textarea
          name="text"
          rows={10}
          defaultValue={text}
          className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 font-sans text-sm"
        />
      </label>

      <MailVorschau
        angebote={angebote.map((a) => ({
          id: a.id,
          href: `${appUrl}/ihr-angebot/${a.trackingToken}`,
        }))}
      />

      <Sendeknopf />
      <p className="text-xs text-leise">
        Eine Mail mit allen angehakten Angeboten, jedes mit eigener Überschrift und eigenem Knopf.
        Unterschrift und Fußzeile hängen wir darunter. Jedes mitgeschickte Angebot wird als
        versendet vermerkt.
      </p>
    </form>
  );
}

function AngebotKarte({
  angebot,
  vorgangId,
  appUrl,
  kundeEmail,
  ansprechpartner,
  terminwahl,
  frisch = false,
}: {
  angebot: AngebotDetail;
  vorgangId: string;
  appUrl: string;
  kundeEmail: string;
  ansprechpartner: string | null;
  /** Die Terminwahl, damit der Tag auch beim Aendern erreichbar ist. */
  terminwahl?: React.ReactNode;
  /** Gerade eben entstanden: kurz hervorheben. */
  frisch?: boolean;
}) {
  const [laeuft, starte] = useTransition();
  const [kopiert, setKopiert] = useState<"" | "link" | "mail">("");

  /*
    Das Angebot hier auf der Seite ansehen, ohne Tab zu wechseln.

    Gezeigt wird die Kundenseite, nicht das PDF. "beim Angebot kommt
    nicht mehr dieser schoene Ablauf mit den Fotos... mit einer blossen
    auflistung kann man sich den abend nicht so toll vorstellen"
    (Florian, 29.10.2026). Der Abend mit Bildern, Zeitachse und Menue
    steht nur auf der Webseite; das PDF ist die nuechterne Fassung fuer
    die Ablage. Wer prueft, ob ein Angebot ueberzeugt, muss das sehen,
    was der Kunde sieht.

    `?vorschau=1` haelt zwei Dinge auseinander: Der Besuch zaehlt nicht
    als Oeffnung, und die Knoepfe zum Zusagen und Absagen fehlen. Beides
    greift nur bei angemeldeten Mitarbeitern.

    `stand` steigt bei jedem Aufklappen und haengt am Rahmen. Wer eine
    Position geaendert hat, sieht beim naechsten Aufklappen die neue
    Fassung und nicht die, die der Browser noch im Zwischenspeicher hat.
  */
  const [vorschau, setVorschau] = useState(frisch);
  const [stand, setStand] = useState(1);

  const link = `${appUrl}/ihr-angebot/${angebot.trackingToken}`;
  const summe = angebotssumme(angebot.positionen);

  // Was sich am Angebot aendern laesst, in einer Zeile. Siehe pruefsumme.
  const abdruck = pruefsumme(
    angebot.positionen
      .map(
        (x) =>
          `${x.id}:${x.menge}:${x.einzelBruttoCent}:${x.optional ? 1 : 0}:${x.beschreibung ?? ""}`,
      )
      .join("|"),
  );

  /*
    Gesiezt, wie das Angebot selbst.

    Im Haus wird geduzt, im Gespraech mit Firmen nicht: "bitte umstellen
    auf sie, kevin findet das besser" (Florian, 28.10.2026). Mail,
    Angebotsseite und PDF ziehen dabei gemeinsam um, zwei verschiedene
    Anreden nebeneinander fielen sofort auf.

    Die Unterschrift fehlt hier mit Absicht, die haengt der Versand als
    Fusszeile an, siehe lib/mail/fusszeile.ts.
  */
  const mailtext = [
    ansprechpartner ? `Guten Tag ${ansprechpartner},` : "Guten Tag,",
    "",
    "vielen Dank für Ihr Interesse an einem Abend im Florian Zimmer Theater.",
    "",
    /*
      Kein Versprechen mehr, dass ein PDF anhaengt.

      "das angebot haengt nicht als pdf. also bitte schreiben: einfach
      auf den link klicken" (Florian, 28.10.2026). Das PDF geht mit,
      wenn es sich erzeugen laesst, aber darauf ist kein Verlass, und
      eine Mail, die einen Anhang ankuendigt, der fehlt, laesst den
      Kunden suchen.

      Ausserdem stand hier vorher ein Satz, der auf "hier:" endete und
      die nackte Adresse darunter. In der Fassung mit Formatierung
      faellt die Adresse weg, und der Satz hing in der Luft.
    */
    "Ihr persönliches Angebot liegt für Sie bereit. Ein Klick genügt: Dort sehen Sie alles " +
      "im Überblick und können direkt zusagen oder es ausdrucken.",
    link,
    "",
    `Das Angebot gilt bis zum ${new Date(angebot.gueltigBis).toLocaleDateString("de-DE")}.`,
    "",
    /*
      Der freundliche Schluss (Florian, 28.10.2026): "schreib in der mail
      an den kunden auch nette. können sich jederzeit melden." Wer ein
      Angebot bekommt, hat fast immer noch eine Frage, und die soll er
      stellen, statt die Mail liegen zu lassen.
    */
    "Passt noch nicht alles? Schreiben Sie uns gern Ihren Änderungswunsch, direkt im Angebot " +
      "oder als Antwort auf diese Mail. Ob anderer Termin, mehr oder weniger Personen oder eine " +
      "andere Kategorie: Wir besprechen das in Ruhe und schicken Ihnen eine angepasste Fassung.",
    "",
    "Und falls noch etwas offen ist: Melden Sie sich jederzeit, eine Mail oder ein kurzer Anruf " +
      "unter 0731 7906110 genügt. Wir gehen das gerne gemeinsam durch und passen das Angebot an, " +
      "bis es für Sie passt.",
    "",
    "Wir freuen uns auf Sie.",
    "",
    "Herzliche Grüße",
  ].join(UMBRUCH);

  const betreff = `Ihr Angebot ${angebot.nummer} für den Abend im Florian Zimmer Theater`;

  /*
    Fuer die beiden Wege nach draussen, Zwischenablage und Outlook,
    gehoert die Fusszeile mit in den Text. Beim Versand von hier aus
    haengt sie der Server an, deshalb steht sie nicht im Textfeld.
  */
  const mailtextKomplett = mailtext + FUSSZEILE_TEXT;

  async function kopiere(was: "link" | "mail") {
    try {
      await navigator.clipboard.writeText(was === "link" ? link : mailtextKomplett);
      setKopiert(was);
      setTimeout(() => setKopiert(""), 2500);
    } catch {
      // Manche Browser erlauben das nur nach direkter Nutzeraktion.
      // Dann bleibt der Text im Feld zum Markieren.
    }
  }

  return (
    <div
      id={`angebot-${angebot.id}`}
      className="scroll-mt-4 rounded-md border p-4 transition-colors"
      style={
        frisch
          ? { borderColor: "var(--gut)", background: "var(--gut-hell)" }
          : { borderColor: "var(--linie)" }
      }
    >
      {frisch && (
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--gut)" }}>
          Gerade erstellt. Plätze sind noch nicht blockiert, das machst du oben im
          Kasten Termin.
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{angebot.nummer}</span>
          <span className="ml-2 text-sm text-leise">{eur(summe.bruttoCent)}</span>
        </div>
        <ZustandsAnzeige angebot={angebot} />
      </div>

      <AenderungsWunsch angebot={angebot} />


      <div className="mb-3 rounded bg-hintergrund p-2">
        <div className="mb-1 text-xs text-leise">Persönlicher Link für den Kunden</div>
        <div className="break-all font-mono text-xs">{link}</div>
      </div>

      {/*
        Das PDF, so wie der Kunde es bekommt. Vor dem Verschicken einmal
        selbst ansehen ist die beste Kontrolle (Florian, 25.09.2026).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/*
          Ein Knopf statt dreier. "wir wollen einfach einfach einfach"
          (Florian, 29.10.2026). Ansehen und Aendern gehoeren zusammen:
          Man sieht sich das Angebot an und merkt dabei, dass etwas
          fehlt. Also fuehrt derselbe Knopf hin, und die Wege zum
          Aendern, zum eigenen Tab und zum PDF stehen in der Vorschau.
        */}
        <button
          type="button"
          onClick={() => {
            if (!vorschau) setStand((s) => s + 1);
            setVorschau((v) => !v);
          }}
          className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          {vorschau ? "Vorschau schließen" : "Ansehen / Ändern"}
        </button>

        {/*
          Der Schritt danach: Man ist sich einig, die Rechnung geht raus.

          Der Knopf steht auch bei einem noch nicht zugesagten Angebot da,
          weil man sich oft am Telefon einig wird und niemand vorher auf
          den Zusageknopf im Kundenlink drückt. Eine zweite Rechnung legt
          er nicht an, er fuehrt dann zur vorhandenen
          (Florian, 25.09.2026).
        */}
        <form action={rechnungErzeugen.bind(null, angebot.id, vorgangId)}>
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold-hell/40 px-3 py-1.5 text-sm font-medium text-gold-dunkel"
          >
            {angebot.angenommenAm ? "Rechnung erstellen" : "Einig geworden? Rechnung erstellen"}
          </button>
        </form>
      </div>

      {/*
        Aendern und ansehen nebeneinander.

        "ich will aber, dass man in dem erstellten rumwurschteln kann.
        dinge aendern, zuruecknehmen, optionen aendern usw."
        (Florian, 29.10.2026). Vorher sprang der Knopf in den Baukasten,
        und daraus entstand ein weiteres Angebot statt einer Aenderung
        am vorhandenen.

        Links stehen jetzt die Positionen, rechts das Dokument. Jede
        Aenderung laedt den Rahmen neu, siehe pruefsumme. Der Baukasten
        bleibt erreichbar, aber als das, was er ist: der Weg zu einer
        ganz neuen Fassung.
      */}
      {vorschau && (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-hintergrund"
              title="Öffnet den echten Kundenlink. Achtung: Das zählt als Öffnung durch den Kunden."
            >
              Kundenlink öffnen
            </a>
            <a
              href={`/api/angebot/pdf?id=${angebot.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-hintergrund"
            >
              als PDF
            </a>
            {!angebot.angenommenAm && !angebot.abgelehntAm && (
              <button
                type="button"
                onClick={zumBaukasten}
                className="rounded-md px-3 py-1.5 text-sm text-leise underline hover:text-gold-dunkel"
                title="Öffnet den Baukasten weiter unten. Daraus entsteht ein weiteres Angebot mit eigener Nummer, dieses hier bleibt stehen."
              >
                lieber ganz neu bauen
              </button>
            )}
          </div>

          {/*
            Vorschau oben, Aenderungen darunter.

            "leider ist uns das zu klein. baue bitte eine andere
            variante draus, so dass das vorschau angebot oben zu sehen
            ist und man drunter die einzelnen punkte ändern kann"
            (Florian, 30.10.2026).

            Vorher standen beide nebeneinander, und das Dokument hatte
            nur zwei Drittel der Breite. Ein Angebot ist aber eine
            Seite: Je breiter sie steht, desto eher sieht man, was der
            Kunde sieht. Untereinander kostet es Scrollen, und das ist
            der bessere Tausch.
          */}
          <div className="space-y-3">
            {/*
              Der Termin, auch beim Aendern.

              "der tag ist verschwunden beim angebot erstellen /ändern.
              es muss hier immer möglich sein den tag zu ändern"
              (Florian, 30.10.2026). Der Termin haengt am Vorgang, nicht
              am einzelnen Angebot: Wer ihn hier aendert, aendert ihn
              fuer alle. Fuer einen anderen Tag baut man besser ein
              weiteres Angebot, dann hat der Kunde beide zur Wahl.
            */}
            {terminwahl && (
              <div className="rounded-md border border-linie bg-flaeche px-3 py-2 text-xs">
                <p>
                  Termin:{" "}
                  <strong>
                    {angebot.vorstellung
                      ? `${angebot.vorstellung.datum.split("-").reverse().join(".")} · ${angebot.vorstellung.show}`
                      : "steht noch nicht fest"}
                  </strong>
                </p>
                {terminwahl}
                <p className="mt-1 text-leise">
                  Gilt für den ganzen Vorgang. Für einen anderen Tag lieber ein weiteres Angebot
                  bauen, der Kunde bekommt dann beide in einer Mail.
                </p>
              </div>
            )}

            {/*
              Die Breite der Vorschau: ein Mass, das beidem gerecht wird.

              Erst stand sie in einem Drittel der Spalte und war zu klein
              (Florian, 30.10.2026), dann ueber die volle Fensterbreite
              und war zu breit ("ausserdem ist das sehr breit jetzt das
              angebot"). Beides stimmt: Ein A4-Dokument liest sich am
              besten etwa so gross wie auf dem Papier, nicht kleiner und
              nicht quer ueber zwei Bildschirmhaelften.

              64rem sind rund 1024 Punkte, also knapp anderthalb A4. Auf
              schmalen Fenstern nimmt die Vorschau, was da ist.
            */}
            <iframe
              key={`${stand}-${abdruck}`}
              src={`/ihr-angebot/${angebot.trackingToken}?vorschau=1&stand=${stand}&p=${abdruck}`}
              title={`Angebot ${angebot.nummer}`}
              className="mx-auto h-[85vh] w-full max-w-[64rem] rounded-md border border-linie bg-white"
            />

            <div className="space-y-3">
            <details open className="rounded-md border border-linie p-3">
              <summary className="cursor-pointer text-xs text-leise">
                      Positionen ändern: Preis, Menge, optional, löschen
              </summary>
              <p className="mt-2 text-xs text-leise">
                Jede Zeile lässt sich einzeln auf <strong>optional</strong> stellen. Dann steht ihr
                Preis beim Kunden in Klammern und zählt nicht zur Summe unten.
              </p>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {zumAendern(angebot.positionen).map((p) => (
                      <tr key={p.id} className="border-b border-linie last:border-0">
                        {/*
                          Der Produktname gross genug, um ihn zu treffen.

                          "zeig die Tickets wie Golden Seats usw. groesser
                          an fuer den Mitarbeiter. das soll gleich ins auge
                          fallen, der produktname auch bei magic menue"
                          (Florian, 30.10.2026). Vorher stand alles in
                          derselben kleinen Schrift wie die Hinweise
                          darunter, und beim Durchgehen von zehn Zeilen
                          musste man jedes Mal genau hinschauen, welche
                          Kategorie gerade dran ist.

                          Die Vorsilbe "Optional" und "Wahlmoeglichkeit"
                          bleibt klein und grau: Sie sagt etwas ueber die
                          Zeile, sie ist nicht der Name.
                        */}
                        <td className={`py-1.5 ${p.istAlternativeZu ? "pl-5" : ""}`}>
                          {p.istAlternativeZu ? (
                            <div className="text-xs text-leise">Wahlmöglichkeit</div>
                          ) : (
                            p.optional && <div className="text-xs text-leise">Optional</div>
                          )}
                          <span
                            className="text-sm font-medium"
                            style={p.optional || p.istAlternativeZu ? { color: "var(--text-leise)" } : undefined}
                          >
                            {p.bezeichnung}
                          </span>
                          {/*
                            Der Text, der im Angebot unter der Position steht.
                            Enter speichert (Florian, 15.10.2026), und seit
                            dem 30.10.2026 auch das Verlassen des Feldes,
                            aus demselben Grund wie beim Preis daneben.
                          */}
                          <form action={positionText.bind(null, p.id, vorgangId)} className="mt-0.5">
                            <input
                              name="text"
                              defaultValue={p.beschreibung ?? ""}
                              maxLength={600}
                              placeholder="Text unter der Position"
                              onBlur={(e) => {
                                if (e.currentTarget.value !== (p.beschreibung ?? "")) {
                                  e.currentTarget.form?.requestSubmit();
                                }
                              }}
                              className="w-full rounded border border-linie px-1.5 py-0.5 text-xs"
                            />
                          </form>
                        </td>
                        <td className="w-14 py-1 text-right tabular-nums">{p.menge}x</td>
                        {/*
                          Der Einzelpreis zum Ueberschreiben. Enter genuegt,
                          der Knopf daneben ist fuer die Maus
                          (Florian, 15.10.2026).
                        */}
                        <td className="w-32 py-1 pl-2 text-right">
                          <form
                            action={positionPreisSetzen.bind(null, p.id, vorgangId)}
                            className="flex items-center justify-end gap-1"
                          >
                            {/*
                              Die Breite steht hier und nicht als Klasse.

                              In globals.css bekommt jedes Textfeld
                              width:100%, und das gewinnt gegen w-20.
                              Seit die Tabelle ueber die ganze Breite
                              geht, war das Preisfeld deshalb riesig:
                              "beim angebot das feld für die preise nicht
                              ganz so groß, nur so wie man es braucht"
                              (Florian, 30.10.2026).
                            */}
                            <input
                              type="text"
                              name="preis"
                              inputMode="decimal"
                              defaultValue={(p.einzelBruttoCent / 100).toFixed(2).replace(".", ",")}
                              /*
                                Speichern, sobald das Feld verlassen wird.

                                "wenn man die preise unterm angebot
                                ändert, gibt es keine speichermöglichkeit
                                ... wenn man dann auf pdf klickt, dass
                                dann der alte preis noch drin steht"
                                (Florian, 30.10.2026). Enter speicherte
                                schon vorher, aber wer tippt und
                                weiterklickt, denkt nicht an Enter.

                                Abgeschickt wird nur bei einer echten
                                Aenderung: Sonst liefe bei jedem Klick
                                durch die Zeilen ein Speichervorgang.
                              */
                              onBlur={(e) => {
                                const vorher = (p.einzelBruttoCent / 100)
                                  .toFixed(2)
                                  .replace(".", ",");
                                if (e.currentTarget.value.trim() !== vorher) {
                                  e.currentTarget.form?.requestSubmit();
                                }
                              }}
                              style={{ width: "5.5rem" }}
                              className="rounded border border-linie px-1.5 py-0.5 text-right text-xs tabular-nums"
                            />
                            <button type="submit" className="underline text-leise" title="Speichern">
                              €
                            </button>
                          </form>
                          {/*
                            Der Nachlass je Zeile.

                            "das soll möglich sein bei jedem einzelnen
                            produkt weiterhin" (Florian, 30.10.2026). Es
                            gab ihn nur noch als Prozentsatz auf alle
                            Tickets im Baukasten; gerechnet und gedruckt
                            wurde er je Zeile immer schon.

                            Leer heisst kein Nachlass. Mehr als die
                            Haelfte nimmt der Server nicht an, das waere
                            kein Rabatt mehr, sondern ein anderer Preis.
                          */}
                          <form
                            action={positionRabattSetzen.bind(null, p.id, vorgangId)}
                            className="mt-1 flex items-center justify-end gap-1"
                          >
                            <input
                              type="text"
                              name="rabatt"
                              inputMode="numeric"
                              defaultValue={p.rabattProzent ? String(p.rabattProzent) : ""}
                              placeholder="Rabatt"
                              style={{ width: "5.5rem" }}
                              onBlur={(e) => {
                                const vorher = p.rabattProzent ? String(p.rabattProzent) : "";
                                if (e.currentTarget.value.trim() !== vorher) {
                                  e.currentTarget.form?.requestSubmit();
                                }
                              }}
                              className="rounded border border-linie px-1.5 py-0.5 text-right text-xs tabular-nums"
                            />
                            <button type="submit" className="underline text-leise" title="Rabatt speichern">
                              %
                            </button>
                          </form>
                        </td>
                        <td className={`py-1 pl-2 text-right tabular-nums ${p.optional ? "text-leise" : ""}`}>
                          {p.rabattProzent ? (
                            <>
                              <span className="block text-leise line-through">
                                {eur(p.einzelBruttoCent * p.menge)}
                              </span>
                              <span style={{ color: "var(--gut)", fontWeight: 600 }}>
                                {p.optional ? `(${eur(positionsSumme(p))})` : eur(positionsSumme(p))}
                              </span>
                            </>
                          ) : p.optional ? (
                            `(${eur(positionsSumme(p))})`
                          ) : (
                            eur(positionsSumme(p))
                          )}
                        </td>
                        {/*
                          Der Schalter je Zeile. Optional heisst: steht im
                          Angebot mit Preis in Klammern und zaehlt nicht zur
                          Summe (Florian, 14.10.2026).

                          Frueher stand hier ein grauer Link "optional", der
                          beim Druecken auf "zur Pflicht" umsprang. Man sah
                          also nicht den Zustand, sondern das Gegenteil, und
                          im Kleingedruckten ganz rechts hat ihn niemand
                          gefunden (Florian, 30.10.2026). Jetzt stehen beide
                          Zustaende nebeneinander, der geltende ist
                          hervorgehoben, genau wie im Baukasten.
                        */}
                        <td className="py-1 pl-2 text-right">
                          <span className="inline-flex gap-1">
                            {([
                              [false, "fest drin", "Zählt zur Summe des Angebots."],
                              [true, "optional", "Steht beim Kunden in Klammern und zählt nicht zur Summe."],
                            ] as const).map(([an, text, titel]) => (
                              <form key={text} action={positionOptional.bind(null, p.id, vorgangId, an)}>
                                <button
                                  type="submit"
                                  title={titel}
                                  className="whitespace-nowrap rounded-md border px-2 py-0.5 text-xs"
                                  style={
                                    Boolean(p.optional) === an
                                      ? { borderColor: "var(--gold)", background: "var(--gold-hell)", fontWeight: 600 }
                                      : { borderColor: "var(--linie)", color: "var(--text-leise)" }
                                  }
                                >
                                  {text}
                                </button>
                              </form>
                            ))}
                          </span>
                          <form action={positionEntfernen.bind(null, p.id, vorgangId)}>
                            <button type="submit" className="whitespace-nowrap underline text-leise">
                              entfernen
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-leise">
                Im Feld steht der Einzelpreis, rechts daneben die Zeilensumme. Ein geänderter Preis
                wird gespeichert, sobald du das Feld verlässt. Optionale Positionen
                stehen im Angebot mit dem Preis in Klammern und sind im Gesamtbetrag nicht enthalten.
                Ein schon verschicktes PDF ändert sich durch Änderungen hier nicht, der Kundenlink
                schon.
              </p>
              {/*
                Alles, was es gibt, mit einem Blick und einem Klick.

                "ich will hier unter dem angebot alles angezeigt haben
                was es gibt. ich will alles dazu oder abwählen können.
                man sollte einen button haben 'alle optionen listen' ...
                wichtig ist mir, dass hier auch die anderen ticketkat.
                drin sind" (Florian, 30.10.2026).

                Darunter stand bisher nur ein Auswahlfeld, in dem man
                eine Leistung suchen und mit drei weiteren Feldern
                eintragen musste. Jetzt steht alles als Knopf da, nach
                Gruppen sortiert. Was schon im Angebot ist, ist gold und
                traegt ein Haekchen; der Rest wartet grau darauf,
                angetippt zu werden.
              */}
              <Leistungsregal
                angebot={angebot}
                vorgangId={vorgangId}
              />

              {/* ------------------------------------------------------------
                  Eine Position dazunehmen, wie bei lexoffice: Artikel wählen
                  oder frei eintippen, Menge, Preis, Haken für optional, dazu
                  ein eigener Text (Florian, 15.10.2026).
                  ------------------------------------------------------------ */}
              <form
                action={positionHinzufuegen.bind(null, angebot.id, vorgangId)}
                className="mt-3 space-y-2 border-t border-linie pt-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem]">
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Position</span>
                    <select name="artikel" defaultValue="" className="text-sm">
                      <option value="">frei eintippen</option>
                      {ZUSATZARTIKEL.map((g) => (
                        <optgroup key={g.titel} label={g.titel}>
                          {g.artikel.map((x) => (
                            <option key={x.nummer} value={x.nummer}>
                              {x.bezeichnung} ({eur(x.bruttoCent)})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Menge</span>
                    <input name="menge" defaultValue="1" inputMode="decimal" className="text-sm" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Preis €</span>
                    <input name="preis" inputMode="decimal" placeholder="wie Liste" className="text-sm" />
                  </label>
                </div>
                <input
                  name="bezeichnung"
                  maxLength={200}
                  placeholder="Eigene Bezeichnung, wenn oben frei eintippen gewählt ist"
                  className="w-full text-sm"
                />
                <textarea
                  name="text"
                  rows={2}
                  maxLength={600}
                  placeholder="Text unter der Position, zum Beispiel der Hinweis zur LED-Fassade"
                  className="w-full text-sm"
                />
                <div className="flex flex-wrap items-center gap-3">
                  {/*
                    Fest oder optional, als sichtbare Wahl.

                    Hier stand ein Haken, der von sich aus gesetzt war.
                    Wer ihn uebersah, hatte eine optionale Zeile im
                    Angebot, ohne es zu merken, und beim Nachtragen
                    ("zwei Menues mehr") ist das genau falsch herum.
                  */}
                  <span className="flex flex-wrap items-center gap-3 text-sm">
                    {([
                      ["nein", "fest drin", "Zählt zur Summe des Angebots."],
                      ["ja", "optional", "Preis in Klammern, zählt nicht zur Summe."],
                    ] as const).map(([wert, text, titel]) => (
                      <label key={wert} className="flex items-center gap-2" title={titel}>
                        <input
                          type="radio"
                          name="optional"
                          value={wert}
                          defaultChecked={wert === "nein"}
                          className="h-4 w-4 accent-[var(--gold-dunkel)]"
                        />
                        {text}
                      </label>
                    ))}
                  </span>
                  <button
                    type="submit"
                    className="rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold hover:bg-gold-hell"
                  >
                    Position hinzufügen
                  </button>
                </div>
                {/*
                  Der Satz zur LED-Fassade steht zum Kopieren da. Werbeleistung
                  und Eventpaket bleiben darin getrennt, der Nachlass hängt an
                  der Partnerschaft und nicht am Ticketpreis (Florian,
                  15.10.2026).
                */}
                <details className="text-xs text-leise">
                  <summary className="cursor-pointer">Textbaustein LED-Fassade</summary>
                  <p className="mt-1 rounded border border-linie p-2 text-text">{LED_TEXT}</p>
                </details>
              </form>
            </details>
            </div>
          </div>
        </div>
      )}

      {/*
        Verschicken aus dem Programm heraus, ueber das Postfach
        tickets@florianzimmer.com. Der Text steht offen da und laesst sich
        vor dem Abschicken aendern: Kein Angebot ist wie das andere, und
        wer eben telefoniert hat, will darauf Bezug nehmen.
      */}
      <details className="mb-3 rounded border border-gold bg-gold-hell/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gold-dunkel">
          Angebot per Mail verschicken
        </summary>

        <form action={angebotPerMail.bind(null, angebot.id, vorgangId)} className="mt-3 space-y-2">
          <label className="block text-xs">
            <span className="text-leise">An</span>
            <input
              type="email"
              name="an"
              defaultValue={kundeEmail}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            <span className="text-leise">Betreff</span>
            <input
              type="text"
              name="betreff"
              defaultValue={betreff}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            <span className="text-leise">Text</span>
            <textarea
              name="text"
              rows={12}
              defaultValue={mailtext}
              className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 font-sans text-sm"
            />
          </label>

          <MailVorschau link={link} />

          <Sendeknopf />
          <p className="text-xs text-leise">
            Geht von kevin.steele@florianzimmer.com hinaus und steht danach dort unter Gesendete
            Elemente. Antworten des Kunden landen bei Kevin. Das Angebot wird gleichzeitig als
            versendet vermerkt. Unterschrift, Bewertungslinks und Anschrift hängen wir
            automatisch darunter, die müssen hier nicht hinein. Ein PDF hängt nicht mehr an, der
            Kunde öffnet das Angebot über den Knopf.
          </p>
        </form>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => kopiere("link")}
          className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
        >
          {kopiert === "link" ? "kopiert" : "Link kopieren"}
        </button>

        <button
          onClick={() => kopiere("mail")}
          className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell"
        >
          {kopiert === "mail" ? "kopiert" : "Mailtext kopieren"}
        </button>

        <a
          /*
            Derselbe Betreff wie beim Versand von hier aus. Vorher stand
            im Outlook-Weg "Ihr Angebot für Ihren Abend", im Text darunter
            aber das Du. Das fiel sofort auf (Florian, 28.10.2026).
          */
          href={`mailto:${encodeURIComponent(kundeEmail)}?subject=${encodeURIComponent(
            betreff,
          )}&body=${encodeURIComponent(mailtextKomplett)}`}
          className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-xs font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          In Outlook öffnen
        </a>

        {!angebot.versendetAm && (
          <button
            disabled={laeuft}
            onClick={() => starte(() => void angebotVersendet(angebot.id, vorgangId))}
            className="rounded-md border border-linie px-3 py-1.5 text-xs hover:border-gold hover:bg-gold-hell disabled:opacity-50"
          >
            als versendet markieren
          </button>
        )}

        {angebot.oeffnungen.length === 0 && !angebot.angenommenAm && (
          <button
            disabled={laeuft}
            onClick={() => starte(() => void angebotLoeschen(angebot.id, vorgangId))}
            className="rounded-md px-3 py-1.5 text-xs text-leise hover:bg-blocker-hell hover:text-blocker disabled:opacity-50"
          >
            löschen
          </button>
        )}
      </div>

      {angebot.oeffnungen.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs" style={{ color: "var(--gold-dunkel)" }}>
            {angebot.oeffnungen.length}x geöffnet, alle Zeitpunkte ansehen
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-leise">
            {angebot.oeffnungen.map((o, i) => (
              <li key={i}>
                {new Date(o.zeitpunkt).toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {o.geraet && ` · ${o.geraet}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Eine kurze Zahl ueber den Stand der Positionen.
 *
 * Sie haengt am Rahmen der Vorschau. Aendert jemand einen Preis, eine
 * Menge oder einen Haken, ist die Zahl eine andere, der Rahmen wird neu
 * geladen, und im Dokument daneben steht sofort die neue Fassung
 * (Florian, 29.10.2026: "in dem angezeigten dokument soll sich das dann
 * auch immer gleich aendern").
 */
function pruefsumme(text: string): number {
  let wert = 0;
  for (let i = 0; i < text.length; i++) wert = (wert * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(wert);
}

/**
 * Oeffnet den Baukasten weiter unten und springt hin.
 *
 * Steht auf Modulebene, weil der Knopf dazu in der Vorschau sitzt und
 * der Hinweis auf den Kundenwunsch an einer anderen Stelle der Karte.
 */
function zumBaukasten(): void {
  const kasten = document.getElementById("angebot-bauen");
  if (!(kasten instanceof HTMLDetailsElement)) return;
  kasten.open = true;
  kasten.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Der Aenderungswunsch des Kunden.
 *
 * "Angebot anpassen sollte in der naehe der Zeile sein, wo man die
 * schritte sieht" (Florian, 28.10.2026). Also direkt unter der Zeile,
 * die sagt, wo das Angebot steht.
 *
 * Angepasst wird nicht das alte Angebot, sondern es entsteht eine neue
 * Fassung mit eigener Nummer. Das alte bleibt stehen: Was beim Kunden
 * liegt, darf sich nicht nachtraeglich aendern, und bei einer
 * Rueckfrage muss nachvollziehbar sein, was er damals gesehen hat.
 */
function AenderungsWunsch({ angebot }: { angebot: AngebotDetail }) {
  /*
    "wenn man bei vorgang drin ist, muss es den button 'angebot ändern'
    geben" (Florian, 29.10.2026).

    Vorher stand er nur an einem Angebot, das schon beim Kunden liegt.
    Genau da braucht man ihn am seltensten: Die meisten Aenderungen
    passieren vorher, beim Durchsehen. Man baut ein Angebot, sieht die
    Vorschau, und merkt, dass das Menue fehlt. Dann stand man ohne
    Knopf da.

    Jetzt steht er an jedem Angebot, das noch offen ist. Weg ist er
    erst, wenn der Kunde zugesagt oder abgesagt hat: Was entschieden
    ist, wird nicht mehr umgebaut, dafuer gibt es ein neues Angebot
    von vorn.
  */
  if (!angebot.aenderungWunsch) return null;

  return (
    <div className="mb-3">
      {angebot.aenderungWunsch && (
        <div
          className="mb-2 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>
            Änderungswunsch vom Kunden
            {angebot.aenderungAm &&
              `, ${new Date(angebot.aenderungAm).toLocaleDateString("de-DE")}`}
            :
          </strong>
          <p className="mt-1 whitespace-pre-wrap">{angebot.aenderungWunsch}</p>
        </div>
      )}
    </div>
  );
}

/** Wo steht das Angebot gerade, in einem Satz. */
function ZustandsAnzeige({ angebot }: { angebot: AngebotDetail }) {
  const stil = (farbe: string) => ({ color: farbe, background: "transparent" });

  if (angebot.angenommenAm) {
    return (
      <span className="text-xs font-medium" style={stil("var(--gut)")}>
        angenommen von {angebot.angenommenVon}
      </span>
    );
  }
  if (angebot.abgelehntAm) {
    return (
      <span className="text-xs font-medium" style={stil("var(--blocker)")}>
        abgelehnt{angebot.ablehnungsgrund ? `: ${angebot.ablehnungsgrund}` : ""}
      </span>
    );
  }
  if (angebot.oeffnungen.length > 0) {
    const letzte = angebot.oeffnungen[0];
    return (
      <span className="text-xs font-medium" style={stil("var(--gold-dunkel)")}>
        {angebot.oeffnungen.length}x geöffnet, zuletzt{" "}
        {new Date(letzte.zeitpunkt).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          dateStyle: "short",
          timeStyle: "short",
        })}
      </span>
    );
  }
  if (angebot.versendetAm) {
    return (
      <span className="text-xs text-leise">versendet, vom Kunden noch nicht geöffnet</span>
    );
  }
  return <span className="text-xs text-leise">erstellt, noch nicht versendet</span>;
}

/**
 * Auswahl der Getränkepauschalen.
 *
 * Bewusst Kästchen statt einer Liste: Softdrink-Flat zusammen mit Bier-
 * und Wein-Flat ist die beliebteste Buchung. Wer keinen Alkohol trinkt,
 * ist mit den Softdrinks versorgt, alle anderen mit beidem. Im Angebot
 * werden daraus zwei getrennte Positionen.
 */
/**
 * Fest drin oder nur als Wahlmöglichkeit.
 *
 * "ich will dass es drin ist im angebot / ich will dass es drin ist,
 * aber optional. optional ist immer in klammern dann beim kunden auf dem
 * angebot" (Florian, 28.10.2026).
 *
 * Zwei Knöpfe nebeneinander statt eines Hakens: Ein Haken namens
 * "optional" lässt offen, was der andere Zustand eigentlich heisst.
 * Hier steht beides da, und man sieht auf einen Blick, was der Kunde
 * später liest.
 */
/**
 * Gar nicht, zur Wahl oder fest drin.
 *
 * "Ich will zu allen Punkten die Möglichkeit haben, diese fest, oder
 * optional zu haben. Oder auch GAR NICHT erwähnt im Angebot. Dies
 * betrifft auch die Menüs!" (Kevin über Florian, 30.10.2026).
 *
 * Zwei Zustände gab es schon, fest und optional. Der dritte steckte
 * woanders: beim Menü in der Fassung ganz oben, beim Empfang in einem
 * Häkchen daneben. Wer eine Leistung weglassen wollte, musste also an
 * einer anderen Stelle suchen als die, an der er gerade stand.
 *
 * Drei Knöpfe nebeneinander beantworten die Frage dort, wo sie sich
 * stellt, und man sieht ohne Klick, welcher Zustand gerade gilt.
 */
function DreiWeg({
  wert,
  setzen,
  weg = "nicht im Angebot",
}: {
  wert: "weg" | "wahl" | "fest";
  setzen: (w: "weg" | "wahl" | "fest") => void;
  weg?: string;
}) {
  const knopf = (w: "weg" | "wahl" | "fest", text: string, titel: string) => (
    <button
      key={w}
      type="button"
      onClick={() => setzen(w)}
      title={titel}
      className="rounded-md border px-2 py-0.5 text-xs"
      style={
        wert === w
          ? { borderColor: "var(--gold)", background: "var(--gold-hell)", fontWeight: 600 }
          : { borderColor: "var(--linie)", color: "var(--text-leise)" }
      }
    >
      {text}
    </button>
  );

  return (
    <span className="inline-flex gap-1">
      {knopf("weg", weg, "Kommt im Angebot gar nicht vor.")}
      {knopf("wahl", "optional", "Steht beim Kunden in Klammern und zählt nicht zur Summe.")}
      {knopf("fest", "fest drin", "Zählt zur Summe des Angebots.")}
    </span>
  );
}

function DrinSchalter({
  optional,
  setzen,
}: {
  optional: boolean;
  setzen: (optional: boolean) => void;
}) {
  const knopf = (an: boolean, text: string, titel: string) => (
    <button
      type="button"
      onClick={() => setzen(an)}
      title={titel}
      className="rounded-md border px-2 py-0.5 text-xs"
      style={
        optional === an
          ? { borderColor: "var(--gold)", background: "var(--gold-hell)", fontWeight: 600 }
          : { borderColor: "var(--linie)", color: "var(--text-leise)" }
      }
    >
      {text}
    </button>
  );

  return (
    <span className="inline-flex gap-1">
      {knopf(false, "fest drin", "Zählt zur Summe des Angebots.")}
      {knopf(true, "optional", "Steht beim Kunden in Klammern und zählt nicht zur Summe.")}
    </span>
  );
}

function Getraenkewahl({
  gewaehlt,
  setzen,
  mengen,
  setzeMengen,
  personen,
  istOptional,
  setzeOptional,
}: {
  gewaehlt: string[];
  setzen: (nummern: string[]) => void;
  mengen: Record<string, number>;
  setzeMengen: (m: Record<string, number>) => void;
  personen: number;
  istOptional: (nummer: string) => boolean;
  setzeOptional: (nummer: string, optional: boolean) => void;
}) {
  /*
    Die Anzahl haengt am Haken: Wer eine Pauschale anhakt, bekommt sie
    zunaechst fuer alle. Erst wer etwas anderes eintraegt, weicht ab.
    Beim Abhaken verschwindet die Zahl wieder, sonst stuende sie beim
    naechsten Anhaken still auf einem alten Wert.
  */
  function umschalten(nummer: string, an: boolean) {
    if (an) {
      setzen(gewaehlt.filter((n) => n !== nummer));
      const rest = { ...mengen };
      delete rest[nummer];
      setzeMengen(rest);
    } else {
      setzen([...gewaehlt, nummer]);
      setzeMengen({ ...mengen, [nummer]: personen });
    }
  }

  const verteilt = GETRAENKE.filter((g) => gewaehlt.includes(g.nummer)).reduce(
    (summe, g) => summe + (mengen[g.nummer] ?? personen),
    0,
  );

  return (
    <div className="space-y-1.5">
      {GETRAENKE.map((g) => {
        const an = gewaehlt.includes(g.nummer);
        return (
          <div key={g.nummer} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={an}
                onChange={() => umschalten(g.nummer, an)}
                className="mt-0.5 h-auto w-auto"
              />
              <span>
                {g.bezeichnung}
                <span className="text-leise"> ({eur(g.bruttoCent)})</span>
              </span>
            </label>
            {an && (
              <>
                <label className="flex items-center gap-1 text-xs text-leise">
                  <input
                    type="number"
                    min={0}
                    value={mengen[g.nummer] ?? personen}
                    onChange={(e) =>
                      setzeMengen({
                        ...mengen,
                        [g.nummer]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-16 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
                  />
                  mal
                </label>
                <DrinSchalter
                  optional={istOptional(g.nummer)}
                  setzen={(o) => setzeOptional(g.nummer, o)}
                />
              </>
            )}
          </div>
        );
      })}

      {gewaehlt.length === 0 ? (
        <p className="text-xs text-leise">Keine Pauschale, Getränke werden einzeln abgerechnet.</p>
      ) : (
        /*
          Die Kontrollzeile. Zehn Bier- und Weinflats plus zwei
          Softdrinkflats bei zwoelf Teilnehmern soll aufgehen, und wenn
          nicht, faellt es hier auf und nicht erst im PDF. Mehr als eine
          Flat je Gast ist trotzdem erlaubt: Softdrink zusammen mit Bier
          und Wein ist die haeufigste Buchung.
        */
        <p className="pt-1 text-xs text-leise">
          {verteilt} {verteilt === 1 ? "Pauschale" : "Pauschalen"} bei {personen}{" "}
          {personen === 1 ? "Teilnehmer" : "Teilnehmern"}
          {verteilt < personen && (
            <span style={{ color: "var(--warnung)" }}>
              {" "}
              · {personen - verteilt} {personen - verteilt === 1 ? "Gast geht" : "Gäste gehen"} leer
              aus
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Was eine Exklusivbuchung im Angebot bedeutet.
 *
 * Hier gibt es nichts auszuwählen: eine Zeile für das ganze Haus, keine
 * Kategorien, keine Sitzplatzwahl (Florian, 15.10.2026). Der Kasten
 * sagt, was im Angebot landen wird und was der Preis je Sitzplatz
 * ergibt, denn danach wird gerechnet.
 */
function Exklusivhinweis({
  art,
  preisCent,
  personen,
}: {
  art: "theater" | "parkett";
  preisCent: number;
  personen: number;
}) {
  const eintrag = ARTEN.find((a) => a.wert === art);
  const artikel = EXKLUSIV.find((a) => a.nummer === eintrag?.nummer);
  if (!eintrag || !artikel) return null;

  const gilt = preisCent > 0 ? preisCent : artikel.bruttoCent;
  const plaetze = eintrag.plaetze;

  return (
    <div className="rounded-md border border-linie bg-hintergrund p-3 text-xs">
      <p className="font-medium">{artikel.bezeichnung}</p>
      <p className="mt-1 text-leise">
        Keine Ticketkategorien und keine Sitzplatzwahl: Der Saal gehört an diesem Abend nur Ihnen.
        Im Angebot steht eine Zeile über {eur(gilt)}
        {preisCent > 0 && <> statt der üblichen {eur(artikel.bruttoCent)}</>}.
      </p>
      <p className="mt-1 text-leise">
        Das sind {eur(Math.round(gilt / plaetze))} je Sitzplatz bei {plaetze} Plätzen
        {personen > 0 && <> und {eur(Math.round(gilt / personen))} je angemeldetem Gast</>}.
      </p>
    </div>
  );
}

/**
 * Stückzahl je Ticketkategorie.
 *
 * Mehrere Kategorien in einem Angebot waren der Wunsch: Bei Firmen sitzt
 * die Geschäftsleitung vorne, der Rest weiter hinten (Florian,
 * 15.10.2026). Jede Kategorie mit einer Zahl wird eine eigene Zeile im
 * Angebot und zählt zur Summe.
 *
 * Steht nur eine Kategorie da, erscheinen die anderen im Angebot wie
 * bisher als Wahlmöglichkeit ohne Preis in der Summe.
 */
function Kategorienwahl({
  mengen,
  setzen,
  personen,
  preise,
  preiseSelbst,
  istOptional,
  setzeOptional,
  eigenePreise,
  setzeEigenenPreis,
}: {
  mengen: Record<string, number>;
  setzen: (m: Record<string, number>) => void;
  personen: number;
  /**
   * Die Preise des gewaehlten Abends, Artikelnummer zu Cent.
   *
   * "dort stehen auch nicht die richtigen preise für eine
   * donnerstagsshow ... oben sagst du ja schon donnerstag (günstiger) -
   * zeigst aber die preise vom samstag" (Florian, 30.10.2026). Hier
   * standen die Listenpreise aus dem Artikelstamm, gerechnet wurde mit
   * denen der Vorstellung. Jetzt steht beides im Einklang.
   */
  preise: Record<string, number>;
  /** Felder leer lassen, damit der Preis von Hand kommt. */
  preiseSelbst: boolean;
  istOptional: (nummer: string) => boolean;
  setzeOptional: (nummer: string, an: boolean) => void;
  /**
   * Eigene Preise je Kategorie, als getippter Text.
   *
   * "gib einfach hier schon die möglichkeit einfluss auf den preis zu
   * nehmen" (Florian, 30.10.2026). Darunter stand nur ein Feld fuer
   * alle Kategorien zusammen; wer den Golden Seats einen anderen Preis
   * geben wollte, musste das Angebot erst bauen und dann in der
   * Positionsliste nachbessern.
   */
  eigenePreise: Record<string, string>;
  setzeEigenenPreis: (nummer: string, wert: string) => void;
}) {
  const verteilt = TICKETS.reduce((s, t) => s + (mengen[t.nummer] ?? 0), 0);
  const benutzte = TICKETS.filter((t) => (mengen[t.nummer] ?? 0) > 0).length;

  return (
    <div className="space-y-1.5">
      {TICKETS.map((t) => {
        const cent = preise[t.nummer] ?? t.bruttoCent;
        const anders = cent !== t.bruttoCent;
        return (
          <div key={t.nummer} className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              value={mengen[t.nummer] ?? 0}
              onChange={(e) =>
                setzen({ ...mengen, [t.nummer]: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-20 rounded-md border border-linie px-2 py-1 text-sm tabular-nums"
            />
            <span>
              {t.bezeichnung}
              {preiseSelbst ? (
                <span className="text-leise"> (im Shop {eur(cent)})</span>
              ) : (
                <>
                  <span className="text-leise"> ({eur(cent)})</span>
                  {anders && (
                    <span className="text-leise"> statt {eur(t.bruttoCent)} an anderen Tagen</span>
                  )}
                </>
              )}
            </span>
            <label className="flex items-center gap-1 text-xs text-leise">
              eigener Preis
              <input
                type="text"
                inputMode="decimal"
                value={eigenePreise[t.nummer] ?? ""}
                onChange={(e) => setzeEigenenPreis(t.nummer, e.target.value)}
                placeholder={preiseSelbst ? "Preis" : (cent / 100).toFixed(2).replace(".", ",")}
                style={{ width: "5.5rem" }}
                className="rounded-md border border-linie px-2 py-1 text-right text-sm tabular-nums"
              />
              €
            </label>
            {/*
              Der Optional-Schalter, auch hier.

              "das mit dem optional muss auch direkt kommen wenn man das
              erste angebot erstellt. da ist es nicht der fall bei den
              kategorien" (Florian, 30.10.2026). Bei Menue, Empfang,
              Getraenken und den Highlights gab es ihn schon, bei den
              Tickets fehlte er.
            */}
            {(mengen[t.nummer] ?? 0) > 0 && (
              <DrinSchalter
                optional={istOptional(t.nummer)}
                setzen={(an) => setzeOptional(t.nummer, an)}
              />
            )}
          </div>
        );
      })}

      {/*
        Die Kontrollzeile. Dass die Stückzahlen zur Gästezahl passen,
        merkt man sonst erst im fertigen PDF.
      */}
      <p className="pt-1 text-xs text-leise">
        {verteilt === 0 ? (
          <>Keine Stückzahl eingetragen: Dann bekommen alle {personen} Gäste Kat. 2.</>
        ) : (
          <>
            {verteilt} von {personen} Gästen verteilt
            {verteilt !== personen && (
              <span style={{ color: "var(--warnung)" }}>
                {" "}
                · stimmt nicht mit den Gruppen überein
              </span>
            )}
            {benutzte > 1 && " · mehrere Kategorien, alle zählen zur Summe"}
            {benutzte === 1 &&
              " · Golden Seats und Kat. 1 stehen als Wahlmöglichkeit darunter, in Klammern und nicht in der Summe"}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Der Umbruch als Konstante.
 *
 * Steht hier, damit im Mailtext oben kein Rueckstrich noetig ist. Der
 * ist auf dem Weg durch Werkzeuge schon zweimal verlorengegangen und hat
 * einmal ein Null-Byte in der Datei hinterlassen.
 */
const UMBRUCH = String.fromCharCode(10);

/**
 * Der Knopf zum Abschicken.
 *
 * Zwischen Klick und Antwort vergehen ein bis zwei Sekunden, in denen
 * der Server mit Microsoft spricht. Ohne Rueckmeldung sieht die Seite in
 * dieser Zeit aus, als sei nichts passiert, und man klickt noch einmal.
 * Bei einer Mail an einen Kunden waere das eine zweite Mail.
 */
function Sendeknopf() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird verschickt..." : "Jetzt verschicken"}
    </button>
  );
}
