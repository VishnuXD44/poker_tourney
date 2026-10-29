// BASE_PATH is set when building for bevishnu.com/poker; local dev serves from the root.
const basePath = process.env.BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every page is a client component, so the dashboard ships as static files.
  output: "export",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  // The in-browser arena imports the game engine from ../server/game.
  experimental: { externalDir: true },
};

module.exports = nextConfig;
