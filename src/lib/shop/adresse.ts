/**
 * Die Adresse des Ticketshops, an einer Stelle.
 *
 * Gelesen wird über die öffentliche Shop-Adresse, also über denselben
 * Weg, den jeder Besucher der Seite ohnehin auslöst. Dahinter antwortet
 * seit dem 20.10.2026 FloTix, nicht mehr Ditix: Die Routen heißen noch
 * /api/ditix/..., die Zahlen kommen aus unserem eigenen Backend.
 *
 * Warum das hier steht: Der Standard war bisher an sieben Stellen
 * einzeln eingetragen, und zwar als shop.florianzimmertheater.de. Diese
 * Adresse ist nur noch eine Umleitung auf die Hauptadresse. Solange die
 * Umleitung steht, geht es gut; nimmt sie jemand weg, fallen Spielplan,
 * Preise, Saalplan und Auslastung gleichzeitig aus, und zwar still.
 *
 * "greifst du bei noch irgendeinem punkt auf ditix zurück?" (Florian,
 * 30.10.2026). Hier nicht mehr, und ab jetzt ohne den Umweg.
 */

export const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://florianzimmertheater.de";
