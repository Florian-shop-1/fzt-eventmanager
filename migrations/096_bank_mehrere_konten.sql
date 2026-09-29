-- Mehrere Konten desselben Bankzugangs lesen (Florian, 29.09.2026).
--
-- Bisher wurde genau ein Konto abgerufen. Zum Zugang gehoeren aber drei:
-- die beiden Geschaeftskonten und das Kreditkartenkonto. Alle drei sollen
-- im Zahlungsabgleich auftauchen, getrennt erkennbar.
--
-- Warum eine eigene Tabelle und nicht einfach alles annehmen, was das
-- Abrufprogramm schickt: Die Annahmestelle hat bisher geprueft, ob die
-- Umsaetze zum erwarteten Konto gehoeren. Diese Sicherung bleibt. Ein
-- neues Konto wird vermerkt, aber erst uebernommen, wenn es hier
-- freigeschaltet ist. So landet kein Privatkonto versehentlich im
-- Programm, nur weil auf dem Rechner im Haus eine Zeile falsch steht.
--
-- Gespeichert werden ausschliesslich die letzten vier Stellen. Die
-- vollstaendige IBAN steht nirgends in dieser Datenbank.

begin;

create table if not exists bank_konto (
  -- Die letzten vier Stellen, so wie sie das Abrufprogramm meldet.
  endet_auf    text primary key,
  bezeichnung  text not null default '',
  -- giro oder kreditkarte
  art          text not null default 'giro' check (art in ('giro', 'kreditkarte')),
  -- Erst ein freigeschaltetes Konto wird eingelesen.
  aktiv        boolean not null default false,
  zuerst_am    timestamptz not null default now(),
  zuletzt_am   timestamptz,
  zuletzt_umsaetze int not null default 0
);

-- Das bisher abgerufene Konto ist selbstverstaendlich freigeschaltet.
insert into bank_konto (endet_auf, bezeichnung, art, aktiv)
select konto_endet_auf, 'Geschaeftskonto', 'giro', true
  from bank_stand
 where konto_endet_auf is not null and konto_endet_auf <> ''
on conflict (endet_auf) do update set aktiv = true;

-- Zu welchem Konto ein Umsatz gehoert. Leer bei allem, was vor dieser
-- Aenderung eingelesen wurde: Damals gab es nur ein Konto.
alter table bank_umsatz add column if not exists konto text not null default '';

create index if not exists bank_umsatz_konto on bank_umsatz (konto, buchungstag desc);

commit;
