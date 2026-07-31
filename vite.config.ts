import vinext from "vinext";
import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

type HostingConfig = {
  d1: string | null;
  r2: string | null;
};

async function loadHostingConfig(): Promise<HostingConfig> {
  try {
    return JSON.parse(
      await readFile(new URL("./.openai/hosting.json", import.meta.url), "utf8"),
    ) as HostingConfig;
  } catch {
    return { d1: null, r2: null };
  }
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const useNitro =
  process.env.NITRO_PRESET === "vercel" || process.env.VERCEL === "1";

export default defineConfig(async () => {
  const { d1, r2 } = await loadHostingConfig();
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const plugins: NonNullable<
    Awaited<ReturnType<typeof defineConfig>>["plugins"]
  > = [vinext(), sites()];

  let css: Awaited<ReturnType<typeof defineConfig>>["css"];

  if (useNitro) {
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    const { nitro } = await import("nitro/vite");
    plugins.unshift(tailwindcss());
    plugins.push(nitro());
    css = {
      postcss: {
        plugins: [],
      },
    };
  } else {
    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
    ...(css ? { css } : {}),
  };
});
