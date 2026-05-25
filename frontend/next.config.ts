import type { NextConfig } from "next";

const FLASK_API = process.env.FLASK_API_URL ?? "http://localhost:5001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${FLASK_API}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
