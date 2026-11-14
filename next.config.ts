import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Payment proof screenshots come straight off a phone, where 2-4MB is
      // ordinary. The default server-action body cap is 1MB, which would
      // reject most of them with a framework error rather than our own
      // message. The action itself refuses anything over 5MB.
      bodySizeLimit: "6mb",
    },
  },

  // Analytics now lives on the Journal page; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/dashboard/analytics", destination: "/dashboard/journal", permanent: false }];
  },
};

export default nextConfig;
