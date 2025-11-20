/**
 * Next.js Configuration for Weather Alerts Dashboard
 * 
 * Configures Next.js for standalone deployment (useful for containerization)
 * and allows external directory imports for flexibility in project structure.
 */

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

