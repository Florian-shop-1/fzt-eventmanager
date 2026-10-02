-- Welche Show, und wofür genau der Techniker (Florian, 02.10.2026).
--
-- "Wenn ein Event oder Dienstplan ausser der reihe selber angelegt wird
-- im Eventmanager, dann musst du abfragen, ob mit show, dann welcher
-- (Ulmfassbar, Flo-zirkus, Andere: ...welche?). dann als nächstes, ob ein
-- techniker gebraucht wird? für was genau wird dieser gebraucht."
--
-- Bisher stand nur "mit Show" oder "ohne Show" fest. Welche Show es ist,
-- entscheidet aber darüber, wer eingeteilt wird: Den Flo-Zirkus macht Ben
-- allein, die Ulmfassbar braucht das ganze Showteam. Und ein Abend ohne
-- Show braucht oft nur jemanden, der den Showroom einschaltet, was jeder
-- kann, manchmal aber eine Programmierung, die nur Lenny oder Leeven
-- macht. Wer das nicht beim Anlegen aufschreibt, ruft es am Showtag
-- hinterher.

-- 'ulmfassbar', 'flozirkus' oder 'andere'. Leer bei Abenden ohne Show.
alter table eigener_termin add column if not exists show_art text not null default '';
-- Bei 'andere': wie die Show heißt.
alter table eigener_termin add column if not exists show_name text not null default '';
-- Wofür der Techniker gebraucht wird, im Klartext.
alter table eigener_termin add column if not exists technik_aufgaben text not null default '';
