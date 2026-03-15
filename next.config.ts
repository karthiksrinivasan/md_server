import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    MD_SERVE_ROOT: process.env.MD_SERVE_ROOT ?? "",
    MD_SERVE_PORT: process.env.MD_SERVE_PORT ?? "3030",
    MD_SERVE_FILTERS: process.env.MD_SERVE_FILTERS ?? "",
  },
};

export default nextConfig;
