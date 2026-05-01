import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Pick up the repo-root .env (where the AI keys live) so server-rendered
// AI calls work in `highli web` and `next dev` from this workspace.
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "..", ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["@highli/core", "@highli/sources"],
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    AI_PROVIDER: process.env.AI_PROVIDER ?? "anthropic",
    AI_MODEL: process.env.AI_MODEL ?? "claude-sonnet-4-5",
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
