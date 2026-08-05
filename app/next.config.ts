import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // @google-analytics pulls a large native gRPC + protobuf dep cone that
  // the Next.js standalone tracer can't statically follow. Mark them as
  // serverExternalPackages so Next does NOT try to bundle them, and use
  // outputFileTracingIncludes with a node_modules wildcard to make sure
  // the runner image has all of them available on disk. Attempts to
  // whitelist every transitive (grpc/proto-loader→lodash.camelcase→…)
  // devolved into whack-a-mole.
  serverExternalPackages: [
    "@google-analytics/admin",
    "@google-analytics/data",
    "google-gax",
    "google-auth-library",
    "@grpc/grpc-js",
    "@grpc/proto-loader",
  ],
  outputFileTracingIncludes: {
    "/api/projects/analytics/**/*": ["./node_modules/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://www.googletagmanager.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://cloudflareinsights.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
