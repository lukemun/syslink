/**
 * Next.js Configuration for Weather Alerts Dashboard
 * 
 * Allows external directory imports for flexibility in project structure.
 * Configured for Vercel deployment.
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow imports from outside the app directory
    externalDir: true,
  },
};

export default nextConfig;

