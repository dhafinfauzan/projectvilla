import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // The villas/booking experience was consolidated into /rooms (QloApps).
  async redirects() {
    return [
      { source: "/villas", destination: "/rooms", permanent: true },
      { source: "/villas/:slug", destination: "/rooms", permanent: true },
      { source: "/booking", destination: "/rooms", permanent: true },
      { source: "/booking/:path*", destination: "/rooms", permanent: true },
    ];
  },
};

export default nextConfig;
