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
        source: "/3pl-sourcing/projects/:id/comparison",
        destination: "/3pl-sourcing/projects/:id",
        permanent: true,
      },
      {
        source: "/projects/:id/comparison",
        destination: "/3pl-sourcing/projects/:id",
        permanent: true,
      },
      {
        source: "/3pl-sourcing/projects/:id/providers/:providerId/rates",
        destination: "/3pl-sourcing/projects/:id/providers/:providerId",
        permanent: true,
      },
      {
        source: "/projects/:id/providers/:providerId/rates",
        destination: "/3pl-sourcing/projects/:id/providers/:providerId",
        permanent: true,
      },
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
