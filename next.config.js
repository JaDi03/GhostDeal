/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Do not auto-write root AGENTS.md / CLAUDE.md on next dev.
  agentRules: false,
  // starknetkit ships untranspiled ESM (svelte connectors). Desktop Connect
  // does not import it; Ready in-app Connect does, via dynamic import.
  transpilePackages: ["starknetkit"],
}

module.exports = nextConfig
