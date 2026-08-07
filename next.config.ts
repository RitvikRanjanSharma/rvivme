import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Turbopack warns and guesses a root when it finds multiple lockfiles
  // while walking up the directory tree (e.g. a stray package-lock.json in
  // C:\Users\Ritvik). Pinning it here removes the ambiguity regardless of
  // what else exists on the machine outside this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;