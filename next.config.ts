import { readFileSync } from "fs";
import { join } from "path";
import type { NextConfig } from "next";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    // Captured once when this config loads (build start for `next build`,
    // dev server start for `next dev`) so it reflects the running build,
    // not the moment each page happens to render.
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
