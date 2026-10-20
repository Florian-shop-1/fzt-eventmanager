# Anfragen ohne Google-Tabelle

Stand 20.10.2026 (Julian). Ziel: Website-Anfragen und Meta-Leadformulare landen direkt im
Eventmanager. Die Google-Tabellen „Neukundengewinnung – Eventanfragen“ (Blatt Anfragen) und
„Rohdaten“ (Blatt Eventanfragen) werden nicht mehr gebraucht, die Mail aus Make an Kevin fällt weg.

## Heute

```
Website (Shop) ─┐
                ├─> Make „Anfragen (Website + Meta)“ ─┬─> Rohdaten / Eventanfragen
Meta-Leads ─────┘                                      ├─> Neukundengewinnung / Anfragen  <── Eventmanager liest (CSV)
                                                       └─> Mail an Kevin (Brevo)
Eventmanager: Bearbeitungsstand in lead_stand, eigene Meldungsmail alle 15 Min (anfrage_gemeldet)
```

## Neu

```
Website (Shop) ─┐
                ├─> Make „Anfragen (Website + Meta)“ ──> POST /api/anfrage ──> Tabelle anfrage
Meta-Leads ─────┘                                                              ├─> Leads-Seite
                                                                               └─> Mail sofort an Kevin, Florian, Julian
```

Make bleibt nur als Eingang (Meta schickt die Leads direkt an den Make-Webhook, der Shop ebenso).
Der Schlüssel jeder Anfrage ist derselbe wie bisher (Datum, Adresse, Name), deshalb gelten
Bearbeitungsstand und „schon gemeldet“ unverändert weiter.

## Umschalten (Reihenfolge)

1. **Deployen** (dieser PR). Ändert nichts, solange `ANFRAGEN_QUELLE` leer ist.
2. **Vercel-Umgebung** setzen: `ANFRAGEN_SCHLUESSEL` (neu, zufällig, ≥ 16 Zeichen) und
   `ANFRAGEN_MELDEN_AN` = Kevin, Florian, Julian (julian@profitables.marketing). Redeploy.
3. **Make**: im Szenario „Anfragen (Website + Meta)“ nach dem JSON-Modul (5) ein HTTP-Modul
   „An Eventmanager“ einfügen (Entwurf: `docs/make-anfragen-an-eventmanager.json`), Schlüssel als
   `?schluessel=`. Die Sheets-Module bleiben vorerst, die Mail an Kevin noch auch.
   → Ab jetzt laufen beide Wege parallel, die Tabelle anfrage füllt sich.
4. **Bestand übernehmen**: `npm run anfragen:import` (zählt) und `npm run anfragen:import -- --wirklich`.
5. **Umlegen**: `ANFRAGEN_QUELLE=datenbank`, Redeploy. Leads-Seite liest aus der eigenen Tabelle,
   die Meldung geht sofort beim Eingang raus.
6. **Make aufräumen**: Mail-Modul an Kevin entfernen (sonst doppelt). Nach ein paar Tagen ohne
   Auffälligkeiten auch die beiden Sheets-Module entfernen.

Zurück: `ANFRAGEN_QUELLE` leeren und Redeploy, die Tabelle ist während des Parallelbetriebs vollständig.

Wichtig ab Schritt 5: Status nur noch im Eventmanager pflegen, Änderungen in der Google-Tabelle
werden nicht mehr gelesen.
