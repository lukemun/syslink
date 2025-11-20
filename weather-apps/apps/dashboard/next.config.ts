import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for OpenNext/AWS Lambda deployment
  output: "standalone",
  experimental: {
    // Allow imports from outside the app directory
    externalDir: true,
  },
};

export default nextConfig;
