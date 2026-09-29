-- Urlaub, krank oder privat (Florian, 29.09.2026).
--
-- Bisher stand in dienst_abwesend nur ein Freitext als Grund. Für den
-- Dienstplan reichte das: Dort zählt allein, dass jemand nicht kann.
--
-- Für die Lohnabrechnung reicht es nicht. Frau Buschow im Steuerbüro
-- braucht getrennt, wer Urlaub hatte und wer krank war, denn beides wird
-- unterschiedlich abgerechnet.
--
-- Die vorhandenen Einträge bekommen ihre Art aus dem Grund, so gut das
-- geht. Wo nichts passt, steht "privat": Das ist die harmloseste
-- Annahme, denn daraus folgt keine falsche Lohnbuchung.

begin;

alter table dienst_abwesend add column if not exists art text not null default 'privat'
  check (art in ('urlaub', 'krank', 'privat'));

-- Ganze Wörter, keine Wortteile: "%au%" hätte auch "Hausbau" und "Auto"
-- zu einer Krankmeldung gemacht.
update dienst_abwesend
   set art = case
     when grund ~* '(urlaub|ferien)' then 'urlaub'
     when grund ~* '(krank|arzt|\yau\y|\yakw\y)' then 'krank'
     else 'privat'
   end
 where art = 'privat';

create index if not exists dienst_abwesend_art on dienst_abwesend (art, von);

commit;
