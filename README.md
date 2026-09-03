# FZT Eventmanager

Internes Programm des Florian Zimmer Theaters für Firmenevents: von der ersten Anfrage
über das Angebot bis zur Platzierung der Gäste in der Magicuisine.

## Starten

Doppelklick auf **`Programm starten.cmd`** im Projektordner. Der Browser öffnet
sich nach wenigen Sekunden von selbst. Das schwarze Fenster muss offen bleiben,
solange gearbeitet wird.

Doppelklick auf **`Pruefungen laufen lassen.cmd`** prüft Sitzplaner,
Angebotsberechnung, Datenbankschema und die Verbindung zur Datenbank.

Wer lieber tippt:

```bash
npm run dev
```

Danach im Browser `http://localhost:3005` öffnen.

## Datenbank einrichten

Die Daten liegen in einer Postgres-Datenbank bei Neon.

1. Auf neon.com anmelden und ein Projekt anlegen, Region Frankfurt.
2. Dort unter "Connect" die Verbindungszeichenfolge kopieren.
3. Im Projektordner eine Datei `.env.local` anlegen (Vorlage: `.env.example`)
   und die Verbindung als `DATABASE_URL` eintragen.
4. Tabellen anlegen:

```bash
npm run migrate
```

Das Skript spielt alle Dateien aus `migrations/` ein und merkt sich, welche
schon erledigt sind. Es lässt sich gefahrlos mehrfach ausführen.

`.env.local` enthält Zugangsdaten und landet nicht in Git.

## lexoffice verbinden

Doppelklick auf **`Lexoffice verbinden.cmd`**. Das Skript fragt nach dem Schlüssel,
trägt ihn in `.env.local` ein und prüft sofort die Verbindung.

Den Schlüssel gibt es unter https://app.lexware.de/addons/public-api.

Wichtig: Falls dort bereits ein Schlüssel liegt, trotzdem einen neuen erzeugen.
Schlüssel, die vor Einführung der Angebots-Schnittstelle erstellt wurden, dürfen
keine Angebote anlegen. Das prüft das Skript mit und sagt es deutlich.

Reine Prüfung ohne Eintragen:

```bash
npm run lexoffice:test
```

Technische Eckdaten: Gateway `https://api.lexware.io`, höchstens zwei Anfragen
pro Sekunde (der Client drosselt selbst), Steuersatz und Rabatt werden je Position
mitgeschickt, Alternativpositionen kennt die Schnittstelle nativ.

### Zertifikate auf Windows-Rechnern im Firmennetz

Alle npm-Befehle laufen über `cross-env NODE_OPTIONS=--use-system-ca`. Grund: Auf
Rechnern, auf denen ein Virenscanner oder eine Firewall HTTPS-Verbindungen
aufbricht, vertraut Node dem ersetzten Zertifikat sonst nicht und meldet nur
"fetch failed". Mit dieser Einstellung nutzt Node den Zertifikatsspeicher von
Windows. Das ist der sichere Weg, im Gegensatz zum Abschalten der Prüfung.

## Prüfen, ob alles rechnet

```bash
npm test
```

Prüft den Sitzplaner an neun Fällen, rechnet beide Musterangebote nach und
spielt das Datenbankschema in ein Postgres im Arbeitsspeicher ein. Für den
letzten Teil ist keine echte Datenbank nötig.

## Was bereits funktioniert

**Vorgänge** (`/vorgaenge`)

Firmenevents von der Anfrage bis zur Durchführung. Anfrage aufnehmen legt Kunde,
Vorstellung, Vorgang und erste Gruppe in einem Schritt an. Im Vorgang selbst:
Statusleiste, weitere Gruppen, Notizen mit Benutzer und Zeit, Aufgaben mit Frist,
Zahlungen und die Historie früherer Besuche desselben Kunden.

Die Ausnahme vom Aufschlag für nicht belegte Logenplätze wird hier gesetzt. Ohne
Begründung lehnt bereits die Datenbank ab, es kann also keine unbegründete
Ausnahme geben.

**Sitzplaner** (`/sitzplan`)

Gruppen eintragen, das Programm schlägt eine Platzierung vor. Enthaltene Regeln:

- Gruppen kommen in die Logen, Buchungen aus dem Webshop in die Eventgalerie
- In einer Loge sitzt immer nur eine Gruppe. Fremde Paare werden nie zusammengelegt
- Logen lassen sich zusammenlegen, aber nur nebeneinanderliegende (3 und 4 geht, 2 und 5 nicht)
- Der bauliche Abstand zwischen Loge 1 und 2 wird als Nachteil bewertet, aber nicht verboten
- Ein Zusatzstuhl an der Stirnseite wird eingeplant, wenn es sonst nicht passt (13. Gast)
- Bleiben Plätze in einer belegten Loge frei, wird die Differenz berechnet und angezeigt
- Über "Ausnahme machen" plus Begründung lässt sich die Differenz erlassen. Die Begründung
  wird mitgespeichert, damit später nachvollziehbar bleibt, wer was entschieden hat
- Unter fünf Personen kommt ein Hinweis, dass die Eventgalerie besser passt

Das Programm liefert immer mehrere Varianten mit Begründung. Die Auswahl trifft ein Mensch.

**Shortcuts** (`/shortcuts`)

Sammlung der Google-Tabellen für Versand, Menüs und Leads. Liegt vorerst nur im Browser
des jeweiligen Benutzers.

**Angebotsberechnung** (`/angebot`)

Positionen aus dem Artikelstamm, Alternativpositionen für die Ticketkategorie,
Rabatte, Getränkepauschalen und die Exklusivnutzung für blockierte Logenplätze.
Beide Musterangebote werden auf den Cent nachgerechnet, Steuerausweis inklusive.

**Datenbank**

Postgres bei Neon in Frankfurt, 15 Tabellen. Alle Benutzer sehen denselben Stand.

**Spielplan aus dem Ticketshop**

Beim Aufnehmen einer Anfrage wird die Vorstellung aus dem echten Spielplan gewählt,
aktuell rund 196 Termine. Die Ditix-Kennung der Vorstellung wird mitgespeichert, damit
später eindeutig ist, um welche Vorstellung es geht.

Gelesen wird über die öffentliche Shop-Adresse `shop.florianzimmertheater.de`, also über
denselben Weg, den jeder Besucher der Seite ohnehin auslöst. Kein Schlüssel nötig.

**Wichtig zur Staging-Umgebung:** Im Vercel-Projekt des Shops gibt es nur EIN Paar
`DITIX_API_URL` und `DITIX_API_KEY`, gültig für Preview und Production zugleich. Die
Staging-Seite spricht also mit demselben Ticketsystem wie der Livebetrieb. Eine Buchung
über Staging wäre eine echte Buchung. Deshalb enthält `src/lib/ditix/spielplan.ts`
bewusst keine einzige schreibende Funktion.

## Was noch fehlt

- Sitzplan mit den echten Vorgängen verbinden, aktuell arbeitet er mit Beispieldaten
- Angebot aus einem Vorgang erzeugen und speichern, inklusive PDF
- Persönlicher Kundenlink mit Öffnungs-Tracking und Online-Annahme
- Ablage des Angebotsentwurfs in Outlook
- Anbindung an lexoffice für Angebot, Rechnung und Zahlungsstatus
- Anmeldung für die vier Benutzer, zwingend bevor das Programm online geht
- Küchen- und Serviceblatt mit Menüzahlen, Unverträglichkeiten und Tischplan
- Automatisches Einbuchen der Firmentickets in Ditix

## Dateien, in denen die Hausregeln stehen

Diese drei Dateien enthalten alles, was sich ändern kann, wenn sich im Haus etwas ändert:

| Datei | Inhalt |
| --- | --- |
| `src/lib/domain/venue.ts` | Logen, Tische der Eventgalerie, Stehtische im Foyer |
| `src/lib/domain/artikel.ts` | Artikelstamm mit allen Preisen, Artikelnummern wie in lexoffice |
| `src/lib/domain/pricing.ts` | Rechenregeln, Fristen, Wert eines blockierten Platzes |
| `src/lib/seating/bausteine.ts` | Strafpunkte, nach denen der Sitzplaner abwägt |

Die Strafpunkte legen fest, wie der Planer abwägt. Höhere Zahl bedeutet: wird stärker
vermieden. Aktuell gilt:

| Punkte | Wofür |
| --- | --- |
| 10 | je Platz, der in einer belegten Loge frei bleibt |
| 30 | Gruppe sitzt über den Abstand zwischen Loge 1 und 2 hinweg |
| 12 | je Zusatzstuhl an der Stirnseite |
| 8 | Gruppe unter fünf Personen belegt eine ganze Loge |
| 3 | je zusätzlich geöffnete Loge |
| 500 | je Person, die gar keinen Platz bekommt |

## Aufbau eines Angebots

Abgeleitet aus den Musterangeboten AG-0826-1167 und AG-0826-1168:

1. Kopf mit Angebotsnummer im Format `AG-MMJJ-NNNN`, Kundennummer, Datum, gültig sieben Tage
2. Ablaufplan als Einleitung: 17:20 Empfang, 17:50 Menü, 20:00 Show, 22:30 Ausklang Foyerbar
3. Position 1: 4-Gang-Menü je Person
4. Position 2: Showticket in einer Kategorie, darunter die anderen drei als Alternativpositionen,
   sodass der Kunde selbst wählen kann
5. Textblock mit den optionalen Extras (Getränkepauschalen, Face to Face Show, LED-Fassade,
   Aftershow-Party)
6. Schlusstext: Reservierung bleibt bis zum vollständigen Zahlungseingang unverbindlich,
   Menüwahl und Allergien spätestens sieben Tage vorher

Rabatte kommen fallweise vor, im Angebot AG-0826-1168 waren es 15 Prozent auf die Tickets.

## Offene Punkte, die Florian noch klären muss

1. **Bier- und Wein-Flat**: Artikelliste sagt 25 Euro, beide Angebote sagen 35 Euro.
   Hinterlegt sind vorläufig 35 Euro.
2. **Umsatzsteuer, geklärt am 2026-08-23**: Menüs 7 Prozent, Showtickets 7 Prozent,
   zusätzliche Leistungen wie Geschenkboxen, Technik und Getränke 19 Prozent. Das Programm
   rechnet danach und trifft den Steuerausweis der Musterangebote auf den Cent.
   Offen bleibt: In der lexoffice-Artikelliste stehen die Menüs mit 19 Prozent. Wird dort
   ein Beleg von Hand aus dem Artikelstamm erzeugt, nimmt lexoffice weiterhin 19 Prozent.
   Der Satz sollte in lexoffice korrigiert werden.
3. **Menüpreis in der Loge**: Der Artikelstamm kennt 4-Gang-Menü zu 69 Euro und
   4-Gang-Menü LOGE zu 79 Euro. In beiden Angeboten wurden 69 Euro berechnet, auch bei
   Platzierung in der Loge. Gilt der Aufschlag ab sofort?
4. **Empore**: Die Ticketkategorien heißen Golden Seats, Kat. 1, Kat. 2 und Kat. 3. Die
   Empore, auf der Logengäste laut Florian meist sitzen, taucht dort nicht auf.
5. **Menüwahl-Frist**: Der Angebotstext nennt sieben Tage, in der Praxis geht es noch am
   selben Tag. Hinterlegt als Warnschwelle, nicht als Sperre.
6. **Restlicher Artikelstamm**: Die übermittelte Liste endet bei "Miete Showroom
   (erste Stunde)". Was danach kommt, fehlt noch.
7. **Foyer**: Anzahl der Stehtische ist geschätzt und muss gezählt werden.
8. **lexoffice**: API-Schlüssel wird benötigt.
9. **Ditix**: Zugang zur Middleware-Schnittstelle wird beim Entwicklerteam angefragt.
10. **Outlook**: Microsoft 365 wird genutzt. Angebotsentwürfe sollen im Entwurfsordner
    von `tickets@florianzimmer.com` landen. Offen: ob das ein geteiltes Postfach oder ein
    eigenes Konto ist, davon hängen die nötigen Rechte ab.

## Einzelne Prüfungen

```bash
npm run test:sitzplan
```

Spielt neun echte Fälle durch und gibt aus, wie das Programm die Gäste setzen würde.
Wer eine Regel ändert, sollte das danach einmal laufen lassen.

```bash
npm run test:angebot
```

Rechnet die Musterangebote AG-0826-1167 und AG-0826-1168 nach und vergleicht die
Summen mit den Originalen.

```bash
npm run test:datenbank
```

Spielt die Migrationen in ein Postgres im Arbeitsspeicher ein und prüft, ob die
Regeln greifen, etwa dass eine Ausnahme ohne Begründung abgelehnt wird.
