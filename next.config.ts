import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Beim Entwickeln wird das Programm auch über 127.0.0.1 aufgerufen (zweite
  // Sitzung im Testbrowser). Ohne diesen Eintrag blockiert Next.js dort die
  // eigenen Skripte, und alles, was im Browser laufen muss, bleibt stumm.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
