/**
 * Wie viele Tage vor der Show geschrieben wird.
 *
 * Fuenf, nicht sieben. Der Unterschied klingt klein, entscheidet aber, wie
 * viele Gaeste die Mail ueberhaupt erreicht: Angeschrieben wird, wer zu
 * diesem Zeitpunkt schon gebucht hat. Zwei Tage spaeter sind spuerbar mehr
 * Karten verkauft, und diese Gaeste fielen bei sieben Tagen ganz durchs
 * Raster -- sie haetten ihre Mail schon verpasst, bevor sie gebucht haben.
 *
 * Nach unten begrenzt es die Kueche: Das Menue laesst sich bis 17 Uhr am
 * Showtag buchen, aber wer erst am Vortag fragt, bekommt kaum noch jemanden
 * dazu, der seinen Abend schon verplant hat. Fuenf Tage lassen dem Gast ein
 * Wochenende zum Ueberlegen und der Kueche jede Freiheit.
 *
 * Steht in einer eigenen Datei, damit der Textbaustein und der taegliche
 * Lauf dieselbe Zahl benutzen, ohne sich gegenseitig zu importieren.
 */
export const VORLAUF_TAGE = 5;
