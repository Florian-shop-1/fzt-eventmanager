/**
 * Das Begleitschreiben zum Zauberstab, eine A4-Seite auf dem Briefbogen.
 *
 * Es liegt als eigenes Bauteil hier, weil es an zwei Stellen gebraucht
 * wird: auf der Zauberstabseite und im Druckstapel der Versandliste.
 * Gedruckt wird auf denselben Briefbogen wie beim Gutscheinversand, in
 * denselben Umschlag, mit derselben Anschrift im Fenster (Florian,
 * 30.09.2026: "es geht in einen normalen umschlag").
 */

import {
  ABSENDERZEILE,
  KONTAKTZEILE,
  UNTERSCHRIFT_ROLLE,
} from "@/lib/shop/anschreiben";
import {
  ZAUBERSTAB_ABSAETZE,
  ZAUBERSTAB_GRUSS,
  ZAUBERSTAB_UEBERSCHRIFT,
  zauberstabAnrede,
} from "@/lib/shop/zauberstab-brief";
import type { Zauberstab } from "@/lib/shop/zauberstab";
import { datumLang } from "@/lib/zeit";

export function ZauberstabBrief({ z }: { z: Zauberstab }) {
  return (
    <div className="druckblatt relative overflow-hidden" style={{ width: "210mm", height: "296.9mm" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bilder/briefbogen.jpg"
        alt=""
        className="absolute inset-0"
        style={{ width: "210mm", height: "297mm" }}
      />

      <div
        className="absolute text-right text-[9pt] leading-snug text-leise"
        style={{ right: "19mm", top: "41mm" }}
      >
        <div>Neu-Ulm, {datumLang(new Date().toISOString().slice(0, 10))}</div>
      </div>

      <div className="absolute" style={{ left: "19mm", top: "50mm", width: "105mm" }}>
        <div className="text-[8pt] leading-tight text-leise">{ABSENDERZEILE}</div>
        <address className="not-italic text-[12pt] leading-snug" style={{ marginTop: "2.5mm" }}>
          <div>{z.name}</div>
          <div>{z.strasse}</div>
          <div>
            {z.plz} {z.ort}
          </div>
        </address>
      </div>

      <div className="absolute" style={{ left: "19mm", right: "19mm", top: "88mm", bottom: "30mm" }}>
        <h2 className="text-[16pt]">{ZAUBERSTAB_UEBERSCHRIFT}</h2>

        <p className="text-[12pt]" style={{ marginTop: "8.5mm" }}>
          {zauberstabAnrede(z.vorname || z.name)}
        </p>

        <div className="text-[12pt] leading-relaxed">
          {[...ZAUBERSTAB_ABSAETZE, ZAUBERSTAB_GRUSS].map((absatz, i) => (
            <p key={i} style={{ marginTop: "5.6mm" }}>
              {absatz}
            </p>
          ))}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bilder/unterschrift.png"
          alt="Florian Zimmer"
          style={{ height: "16mm", marginTop: "3mm" }}
        />
        <p className="text-[9pt] text-leise">{UNTERSCHRIFT_ROLLE}</p>
      </div>

      <div
        className="absolute text-center text-[8pt] text-leise"
        style={{ left: "19mm", right: "19mm", top: "278.6mm", lineHeight: 1.25 }}
      >
        <div>{ABSENDERZEILE}</div>
        <div>{KONTAKTZEILE}</div>
      </div>
    </div>
  );
}

