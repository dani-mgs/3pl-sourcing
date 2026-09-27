import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/dashboard/:path*",
        destination: "/3pl-sourcing/:path*",
        permanent: true,
      },
      {
        source: "/projects/:path*",
        destination: "/3pl-sourcing/projects/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
