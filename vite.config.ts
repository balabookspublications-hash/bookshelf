import vinext from "vinext";
import { defineConfig, type UserConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const useNitro =
  process.env.NITRO_PRESET === "vercel" || process.env.VERCEL === "1";

export default defineConfig(async () => {
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const plugins: NonNullable<UserConfig["plugins"]> = [vinext()];

  let css: UserConfig["css"];

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
