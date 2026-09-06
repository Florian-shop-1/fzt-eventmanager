-- Der eindeutige Index war bedingt angelegt, und das ging nicht auf.
--
-- Gedacht war: Jeder Zugang hat höchstens eine Vereinbarung, Personen
-- ohne Zugang dürfen mehrere Zeilen ohne Kennung haben. Deshalb stand da
-- ein Index mit "where benutzer_id is not null".
--
-- Beim Speichern wird die Zeile mit "insert ... on conflict (benutzer_id)
-- do update" angelegt oder aktualisiert. Postgres kann einen bedingten
-- Index dafür aber nur benutzen, wenn dieselbe Bedingung im Befehl
-- wiederholt wird. Sonst bricht es ab: "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- Die Bedingung braucht es gar nicht. In einem eindeutigen Index gelten
-- in Postgres mehrere leere Werte als verschieden, es dürfen also
-- beliebig viele Zeilen ohne Kennung nebeneinander stehen. Ein
-- gewöhnlicher Index tut damit genau dasselbe und funktioniert.

drop index if exists geheimhaltung_benutzer;

create unique index if not exists geheimhaltung_benutzer
  on geheimhaltung (benutzer_id);
