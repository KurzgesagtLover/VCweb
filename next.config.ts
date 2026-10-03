import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  experimental: {
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
};

export default nextConfig;
