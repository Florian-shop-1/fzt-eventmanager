import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  einstellungLesen,
  imHaus,
  meldungMerken,
  schonGemeldet,
  standVon,
  stempelSetzen,
  stunden,
  type StempelArt,
} from "@/lib/stempel/db";
import { ausserDienstMelden, gelaendeVerlassen, unplausibelMelden } from "@/lib/stempel/wache";
import { eingeteiltAm } from "@/lib/stempel/dienst";
import { mahnungMerken, offeneSchilderAbends, schonGemahnt } from "@/lib/shop/parkplatz-wache";
import { istSonntag, letzterImFoyer, schonAbgeschlossen } from "@/lib/stempel/abschluss";
import { istSilvester, NACHT_BIS, NACHT_VON } from "@/lib/stempel/tag";
import { geraetPruefen } from "@/lib/stempel/geraet";
import { offeneBestellungen } from "@/lib/wein/db";

/**
 * Ein Stempel vom Handy: Art plus Position.
 *
 * Geprüft wird auf dem Server, nicht im Browser. Sonst könnte man die
 * Position einfach im Browser verändern und sich von zu Hause einstempeln.
 * (Ganz verhindern lässt sich Schummeln mit gefälschtem GPS nicht, aber
 * jede Prüfung gehört trotzdem hierher.)
 */

export const dynamic = "force-dynamic";

const ERLAUBT: StempelArt[] = ["kommen", "pause_start", "pause_ende", "gehen"];

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  // Nur am Handy. Geprueft auf dem Server, damit es nicht reicht, im
  // Browser einen Knopf sichtbar zu machen (Florian, 23.09.2026).
  const geraet = geraetPruefen(request.headers.get("user-agent"));
  if (!geraet.handy) {
    return NextResponse.json({ ok: false, fehler: geraet.grund }, { status: 403 });
  }

  const daten = (await request.json().catch(() => null)) as
    | { art?: string; lat?: number; lon?: number; genauigkeit?: number }
    | null;
  const art = daten?.art as StempelArt;
  if (!ERLAUBT.includes(art)) return NextResponse.json({ ok: false, fehler: "Unbekannter Stempel." }, { status: 400 });

  const e = await einstellungLesen();
  const stand = await standVon(b.id);

  // Reihenfolge prüfen, damit keine unsinnigen Folgen entstehen.
  const erlaubtJetzt: Record<string, StempelArt[]> = {
    aus: ["kommen"],
    arbeit: ["pause_start", "gehen"],
    pause: ["pause_ende", "gehen"],
  };
  if (!erlaubtJetzt[stand.zustand].includes(art)) {
    return NextResponse.json({ ok: false, fehler: "Das passt gerade nicht. Bitte die Seite neu laden." }, { status: 409 });
  }

  const hatOrt = typeof daten?.lat === "number" && typeof daten?.lon === "number";
  const pruefung = hatOrt
    ? imHaus(e, { lat: daten!.lat!, lon: daten!.lon!, genauigkeit: daten!.genauigkeit ?? 9999 })
    : { drin: false, entfernungM: 0, grund: "Kein Standort verfügbar. Bitte Ortungsdienste einschalten und den Zugriff erlauben." };

  /*
    Eingestempelt wird nur auf dem Gelände.

    Bis zum 05.10.2026 ging es auch ohne Standort: Lieber eine Zeit, die
    das Büro nachprüft, als jemanden vor der Tür stehen lassen. Damit war
    die Prüfung aber zahnlos, denn ohne Ortung stempelte es sich von
    überall. Jetzt wird abgelehnt und gesagt, woran es liegt: entweder
    ist die Ortung aus, oder die Person steht zu weit weg (Florian,
    06.10.2026: "stempeln nur auf dem grundstück zulassen").

    Ausstempeln geht weiter von überall. Wer schon zu Hause merkt, dass
    er vergessen hat auszustempeln, soll das tun können, und die Meldung
    ans Büro läuft dafür schon.

    Niemand verliert dabei seine Zeit: Wer nicht stempeln kann, meldet
    sie unter "Nachmelden" nach, und das steht auch in der Antwort.
  */
  const mussImHaus = art !== "gehen";
  if (e.aktiv && mussImHaus && !pruefung.drin) {
    return NextResponse.json(
      {
        ok: false,
        sperre: hatOrt ? "zu_weit" : "kein_ort",
        entfernung: hatOrt ? pruefung.entfernungM : null,
        radius: e.radiusM,
        fehler: hatOrt
          ? `Du bist rund ${pruefung.entfernungM} Meter vom Theater entfernt. Gestempelt wird nur auf dem Gelände.`
          : "Wir können deinen Standort nicht sehen. Entweder sind die Ortungsdienste aus, oder der Browser darf nicht auf den Standort zugreifen.",
      },
      { status: 403 },
    );
  }
  // Beim Ausstempeln außerhalb des Geländes bekommt der Mitarbeiter eine
  // eigene, passende Meldung statt der GPS-Meldung fürs Einstempeln: Hier
  // geht es nicht um ein Ortungsproblem, sondern darum, dass er das Haus
  // schon verlassen hat (Florian, 28.09.2026).
  const drausenBeimGehen = art === "gehen" && hatOrt && !pruefung.drin;

  const stempel = await stempelSetzen({
    benutzerId: b.id,
    name: b.name,
    art,
    lat: hatOrt ? daten!.lat! : null,
    lon: hatOrt ? daten!.lon! : null,
    genauigkeit: daten?.genauigkeit ?? null,
    entfernungM: hatOrt ? pruefung.entfernungM : null,
    imHaus: pruefung.drin,
    notiz: drausenBeimGehen
      ? `Ausgestempelt außerhalb des Geländes (rund ${pruefung.entfernungM} Meter entfernt)`
      : "",
  });

  /*
    Eine Uhrzeit, zu der niemand arbeitet.

    Gestempelt wird trotzdem: Vielleicht stimmt es ja, und niemanden
    auszusperren ist wichtiger als eine saubere Tabelle. Aber der Tag
    zaehlt erst, wenn jemand die Zeiten bestaetigt hat, und die Person
    erfaehrt das sofort statt erst bei der Lohnabrechnung
    (Florian, 29.09.2026).
  */
  const jetzt = new Date(stempel.zeitpunkt);
  const tagHier = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const minutenHier = Number(
    jetzt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).slice(0, 2),
  ) * 60 +
    Number(jetzt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", minute: "2-digit" }));

  if (!istSilvester(tagHier) && minutenHier >= NACHT_VON && minutenHier <= NACHT_BIS) {
    await unplausibelMelden({
      stempelId: stand.stempelHeute.find((s) => s.art === "kommen")?.id ?? stempel.id,
      benutzerId: b.id,
      name: b.name,
      art,
      zeitpunkt: stempel.zeitpunkt,
      grund: "mitten in der Nacht",
    }).catch(() => undefined);
  }

  /*
    Einstempeln an einem Tag ohne Dienst.

    Gestempelt ist schon, der Knopf hat getan, was er soll. Gefragt wird
    gleich danach: "wenn jemand an einem Tag ausserhalb deines
    eingeteilten Dienstes stempelt, dann bitte nach dem Grund fragen"
    (Florian, 06.10.2026). Das Büro bekommt die Meldung auch ohne Antwort,
    sonst bliebe ein unbeantwortetes Fenster unbemerkt.
  */
  let grundNoetig = false;
  if (art === "kommen" && b.rolle !== "reinigung") {
    grundNoetig = !(await eingeteiltAm(b.id, tagHier));
    if (grundNoetig && !(await schonGemeldet(stempel.id, "ohne_dienst"))) {
      await meldungMerken(stempel.id, "ohne_dienst");
      await ausserDienstMelden({ name: b.name, tag: tagHier, grund: "" }).catch(() => undefined);
    }
  }

  if (art === "gehen" && !pruefung.drin && hatOrt) {
    // Auf den Kommen-Stempel beziehen, damit dieselbe Schicht nicht zweimal
    // gemeldet wird, falls die Stempeluhr das schon getan hat.
    await gelaendeVerlassen({
      kommenId: stand.stempelHeute.find((s) => s.art === "kommen")?.id ?? stempel.id,
      benutzerId: b.id,
      name: b.name,
      // Hier hat er selbst gestempelt, es braucht keinen zweiten Stempel.
      schonGestempelt: true,
      seit: stand.stempelHeute.find((s) => s.art === "kommen")?.zeitpunkt ?? stempel.zeitpunkt,
      entfernungM: pruefung.entfernungM,
    }).catch(() => undefined);
  }

  /*
    Die Parkplatzschilder für den nächsten Showtag.

    Gezeigt beim Ausstempeln am Abend, und zwar jedem, solange die
    Schilder nicht hängen: "du kannst das bei allen anzeigen, solange es
    noch nicht gemacht ist. wenn abends nach 20:00 Uhr ausgestempelt
    wird, ist diese Info wichtig" (Florian, 08.10.2026).

    Vorher hing der Hinweis an der Person, die als letzte aus dem Foyer
    geht. Das ging schief, sobald jemand vergaß auszustempeln: Dann hielt
    das Programm ihn für anwesend, und die Person, die wirklich als
    letzte ging, bekam nichts zu sehen.

    Die Zeit entscheidet jetzt statt der Anwesenheit. Vor 20 Uhr geht
    niemand in den Feierabend, der danach noch Schilder bestückt; nach
    Mitternacht zählt der angebrochene Tag mit, denn wer um halb eins
    geht, geht vom gestrigen Abend heim.

    Nur das Foyer: "das ist nur für FOYER, wenn die Foyer leute
    ausstempeln, die sind verantwortlich für die parkplätze" (Florian,
    08.10.2026). Das Showteam könnte die Parkplatzseite ohnehin nicht
    öffnen.
  */
  let parkplatz: { datum: string; offen: number; gesamt: number } | null = null;
  if (art === "gehen" && b.rolle === "foyer") {
    const stundeHier = Number(
      new Date()
        .toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false })
        .slice(0, 2),
    );
    if (stundeHier >= 20 || stundeHier < 5) {
      const stand = await offeneSchilderAbends().catch(() => null);
      if (stand) {
        // Fuer die Spur im Protokoll, nicht als Sperre: Gezeigt wird er
        // jedem, bis die Schilder hängen.
        if (!(await schonGemahnt(stand.datum, "hase"))) await mahnungMerken(stand.datum, "hase");
        parkplatz = stand;
      }
    }
  }

  /*
    Der Sonntagsabschluss.

    Sonntag ist der letzte Showtag der Woche, danach steht das Haus ein
    paar Tage still, und was dann noch läuft, läuft umsonst: "nur wenn
    der letzte ausstempelt am Sonntag im foyer, sind alle Kühltheken
    abgeschaltet, Musik und Licht aus?" (Florian, 08.10.2026).

    Hier zählt wirklich, wer der letzte ist, anders als beim
    Parkplatzhinweis: Die Frage gehört an den, der abschließt. Ein
    vergessener Stempel macht dabei niemanden mehr zum Anwesenden, siehe
    letzterImFoyer.
  */
  /*
    Eine Bestellung der Gastro, die noch keiner abgestellt hat.

    Das Ausstempeln ist der letzte Moment, in dem es noch jemand machen
    kann, der im Haus ist (Florian, 09.10.2026). Deshalb dringlich und
    nicht nur als Randnotiz, aber ohne Sperre: Wer wirklich nicht mehr
    kann, soll trotzdem nach Hause gehen duerfen.
  */
  let bestellung: { anzahl: number; inhalt: string } | null = null;
  if (art === "gehen" && ["foyer", "team", "chef"].includes(b.rolle)) {
    const offen = await offeneBestellungen().catch(() => []);
    if (offen.length > 0) {
      bestellung = {
        anzahl: offen.length,
        inhalt: offen.map((o) => o.inhalt).filter(Boolean).join(" · "),
      };
    }
  }

  let abschluss = false;
  if (art === "gehen" && b.rolle === "foyer" && istSonntag()) {
    abschluss = (await letzterImFoyer(b.id)) && !(await schonAbgeschlossen(tagHier));
  }

  const neu = await standVon(b.id);
  return NextResponse.json({
    ok: true,
    parkplatz,
    bestellung,
    abschluss,
    abschlussTag: tagHier,
    zustand: neu.zustand,
    arbeitszeit: stunden(neu.minutenHeute),
    pause: stunden(neu.pausenMinutenHeute),
    entfernung: pruefung.entfernungM,
    // Nach dem Grund fragen, wenn an diesem Tag kein Dienst eingeteilt ist.
    grundNoetig,
    /*
      Die Putzfirma sagt beim Einstempeln, wie viele Leute da sind.

      Sie steht in keinem Dienstplan und wird deshalb auch nicht nach
      einem Grund gefragt: Dass sie kommt, ist der Normalfall. Gefragt
      wird nach der Zahl, denn danach wird abgerechnet (Florian,
      07.10.2026).
    */
    personenNoetig: art === "kommen" && b.rolle === "reinigung",
    stempelId: stempel.id,
    // Kein Fehler, aber ein Hinweis: ausgestempelt wurde trotzdem.
    standortHinweis: drausenBeimGehen ? "Du befindest dich nicht auf dem Grundstück." : null,
    standortHinweisArt: drausenBeimGehen ? "verlassen" : null,
  });
}
