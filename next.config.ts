import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Public catalog pages revalidate every 60 s; after that a CDN may serve the old
  // copy at most until this many seconds since it was rendered.
  expireTime: 180,
  // Catalog images are served straight from Cloud Storage as <img> tags
  // (thumbnails are generated in the browser), so the image optimizer is unused.
  images: { unoptimized: true },
  // Keep firebase-admin (and its gRPC deps) as external packages on the server.
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [
      {
        // Nothing on this site is meant to be framed (clickjacking of the consent screen,
        // which can also be reached by client-side navigation from /login).
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/oauth/authorize",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
