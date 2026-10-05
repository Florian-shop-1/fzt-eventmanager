-- Wer noch schnuppert.
--
-- Christian probiert bei den Proben mit, gestempelt wird trotzdem: Wer im
-- Haus ist, soll im Haus gestempelt sein. Seine Stunden gehen aber NICHT
-- ans Lohnbüro, so war es ausgemacht (Florian, 05.10.2026).
--
-- Deshalb ein Kennzeichen an der Person und nicht an einzelnen Stempeln:
-- Es gilt, solange jemand schnuppert, und faellt weg, sobald er anfaengt.
-- Was in der Zeit gestempelt wurde, bleibt sichtbar und nachvollziehbar,
-- es wird nur nicht gemeldet.
alter table benutzer add column if not exists schnuppert boolean not null default false;

-- Seit wann, fuer die Anzeige. Erst ab diesem Tag gilt das Kennzeichen,
-- damit spaetere Stunden eines echten Mitarbeiters nicht nachtraeglich
-- aus der Meldung fallen, wenn jemand den Haken aus Versehen setzt.
alter table benutzer add column if not exists schnuppert_seit date;
