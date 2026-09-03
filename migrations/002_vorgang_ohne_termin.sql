-- Ein Vorgang darf auch ohne feste Vorstellung bestehen.
--
-- Grund: Die meisten Anfragen kommen ohne Termin herein. In der Leadliste
-- steht bei vielen als Wunschdatum nur "in_den_nächsten_3_monaten" oder gar
-- nichts. Trotzdem soll ein Angebot geschrieben werden können. Der Termin
-- wird nachgetragen, sobald der Kunde sich festgelegt hat.

alter table vorgang alter column vorstellung_id drop not null;

-- Ohne Termin gibt es auch keine Personenzahl aus dem Sitzplan. Deshalb
-- bekommt der Vorgang ein Feld für die grobe Angabe aus der Anfrage,
-- zum Beispiel "11-50" oder "ca. 20".
alter table vorgang add column if not exists personen_ungefaehr text;

-- Wunschzeitraum in Worten, solange kein Termin feststeht.
alter table vorgang add column if not exists wunschzeitraum text;

comment on column vorgang.vorstellung_id is
  'NULL bedeutet: Termin steht noch nicht fest. Dann gelten personen_ungefaehr und wunschzeitraum.';
