#!/usr/bin/env python3
"""
Holt die Kontoumsaetze bei der Bank ab und schickt sie an den Eventmanager.

Warum ausserhalb des Eventmanagers:
    Bankzugangsdaten haben auf einem Webserver nichts verloren. Dieses
    Programm laeuft auf einem Rechner im Haus. Nur dort liegen VR-NetKey
    und PIN, und zwar in Umgebungsvariablen, nicht im Programmtext.
    An den Eventmanager gehen ausschliesslich die fertigen Umsaetze.

Was dieses Programm ausdruecklich NICHT kann:
    Es liest. Es gibt hier keine Ueberweisung, keine Lastschrift, keinen
    Dauerauftrag und keinen Zahlungsauftrag. Der genutzte FinTS-Zugang
    wird nur mit den lesenden Geschaeftsvorfaellen aufgerufen
    (get_sepa_accounts, get_transactions). Zahlungen werden unter keinen
    Umstaenden ausgeloest.

Was nie ausgegeben wird:
    PIN, VR-NetKey, TAN und die vollstaendige IBAN erscheinen weder auf
    dem Bildschirm noch in einer Datei, die dieses Programm schreibt.
    Angezeigt werden hoechstens die letzten vier Stellen des Kontos.

Einmal einrichten:
    py -m pip install fints requests

Umgebungsvariablen (auf dem Rechner im Haus setzen, nicht in eine Datei
im Projektordner schreiben):
    FINTS_ENDPOINT   FinTS-Adresse der Bank. Fuer die Volksbank
                     Allgaeu-Oberschwaben (frueher Rechenzentrale Fiducia):
                     https://fints2.atruvia.de/cgi-bin/hbciservlet
                     Meldet die Bank "Institut unbekannt", ist es
                     https://fints1.atruvia.de/cgi-bin/hbciservlet
    FINTS_BLZ        Bankleitzahl, hier 65091040
    FINTS_USER       VR-NetKey
    FINTS_PIN        OnlineBanking-PIN
    FINTS_IBAN       vollstaendige IBAN des Geschaeftskontos
    FINTS_PRODUKT_ID FinTS-Registrierungsnummer. Pflicht, nicht von uns
                     erfunden: Die Banken lassen nur registrierte Programme
                     an ihre Schnittstelle. Kostenlos zu beantragen unter
                     https://www.hbci-zka.de/register/prod_register.htm
    EVENTMANAGER_URL z. B. https://eventmanager.florianzimmer.com
    BANK_IMPORT_SECRET  derselbe Wert wie in Vercel

Aufruf:
    py scripts/bank-abruf.py               letzte 30 Tage
    py scripts/bank-abruf.py --tage 90
    py scripts/bank-abruf.py --trocken     nur anzeigen, nichts senden
    py scripts/bank-abruf.py --automatisch fuer die Aufgabenplanung

Im automatischen Lauf wird nie auf eine Eingabe gewartet. Verlangt die
Bank eine Freigabe, meldet das Programm das an den Eventmanager und
beendet sich. Im Eventmanager steht dann unter Zahlungseingaenge, dass
die Bankverbindung neu bestaetigt werden muss.
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

# Im Haus laeuft der Netzverkehr ueber einen Firmenfilter, der die
# Verbindungen aufbricht und mit einem eigenen Zertifikat neu unterschreibt.
# Python bringt seine eigene Zertifikatsliste mit und kennt dieses
# Zertifikat nicht, deshalb scheiterte der Abruf mit
# CERTIFICATE_VERIFY_FAILED. truststore laesst Python den Windows-Speicher
# benutzen, in dem das Zertifikat liegt. Genau dasselbe macht das Projekt
# an anderer Stelle fuer Node mit --use-system-ca.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

# Der Zustand der FinTS-Verbindung (System-Kennung, TAN-Verfahren). Kein
# Geheimnis im Sinne der PIN, gehoert aber trotzdem nicht ins Repository.
ZUSTAND_DATEI = Path.home() / ".fzt-bank-fints.dat"

LESENDE_HINWEISE = (
    "Dieses Programm ruft nur lesende Geschaeftsvorfaelle auf. "
    "Es loest keine Zahlungen aus."
)


def pflicht(name):
    wert = os.environ.get(name, "").strip()
    if not wert:
        raise SystemExit(
            f"Die Umgebungsvariable {name} fehlt. Trage sie ueber "
            f"scripts/zugangsdaten.cmd ein (Doppelklick) und starte das Programm neu."
        )
    # Ein haeufiger Stolperstein: der Beispieltext aus der Anleitung wurde
    # eins zu eins uebernommen. Dann lieber hier abbrechen als bei der Bank.
    if wert.lower().startswith(("dein ", "deine ")) or wert.lower() in ("vr-netkey", "pin", "iban"):
        raise SystemExit(
            f"In {name} steht noch der Beispieltext aus der Anleitung. "
            f"Trage den echten Wert ueber scripts/zugangsdaten.cmd ein (Doppelklick)."
        )
    return wert


def konto_endet_auf(iban):
    return iban.replace(" ", "")[-4:]


def melde(url, geheim, rumpf):
    """Schickt etwas an den Eventmanager. Nur Umsaetze und Zustand, nie Zugangsdaten."""
    import requests

    antwort = requests.post(
        url.rstrip("/") + "/api/bank",
        headers={
            "authorization": f"Bearer {geheim}",
            "content-type": "application/json",
        },
        data=json.dumps(rumpf),
        timeout=60,
    )
    if antwort.status_code != 200:
        raise SystemExit(f"Der Eventmanager hat abgelehnt ({antwort.status_code}): {antwort.text[:300]}")
    return antwort.json()


def cent(betrag):
    # mt-940 liefert Decimal, das runden wir kaufmaennisch auf Cent.
    return int(round(float(betrag) * 100))


def umsatz_aus_buchung(t):
    """Eine Buchung aus mt-940 in die Form bringen, die der Eventmanager erwartet."""
    d = t.data
    zweck = " ".join(str(d.get(k) or "") for k in ("purpose", "posting_text", "prima_nota")).strip()
    betrag = d.get("amount")
    return {
        "buchungstag": (d.get("entry_date") or d.get("date")).isoformat(),
        "wertstellung": d.get("date").isoformat() if d.get("date") else None,
        "betragCent": cent(betrag.amount) if betrag is not None else 0,
        "waehrung": getattr(betrag, "currency", "EUR") if betrag is not None else "EUR",
        "gegenname": (d.get("applicant_name") or "").strip(),
        "gegenIban": (d.get("applicant_iban") or "").strip(),
        "verwendungszweck": " ".join(zweck.split()),
        "bankReferenz": (d.get("bank_reference") or d.get("customer_reference") or None),
        "transaktionsId": d.get("id") or None,
    }


def main():
    p = argparse.ArgumentParser(description="Kontoumsaetze lesen und an den Eventmanager schicken")
    p.add_argument("--tage", type=int, default=30, help="wie weit zurueck gelesen wird")
    p.add_argument("--trocken", action="store_true", help="nur anzeigen, nichts senden")
    p.add_argument(
        "--automatisch",
        action="store_true",
        help="ohne Rueckfragen, fuer die taegliche Aufgabenplanung",
    )
    a = p.parse_args()

    endpoint = pflicht("FINTS_ENDPOINT")
    blz = pflicht("FINTS_BLZ")
    benutzer = pflicht("FINTS_USER")
    pin = pflicht("FINTS_PIN")
    iban = pflicht("FINTS_IBAN").replace(" ", "")
    produkt = os.environ.get("FINTS_PRODUKT_ID", "").strip()
    if not produkt:
        raise SystemExit(
            "Es fehlt die FinTS-Registrierungsnummer (FINTS_PRODUKT_ID).\n"
            "Jedes Programm, das per FinTS ein Konto liest, braucht eine eigene Nummer.\n"
            "Sie ist kostenlos und wird bei der Deutschen Kreditwirtschaft beantragt:\n"
            "https://www.hbci-zka.de/register/prod_register.htm\n"
            "Solange sie fehlt: Umsaetze im OnlineBanking exportieren und im\n"
            "Eventmanager unter Zahlungseingaenge hochladen, das laeuft schon."
        )
    url = os.environ.get("EVENTMANAGER_URL", "").strip()
    geheim = os.environ.get("BANK_IMPORT_SECRET", "").strip()
    if not a.trocken and (not url or not geheim):
        raise SystemExit("EVENTMANAGER_URL und BANK_IMPORT_SECRET fehlen. Oder starte mit --trocken.")

    print(f"Konto ...{konto_endet_auf(iban)} bei BLZ {blz}. {LESENDE_HINWEISE}")

    # Die Rueckmeldungen der Bank mitlesen.
    #
    # Ohne das steht bei jedem Problem nur die Meldung der Bibliothek da,
    # und die ist irrefuehrend: Bei einer nicht freigeschalteten
    # Produktnummer meldete python-fints "Could not find system_id",
    # waehrend die Bank in Wahrheit "Software nicht als FinTS-Produkt
    # registriert" antwortete (23.09.2026). Gelesen werden nur Code und
    # Text der Rueckmeldung, keine Kontodaten.
    bankmeldungen = []

    def mitschneiden():
        import fints.connection as verbindung

        urspruenglich = verbindung.FinTSHTTPSConnection.send

        def senden(self, nachricht):
            antwort = urspruenglich(self, nachricht)
            try:
                for art in ("HIRMG", "HIRMS"):
                    for seg in antwort.find_segments(art):
                        for r in getattr(seg, "responses", []):
                            code = str(getattr(r, "code", ""))
                            text = str(getattr(r, "text", "")).strip()
                            if code.startswith("9") and text:
                                bankmeldungen.append(f"{code}: {text}")
            except Exception:  # noqa: BLE001
                pass
            return antwort

        verbindung.FinTSHTTPSConnection.send = senden

    try:
        from fints.client import FinTS3PinTanClient, NeedTANResponse
    except ImportError as f:
        # Die genaue Ursache mitgeben. "fints fehlt" zu melden, wenn in
        # Wahrheit etwas anderes klemmt, kostet nur Sucherei.
        raise SystemExit(
            f"Eine benoetigte Bibliothek laesst sich nicht laden ({f}).\n"
            f"Einmalig in PowerShell: py -m pip install fints requests\n"
            f"Verwendetes Python: {sys.executable}"
        )

    mitschneiden()

    zustand = ZUSTAND_DATEI.read_bytes() if ZUSTAND_DATEI.exists() else None
    klient = FinTS3PinTanClient(
        blz,
        benutzer,
        pin,
        endpoint,
        product_id=produkt,
        from_data=zustand,
    )

    # Ab hier darf die PIN nicht mehr auftauchen. Sie liegt nur noch im
    # Objekt des Klienten und wird niemals ausgegeben oder gespeichert.
    pin = None

    # Erst das TAN-Verfahren waehlen, dann den Dialog aufbauen.
    #
    # Ohne diesen Schritt kommt die Anmeldung zwar zustande, die Bank
    # liefert aber keine System-Kennung, und python-fints bricht mit
    # "Could not find system_id" ab (hier am 23.09.2026 genau so passiert).
    # Der Aufruf laeuft ueber einen anonymen Dialog, es wird dabei nichts
    # gelesen und nichts ausgeloest.
    try:
        verfahren = klient.get_tan_mechanisms()
        if verfahren:
            aktuell = klient.get_current_tan_mechanism()
            if aktuell not in verfahren:
                erstes = list(verfahren.keys())[0]
                print(f"TAN-Verfahren: {getattr(verfahren[erstes], 'name', erstes)}")
                klient.set_tan_mechanism(erstes)
    except Exception as f:
        print(f"Das TAN-Verfahren liess sich nicht abfragen ({type(f).__name__}: {f}).")

    fehler = None
    umsaetze = []
    try:
        with klient:
            if klient.init_tan_response:
                # Die Bank will eine Freigabe. Das ist kein Fehler, sondern
                # der normale Weg nach 90 Tagen oder bei einem neuen Rechner.
                antwort = klient.init_tan_response
                if a.automatisch:
                    # Im automatischen Lauf sitzt niemand davor. Also nur
                    # melden und aufhoeren, nicht auf eine Eingabe warten.
                    print("Die Bank verlangt eine Freigabe. Bitte den Abruf einmal von Hand starten.")
                    if not a.trocken:
                        melde(url, geheim, {"freigabeNoetig": True})
                    return
                print("\nDie Bank verlangt eine Freigabe.")
                print(antwort.challenge)
                print("Gib die Freigabe in der SecureGo-plus-App und bestaetige hier mit der Eingabetaste,")
                print("oder tippe die TAN ein, wenn die Bank eine verlangt.")
                eingabe = input("TAN (leer lassen, wenn in der App freigegeben): ").strip()
                klient.send_tan(antwort, eingabe)

            konten = klient.get_sepa_accounts()
            if isinstance(konten, NeedTANResponse):
                raise SystemExit("Die Bank verlangt eine weitere Freigabe. Bitte das Programm erneut starten.")

            treffer = [k for k in konten if (k.iban or "").replace(" ", "") == iban]
            if not treffer:
                gefunden = ", ".join("..." + konto_endet_auf(k.iban or "") for k in konten)
                raise SystemExit(
                    f"Das Konto ...{konto_endet_auf(iban)} ist bei diesem Zugang nicht dabei. "
                    f"Gefunden wurden: {gefunden or 'keine'}"
                )
            konto = treffer[0]

            bis = date.today()
            von = bis - timedelta(days=a.tage)
            print(f"Lese Umsaetze von {von.isoformat()} bis {bis.isoformat()} ...")
            buchungen = klient.get_transactions(konto, von, bis)
            umsaetze = [umsatz_aus_buchung(t) for t in buchungen]
    except SystemExit:
        raise
    except Exception as f:  # noqa: BLE001
        # Die Meldung der Bibliothek kann Kontodaten enthalten, deshalb nur
        # die Art des Fehlers weitergeben.
        fehler = f"{type(f).__name__}: {str(f)[:200]}"
        # Was die Bank selbst gesagt hat, ist fast immer hilfreicher.
        if bankmeldungen:
            klartext = " | ".join(dict.fromkeys(bankmeldungen))[:300]
            fehler = klartext
            if "nicht als FinTS-Produkt registriert" in klartext:
                fehler += (
                    " -- Die Registrierungsnummer ist bei der Bank noch nicht bekannt. "
                    "Sie wird von der FinTS-Leitstelle turnusmaessig an die Rechenzentren verteilt."
                )
        print("Der Abruf ist gescheitert:", fehler, file=sys.stderr)
    finally:
        try:
            ZUSTAND_DATEI.write_bytes(klient.deconstruct(including_private=True))
            if os.name == "posix":
                ZUSTAND_DATEI.chmod(0o600)
        except Exception:  # noqa: BLE001
            pass

    print(f"{len(umsaetze)} Buchungen gelesen.")
    if a.trocken:
        for u in umsaetze[:20]:
            print(f"  {u['buchungstag']}  {u['betragCent'] / 100:10.2f}  {u['gegenname'][:28]:28}  {u['verwendungszweck'][:50]}")
        print("Trockenlauf, es wurde nichts gesendet.")
        return

    if fehler:
        melde(url, geheim, {"fehler": fehler})
        raise SystemExit(1)

    ergebnis = melde(
        url,
        geheim,
        {
            "umsaetze": umsaetze,
            "bis": date.today().isoformat(),
            "kontoEndetAuf": konto_endet_auf(iban),
        },
    )
    print(
        f"Gesendet. Neu: {ergebnis.get('neu', 0)}, schon bekannt: {ergebnis.get('schonBekannt', 0)}, "
        f"automatisch zugeordnet: {ergebnis.get('zugeordnet', 0)}, offen: {ergebnis.get('offen', 0)}"
    )


if __name__ == "__main__":
    main()
