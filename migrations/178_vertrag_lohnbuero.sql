-- Eine Mail ans Lohnbüro, wenn beides da ist (Florian, 15.10.2026).
--
-- "bitte mach es in Zukunft so, dass die Mail an Werner und Buschow erst
-- ausgelöst wird, wenn Personalbogen und Arbeitsvertrag ausgefüllt sind.
-- Sie kriegt also eine Mail mit zwei Anhängen."
--
-- Hier steht, wann das Paket hinausgegangen ist. Am Vertrag und nicht an
-- der Person, damit ein neuer Vertrag später eine neue Mail auslöst.
alter table arbeitsvertrag add column if not exists lohnbuero_am timestamptz;
