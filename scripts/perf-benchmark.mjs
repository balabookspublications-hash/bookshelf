#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = projectRequire("@playwright/test");

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:4173/",
    label: "run",
    out: "artifacts/perf",
    runs: 3,
    viewport: { width: 1280, height: 720 },
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--url") args.url = argv[++i];
    else if (value === "--label") args.label = argv[++i];
    else if (value === "--out") args.out = argv[++i];
    else if (value === "--runs") args.runs = Number(argv[++i]);
    else if (value === "-h" || value === "--help") {
      console.log(
        "Usage: perf-benchmark.mjs [--url URL] [--label NAME] [--out DIR] [--runs N]",
      );
      process.exit(0);
    }
  }

  return args;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

async function measureOnce(page) {
  await page.goto("about:blank");
  await page.addInitScript(() => {
    window.__PERF__ = {
      navStart: performance.now(),
      readyAt: null,
      firstFrameAt: null,
      frames: 0,
      frameTimes: [],
      lastFrame: performance.now(),
      rendererInfo: null,
    };

    const observer = new MutationObserver(() => {
      const root = document.querySelector(".press-experience.is-ready");
      if (root && window.__PERF__.readyAt === null) {
        window.__PERF__.readyAt = performance.now();
      }
    });

    const watch = () => {
      const root = document.querySelector(".press-experience");
      if (!root) {
        requestAnimationFrame(watch);
        return;
      }
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      if (root.classList.contains("is-ready") && window.__PERF__.readyAt === null) {
        window.__PERF__.readyAt = performance.now();
      }
    };
    watch();

    const trackFrames = (timestamp) => {
      const perf = window.__PERF__;
      perf.frames += 1;
      const delta = timestamp - perf.lastFrame;
      perf.lastFrame = timestamp;
      if (perf.frames > 1) perf.frameTimes.push(delta);
      if (perf.firstFrameAt === null) perf.firstFrameAt = performance.now();
      requestAnimationFrame(trackFrames);
    };
    requestAnimationFrame(trackFrames);
  });

  const started = performance.now();
  await page.goto(page.__targetUrl, { waitUntil: "domcontentloaded" });

  await page.waitForSelector(".press-experience.is-ready", { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const sample = await page.evaluate(() => {
    const perf = window.__PERF__;
    const frameTimes = perf.frameTimes.slice(-180);
    const avgFrameMs =
      frameTimes.length > 0
        ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
        : null;

    const canvas = document.querySelector("canvas");
    const rendererInfo =
      canvas &&
      typeof canvas.getContext === "function" &&
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false })
        ? {
            pixelRatio: window.devicePixelRatio,
          }
        : null;

    return {
      timeToReadyMs: perf.readyAt === null ? null : perf.readyAt - perf.navStart,
      timeToFirstFrameMs:
        perf.firstFrameAt === null ? null : perf.firstFrameAt - perf.navStart,
      avgFps: avgFrameMs ? 1000 / avgFrameMs : null,
      p95FrameMs:
        frameTimes.length > 0
          ? [...frameTimes].sort((a, b) => a - b)[
              Math.floor(frameTimes.length * 0.95)
            ]
          : null,
      rendererInfo,
    };
  });

  return {
    ...sample,
    wallClockMs: performance.now() - started,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=metal"],
  });
  const context = await browser.newContext({
    viewport: args.viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.__targetUrl = args.url;

  const runs = [];
  for (let index = 0; index < args.runs; index += 1) {
    runs.push(await measureOnce(page));
  }

  await browser.close();

  const pick = (key) =>
    median(
      runs
        .map((run) => run[key])
        .filter((value) => typeof value === "number" && Number.isFinite(value)),
    );

  const report = {
    label: args.label,
    url: args.url,
    runs,
    summary: {
      timeToReadyMs: pick("timeToReadyMs"),
      timeToFirstFrameMs: pick("timeToFirstFrameMs"),
      avgFps: pick("avgFps"),
      p95FrameMs: pick("p95FrameMs"),
      pixelRatio: median(
        runs
          .map((run) => run.rendererInfo?.pixelRatio ?? null)
          .filter((value) => typeof value === "number" && Number.isFinite(value)),
      ),
    },
  };

  const outPath = path.join(args.out, `${args.label}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
