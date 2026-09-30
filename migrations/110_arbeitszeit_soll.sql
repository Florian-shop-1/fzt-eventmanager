-- Regelarbeitszeit der Festangestellten und ihr Arbeitszeitkonto.
--
-- Ben arbeitet regelmäßig 80 Stunden im Monat, Olena 60 (Florian,
-- 30.09.2026). Wer weniger schafft, baut Minusstunden auf, und die rufen
-- wir ab. Mehrarbeit bis zu 10 Prozent der Monatsstunden ist mit dem
-- Gehalt abgegolten und ergibt keine Plusstunden; so steht es auch im
-- Teilzeitvertrag unter § 5.
--
-- Gespeichert wird nur die Vorgabe. Was daraus folgt, rechnet das
-- Programm jedes Mal neu aus den Stempeln: Ein gespeicherter Saldo wäre
-- falsch, sobald jemand eine Zeit korrigiert.

create table if not exists arbeitszeit_soll (
  benutzer_id uuid primary key references benutzer(id) on delete cascade,
  -- Regelarbeitszeit in Stunden pro Kalendermonat.
  monats_stunden numeric(6, 2) not null,
  -- Wie viel Mehrarbeit mit dem Gehalt abgegolten ist, in Prozent.
  korridor_prozent integer not null default 10,
  -- Ab wann gerechnet wird.
  seit date not null,
  notiz text not null default '',
  geaendert_von text not null default '',
  geaendert_am timestamptz not null default now()
);

-- Die beiden, die es heute betrifft. Weitere trägt das Büro selbst ein.
insert into arbeitszeit_soll (benutzer_id, monats_stunden, seit, notiz, geaendert_von)
select b.id, 80, date '2026-09-01', 'Regelarbeitszeit laut Absprache', 'Florian Zimmer'
  from benutzer b where lower(b.email) = 'benshchudlo@gmail.com'
on conflict (benutzer_id) do nothing;

insert into arbeitszeit_soll (benutzer_id, monats_stunden, seit, notiz, geaendert_von)
select b.id, 60, date '2026-09-01', 'Regelarbeitszeit laut Absprache', 'Florian Zimmer'
  from benutzer b where lower(b.email) = 'elenadanylovych77@gmail.com'
on conflict (benutzer_id) do nothing;
