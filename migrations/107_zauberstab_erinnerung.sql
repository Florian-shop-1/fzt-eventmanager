-- Der Zauberstab wartet: Teilnahme ohne Anschrift, Erinnerung am Tag darauf.
--
-- Bis zum 30.09.2026 ging die Bestätigungsmail sofort nach dem Absenden
-- hinaus und bat um die Anschrift. Wer sie eine Zeile später eingetippt
-- hatte, wurde also nach etwas gefragt, das er schon gegeben hatte
-- (Florian). Jetzt kommt die Mail erst mit der Anschrift.
--
-- Damit niemand vergessen wird, der nur mitgemacht und die Anschrift
-- offen gelassen hat, steht er trotzdem hier, nur ohne Straße. Am Tag
-- darauf bekommt er eine Erinnerung mit einem eigenen Link, über den er
-- die Anschrift nachtragen kann, ohne sich noch einmal anzumelden.

begin;

alter table zauberstab_versand add column if not exists token text;
alter table zauberstab_versand add column if not exists erinnert_am timestamptz;
alter table zauberstab_versand add column if not exists bestaetigt_am timestamptz;

create unique index if not exists zauberstab_token on zauberstab_versand (token) where token is not null;

-- Wer noch keine Anschrift hinterlassen hat, steht hier vorn.
create index if not exists zauberstab_ohne_anschrift
  on zauberstab_versand (eingegangen_am) where strasse = '';

commit;
