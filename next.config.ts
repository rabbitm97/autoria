import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages use Node.js APIs and must not be bundled by webpack/turbopack
  serverExternalPackages: [
    "mammoth",
    "pdf-parse",
    "sharp",
    "@google/genai",
    "@react-pdf/renderer",
    "jszip",
  ],

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
