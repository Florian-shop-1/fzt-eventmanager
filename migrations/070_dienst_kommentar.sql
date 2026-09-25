-- Kommentare unter jeder Show im Dienstplan (Florian, 23.09.2026).
--
-- Bisher gab es nur die Notiz an eine einzelne Person beim Anfragen. Das
-- Showteam redet aber über die Show, nicht über eine Zeile: "Ich bin
-- später da", "Wer bringt die Requisite mit?", "Achtung, Gruppe mit 40
-- Leuten". Genau dafür ist das hier, wie unter einem Beitrag bei
-- Facebook: schreiben, antworten, Herz geben.
--
-- Gehängt an die Ditix-Terminnummer, weil daran auch die Einteilung
-- hängt. Antworten zeigen mit antwort_auf auf den Kommentar darüber,
-- eine Ebene tief, mehr wird unübersichtlich.
--
-- Gelöscht wird nicht wirklich: geloescht_am setzt den Text auf
-- unsichtbar, die Antworten darunter bleiben lesbar.

create table if not exists dienst_kommentar (
  id             uuid primary key default gen_random_uuid(),
  ditix_event_id text not null,
  antwort_auf    uuid references dienst_kommentar (id) on delete cascade,
  benutzer_id    uuid not null references benutzer (id) on delete cascade,
  text           text not null check (length(btrim(text)) > 0),
  erstellt_am    timestamptz not null default now(),
  geloescht_am   timestamptz
);

create index if not exists dienst_kommentar_termin on dienst_kommentar (ditix_event_id, erstellt_am);

-- Ein Herz je Person und Kommentar, nochmal tippen nimmt es zurück.
create table if not exists dienst_kommentar_herz (
  kommentar_id uuid not null references dienst_kommentar (id) on delete cascade,
  benutzer_id  uuid not null references benutzer (id) on delete cascade,
  gesetzt_am   timestamptz not null default now(),
  primary key (kommentar_id, benutzer_id)
);
