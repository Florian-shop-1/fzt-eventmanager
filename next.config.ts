import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Beim Entwickeln wird das Programm auch über 127.0.0.1 aufgerufen (zweite
  // Sitzung im Testbrowser). Ohne diesen Eintrag blockiert Next.js dort die
  // eigenen Skripte, und alles, was im Browser laufen muss, bleibt stumm.
  allowedDevOrigins: ["127.0.0.1"],

  /*
    Die Bilder fuer das Angebots-PDF muessen mit auf den Server.

    Next.js nimmt nur mit, was im Code importiert wird. Diese Bilder
    werden aber zur Laufzeit gelesen, nicht importiert, und fehlten
    deshalb nach dem Hochladen. Hier stehen sie namentlich drin
    (Florian, 25.09.2026).
  */
  outputFileTracingIncludes: {
    "/**": ["./src/lib/angebot/bilder/**"],
  },
};

export default nextConfig;
