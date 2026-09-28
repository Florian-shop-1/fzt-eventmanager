-- Der Kurzbefehl-Link zum automatischen Ausstempeln ist wieder weg
-- (Florian, 29.09.2026): Das klingt zu sehr nach "das Programm hat mich
-- ausgestempelt", und genau das soll die Stempeluhr nicht mehr tun.
-- Ausstempeln geschieht nur noch, wenn der Mitarbeiter selbst in der
-- Stempeluhr auf den Knopf tippt. stempel_token diente ausschliesslich
-- diesem Link, die Tabelle wird deshalb nicht mehr gebraucht.

drop table if exists stempel_token;
