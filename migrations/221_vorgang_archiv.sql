-- Vorgänge archivieren, statt sie ewig in der Liste zu lassen.
--
-- "bei dieser ewig langen liste von vorgängen muss es die möglichkeit
-- geben zu archivieren. bzw. als verloren zu markieren oder zu löschen,
-- dass es verschwindet" (Florian, 30.10.2026).
--
-- Archiviert heißt: aus dem Weg, aber nicht weg. Die Zeile bleibt mit
-- allem dran, sie steht nur nicht mehr in der täglichen Liste. Wer sie
-- sucht, schaltet auf Archiv um und holt sie mit einem Klick zurück.

alter table vorgang add column if not exists archiviert_am  timestamptz;
alter table vorgang add column if not exists archiviert_von text;

-- Warum ein Angebot nicht zustande kam. Steht im Vorgang und in der
-- Liste, damit man beim nächsten Angebot daraus lernen kann.
alter table vorgang add column if not exists verloren_grund text;

create index if not exists vorgang_archiv_idx on vorgang (archiviert_am);
