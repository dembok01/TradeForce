import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Analytics now lives on the Journal page; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/dashboard/analytics", destination: "/dashboard/journal", permanent: false }];
  },
};

export default nextConfig;
