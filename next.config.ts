import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages use Node.js APIs and must not be bundled by webpack/turbopack
  serverExternalPackages: ["mammoth", "pdf-parse", "sharp", "openai"],
};

export default nextConfig;
