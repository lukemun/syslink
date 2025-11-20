import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow imports from outside the app directory
    externalDir: true,
  },
};

export default nextConfig;
