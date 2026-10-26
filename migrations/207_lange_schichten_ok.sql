-- Wer keine Meldung über lange Schichten bekommt (Florian, 24.10.2026).
--
-- "dem Ben gehen wir nicht auf den Sack. der ist immer am arbeiten und
-- mein gott. wenn er mal länger macht ist es halt so :-)"
--
-- Gemeint ist nur die hausinterne Meldung ans Büro, dass jemand lange
-- eingestempelt ist. Die Pausenerinnerung bleibt für alle: Die steht im
-- Arbeitszeitgesetz und ist nicht unsere Entscheidung.
begin;

alter table benutzer
  add column if not exists lange_schichten_ok boolean not null default false;

update benutzer set lange_schichten_ok = true
 where lower(email) = 'benjamin.shchudlo@florianzimmer.com'
    or name ilike 'Benjamin Shchudlo';

commit;
