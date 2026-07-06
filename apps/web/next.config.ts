import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vertice/shared"],
  // Subir documentos de incapacidades (ST7, fotos) va por Server Action. El
  // límite por defecto de Next es 1MB → fotos/PDF de 2-6MB se rechazan ANTES
  // de llegar a la action. Lo subimos a 10MB (la action valida su propio máx de 6MB).
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Incluir las plantillas .docx de contratos en el bundle de la función
  // serverless que las lee (si no, Vercel no las empaqueta y fs.readFile falla).
  outputFileTracingIncludes: {
    "/api/contratos/[id]/docx": ["./src/lib/contratos/templates/*.docx"],
  },
};

export default nextConfig;
