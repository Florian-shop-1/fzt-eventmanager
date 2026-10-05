/**
 * Was aelteren Browsern fehlt, bevor das Programm startet.
 *
 * Auf dem iPad im Haus laeuft eine aeltere Safari-Fassung. Dort blieb die
 * Seite stumm: Man konnte tippen, so viel man wollte, nichts reagierte
 * (Florian, 05.10.2026). Grund ist nicht der Eventmanager selbst,
 * sondern Next.js: Es baut von sich aus nur fuer Safari 16.4 und neuer
 * und verwendet dabei Funktionen, die aeltere Fassungen nicht kennen.
 * Eine davon reicht, und der ganze Browser steigt aus.
 *
 * Die Bauvorgabe in package.json ("browserslist") kuemmert sich um die
 * Schreibweise des Programms. Was hier steht, sind die Funktionen, die
 * damit nicht mitkommen: Sie werden nachgereicht, falls sie fehlen.
 *
 * Diese Datei laeuft, bevor die Seite bedienbar wird (siehe
 * node_modules/next/dist/docs, instrumentation-client.md). Jeder Eintrag
 * prueft erst, ob es die Funktion schon gibt, und laesst sie sonst in
 * Ruhe.
 */

function nachreichen(ziel: object, name: string, wert: unknown) {
  if (name in ziel) return;
  Object.defineProperty(ziel, name, {
    value: wert,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/** Array.prototype.at und String.prototype.at, ab Safari 15.4. */
function at(this: { length: number; [i: number]: unknown }, n: number) {
  const i = Math.trunc(n) || 0;
  const k = i < 0 ? this.length + i : i;
  return k < 0 || k >= this.length ? undefined : this[k];
}

nachreichen(Array.prototype, "at", at);
nachreichen(String.prototype, "at", at);

/** Array.prototype.findLast und findLastIndex, ab Safari 15.4. */
nachreichen(Array.prototype, "findLast", function (
  this: unknown[],
  pruefen: (wert: unknown, i: number, liste: unknown[]) => boolean,
) {
  for (let i = this.length - 1; i >= 0; i--) {
    if (pruefen(this[i], i, this)) return this[i];
  }
  return undefined;
});

nachreichen(Array.prototype, "findLastIndex", function (
  this: unknown[],
  pruefen: (wert: unknown, i: number, liste: unknown[]) => boolean,
) {
  for (let i = this.length - 1; i >= 0; i--) {
    if (pruefen(this[i], i, this)) return i;
  }
  return -1;
});

/** Object.hasOwn, ab Safari 15.4. */
nachreichen(Object, "hasOwn", (o: object, k: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(o, k),
);

/** structuredClone, ab Safari 15.4. Hier nur die einfache Fassung. */
if (typeof window !== "undefined" && !("structuredClone" in window)) {
  nachreichen(window, "structuredClone", (wert: unknown) =>
    wert === undefined ? undefined : JSON.parse(JSON.stringify(wert)),
  );
}
