-- T1 und T2 sind im Haus andersherum benannt (Florian, 21.09.2026).
--
-- Ben ist T2 (jede Show, Flo-Zirkus allein), Mario, Julian, Noel und die
-- anderen sind T1. Bisher war es im Programm vertauscht. Damit die Namen
-- im Dienstplan zu dem passen, was im Haus gesagt wird, werden die
-- gespeicherten Werte einmalig getauscht.

alter table dienst_quali drop constraint if exists dienst_quali_position_check;
alter table dienst_fest drop constraint if exists dienst_fest_position_check;
alter table dienst_einsatz drop constraint if exists dienst_einsatz_position_check;

update dienst_quali set position = 'TX' where position = 'T1';
update dienst_quali set position = 'T1' where position = 'T2';
update dienst_quali set position = 'T2' where position = 'TX';

update dienst_fest set position = 'TX' where position = 'T1';
update dienst_fest set position = 'T1' where position = 'T2';
update dienst_fest set position = 'T2' where position = 'TX';

update dienst_einsatz set position = 'TX' where position = 'T1';
update dienst_einsatz set position = 'T1' where position = 'T2';
update dienst_einsatz set position = 'T2' where position = 'TX';

alter table dienst_quali add constraint dienst_quali_position_check check (position in ('FOH', 'T2', 'T1'));
alter table dienst_fest add constraint dienst_fest_position_check check (position in ('FOH', 'T2', 'T1'));
alter table dienst_einsatz add constraint dienst_einsatz_position_check check (position in ('FOH', 'T2', 'T1', 'SHADOW'));
