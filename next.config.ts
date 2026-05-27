import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages use Node.js APIs and must not be bundled by webpack/turbopack
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
    "mammoth",
    "sharp",
    "@google/genai",
    "@react-pdf/renderer",
    "jszip",
  ],

  // Arquivos não-JS que precisam ser copiados para o pacote da função serverless.
  // Sparticuz Chromium tem o binário comprimido em /bin/chromium.br que precisa
  // estar disponível em runtime; sem este tracing, a pasta bin/ não é copiada
  // e a função falha com "input directory does not exist".
  outputFileTracingIncludes: {
    "/api/agentes/gerar-pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/projects/[id]/cover-editor/export-pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },

  images: {
    remotePatterns: [
      // Supabase Storage (generated covers, manuscript assets)
      { protocol: "https", hostname: "*.supabase.co" },
      // Dev mock placeholder images
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
};

export default nextConfig;
