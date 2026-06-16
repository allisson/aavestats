/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: every read runs in the browser against public RPCs, so there
  // is no server to deploy (see docs/adr/0005). `next build` emits ./out.
  output: "export",
  // Deployed as a GitHub Pages project page at allisson.github.io/aavestats/
  // (see docs/adr/0006). basePath prefixes routes and assets so they resolve
  // under the subpath; it applies in dev too (localhost:3000/aavestats).
  basePath: "/aavestats",
};

export default nextConfig;
