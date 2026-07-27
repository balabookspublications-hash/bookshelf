import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const skillRoot = path.join(
  root,
  ".agents",
  "skills",
  "mint-threejs-skills",
);
const upstreamCommit = "e563354fae765ef49b6b0e2bd6b695554689ba40";

const requiredSkillFiles = [
  "LICENSE",
  "README.md",
  "SKILL.md",
  "references/asset-pipeline.md",
  "references/gltf-runtime-compatibility.md",
  "references/mint-mcp-assets.md",
  "scripts/sync-mint-assets.mjs",
  "skills/threejs-app-director/SKILL.md",
  "skills/threejs-debug-profiler/SKILL.md",
  "skills/threejs-game-director/SKILL.md",
  "skills/threejs-game-ui-designer/SKILL.md",
  "skills/threejs-gameplay-systems/SKILL.md",
  "skills/threejs-interaction-systems/SKILL.md",
  "skills/threejs-qa-release/SKILL.md",
  "skills/threejs-visual-systems/SKILL.md",
];

const problems = [];

for (const relativePath of requiredSkillFiles) {
  const absolutePath = path.join(skillRoot, relativePath);

  try {
    const stats = await lstat(absolutePath);
    if (!stats.isFile()) {
      problems.push(`${relativePath} is not a regular file`);
    }
    if (stats.isSymbolicLink()) {
      problems.push(`${relativePath} must be vendored, not symlinked`);
    }
  } catch {
    problems.push(`${relativePath} is missing`);
  }
}

const configPath = path.join(root, ".codex", "config.toml");
let config = "";

try {
  config = await readFile(configPath, "utf8");
} catch {
  problems.push(".codex/config.toml is missing");
}

if (!config.includes("[mcp_servers.mint]")) {
  problems.push(".codex/config.toml does not define mcp_servers.mint");
}
if (!config.includes('url = "https://mcp.mint.gg/mcp"')) {
  problems.push(".codex/config.toml does not use the production Mint MCP URL");
}
if (!config.includes('auth = "oauth"')) {
  problems.push(".codex/config.toml does not configure OAuth");
}

if (problems.length > 0) {
  console.error("Mint tooling check failed:");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Mint MCP and Mint Three.js Skills are present (upstream ${upstreamCommit.slice(0, 12)}).`,
  );
}
