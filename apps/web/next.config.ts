import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vertice/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
