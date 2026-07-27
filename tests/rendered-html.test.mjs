import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete editorial bookshelf shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Stripe Press — The Complete Shelf<\/title>/i);
  assert.match(html, /19 VOLUMES/);
  assert.match(html, /01 CONTINUOUS SHELF/);
  assert.match(html, /data-testid="shelf-canvas"/);
  assert.match(html, /data-testid="inspect-active"/);
  assert.match(html, /Poor Charlie’s Almanack/);
  assert.match(html, /Browse to High Growth Handbook/);
  assert.match(html, /og:image/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("ships all nineteen original Mint volumes locally", async () => {
  const manifestUrl = new URL(
    "../public/assets/mint/manifest.json",
    import.meta.url,
  );
  const manifestText = await readFile(manifestUrl, "utf8");
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.assets.length, 19);
  assert.equal(new Set(manifest.assets.map((book) => book.id)).size, 19);
  assert.ok(
    manifest.assets.every(
      (book) =>
        book.file.startsWith("/assets/mint/books/") &&
        book.file.endsWith(".glb"),
    ),
  );
  assert.doesNotMatch(manifestText, /https?:\/\//i);

  await Promise.all(
    manifest.assets.map((book) =>
      access(new URL(`../public${book.file}`, import.meta.url)),
    ),
  );

  const engine = await readFile(
    new URL("../app/ShelfEngine.ts", import.meta.url),
    "utf8",
  );
  assert.match(engine, /GLTFLoader/);
  assert.match(engine, /loadMintAssets/);
  assert.doesNotMatch(engine, /OBJLoader|stripe-press\/textures/);
});
