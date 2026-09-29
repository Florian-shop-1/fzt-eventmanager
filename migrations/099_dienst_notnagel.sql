-- "Nur wenn Not am Mann ist" (Florian, 29.09.2026).
--
-- Wer sich einträgt, meint damit nicht immer dasselbe. Der eine will den
-- Abend, der andere springt ein, weil sonst niemand da ist, hätte aber
-- lieber frei. Bisher sah beides gleich aus, und der zweite blieb dann
-- auch eingeteilt, obwohl jemand anderes gern gekommen wäre.
--
-- Deshalb kann man beim Eintragen sagen, dass es nur im Notfall gilt.
-- Das steht dann neben dem Namen, und die anderen sehen, wo sie mit einer
-- Entlastung wirklich jemandem helfen.

begin;

alter table dienst_einsatz add column if not exists notnagel boolean not null default false;
alter table dienst_einsatz add column if not exists notnagel_grund text not null default '';

commit;
