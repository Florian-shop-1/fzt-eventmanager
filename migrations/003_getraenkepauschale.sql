-- Getränkepauschale je Gruppe.
--
-- Bei Firmenevents ist die Flatrate meistens im Paket enthalten und gilt für
-- die ganze Gruppe, nicht für einzelne Gäste. Die Küche und der Service
-- brauchen daraus vor allem eine Zahl: wie viele Armbänder ausgegeben werden.

alter table gruppe add column if not exists getraenkepauschale text;

comment on column gruppe.getraenkepauschale is
  'Artikelnummer der Getränkepauschale aus artikel.ts, zum Beispiel FLATALL. NULL bedeutet keine.';
