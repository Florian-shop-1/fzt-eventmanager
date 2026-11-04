-- Eingeladene Gäste: Mailadresse, Einlader und die Bitte um eine Bewertung.
--
-- "frag die email adresse ab und trag die leute in die magic-news ein. sie
-- sollen nach der show auch eine bewertung-mail kriegen. bei denen kannst du
-- auch bezug drauf nehmen, dass sie freikarten geschenkt bekommen haben von
-- XXX z.B. veronika" (Florian, 04.11.2026).
--
-- Zur Einwilligung, damit es später niemand sucht: Es gibt bewusst kein
-- Häkchen "hat zugestimmt". Wer auf dieser Liste steht, hat vorher
-- zugestimmt, sonst stünde er nicht darauf. "sie kommen ja erst nach deren
-- zustimmung auf die gästeliste.. die frage ist also bereits beantwortet und
-- verwirrt den einlass nur" (Florian, 04.11.2026). Eine eingetragene
-- Mailadresse ist deshalb die Zustimmung; ohne Adresse geht nichts hinaus.

alter table gaesteliste add column if not exists email            text;
-- Wer eingeladen hat. Steht in der Mail: "Veronika hat dich eingeladen."
alter table gaesteliste add column if not exists eingeladen_von   text;

-- Eigener Schlüssel für den Link in der Mail. Ohne ihn liesse sich der
-- Klick nicht zuordnen und die Erinnerung ginge an alle.
alter table gaesteliste add column if not exists token            text;

alter table gaesteliste add column if not exists bewertung_mail_am       timestamptz;
alter table gaesteliste add column if not exists bewertung_klick_am      timestamptz;
alter table gaesteliste add column if not exists bewertung_erinnerung_am timestamptz;
-- Wann der Gast in die Magic News übernommen wurde. Leer heisst: noch nicht.
alter table gaesteliste add column if not exists newsletter_am           timestamptz;

create unique index if not exists gaesteliste_token on gaesteliste (token) where token is not null;
create index if not exists gaesteliste_bewertung on gaesteliste (datum) where email is not null;
