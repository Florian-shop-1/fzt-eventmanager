-- Der Name des Käufers, für die persönliche Anrede in der Vorfreude-Mail.
--
-- "Hallo Florian," wirkt anders als "Hallo,". Deshalb dieses Feld.
--
-- Wichtig zum Verständnis des heutigen Stands: Der Shop erhebt den Namen NICHT
-- mehr. Der Kontaktschritt fragt nur noch Telefon und E-Mail, den Namen nimmt
-- ditix im Checkout auf (siehe sendAbandonerWebhook im Shop, wo vorname und
-- nachname bewusst leer mitlaufen). Aus ditix kommt er bisher nicht zu uns
-- zurück; checkout/status liefert nur Zahlungsstand und Bestellnummer.
--
-- Die Spalte steht trotzdem schon hier, und die Mail wertet sie aus. Sobald
-- der Name auf einem der beiden möglichen Wege ankommt (ditix-Bestellung über
-- die Middleware, oder wieder ein Namensfeld im Shop), ist die Anrede ohne
-- weitere Änderung persönlich. Bis dahin greift der Rückfall "Hallo,".
--
-- Gespeichert wird der Name so, wie er hereinkommt, also gegebenenfalls
-- vollständig. Den Vornamen löst die Mail selbst heraus (vorname() in
-- src/lib/mail/vorfreude.ts), damit eine spätere Korrektur an einer Stelle
-- passiert und nicht in den Daten festgeschrieben ist.

alter table shop_buchung
  add column if not exists name text not null default '';
