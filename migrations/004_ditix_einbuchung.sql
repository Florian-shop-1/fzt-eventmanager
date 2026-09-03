-- Merkt sich, ob ein Firmenevent bereits in Ditix eingebucht ist.
--
-- Hintergrund: Ditix gilt als führende Quelle für die Menüzahl. Sobald ein
-- Firmenevent dort eingebucht ist, taucht es in der Menüliste auf. Zählt das
-- Programm dann zusätzlich seine eigenen Zahlen mit, steht dieselbe Gruppe
-- doppelt in der Belegung.
--
-- Deshalb: Ist ditix_eingebucht gesetzt, liefert Ditix die Zahl und der
-- Vorgang wird nicht mehr addiert. Die Bestellnummern erlauben zusätzlich
-- den Abgleich, ob dort auch wirklich so viele Menüs stehen wie vereinbart.

alter table vorgang add column if not exists ditix_eingebucht boolean not null default false;
alter table vorgang add column if not exists ditix_eingebucht_am timestamptz;
alter table vorgang add column if not exists ditix_eingebucht_von text;

-- Bestellnummern aus Ditix, kommagetrennt. Ein Firmenevent kann in mehreren
-- Bestellungen eingebucht sein, etwa getrennt nach Ticketkategorie.
alter table vorgang add column if not exists ditix_order_ids text;

comment on column vorgang.ditix_eingebucht is
  'true bedeutet: die Menüs stehen in Ditix. Ab dann zählt allein die Ditix-Zahl.';
