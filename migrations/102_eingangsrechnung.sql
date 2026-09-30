-- Eingangsrechnungen: was schuldet das Haus wem, und ist es bezahlt?
-- (Florian, 30.09.2026)
--
-- Werner soll auf einen Blick sehen, was offen ist und was schon vom Konto
-- abgegangen ist. Bisher hat er jede Kreditkartenzahlung von Hand mit den
-- Belegen verglichen.
--
-- Die Belegtabelle kann das fast: Sie kennt Lieferant, Datum und Betrag.
-- Was fehlt, ist die Fälligkeit und die Unterscheidung zwischen einem Beleg
-- (schon bezahlt, etwa an der Kasse) und einer Rechnung (kommt per Mail und
-- wird später überwiesen).
--
-- Bezahlt ist eine Rechnung, wenn ihr eine Abbuchung zugeordnet wurde, siehe
-- bank_umsatz.beleg_id. Das steht bewusst nicht doppelt hier: Zwei Wahrheiten
-- über dieselbe Zahlung laufen irgendwann auseinander.

begin;

-- Wann sie fällig ist, falls die Rechnung ein Ziel nennt.
alter table bewirtung add column if not exists faellig_am date;

-- Rechnung oder schon bezahlter Beleg. Was per Mail kommt, ist eine
-- Rechnung; was jemand abfotografiert, hat er meist schon bezahlt.
alter table bewirtung add column if not exists ist_rechnung boolean not null default false;

-- Die Rechnungsnummer des Lieferanten, fuer die Suche und den Verwendungszweck.
alter table bewirtung add column if not exists lieferant_nummer text not null default '';

-- Was per Mail hereinkam, ist eine Rechnung: Niemand mailt einen Kassenbon.
update bewirtung set ist_rechnung = true where herkunft = 'mail' and ist_rechnung = false;

create index if not exists bewirtung_rechnung on bewirtung (ist_rechnung, faellig_am);

-- Stand des taeglichen Postfachlaufs, damit man morgens sieht, ob er lief.
create table if not exists rechnungspost_lauf (
  id            int primary key default 1 check (id = 1),
  zuletzt_am    timestamptz,
  gesehen       int not null default 0,
  neu           int not null default 0,
  ohne_anhang   int not null default 0,
  fehler_anzahl int not null default 0,
  letzter_fehler text not null default ''
);

insert into rechnungspost_lauf (id) values (1) on conflict (id) do nothing;

commit;
