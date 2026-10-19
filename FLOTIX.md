# Die Umstellung auf FloTix

Stand 20.10.2026. Gearbeitet wird in diesem Eventmanager, dem echten. Eine Kopie gibt es
nicht mehr (der Zweig `flotix` ist archiviert, siehe unten).

Das ist möglich, weil die neue Quelle ausgeschaltet ist, solange niemand sie einschaltet:
Ohne `QUELLE=flotix` liest der Eventmanager weiter Ditix und die Google-Tabellen, genau wie
bisher. Der FloTix-Teil liegt daneben und schläft.

## Drei Wege, auf denen die Ticketdaten hereinkommen

| Weg | Inhalt | Stand |
|---|---|---|
| Shop-API `/api/ditix/*` | Spielplan, Saalplan, Preise, Auslastung, Ticketarten | **Nichts zu tun.** FloTix antwortet auf denselben Adressen im selben Format, sobald im Shop `TICKETING=flotix` steht. |
| 4 Google-Tabellen | Gäste und Menüs, Parkplätze, Gutscheinversand, Anfragen | **Umgebaut.** Gäste, Menüs, Parkplätze und Versand kommen wahlweise aus FloTix. Die Anfragen (Meta-Leads) bleiben in ihrer Tabelle, das sind keine Ticketdaten. |
| Sofortmeldung neuer Buchungen | Der Shop schob jede Buchung herein | **Umgebaut.** FloTix meldet jede Änderung an `/api/flotix/meldung`. |

## Die Weiche

Eine Umgebungsvariable entscheidet, keine Codeänderung:

```
QUELLE=flotix
FLOTIX_KEY=<der Schlüssel aus dem Vercel-Projekt flotix-backend>
FLOTIX_URL=https://flotix.florianzimmertheater.de   (voreingestellt)
```

Fehlt `QUELLE` oder der Schlüssel, bleibt alles beim alten Weg. Zurückgeschaltet wird
genauso: Variable weg, neu veröffentlichen, eine Minute. Dieselbe Mechanik, mit der Julian
den Shop umschaltet. Die einzige Stelle, die von FloTix weiß, ist `src/lib/flotix/tuer.ts`.

`FLOTIX_KEY` allein schaltet nichts um. Er wird für die Sofortmeldung gebraucht und darf
deshalb schon vorher stehen.

## Die Tür in FloTix

`GET /api/eventmanager` im Projekt `flotix-backend`, nur lesend, mit eigenem Schlüssel
(`EVENTMANAGER_KEY` dort, Kopf `x-eventmanager-key`):

- `?aktion=probe` Lebenszeichen und Stand
- `?aktion=bestellungen` je Bestellung mit Positionen, wie verkauft
- `?aktion=gutscheinversand` was per Post geht

Die Tür deutet nichts. Was ein Menü ist und was ein Ticket, entscheidet weiterhin der
Eventmanager anhand der Bezeichnung (`src/lib/shop/artikel.ts`). Beide Quellen benutzen
dieselbe Erkennung, damit ein Unterschied in den Zahlen wirklich aus den Daten kommt und
nicht daraus, dass zweimal verschieden erkannt wurde.

## Die Sofortmeldung

1. In FloTix wird bezahlt, storniert oder ein Gutschein für die Post gekauft.
2. FloTix ruft `POST /api/flotix/meldung` hier auf, mit demselben Schlüssel.
3. Die Route wirft den Zwischenspeicher unter dem Kennzeichen `flotix` weg (`expire: 0`,
   nicht `max`: Wer nach der Buchung die Einlassliste aufschlägt, soll den Gast sehen und
   nicht erst den vorherigen Stand).
4. Die nächste Liste holt frisch bei FloTix.

Damit FloTix meldet, braucht es dort `EVENTMANAGER_URL` und `EVENTMANAGER_KEY`. Fehlt eines,
meldet FloTix absichtlich nichts. Bleibt eine Meldung aus, hinkt nichts länger als eine
Minute nach: So lange gilt der Zwischenspeicher auch ohne Meldung. Eine doppelte Meldung
schadet nicht, es wird derselbe Speicher zweimal weggeworfen.

## Was vor dem Umschalten noch fehlt

1. **Vergleichslauf:** `npx tsx scripts/quellenvergleich.ts` stellt beide Quellen je
   Vorstellung nebeneinander und sagt, wie viele Termine übereinstimmen. Aussagekräftig
   erst, wenn der Shop über FloTix verkauft: Heute stehen dort nur Testkäufe.
2. **Schnitt über das Vorstellungsdatum:** Shows vor dem Umschalttag aus der Tabelle,
   danach aus FloTix. Sonst sind an dem Tag alle alten Gästelisten, Funktionsheets und
   Abrechnungen leer. Wird eingebaut, sobald der Umschalttag feststeht, weil genau dieses
   Datum hineingehört.

Der Ablauf des Umschalttags selbst steht in `UMSCHALTTAG.md` im Projekt `flotix-backend`.

## Die archivierte Kopie

Am 19.10.2026 lag die Arbeit zuerst in einer Kopie (`flotix-eventmanager`, Zweig `flotix`).
Sie wird nicht mehr gepflegt. Der Zweig bleibt im Repository liegen, falls jemand
nachschauen will; gearbeitet wird in `master`.
