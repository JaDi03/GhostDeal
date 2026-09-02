/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Do not auto-write root AGENTS.md / CLAUDE.md on next dev.
  agentRules: false,
  // starknetkit ships untranspiled ESM (svelte connectors). Desktop Connect
  // does not import it; Ready in-app Connect does, via dynamic import.
  transpilePackages: ["starknetkit"],
  // Next serves app/manifest.ts at /manifest.webmanifest. Browsers and some
  // wallet extensions still request the historical /manifest.json path.
  async rewrites() {
    return [{ source: "/manifest.json", destination: "/manifest.webmanifest" }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Secrets live in localStorage: keep the app out of frames and
          // quiet on referrers to shrink the XSS and metadata surface.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
}

module.exports = nextConfig
