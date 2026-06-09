import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vertice/shared"],
  // Incluir las plantillas .docx de contratos en el bundle de la función
  // serverless que las lee (si no, Vercel no las empaqueta y fs.readFile falla).
  outputFileTracingIncludes: {
    "/api/contratos/[id]/docx": ["./src/lib/contratos/templates/*.docx"],
  },
};

export default nextConfig;
