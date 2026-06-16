/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: every read runs in the browser against public RPCs, so there
  // is no server to deploy (see docs/adr/0005). `next build` emits ./out.
  output: "export",
};

export default nextConfig;
