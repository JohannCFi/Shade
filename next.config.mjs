/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Unlink SDK ships native-ish crypto; keep it server-external where used.
  serverExternalPackages: ["@unlink-xyz/sdk"],
  // Source files use NodeNext-style ".js" import specifiers that resolve to
  // ".ts" sources. Teach webpack to map them (vitest/tsx already do).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
