/**
 * Die Arbeitsverträge des Hauses.
 *
 * Der Wortlaut stammt aus den Vorlagen, die Florian am 30.09.2026
 * übergeben hat (Master_Kurzfristige_Beschaeftigung_AKTUELL.docx und
 * Master_Teilzeit_Saisonvertrag_Festgehalt_Arbeitszeitkonto_10Prozent.docx).
 * Er steht hier Wort für Wort so, wie er dort steht: "bitte die verträge
 * so nehmen (nichts inhaltlich ändern oder ergänzen)".
 *
 * Ausgefüllt werden nur die eckigen Lücken der Vorlage. Sie stehen im
 * Text als Marken in geschweiften Klammern, damit jede Lücke genau einen
 * Wert bekommt: In der Vorlage heissen zwei verschiedene Lücken beide
 * "[Datum]", und wer die eine mit dem Wert der anderen füllt, schreibt
 * ein falsches Vertragsende in einen unterschriebenen Vertrag.
 *
 * Der Minijob-Vertrag kam am 02.10.2026 dazu. Er folgt dem Vertrag für
 * die kurzfristige Beschäftigung Wort für Wort, bis auf das, was sich
 * zwischen den beiden Beschäftigungsarten tatsächlich unterscheidet: die
 * Entgeltgrenze, die Rentenversicherung mit ihrem Befreiungsantrag und
 * die Anzeige weiterer Minijobs. Alles andere ist derselbe Text, damit
 * im Haus nicht zwei Regelwerke nebeneinanderstehen.
 *
 * Wer den Text ändert, ändert einen Vertrag. Das ist nichts, was
 * nebenbei passiert: Jede Änderung gehört mit Florian besprochen und
 * betrifft nur künftige Verträge, nie einen schon unterschriebenen. Was
 * unterschrieben wurde, wird deshalb beim Unterschreiben als Ganzes
 * gespeichert.
 */

/** Ende der Spielzeit, das Vertragsende beider Verträge (Florian, 30.09.2026). */
export const SPIELZEIT_ENDE = "2027-07-04";

/** Die Anschrift der Gesellschaft, wie sie im Vertrag steht. */
export const FIRMENANSCHRIFT = "Grethe-Weiser-Str. 2/1, 89231 Neu-Ulm";

export type Vertragsart = "kurzfristig" | "minijob" | "teilzeit";

export const ARTNAME: Record<Vertragsart, string> = {
  kurzfristig: "Kurzfristige Beschäftigung",
  minijob: "Minijob",
  teilzeit: "Teilzeit / Saison",
};

/** Die Überschrift, wie sie über dem Vertrag steht. */
export const UEBERSCHRIFT: Record<Vertragsart, { titel: string; unterzeile: string }> = {
  kurzfristig: {
    titel: "ARBEITSVERTRAG",
    unterzeile: "Kurzfristige Beschäftigung gemäß § 8 Abs. 1 Nr. 2 SGB IV",
  },
  minijob: {
    titel: "ARBEITSVERTRAG",
    unterzeile: "Geringfügige Beschäftigung (Minijob) gemäß § 8 Abs. 1 Nr. 1 SGB IV",
  },
  teilzeit: {
    titel: "ARBEITSVERTRAG",
    unterzeile: "Teilzeit / Saisonarbeitsvertrag mit Festgehalt, Arbeitszeitkonto und 10-%-Korridor",
  },
};

export interface Abschnitt {
  titel: string;
  absaetze: string[];
}

/**
 * Was in die Lücken kommt.
 *
 * Alles als fertiger Text: Was im Vertrag steht, soll genau das sein,
 * was hier übergeben wurde, und nicht das Ergebnis einer Formatierung
 * tief im Zeichenwerk.
 */
export interface Luecken {
  name: string;
  anschrift: string;
  geburtsdatum: string;
  beginn: string;
  ende: string;
  taetigkeit: string;
  aufgaben: string;
  /** Kurzfristig: Stundenlohn, etwa "14,50". */
  stundenlohn?: string;
  /** Teilzeit: Stunden pro Monat und pro Woche. */
  monatsstunden?: string;
  wochenstunden?: string;
  /** Teilzeit: monatliches Bruttogehalt, etwa "1.450,00". */
  festgehalt?: string;
  /** Teilzeit: Probezeit in Monaten, etwa "drei". */
  probezeit?: string;
}

const KURZFRISTIG: Abschnitt[] = [
  {
    titel: "§ 1 Art der Beschäftigung",
    absaetze: [
      "(1) Der Arbeitnehmer wird als kurzfristig Beschäftigter im Sinne des § 8 Abs. 1 Nr. 2 SGB IV beschäftigt.",
      "(2) Die Vertragsparteien gehen davon aus, dass die gesetzlichen Voraussetzungen einer kurzfristigen Beschäftigung erfüllt sind.",
      "(3) Der Arbeitnehmer verpflichtet sich, dem Arbeitgeber vor Beginn der Tätigkeit sämtliche für die sozialversicherungsrechtliche Beurteilung erforderlichen Angaben vollständig und wahrheitsgemäß mitzuteilen.",
      "(4) Hierzu gehören insbesondere Angaben über weitere Beschäftigungen im laufenden Kalenderjahr, andere kurzfristige Beschäftigungen, Hauptbeschäftigungen, Arbeitslosigkeit bzw. Arbeitssuche, Schul-, Studien-, Ausbildungs- oder Rentenstatus sowie sonstige Umstände, die für die Beurteilung der Berufsmäßigkeit relevant sein können.",
      "(5) Änderungen dieser Angaben sind dem Arbeitgeber unverzüglich mitzuteilen.",
      "(6) Stellt sich aufgrund unrichtiger oder unvollständiger Angaben des Arbeitnehmers heraus, dass die Voraussetzungen einer kurzfristigen Beschäftigung nicht vorlagen, bleiben gesetzliche Ersatz- und Rückgriffsansprüche des Arbeitgebers unberührt.",
    ],
  },
  {
    titel: "§ 2 Vertragsbeginn und Vertragsende",
    absaetze: [
      "(1) Das Arbeitsverhältnis beginnt am {beginn} und endet automatisch mit Ablauf des {ende}, ohne dass es einer Kündigung bedarf.",
      "(2) Das vereinbarte Vertragsende ist verbindlich.",
      "(3) Eine Fortsetzung über das Vertragsende hinaus bedarf einer ausdrücklichen vorherigen Vereinbarung.",
      "(4) Ein Anspruch auf weitere Beschäftigung oder Abschluss eines Folgevertrages besteht nicht.",
      "(5) Der Arbeitnehmer wird darauf hingewiesen, dass er sich spätestens drei Monate vor dem vereinbarten Ende des Arbeitsverhältnisses persönlich bei der Agentur für Arbeit arbeitssuchend melden muss. Liegen zwischen der Kenntnis des Beendigungszeitpunkts und der Beendigung weniger als drei Monate, hat die Meldung innerhalb von drei Tagen zu erfolgen.",
    ],
  },
  {
    titel: "§ 3 Tätigkeit",
    absaetze: [
      "(1) Der Arbeitnehmer wird als {taetigkeit} beschäftigt.",
      "(2) Zu seinen Aufgaben gehören insbesondere: {aufgaben}.",
      "(3) Der Arbeitgeber kann dem Arbeitnehmer andere gleichwertige und zumutbare Tätigkeiten übertragen.",
    ],
  },
  {
    titel: "§ 4 Arbeitsort",
    absaetze: [
      "(1) Regelmäßiger Arbeitsort ist das Florian Zimmer Theater in Neu-Ulm.",
      "(2) Der Arbeitnehmer kann bei betrieblichem Bedarf auch bei Proben, Außenveranstaltungen, Firmenveranstaltungen, Gastspielen, Auf- und Abbauten oder an anderen zumutbaren Einsatzorten beschäftigt werden.",
    ],
  },
  {
    titel: "§ 5 Arbeitszeit",
    absaetze: [
      "(1) Die Arbeitstage und Einsatzzeiten richten sich nach dem betrieblichen Dienst- und Veranstaltungsplan.",
      "(2) Regelmäßige Einsatzzeiten liegen insbesondere von Donnerstag bis Sonntag sowie an Feiertagen und bei Sonderveranstaltungen.",
      "(3) Beginn, Ende und Verteilung der Arbeitszeit werden vom Arbeitgeber im Rahmen der gesetzlichen und vertraglichen Vorgaben nach billigem Ermessen festgelegt.",
      "(4) Der Arbeitnehmer ist verpflichtet, die ihm ordnungsgemäß zugewiesenen Dienste wahrzunehmen.",
      "(5) Mehrarbeit ist nur zu leisten und wird nur vergütet, wenn sie vom Arbeitgeber angeordnet, genehmigt oder nachträglich anerkannt worden ist.",
      "(6) Eigenmächtig geleistete Mehrarbeit begründet grundsätzlich keinen zusätzlichen Vergütungsanspruch.",
      "(7) Die gesetzlichen Zeitgrenzen für eine kurzfristige Beschäftigung dürfen nicht überschritten werden.",
    ],
  },
  {
    titel: "§ 6 Arbeitszeiterfassung",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, sämtliche Arbeitszeiten einschließlich Beginn, Ende und Pausen vollständig und wahrheitsgemäß über das vom Arbeitgeber festgelegte Verfahren zu dokumentieren.",
      "(2) Die Arbeitszeiterfassung ist spätestens am jeweiligen Arbeitstag vorzunehmen.",
      "(3) Manipulationen oder vorsätzlich falsche Angaben stellen eine erhebliche arbeitsvertragliche Pflichtverletzung dar.",
    ],
  },
  {
    titel: "§ 7 Vergütung",
    absaetze: [
      "(1) Der Arbeitnehmer erhält {stundenlohn} € brutto pro vergütungspflichtiger Arbeitsstunde.",
      "(2) Der jeweils geltende gesetzliche Mindestlohn darf nicht unterschritten werden.",
      "(3) Die Vergütung erfolgt monatlich nach den tatsächlich abzurechnenden bzw. gesetzlich vergütungspflichtigen Stunden.",
      "(4) Die Auszahlung erfolgt per Überweisung auf das vom Arbeitnehmer angegebene Bankkonto.",
      "(5) Die lohnsteuerliche Behandlung erfolgt nach den jeweils geltenden gesetzlichen Voraussetzungen und den für den Arbeitnehmer vorliegenden Besteuerungsmerkmalen.",
      "(6) Für Sonn-, Feiertags-, Nacht- oder Mehrarbeit besteht kein zusätzlicher vertraglicher Zuschlagsanspruch, soweit nicht zwingende gesetzliche Vorschriften entgegenstehen.",
      "(7) Sonderzahlungen, Prämien oder sonstige freiwillige Leistungen begründen auch bei wiederholter Gewährung keinen Rechtsanspruch für die Zukunft.",
      "(8) Irrtümliche Überzahlungen sind zurückzuerstatten.",
    ],
  },
  {
    titel: "§ 8 Krankheit",
    absaetze: [
      "(1) Jede Arbeitsunfähigkeit ist dem Arbeitgeber unverzüglich und grundsätzlich vor Beginn des vorgesehenen Dienstes mitzuteilen.",
      "(2) Der Arbeitgeber ist berechtigt, einen gesetzlich vorgesehenen Nachweis der Arbeitsunfähigkeit ab dem ersten Krankheitstag zu verlangen.",
      "(3) Während der ersten vier Wochen des ununterbrochenen Arbeitsverhältnisses besteht kein gesetzlicher Anspruch auf Entgeltfortzahlung durch den Arbeitgeber nach § 3 Abs. 3 Entgeltfortzahlungsgesetz.",
      "(4) Nach Ablauf der gesetzlichen Wartezeit besteht Entgeltfortzahlung ausschließlich im gesetzlich vorgeschriebenen Umfang.",
      "(5) Weitergehende vertragliche Ansprüche auf Entgeltfortzahlung werden nicht begründet.",
    ],
  },
  {
    /*
      Ein Satz, mehr nicht.

      "schreib rein Urlaub - es gelten die gesetzlichen regelungen, mehr
      nicht. nur diesen einen satz zum urlaub" (Florian, 30.09.2026). Der
      Paragraph fehlte ganz, und das Nachweisgesetz verlangt eine Angabe
      zum Urlaub. Mehr als den Verweis auf das Gesetz wollte Florian
      ausdruecklich nicht.
    */
    titel: "§ 9 Urlaub",
    absaetze: ["(1) Es gelten die gesetzlichen Regelungen."],
  },
  {
    titel: "§ 10 Kündigung",
    absaetze: [
      "(1) Das Arbeitsverhältnis endet grundsätzlich automatisch zum in § 2 vereinbarten Zeitpunkt.",
      "(2) Die ordentliche Kündigung wird während der Vertragslaufzeit ausdrücklich zugelassen.",
      "(3) Soweit der Arbeitnehmer lediglich zur vorübergehenden Aushilfe eingestellt ist und die gesetzlichen Voraussetzungen hierfür vorliegen, gelten die gesetzlich zulässigen Kündigungsfristen.",
      "(4) Im Übrigen gelten die gesetzlichen Kündigungsfristen.",
      "(5) Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.",
      "(6) Kündigungen bedürfen der gesetzlich vorgeschriebenen Form.",
      "(7) Will der Arbeitnehmer geltend machen, dass eine Kündigung unwirksam ist, muss er grundsätzlich innerhalb von drei Wochen nach Zugang der schriftlichen Kündigung Klage beim zuständigen Arbeitsgericht erheben. Im Übrigen gelten die gesetzlichen Vorschriften.",
    ],
  },
  {
    titel: "§ 11 Pflichten des Arbeitnehmers",
    absaetze: [
      "(1) Der Arbeitnehmer verpflichtet sich, die ihm übertragenen Aufgaben sorgfältig und gewissenhaft auszuführen, Weisungen des Arbeitgebers und seiner Beauftragten zu beachten, Sicherheits-, Hygiene-, Datenschutz- und Brandschutzregelungen einzuhalten, pünktlich und arbeitsfähig zum Dienst zu erscheinen, betriebliche Einrichtungen und Arbeitsmittel sorgfältig zu behandeln und betriebliche Störungen, Schäden oder besondere Vorkommnisse unverzüglich zu melden.",
    ],
  },
  {
    titel: "§ 12 Verschwiegenheit und magische Geheimnisse",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, über sämtliche nicht öffentlich bekannten betrieblichen Angelegenheiten Stillschweigen zu bewahren.",
      "(2) Dies betrifft insbesondere Methoden und Funktionsweisen von Illusionen und Zauberkunststücken, Tricktechnik und Requisiten, Showabläufe und Regieinformationen, technische Einrichtungen, interne betriebliche Abläufe, Kunden- und Gästedaten sowie sonstige Geschäfts- und Betriebsgeheimnisse.",
      "(3) Die Anfertigung und Weitergabe von Foto-, Video- oder Tonaufnahmen aus Backstage-, Technik-, Requisiten-, Lager-, Bühnen- oder Probenbereichen ist ohne Zustimmung des Arbeitgebers untersagt.",
      "(4) Die Verschwiegenheitspflicht besteht nach Beendigung des Arbeitsverhältnisses fort, soweit weiterhin ein berechtigtes Geheimhaltungsinteresse besteht.",
      "(5) Gesetzliche Unterlassungs-, Herausgabe- und Schadensersatzansprüche bleiben unberührt.",
      "(6) Bei einem schuldhaften Verstoß gegen die Verschwiegenheitspflicht wird eine Vertragsstrafe in Höhe des Zweifachen der durchschnittlichen monatlichen Bruttovergütung der letzten drei Abrechnungsmonate fällig. Die Geltendmachung eines darüber hinausgehenden Schadens bleibt unberührt; die Vertragsstrafe wird auf einen Schadensersatzanspruch angerechnet.",
    ],
  },
  {
    titel: "§ 13 Social Media und Öffentlichkeit",
    absaetze: [
      "(1) Interne Vorgänge, Showgeheimnisse, Requisiten, Backstage-Bereiche, technische Einrichtungen, Gästedaten, Mitarbeiterdaten oder sonstige nicht öffentliche betriebliche Informationen dürfen ohne vorherige Zustimmung des Arbeitgebers weder veröffentlicht noch Dritten zugänglich gemacht werden.",
      "(2) Der Arbeitnehmer ist nicht berechtigt, im Namen des Arbeitgebers öffentliche Erklärungen abzugeben.",
    ],
  },
  {
    titel: "§ 14 Arbeitsmittel",
    absaetze: [
      "(1) Überlassene Arbeitsmittel bleiben Eigentum des Arbeitgebers.",
      "(2) Sämtliche Schlüssel, Zugangskarten, Geräte, Kostüme, Requisiten, Dokumente und sonstigen Arbeitsmittel sind spätestens am letzten Arbeitstag vollständig zurückzugeben.",
      "(3) Bei Verlust oder Beschädigung gelten die gesetzlichen Haftungsregelungen.",
    ],
  },
  {
    titel: "§ 15 Nebentätigkeiten und weitere Beschäftigungen",
    absaetze: [
      "(1) Weitere Beschäftigungen, insbesondere weitere kurzfristige Beschäftigungen, sind dem Arbeitgeber vor Aufnahme bzw. unverzüglich nach Bekanntwerden anzuzeigen.",
      "(2) Dies gilt unabhängig davon, ob sie bei einem anderen Arbeitgeber oder im Rahmen einer selbstständigen Tätigkeit ausgeübt werden.",
      "(3) Der Arbeitnehmer darf keine konkurrierende Tätigkeit ausüben, soweit berechtigte Interessen des Arbeitgebers entgegenstehen.",
    ],
  },
  {
    titel: "§ 16 Ausschlussfristen",
    absaetze: [
      "(1) Ansprüche aus dem Arbeitsverhältnis sind innerhalb von drei Monaten nach Fälligkeit mindestens in Textform gegenüber der anderen Vertragspartei geltend zu machen.",
      "(2) Wird der Anspruch zurückgewiesen oder nicht innerhalb von zwei Wochen beantwortet, muss er innerhalb weiterer drei Monate gerichtlich geltend gemacht werden.",
      "(3) Von diesen Ausschlussfristen ausgenommen sind insbesondere Ansprüche auf gesetzlichen Mindestlohn, Ansprüche aus vorsätzlichem Verhalten, Ansprüche wegen Verletzung von Leben, Körper oder Gesundheit sowie sonstige gesetzlich unverzichtbare Ansprüche.",
    ],
  },
  {
    titel: "§ 17 Schlussbestimmungen",
    absaetze: [
      "(1) Dieser Vertrag tritt mit seiner Unterzeichnung an die Stelle sämtlicher zuvor zwischen den Parteien geschlossener Vorverträge, Vertragsentwürfe und früherer Vertragsfassungen, soweit diese dasselbe Beschäftigungsverhältnis betreffen.",
      "(2) Bei mehreren von beiden Parteien unterzeichneten Vertragsfassungen gilt ausschließlich die zeitlich zuletzt von beiden Parteien unterzeichnete Fassung, sofern darin nicht ausdrücklich etwas anderes bestimmt ist.",
      "(3) Frühere Vereinbarungen bleiben nur insoweit bestehen, als dieser Vertrag ausdrücklich auf sie Bezug nimmt oder ihre Fortgeltung ausdrücklich schriftlich vereinbart wird.",
      "(4) Nebenabreden bestehen nicht.",
      "(5) Änderungen und Ergänzungen dieses Vertrages sollen mindestens in Textform erfolgen, soweit gesetzlich keine strengere Form vorgeschrieben ist.",
      "(6) Individuelle Vereinbarungen der Parteien bleiben hiervon unberührt.",
      "(7) Sollten einzelne Bestimmungen dieses Vertrages ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      "(8) Es gelten die gesetzlichen Bestimmungen der Bundesrepublik Deutschland.",
      "(9) Auf das Arbeitsverhältnis finden keine Tarifverträge Anwendung, sofern nicht deren zwingende Geltung gesetzlich angeordnet ist. In ihrer jeweils geltenden Fassung sind die rechtmäßig eingeführten betrieblichen Regelungen zu beachten.",
      "(10) Der Arbeitnehmer erhält eine von beiden Vertragsparteien unterzeichnete Ausfertigung dieses Vertrages. Wird der Vertrag im Eventmanager unterzeichnet, steht sie ihm dort dauerhaft als PDF zum Herunterladen bereit.",
    ],
  },
];

const MINIJOB: Abschnitt[] = [
  {
    titel: "§ 1 Art der Beschäftigung",
    absaetze: [
      "(1) Der Arbeitnehmer wird als geringfügig entlohnt Beschäftigter im Sinne des § 8 Abs. 1 Nr. 1 SGB IV beschäftigt (Minijob).",
      "(2) Die Vertragsparteien gehen davon aus, dass das regelmäßige monatliche Arbeitsentgelt die jeweils geltende Geringfügigkeitsgrenze nicht überschreitet.",
      "(3) Arbeitszeit und Einsatzplanung werden so gestaltet, dass diese Grenze eingehalten wird. Ein gelegentliches und nicht vorhersehbares Überschreiten ist im gesetzlich zulässigen Rahmen unschädlich.",
      "(4) Der Arbeitnehmer verpflichtet sich, dem Arbeitgeber vor Beginn der Tätigkeit sämtliche für die sozialversicherungsrechtliche Beurteilung erforderlichen Angaben vollständig und wahrheitsgemäß mitzuteilen.",
      "(5) Hierzu gehören insbesondere Angaben über weitere geringfügige oder sonstige Beschäftigungen, Hauptbeschäftigungen, Arbeitslosigkeit bzw. Arbeitssuche, Schul-, Studien-, Ausbildungs- oder Rentenstatus sowie sonstige Umstände, die für die Beurteilung der Geringfügigkeit relevant sein können.",
      "(6) Änderungen dieser Angaben sind dem Arbeitgeber unverzüglich mitzuteilen.",
      "(7) Stellt sich aufgrund unrichtiger oder unvollständiger Angaben des Arbeitnehmers heraus, dass die Voraussetzungen einer geringfügigen Beschäftigung nicht vorlagen, bleiben gesetzliche Ersatz- und Rückgriffsansprüche des Arbeitgebers unberührt.",
    ],
  },
{
    titel: "§ 2 Vertragsbeginn und Vertragsende",
    absaetze: [
      "(1) Das Arbeitsverhältnis beginnt am {beginn} und endet automatisch mit Ablauf des {ende}, ohne dass es einer Kündigung bedarf.",
      "(2) Das vereinbarte Vertragsende ist verbindlich.",
      "(3) Eine Fortsetzung über das Vertragsende hinaus bedarf einer ausdrücklichen vorherigen Vereinbarung.",
      "(4) Ein Anspruch auf weitere Beschäftigung oder Abschluss eines Folgevertrages besteht nicht.",
      "(5) Der Arbeitnehmer wird darauf hingewiesen, dass er sich spätestens drei Monate vor dem vereinbarten Ende des Arbeitsverhältnisses persönlich bei der Agentur für Arbeit arbeitssuchend melden muss. Liegen zwischen der Kenntnis des Beendigungszeitpunkts und der Beendigung weniger als drei Monate, hat die Meldung innerhalb von drei Tagen zu erfolgen.",
    ],
  },
{
    titel: "§ 3 Tätigkeit",
    absaetze: [
      "(1) Der Arbeitnehmer wird als {taetigkeit} beschäftigt.",
      "(2) Zu seinen Aufgaben gehören insbesondere: {aufgaben}.",
      "(3) Der Arbeitgeber kann dem Arbeitnehmer andere gleichwertige und zumutbare Tätigkeiten übertragen.",
    ],
  },
{
    titel: "§ 4 Arbeitsort",
    absaetze: [
      "(1) Regelmäßiger Arbeitsort ist das Florian Zimmer Theater in Neu-Ulm.",
      "(2) Der Arbeitnehmer kann bei betrieblichem Bedarf auch bei Proben, Außenveranstaltungen, Firmenveranstaltungen, Gastspielen, Auf- und Abbauten oder an anderen zumutbaren Einsatzorten beschäftigt werden.",
    ],
  },
  {
    titel: "§ 5 Arbeitszeit",
    absaetze: [
      "(1) Die Arbeitstage und Einsatzzeiten richten sich nach dem betrieblichen Dienst- und Veranstaltungsplan.",
      "(2) Die Arbeitszeit beträgt im Monat voraussichtlich bis zu {monatsstunden} Stunden; maßgeblich ist, dass das regelmäßige monatliche Arbeitsentgelt die Geringfügigkeitsgrenze nicht überschreitet.",
      "(3) Regelmäßige Einsatzzeiten liegen insbesondere von Donnerstag bis Sonntag sowie an Feiertagen und bei Sonderveranstaltungen.",
      "(4) Beginn, Ende und Verteilung der Arbeitszeit werden vom Arbeitgeber im Rahmen der gesetzlichen und vertraglichen Vorgaben nach billigem Ermessen festgelegt.",
      "(5) Der Arbeitnehmer ist verpflichtet, die ihm ordnungsgemäß zugewiesenen Dienste wahrzunehmen.",
      "(6) Mehrarbeit ist nur zu leisten und wird nur vergütet, wenn sie vom Arbeitgeber angeordnet, genehmigt oder nachträglich anerkannt worden ist.",
      "(7) Eigenmächtig geleistete Mehrarbeit begründet grundsätzlich keinen zusätzlichen Vergütungsanspruch.",
    ],
  },
{
    titel: "§ 6 Arbeitszeiterfassung",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, sämtliche Arbeitszeiten einschließlich Beginn, Ende und Pausen vollständig und wahrheitsgemäß über das vom Arbeitgeber festgelegte Verfahren zu dokumentieren.",
      "(2) Die Arbeitszeiterfassung ist spätestens am jeweiligen Arbeitstag vorzunehmen.",
      "(3) Manipulationen oder vorsätzlich falsche Angaben stellen eine erhebliche arbeitsvertragliche Pflichtverletzung dar.",
    ],
  },
  {
    titel: "§ 7 Vergütung",
    absaetze: [
      "(1) Der Arbeitnehmer erhält {stundenlohn} € brutto pro vergütungspflichtiger Arbeitsstunde.",
      "(2) Der jeweils geltende gesetzliche Mindestlohn darf nicht unterschritten werden.",
      "(3) Die Vergütung erfolgt monatlich nach den tatsächlich abzurechnenden bzw. gesetzlich vergütungspflichtigen Stunden.",
      "(4) Die Auszahlung erfolgt per Überweisung auf das vom Arbeitnehmer angegebene Bankkonto.",
      "(5) Die Abgaben für eine geringfügige Beschäftigung trägt der Arbeitgeber in dem gesetzlich vorgesehenen Umfang; die lohnsteuerliche Behandlung erfolgt nach den jeweils geltenden gesetzlichen Voraussetzungen.",
      "(6) Für Sonn-, Feiertags-, Nacht- oder Mehrarbeit besteht kein zusätzlicher vertraglicher Zuschlagsanspruch, soweit nicht zwingende gesetzliche Vorschriften entgegenstehen.",
      "(7) Sonderzahlungen, Prämien oder sonstige freiwillige Leistungen begründen auch bei wiederholter Gewährung keinen Rechtsanspruch für die Zukunft.",
      "(8) Irrtümliche Überzahlungen sind zurückzuerstatten.",
    ],
  },
  {
    titel: "§ 8 Rentenversicherung",
    absaetze: [
      "(1) Die Beschäftigung ist in der gesetzlichen Rentenversicherung versicherungspflichtig. Der Arbeitgeber trägt den Pauschalbeitrag, der Arbeitnehmer den Differenzbetrag zum vollen Beitrag.",
      "(2) Der Arbeitnehmer kann sich auf Antrag von der Versicherungspflicht in der Rentenversicherung befreien lassen (§ 6 Abs. 1b SGB VI).",
      "(3) Der Antrag ist dem Arbeitgeber in Textform zu übergeben; die Befreiung wirkt frühestens ab dem gesetzlich vorgesehenen Zeitpunkt und gilt für die gesamte Dauer der Beschäftigung.",
      "(4) Die Befreiung kann während der Beschäftigung nicht widerrufen werden.",
      "(5) Der Arbeitnehmer wurde darauf hingewiesen, dass eine Befreiung Auswirkungen auf spätere Leistungen der gesetzlichen Rentenversicherung haben kann.",
    ],
  },
{
    titel: "§ 9 Krankheit",
    absaetze: [
      "(1) Jede Arbeitsunfähigkeit ist dem Arbeitgeber unverzüglich und grundsätzlich vor Beginn des vorgesehenen Dienstes mitzuteilen.",
      "(2) Der Arbeitgeber ist berechtigt, einen gesetzlich vorgesehenen Nachweis der Arbeitsunfähigkeit ab dem ersten Krankheitstag zu verlangen.",
      "(3) Während der ersten vier Wochen des ununterbrochenen Arbeitsverhältnisses besteht kein gesetzlicher Anspruch auf Entgeltfortzahlung durch den Arbeitgeber nach § 3 Abs. 3 Entgeltfortzahlungsgesetz.",
      "(4) Nach Ablauf der gesetzlichen Wartezeit besteht Entgeltfortzahlung ausschließlich im gesetzlich vorgeschriebenen Umfang.",
      "(5) Weitergehende vertragliche Ansprüche auf Entgeltfortzahlung werden nicht begründet.",
    ],
  },
{
    /*
      Ein Satz, mehr nicht.

      "schreib rein Urlaub - es gelten die gesetzlichen regelungen, mehr
      nicht. nur diesen einen satz zum urlaub" (Florian, 30.09.2026). Der
      Paragraph fehlte ganz, und das Nachweisgesetz verlangt eine Angabe
      zum Urlaub. Mehr als den Verweis auf das Gesetz wollte Florian
      ausdruecklich nicht.
    */
    titel: "§ 10 Urlaub",
    absaetze: ["(1) Es gelten die gesetzlichen Regelungen."],
  },
{
    titel: "§ 11 Kündigung",
    absaetze: [
      "(1) Das Arbeitsverhältnis endet grundsätzlich automatisch zum in § 2 vereinbarten Zeitpunkt.",
      "(2) Die ordentliche Kündigung wird während der Vertragslaufzeit ausdrücklich zugelassen.",
      "(3) Soweit der Arbeitnehmer lediglich zur vorübergehenden Aushilfe eingestellt ist und die gesetzlichen Voraussetzungen hierfür vorliegen, gelten die gesetzlich zulässigen Kündigungsfristen.",
      "(4) Im Übrigen gelten die gesetzlichen Kündigungsfristen.",
      "(5) Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.",
      "(6) Kündigungen bedürfen der gesetzlich vorgeschriebenen Form.",
      "(7) Will der Arbeitnehmer geltend machen, dass eine Kündigung unwirksam ist, muss er grundsätzlich innerhalb von drei Wochen nach Zugang der schriftlichen Kündigung Klage beim zuständigen Arbeitsgericht erheben. Im Übrigen gelten die gesetzlichen Vorschriften.",
    ],
  },
{
    titel: "§ 12 Pflichten des Arbeitnehmers",
    absaetze: [
      "(1) Der Arbeitnehmer verpflichtet sich, die ihm übertragenen Aufgaben sorgfältig und gewissenhaft auszuführen, Weisungen des Arbeitgebers und seiner Beauftragten zu beachten, Sicherheits-, Hygiene-, Datenschutz- und Brandschutzregelungen einzuhalten, pünktlich und arbeitsfähig zum Dienst zu erscheinen, betriebliche Einrichtungen und Arbeitsmittel sorgfältig zu behandeln und betriebliche Störungen, Schäden oder besondere Vorkommnisse unverzüglich zu melden.",
    ],
  },
{
    titel: "§ 13 Verschwiegenheit und magische Geheimnisse",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, über sämtliche nicht öffentlich bekannten betrieblichen Angelegenheiten Stillschweigen zu bewahren.",
      "(2) Dies betrifft insbesondere Methoden und Funktionsweisen von Illusionen und Zauberkunststücken, Tricktechnik und Requisiten, Showabläufe und Regieinformationen, technische Einrichtungen, interne betriebliche Abläufe, Kunden- und Gästedaten sowie sonstige Geschäfts- und Betriebsgeheimnisse.",
      "(3) Die Anfertigung und Weitergabe von Foto-, Video- oder Tonaufnahmen aus Backstage-, Technik-, Requisiten-, Lager-, Bühnen- oder Probenbereichen ist ohne Zustimmung des Arbeitgebers untersagt.",
      "(4) Die Verschwiegenheitspflicht besteht nach Beendigung des Arbeitsverhältnisses fort, soweit weiterhin ein berechtigtes Geheimhaltungsinteresse besteht.",
      "(5) Gesetzliche Unterlassungs-, Herausgabe- und Schadensersatzansprüche bleiben unberührt.",
      "(6) Bei einem schuldhaften Verstoß gegen die Verschwiegenheitspflicht wird eine Vertragsstrafe in Höhe des Zweifachen der durchschnittlichen monatlichen Bruttovergütung der letzten drei Abrechnungsmonate fällig. Die Geltendmachung eines darüber hinausgehenden Schadens bleibt unberührt; die Vertragsstrafe wird auf einen Schadensersatzanspruch angerechnet.",
    ],
  },
{
    titel: "§ 14 Social Media und Öffentlichkeit",
    absaetze: [
      "(1) Interne Vorgänge, Showgeheimnisse, Requisiten, Backstage-Bereiche, technische Einrichtungen, Gästedaten, Mitarbeiterdaten oder sonstige nicht öffentliche betriebliche Informationen dürfen ohne vorherige Zustimmung des Arbeitgebers weder veröffentlicht noch Dritten zugänglich gemacht werden.",
      "(2) Der Arbeitnehmer ist nicht berechtigt, im Namen des Arbeitgebers öffentliche Erklärungen abzugeben.",
    ],
  },
{
    titel: "§ 15 Arbeitsmittel",
    absaetze: [
      "(1) Überlassene Arbeitsmittel bleiben Eigentum des Arbeitgebers.",
      "(2) Sämtliche Schlüssel, Zugangskarten, Geräte, Kostüme, Requisiten, Dokumente und sonstigen Arbeitsmittel sind spätestens am letzten Arbeitstag vollständig zurückzugeben.",
      "(3) Bei Verlust oder Beschädigung gelten die gesetzlichen Haftungsregelungen.",
    ],
  },
  {
    titel: "§ 16 Nebentätigkeiten und weitere Beschäftigungen",
    absaetze: [
      "(1) Weitere Beschäftigungen, insbesondere weitere geringfügige Beschäftigungen bei anderen Arbeitgebern, sind dem Arbeitgeber vor Aufnahme bzw. unverzüglich nach Bekanntwerden anzuzeigen.",
      "(2) Dies ist erforderlich, weil mehrere geringfügige Beschäftigungen zusammengerechnet werden und die Geringfügigkeit entfallen kann.",
      "(3) Dies gilt unabhängig davon, ob sie bei einem anderen Arbeitgeber oder im Rahmen einer selbstständigen Tätigkeit ausgeübt werden.",
      "(4) Der Arbeitnehmer darf keine konkurrierende Tätigkeit ausüben, soweit berechtigte Interessen des Arbeitgebers entgegenstehen.",
    ],
  },
{
    titel: "§ 17 Ausschlussfristen",
    absaetze: [
      "(1) Ansprüche aus dem Arbeitsverhältnis sind innerhalb von drei Monaten nach Fälligkeit mindestens in Textform gegenüber der anderen Vertragspartei geltend zu machen.",
      "(2) Wird der Anspruch zurückgewiesen oder nicht innerhalb von zwei Wochen beantwortet, muss er innerhalb weiterer drei Monate gerichtlich geltend gemacht werden.",
      "(3) Von diesen Ausschlussfristen ausgenommen sind insbesondere Ansprüche auf gesetzlichen Mindestlohn, Ansprüche aus vorsätzlichem Verhalten, Ansprüche wegen Verletzung von Leben, Körper oder Gesundheit sowie sonstige gesetzlich unverzichtbare Ansprüche.",
    ],
  },
{
    titel: "§ 18 Schlussbestimmungen",
    absaetze: [
      "(1) Dieser Vertrag tritt mit seiner Unterzeichnung an die Stelle sämtlicher zuvor zwischen den Parteien geschlossener Vorverträge, Vertragsentwürfe und früherer Vertragsfassungen, soweit diese dasselbe Beschäftigungsverhältnis betreffen.",
      "(2) Bei mehreren von beiden Parteien unterzeichneten Vertragsfassungen gilt ausschließlich die zeitlich zuletzt von beiden Parteien unterzeichnete Fassung, sofern darin nicht ausdrücklich etwas anderes bestimmt ist.",
      "(3) Frühere Vereinbarungen bleiben nur insoweit bestehen, als dieser Vertrag ausdrücklich auf sie Bezug nimmt oder ihre Fortgeltung ausdrücklich schriftlich vereinbart wird.",
      "(4) Nebenabreden bestehen nicht.",
      "(5) Änderungen und Ergänzungen dieses Vertrages sollen mindestens in Textform erfolgen, soweit gesetzlich keine strengere Form vorgeschrieben ist.",
      "(6) Individuelle Vereinbarungen der Parteien bleiben hiervon unberührt.",
      "(7) Sollten einzelne Bestimmungen dieses Vertrages ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      "(8) Es gelten die gesetzlichen Bestimmungen der Bundesrepublik Deutschland.",
      "(9) Auf das Arbeitsverhältnis finden keine Tarifverträge Anwendung, sofern nicht deren zwingende Geltung gesetzlich angeordnet ist. In ihrer jeweils geltenden Fassung sind die rechtmäßig eingeführten betrieblichen Regelungen zu beachten.",
      "(10) Der Arbeitnehmer erhält eine von beiden Vertragsparteien unterzeichnete Ausfertigung dieses Vertrages. Wird der Vertrag im Eventmanager unterzeichnet, steht sie ihm dort dauerhaft als PDF zum Herunterladen bereit.",
    ],
  },
];

const TEILZEIT: Abschnitt[] = [
  {
    titel: "§ 1 Beginn, Befristung und Spielzeit",
    absaetze: [
      "(1) Das Arbeitsverhältnis beginnt am {beginn}.",
      "(2) Das Arbeitsverhältnis ist bis einschließlich {ende} befristet und endet mit Ablauf dieses Tages automatisch, ohne dass es einer Kündigung bedarf.",
      "(3) Die Befristung erfolgt auf der im Einzelfall einschlägigen gesetzlichen Grundlage. Soweit ein Sachgrund erforderlich ist, ist dieser vor Vertragsschluss konkret zu dokumentieren.",
      "(4) Voraussetzung für die Wirksamkeit der Befristung ist die Unterzeichnung dieses Vertrages vor Aufnahme der Tätigkeit.",
      "(5) Eine Fortsetzung des Arbeitsverhältnisses über das vereinbarte Vertragsende hinaus bedarf einer ausdrücklichen Vereinbarung. Der Arbeitnehmer darf seine Tätigkeit nach Vertragsende nicht ohne vorherige Zustimmung des Arbeitgebers fortsetzen.",
      "(6) Ein Anspruch auf Abschluss eines Folgevertrages für eine weitere Spielzeit besteht nicht.",
      "(7) Der Arbeitnehmer wird darauf hingewiesen, dass er sich spätestens drei Monate vor dem vereinbarten Ende des Arbeitsverhältnisses persönlich bei der Agentur für Arbeit arbeitssuchend melden muss. Liegen zwischen der Kenntnis des Beendigungszeitpunkts und der Beendigung weniger als drei Monate, hat die Meldung innerhalb von drei Tagen zu erfolgen.",
    ],
  },
  {
    titel: "§ 2 Tätigkeit",
    absaetze: [
      "(1) Der Arbeitnehmer wird als {taetigkeit} beschäftigt.",
      "(2) Zu seinen Aufgaben gehören insbesondere: {aufgaben}.",
      "(3) Die Tätigkeitsbeschreibung begrenzt das Weisungsrecht des Arbeitgebers nicht abschließend.",
      "(4) Der Arbeitgeber ist berechtigt, dem Arbeitnehmer andere gleichwertige oder zumutbare Tätigkeiten zu übertragen, soweit betriebliche Gründe dies erfordern.",
      "(5) Der Arbeitnehmer verpflichtet sich, auch bei Veranstaltungen, Sonderveranstaltungen, Proben, Auf- und Abbauten, Firmenveranstaltungen und vergleichbaren betrieblichen Einsätzen mitzuwirken, soweit dies im Rahmen seiner Tätigkeit zumutbar ist.",
    ],
  },
  {
    titel: "§ 3 Arbeitsort",
    absaetze: [
      "(1) Regelmäßiger Arbeitsort ist das Florian Zimmer Theater in Neu-Ulm.",
      "(2) Der Arbeitnehmer kann auch an anderen zumutbaren Arbeitsorten eingesetzt werden, insbesondere bei Gastspielen, Außenveranstaltungen, Firmenveranstaltungen, Proben, Produktionen und vergleichbaren betrieblichen Einsätzen.",
      "(3) Ein Anspruch auf Beschäftigung ausschließlich an einem bestimmten Arbeitsplatz besteht nicht.",
    ],
  },
  {
    titel: "§ 4 Arbeitszeit und Einsatzplanung",
    absaetze: [
      "(1) Die regelmäßige Arbeitszeit beträgt durchschnittlich {monatsstunden} Stunden pro Monat bzw. durchschnittlich {wochenstunden} Stunden pro Woche.",
      "(2) Aufgrund des saisonalen Veranstaltungsbetriebes kann die tatsächliche Arbeitszeit in einzelnen Wochen und Monaten von der durchschnittlichen Arbeitszeit abweichen. Maßgeblich ist die durchschnittliche Arbeitszeit innerhalb der Vertragslaufzeit bzw. des vereinbarten Ausgleichszeitraums.",
      "(3) Die Arbeit findet entsprechend dem betrieblichen Bedarf und dem Spiel-, Veranstaltungs-, Proben- und Dienstplan statt. Regelmäßige Einsatzzeiten liegen insbesondere von Donnerstag bis Sonntag sowie an Feiertagen, bei Sonderveranstaltungen und bei betrieblichem Bedarf auch an anderen Wochentagen.",
      "(4) Beginn, Ende, Dauer und Verteilung der Arbeitszeit sowie die Pausen werden vom Arbeitgeber unter Beachtung der gesetzlichen Bestimmungen und nach billigem Ermessen festgelegt.",
      "(5) Ein Anspruch auf bestimmte Arbeitstage, bestimmte Schichten, bestimmte Anfangs- oder Endzeiten oder eine gleichmäßige Verteilung der Arbeitszeit auf einzelne Wochen oder Monate besteht nicht.",
      "(6) Der Arbeitnehmer ist verpflichtet, die veröffentlichten Dienstpläne eigenständig zur Kenntnis zu nehmen und die ihm zugewiesenen Dienste pünktlich wahrzunehmen.",
      "(7) Angeordnete bzw. genehmigte Mehrarbeit ist im gesetzlich zulässigen Umfang zu leisten.",
    ],
  },
  {
    titel: "§ 5 Festgehalt, 10-%-Korridor und Arbeitszeitkonto",
    absaetze: [
      "(1) Der Arbeitnehmer erhält für die vereinbarte regelmäßige Arbeitszeit ein monatliches Bruttogehalt in Höhe von {festgehalt} EUR. Die Auszahlung erfolgt jeweils zum Monatsende bzw. entsprechend der betrieblichen Lohnabrechnung auf das vom Arbeitnehmer angegebene Konto.",
      "(2) Mit dem vereinbarten monatlichen Bruttogehalt sind zusätzlich geleistete Arbeitsstunden bis zu 10 % der vertraglich vereinbarten durchschnittlichen Monatsarbeitszeit abgegolten. Diese innerhalb des 10-%-Korridors liegenden zusätzlichen Arbeitsstunden begründen weder einen zusätzlichen Vergütungsanspruch noch eine Gutschrift als Plusstunden auf dem Arbeitszeitkonto. Die Abgeltung gilt nur, soweit hierdurch der jeweils zwingend geltende gesetzliche Mindestlohn für sämtliche vergütungspflichtigen Arbeitsstunden nicht unterschritten wird.",
      "(3) Erst Arbeitsstunden, die den 10-%-Korridor überschreiten, werden als Plusstunden auf dem Arbeitszeitkonto berücksichtigt, sofern sie vom Arbeitgeber vorab angeordnet oder genehmigt oder nachträglich ausdrücklich anerkannt wurden.",
      "(4) Für den Arbeitnehmer wird ein Arbeitszeitkonto geführt. Auf dem Arbeitszeitkonto werden die vertraglich geschuldete Sollarbeitszeit sowie nach Maßgabe dieses Vertrages anrechenbare Plus- und Minusstunden erfasst.",
      "(5) Plus- und Minusstunden werden in den jeweils folgenden Monat übertragen. Ein monatlicher Ausgleich ist nicht erforderlich. Der Ausgleichszeitraum entspricht grundsätzlich der Vertragslaufzeit bzw. der jeweiligen Spielzeit.",
      "(6) Unterschreitet die anrechenbare Ist-Arbeitszeit die geschuldete Sollarbeitszeit aus einem vom Arbeitnehmer zu vertretenden Grund, entstehen Minusstunden. Bestehende Minusstunden sind innerhalb der Vertragslaufzeit durch zusätzliche Arbeitsleistung auszugleichen.",
      "(7) Der Arbeitnehmer ist verpflichtet, ihm vom Arbeitgeber zugewiesene, zumutbare Arbeitseinsätze zum Abbau bestehender Minusstunden wahrzunehmen.",
      "(8) Vom Arbeitnehmer zu vertretende Minusstunden entstehen insbesondere durch unentschuldigtes Fehlen, schuldhaft verspäteten Arbeitsbeginn, vorzeitiges Verlassen des Arbeitsplatzes, vom Arbeitnehmer verlangte unbezahlte Freistellung, unbegründete Ablehnung ordnungsgemäß zugewiesener Dienste oder sonstige vom Arbeitnehmer zu vertretende Arbeitsausfälle.",
      "(9) Arbeitsausfälle, die ausschließlich darauf beruhen, dass der Arbeitgeber dem arbeitsbereiten Arbeitnehmer keine ausreichende Beschäftigung zuweist und für die der Arbeitgeber das Betriebsrisiko trägt, werden nicht als vom Arbeitnehmer zu vertretende Minusstunden behandelt.",
      "(10) Urlaub, gesetzlich vergütungspflichtige Feiertage und Zeiten gesetzlich bestehender Entgeltfortzahlung werden entsprechend den gesetzlichen Vorschriften auf die Sollarbeitszeit angerechnet.",
      "(11) Der Arbeitgeber ist berechtigt, gutgeschriebene Plusstunden vorrangig durch bezahlte Freizeit auszugleichen. Zeitpunkt und Umfang des Freizeitausgleichs werden unter Berücksichtigung der betrieblichen Interessen vom Arbeitgeber festgelegt.",
      "(12) Bei Beendigung des Arbeitsverhältnisses werden bestehende, gutgeschriebene Plusstunden nach Wahl des Arbeitgebers, soweit zeitlich möglich, durch Freizeit ausgeglichen oder mit dem auf das Bruttomonatsgehalt rechnerisch entfallenden Stundenwert vergütet.",
      "(13) Bei Beendigung des Arbeitsverhältnisses werden vom Arbeitnehmer zu vertretende und noch nicht vergütete Minusstunden nicht vergütet. Soweit für solche Minusstunden bereits Vergütung geleistet wurde, ist der Arbeitgeber im gesetzlich zulässigen Umfang berechtigt, diese mit noch offenen Vergütungsansprüchen zu verrechnen bzw. Rückzahlung zu verlangen. Zwingende gesetzliche Grenzen, insbesondere Pfändungsschutz und zwingende Vergütungsansprüche, bleiben unberührt.",
      "(14) Weitergehende gesetzliche Rechte des Arbeitgebers bleiben unberührt.",
    ],
  },
  {
    titel: "§ 6 Verbot eigenmächtiger Stundenverschiebung",
    absaetze: [
      "(1) Der Arbeitnehmer ist nicht berechtigt, Beginn, Ende oder Dauer seiner Arbeitszeit eigenmächtig zu verändern, Arbeitsstunden ohne Anordnung oder Genehmigung vor- oder nachzuarbeiten, zusätzliche Arbeitsstunden anzusammeln oder Arbeitszeit eigenständig zwischen einzelnen Tagen, Wochen oder Monaten zu verschieben.",
      "(2) Maßgeblich für die geschuldete und anrechenbare Arbeitszeit sind der vom Arbeitgeber festgelegte Dienstplan sowie ausdrücklich angeordnete oder genehmigte Abweichungen.",
      "(3) Insbesondere begründen ein eigenmächtig früherer Arbeitsbeginn, ein späteres Verlassen des Arbeitsplatzes, Arbeiten außerhalb des Dienstplans, freiwilliges längeres Verbleiben im Betrieb oder sonstige nicht angeordnete bzw. nicht genehmigte Mehrarbeit grundsätzlich weder einen Anspruch auf zusätzliche Vergütung noch eine Gutschrift auf dem Arbeitszeitkonto.",
      "(4) Dienst- oder Schichttausche zwischen Arbeitnehmern bedürfen der vorherigen Zustimmung des Arbeitgebers. Ohne Zustimmung vorgenommene Tausche oder Änderungen verändern die vertraglich geschuldete Arbeitszeit nicht.",
      "(5) Ein bloßes Ein- oder Ausstempeln außerhalb der angeordneten bzw. genehmigten Arbeitszeit begründet für sich allein keinen Anspruch auf Vergütung oder Zeitgutschrift.",
      "(6) Erkennt der Arbeitnehmer, dass die vorgesehene Arbeitszeit zur Erledigung der übertragenen Aufgaben voraussichtlich nicht ausreicht, hat er dies dem Arbeitgeber bzw. dem zuständigen Vorgesetzten unverzüglich mitzuteilen und vor Leistung zusätzlicher Arbeitszeit eine Weisung oder Genehmigung einzuholen, soweit nicht eine unaufschiebbare betriebliche Situation ein sofortiges Handeln erfordert.",
    ],
  },
  {
    titel: "§ 7 Arbeitszeiterfassung",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, Beginn, Ende und Dauer seiner Arbeitszeit sowie Pausen vollständig und wahrheitsgemäß über das vom Arbeitgeber vorgegebene Zeiterfassungssystem zu erfassen. Die Zeiterfassung dokumentiert die tatsächliche Anwesenheit; sie ersetzt nicht die erforderliche Anordnung oder Genehmigung von Mehrarbeit.",
      "(2) Die Arbeitszeit ist grundsätzlich unmittelbar bzw. spätestens bis zum Ende des jeweiligen Arbeitstages einzutragen.",
      "(3) Unrichtige, verspätete oder manipulierte Zeiterfassungen können arbeitsrechtliche Konsequenzen bis hin zur Kündigung haben.",
      "(4) Abweichungen von der erfassten Arbeitszeit sind dem Arbeitgeber unverzüglich mitzuteilen.",
    ],
  },
  {
    titel: "§ 8 Urlaub",
    absaetze: [
      "(1) Der Arbeitnehmer erhält ausschließlich den gesetzlichen Mindesturlaub, sofern nicht ausdrücklich schriftlich zusätzlicher Urlaub vereinbart wird.",
      "(2) Die Höhe des gesetzlichen Urlaubsanspruchs richtet sich nach der tatsächlichen bzw. regelmäßigen Zahl der Arbeitstage pro Woche und den gesetzlichen Bestimmungen.",
      "(3) Bei einer regelmäßigen Vier-Tage-Woche entspricht dies derzeit 16 Arbeitstagen gesetzlichen Mindesturlaubs pro Kalenderjahr.",
      "(4) Bei Eintritt oder Ausscheiden während des Kalenderjahres richtet sich der Teilurlaubsanspruch nach den gesetzlichen Bestimmungen. Für jeden vollen Monat des Bestehens des Arbeitsverhältnisses entsteht ein Urlaubsanspruch in Höhe von 1/12 des Jahresurlaubs. Bruchteile von Urlaubstagen von mindestens einem halben Tag werden auf volle Urlaubstage aufgerundet; geringere Bruchteile verfallen.",
      "(5) Urlaub ist vor Antritt zu beantragen und bedarf der Genehmigung des Arbeitgebers.",
      "(6) Der Arbeitgeber kann unter Berücksichtigung der gesetzlichen Vorgaben Betriebsferien festlegen.",
      "(7) Aufgrund des Theaterbetriebes soll Urlaub nach Möglichkeit insbesondere während spiel- bzw. veranstaltungsarmer Zeiten und während einer betrieblichen Sommerpause genommen werden.",
      "(8) Bereits gebuchte Reisen oder private Planungen begründen ohne vorherige Urlaubsgenehmigung keinen Anspruch auf Freistellung.",
      "(9) Im Übrigen gelten die gesetzlichen Vorschriften.",
    ],
  },
  {
    titel: "§ 9 Krankheit und sonstige Arbeitsverhinderung",
    absaetze: [
      "(1) Jede Arbeitsverhinderung und deren voraussichtliche Dauer sind dem Arbeitgeber unverzüglich, grundsätzlich vor Beginn des geplanten Dienstes, mitzuteilen.",
      "(2) Der Arbeitgeber ist berechtigt, die Vorlage bzw. den gesetzlich vorgesehenen Nachweis einer Arbeitsunfähigkeit bereits ab dem ersten Krankheitstag zu verlangen.",
      "(3) Der Arbeitnehmer hat sämtliche gesetzlichen Mitwirkungs- und Nachweispflichten einzuhalten.",
      "(4) Eine geplante Abwesenheit ist rechtzeitig vorab mit dem Arbeitgeber abzustimmen.",
      "(5) Vergütungsansprüche bei Krankheit oder sonstiger Arbeitsverhinderung bestehen ausschließlich im gesetzlich vorgeschriebenen Umfang.",
    ],
  },
  {
    titel: "§ 10 Probezeit und Kündigung",
    absaetze: [
      "(1) Die ersten {probezeit} Monate des Arbeitsverhältnisses gelten als Probezeit, soweit die Dauer im Verhältnis zur Befristung und Art der Tätigkeit angemessen ist.",
      "(2) Während einer wirksam vereinbarten Probezeit kann das Arbeitsverhältnis mit der gesetzlich zulässigen Frist gekündigt werden.",
      "(3) Auch während der Befristung ist die ordentliche Kündigung ausdrücklich zulässig.",
      "(4) Nach der Probezeit gelten die gesetzlichen Kündigungsfristen.",
      "(5) Verlängert sich die gesetzliche Kündigungsfrist für eine Kündigung durch den Arbeitgeber aufgrund der Dauer der Betriebszugehörigkeit, gilt dieselbe verlängerte Frist auch für eine Kündigung durch den Arbeitnehmer, soweit gesetzlich zulässig.",
      "(6) Das Recht zur außerordentlichen Kündigung bleibt unberührt.",
      "(7) Kündigungen bedürfen zu ihrer Wirksamkeit der gesetzlich vorgeschriebenen Form.",
      "(8) Will der Arbeitnehmer geltend machen, dass eine Kündigung unwirksam ist, muss er grundsätzlich innerhalb von drei Wochen nach Zugang der schriftlichen Kündigung Klage beim zuständigen Arbeitsgericht erheben. Im Übrigen gelten die gesetzlichen Vorschriften.",
    ],
  },
  {
    titel: "§ 11 Freistellung",
    absaetze: [
      "(1) Nach Ausspruch einer Kündigung oder im Zusammenhang mit der Beendigung des Arbeitsverhältnisses ist der Arbeitgeber berechtigt, den Arbeitnehmer unter Fortzahlung der geschuldeten Vergütung widerruflich oder unwiderruflich von der Arbeitsleistung freizustellen.",
      "(2) Bei einer unwiderruflichen Freistellung können noch bestehende Urlaubsansprüche und positive Arbeitszeitguthaben ausdrücklich angerechnet werden.",
      "(3) Anderweitiger Verdienst ist anzurechnen, soweit dies gesetzlich zulässig ist.",
    ],
  },
  {
    titel: "§ 12 Nebentätigkeiten",
    absaetze: [
      "(1) Jede entgeltliche oder regelmäßig ausgeübte Nebentätigkeit ist dem Arbeitgeber vor Aufnahme in Textform anzuzeigen.",
      "(2) Der Arbeitgeber kann eine Nebentätigkeit untersagen oder mit Auflagen versehen, wenn berechtigte betriebliche Interessen beeinträchtigt werden, insbesondere bei Konkurrenz zum Arbeitgeber, Beeinträchtigung der Arbeitsleistung, Überschreitung gesetzlicher Arbeitszeitgrenzen, Interessenkollisionen oder Gefährdung berechtigter Geheimhaltungsinteressen.",
      "(3) Während des bestehenden Arbeitsverhältnisses darf der Arbeitnehmer ohne Zustimmung des Arbeitgebers keine Tätigkeit für einen unmittelbaren Wettbewerber ausüben.",
    ],
  },
  {
    titel: "§ 13 Verschwiegenheit und magische Geheimnisse",
    absaetze: [
      "(1) Der Arbeitnehmer verpflichtet sich, sämtliche ihm im Zusammenhang mit seiner Tätigkeit bekannt werdenden Betriebs- und Geschäftsgeheimnisse streng vertraulich zu behandeln.",
      "(2) Dies gilt insbesondere für Funktionsweisen und Methoden von Illusionen und Zauberkunststücken, Tricktechnik, Gimmicks, Requisiten und technische Konstruktionen, Showabläufe und Regieinformationen, unveröffentlichte kreative Konzepte und Entwicklungen, technische Einrichtungen und Sicherheitsabläufe, interne Kalkulationen, Preise und wirtschaftliche Daten sowie Kunden-, Gäste-, Mitarbeiter- und Geschäftspartnerdaten.",
      "(3) Insbesondere dürfen Methoden von Illusionen, Tricks oder geheimhaltungsbedürftigen Showelementen nicht fotografiert, gefilmt, kopiert, veröffentlicht, weitergegeben oder Dritten zugänglich gemacht werden.",
      "(4) Die Verpflichtung gilt auch nach Beendigung des Arbeitsverhältnisses fort, soweit es sich um rechtlich geschützte bzw. weiterhin berechtigterweise geheim gehaltene Informationen handelt.",
      "(5) Gesetzliche Schadensersatz-, Unterlassungs- und sonstige Ansprüche des Arbeitgebers bleiben unberührt.",
      "(6) Bei einem schuldhaften Verstoß gegen die Verschwiegenheitspflicht wird eine Vertragsstrafe in Höhe von zwei Bruttomonatsgehältern fällig. Die Geltendmachung eines darüber hinausgehenden Schadens bleibt unberührt; die Vertragsstrafe wird auf einen Schadensersatzanspruch angerechnet.",
    ],
  },
  {
    titel: "§ 14 Foto-, Video-, Ton- und Social-Media-Regelung",
    absaetze: [
      "(1) Foto-, Video- oder Tonaufnahmen in nichtöffentlichen Betriebs-, Backstage-, Technik-, Lager-, Proben- oder Bühnenbereichen sind ohne vorherige Zustimmung des Arbeitgebers untersagt.",
      "(2) Interne Dokumente, Dienstpläne, Backstage-Bereiche, Tricktechnik, Requisiten, Gästeinformationen oder sonstige vertrauliche Inhalte dürfen nicht in sozialen Medien oder auf anderen Plattformen veröffentlicht werden.",
      "(3) Presseanfragen oder öffentliche Stellungnahmen im Namen des Arbeitgebers dürfen nur nach vorheriger Zustimmung beantwortet bzw. abgegeben werden.",
    ],
  },
  {
    titel: "§ 15 Arbeitsmittel und Eigentum des Arbeitgebers",
    absaetze: [
      "(1) Sämtliche überlassenen Arbeitsmittel, Schlüssel, Zugangskarten, Geräte, Kostüme, Requisiten, Unterlagen und Datenträger bleiben Eigentum des Arbeitgebers.",
      "(2) Sie sind sorgfältig zu behandeln und dürfen ohne Zustimmung nicht an Dritte weitergegeben werden.",
      "(3) Bei Aufforderung, spätestens jedoch mit Beendigung des Arbeitsverhältnisses, sind sämtliche Gegenstände unverzüglich vollständig zurückzugeben.",
      "(4) Ein Zurückbehaltungsrecht wird ausgeschlossen, soweit gesetzlich zulässig.",
    ],
  },
  {
    titel: "§ 16 Datenschutz und betriebliche Systeme",
    absaetze: [
      "(1) Der Arbeitnehmer verpflichtet sich, sämtliche Datenschutz-, IT-Sicherheits- und betrieblichen Vorgaben einzuhalten und personenbezogene Daten ausschließlich im Rahmen seiner dienstlichen Aufgaben zu verarbeiten.",
      "(2) Zugangsdaten und Passwörter dürfen nicht an Dritte weitergegeben werden.",
    ],
  },
  {
    titel: "§ 17 Fort- und Weiterbildungen",
    absaetze: [
      "(1) Eine Verpflichtung zur Rückzahlung vom Arbeitgeber übernommener Fort- oder Weiterbildungskosten besteht nur, wenn hierzu für die konkrete Fort- oder Weiterbildung eine gesonderte wirksame Rückzahlungsvereinbarung getroffen wurde.",
    ],
  },
  {
    titel: "§ 18 Ausschlussfristen",
    absaetze: [
      "(1) Ansprüche aus dem Arbeitsverhältnis und solche, die mit dem Arbeitsverhältnis in Verbindung stehen, müssen innerhalb von drei Monaten nach Fälligkeit gegenüber der jeweils anderen Vertragspartei mindestens in Textform geltend gemacht werden.",
      "(2) Wird der Anspruch abgelehnt oder nicht innerhalb von zwei Wochen beantwortet, muss er innerhalb weiterer drei Monate gerichtlich geltend gemacht werden.",
      "(3) Von dieser Ausschlussfrist ausgenommen sind insbesondere Ansprüche auf den gesetzlichen Mindestlohn, Ansprüche wegen vorsätzlicher Pflichtverletzungen, Ansprüche wegen Verletzung von Leben, Körper oder Gesundheit sowie sonstige Ansprüche, auf deren Geltendmachung gesetzlich nicht im Voraus verzichtet werden darf.",
    ],
  },
  {
    titel: "§ 19 Mitteilungspflichten",
    absaetze: [
      "(1) Der Arbeitnehmer ist verpflichtet, Änderungen seiner Anschrift, Bankverbindung, Steuermerkmale, Aufenthaltserlaubnis, Arbeitserlaubnis oder sonstiger für das Arbeitsverhältnis wesentlicher persönlicher Daten unverzüglich mitzuteilen.",
      "(2) Nachteile aufgrund einer schuldhaft verspäteten Mitteilung trägt der Arbeitnehmer im gesetzlich zulässigen Umfang.",
    ],
  },
  {
    titel: "§ 20 Betriebliche Regelungen",
    absaetze: [
      "(1) Der Arbeitnehmer verpflichtet sich, die jeweils geltenden betrieblichen Sicherheits-, Hygiene-, Datenschutz-, Arbeits-, Brandschutz-, Haus- und Veranstaltungsregelungen zu beachten.",
      "(2) Das Direktions- und Weisungsrecht des Arbeitgebers bleibt im gesetzlichen Umfang unberührt.",
    ],
  },
  {
    titel: "§ 21 Schlussbestimmungen",
    absaetze: [
      "(1) Dieser Vertrag tritt mit seiner Unterzeichnung an die Stelle sämtlicher zuvor zwischen den Parteien geschlossener Vorverträge, Vertragsentwürfe und früherer Vertragsfassungen, soweit diese dasselbe Beschäftigungsverhältnis betreffen.",
      "(2) Bei mehreren von beiden Parteien unterzeichneten Vertragsfassungen gilt ausschließlich die zeitlich zuletzt von beiden Parteien unterzeichnete Fassung, sofern darin nicht ausdrücklich etwas anderes bestimmt ist.",
      "(3) Frühere Vereinbarungen bleiben nur insoweit bestehen, als dieser Vertrag ausdrücklich auf sie Bezug nimmt oder ihre Fortgeltung ausdrücklich schriftlich vereinbart wird.",
      "(4) Nebenabreden bestehen nicht.",
      "(5) Änderungen und Ergänzungen dieses Vertrages sollen mindestens in Textform erfolgen, soweit gesetzlich keine strengere Form vorgeschrieben ist.",
      "(6) Individuelle Vereinbarungen der Vertragsparteien bleiben hiervon unberührt.",
      "(7) Sollten einzelne Bestimmungen dieses Vertrages ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      "(8) Es gelten die gesetzlichen Bestimmungen der Bundesrepublik Deutschland.",
      "(9) Auf das Arbeitsverhältnis finden keine Tarifverträge Anwendung, sofern nicht deren zwingende Geltung gesetzlich angeordnet ist. In ihrer jeweils geltenden Fassung sind die rechtmäßig eingeführten betrieblichen Regelungen zu beachten.",
      "(10) Der Arbeitnehmer erhält eine von beiden Vertragsparteien unterzeichnete Ausfertigung dieses Vertrages. Wird der Vertrag im Eventmanager unterzeichnet, steht sie ihm dort dauerhaft als PDF zum Herunterladen bereit.",
    ],
  },
];

const VORLAGEN: Record<Vertragsart, Abschnitt[]> = {
  kurzfristig: KURZFRISTIG,
  minijob: MINIJOB,
  teilzeit: TEILZEIT,
};

/**
 * Die Lücken füllen.
 *
 * Bleibt eine Marke ohne Wert, steht sie sichtbar im Text. Das ist
 * Absicht: Eine leere Stelle in einem Vertrag muss auffallen, bevor
 * jemand unterschreibt, und nicht stillschweigend verschwinden.
 */
export function vertragsAbschnitte(art: Vertragsart, l: Luecken): Abschnitt[] {
  const werte: Record<string, string> = {
    firmenanschrift: FIRMENANSCHRIFT,
    name: l.name,
    anschrift: l.anschrift,
    geburtsdatum: l.geburtsdatum,
    beginn: l.beginn,
    ende: l.ende,
    taetigkeit: l.taetigkeit,
    aufgaben: l.aufgaben,
    stundenlohn: l.stundenlohn ?? "",
    monatsstunden: l.monatsstunden ?? "",
    wochenstunden: l.wochenstunden ?? "",
    festgehalt: l.festgehalt ?? "",
    probezeit: l.probezeit ?? "",
  };

  const fuellen = (text: string) =>
    text.replace(/\{([a-z]+)\}/g, (ganz, marke: string) => {
      const wert = werte[marke];
      return wert ? wert : ganz;
    });

  return VORLAGEN[art].map((a) => ({
    titel: a.titel,
    absaetze: a.absaetze.map(fuellen),
  }));
}

/**
 * Der ganze Vertrag als eine Zeichenkette.
 *
 * Daraus entsteht beim Unterschreiben der Fingerabdruck. Er beantwortet
 * die einzige Frage, die im Streitfall zählt: Ist das noch derselbe
 * Text, den die Person gesehen hat?
 */
export function ganzerVertragstext(art: Vertragsart, l: Luecken): string {
  const kopf = [
    UEBERSCHRIFT[art].titel,
    UEBERSCHRIFT[art].unterzeile,
    "Arbeitgeber: Florian Zimmer Theater GmbH, vertreten durch den Geschäftsführer Florian Zimmer, " +
      FIRMENANSCHRIFT,
    `Arbeitnehmer: ${l.name}, ${l.anschrift}, geboren am ${l.geburtsdatum}`,
  ];
  const koerper = vertragsAbschnitte(art, l).flatMap((a) => [a.titel, ...a.absaetze]);
  return [...kopf, ...koerper].join(String.fromCharCode(10));
}
