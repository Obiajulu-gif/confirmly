import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./font/**/*", "./templates/**/*", "./public/**/*"],
    "/receipts/**/*": ["./font/**/*", "./templates/**/*", "./public/**/*"],
    "/verify/**/*": ["./font/**/*", "./templates/**/*", "./public/**/*"],
    "/pay/**/*": ["./font/**/*", "./templates/**/*", "./public/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // geolocation=(self): merchants can set their store location from
            // the dashboard; third-party frames still get no access.
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
