import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; load it with Node's require instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
