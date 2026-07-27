import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(
    html,
    /<title>The Complete Shelf — An Interactive 3D Library<\/title>/i,
  );
  assert.match(html, /19(?:<!-- -->)? VOLUMES/);
  assert.match(html, /01 CONTINUOUS SHELF/);
  assert.match(html, /data-testid="shelf-canvas"/);
  assert.match(html, /data-testid="inspect-active"/);
  assert.match(html, /Poor Charlie’s Almanack/);
  assert.match(html, /Browse to High Growth Handbook/);
  const shelfOrder = [
    "Maintenance: Of Everything, Part One",
    "The Dream Machine",
    "The Scaling Era",
    "The Art of Doing Science and Engineering",
    "Poor Charlie’s Almanack",
    "High Growth Handbook",
    "The Origins of Efficiency",
    "Scaling People",
    "The Revolt of the Public",
    "The Big Score",
    "An Elegant Puzzle",
    "Boom: Bubbles and the End of Stagnation",
    "The Making of Prince of Persia",
    "Where Is My Flying Car?",
    "Pieces of the Action",
    "Working in Public",
    "Get Together",
    "Scientific Freedom",
    "Stubborn Attachments",
  ];
  const renderedPositions = shelfOrder.map((title) =>
    html.indexOf(`Browse to ${title}`),
  );
  assert.ok(renderedPositions.every((position) => position >= 0));
  assert.deepEqual(renderedPositions, [...renderedPositions].sort((a, b) => a - b));
  assert.match(html, /og:image/);
  assert.match(html, /\/social-card\.webp/);
  assert.match(html, /summary_large_image/);
  assert.match(html, /1200/);
  assert.match(html, /630/);
  assert.doesNotMatch(
    html,
    /View (?:local|all) assets|open-asset-library|asset-library/i,
  );
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("keeps third-party editions optional and supports owned cover art", async () => {
  const [engine, styles, catalogSource, coverArt, addingBooks, gitignore] =
    await Promise.all([
      readFile(new URL("../app/ShelfEngine.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../app/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/cover-art.ts", import.meta.url), "utf8"),
      readFile(new URL("../docs/adding-books.md", import.meta.url), "utf8"),
      readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    ]);

  assert.match(catalogSource, /coverImage\?: string/);
  assert.match(engine, /loadCustomCover\(runtime, book\.coverImage\)/);
  assert.match(engine, /customCover:\$\{runtime\.data\.id\}/);
  assert.match(engine, /Keep the generated procedural cover/);
  assert.match(engine, /\$\{this\.booksData\.length\} volumes ready/);
  assert.match(coverArt, /siteConfig\.coverImprint/);
  assert.doesNotMatch(coverArt, /STRIPE PRESS/);
  assert.match(addingBooks, /public\/books\/my-book\/cover\.webp/);
  assert.match(addingBooks, /If the image is missing.*procedural cover/s);
  assert.match(gitignore, /\/public\/assets\/stripe-press\//);

  // A separately licensed local archive can still activate the specialized
  // edition adapter, but no archive is required by this test or a clean clone.
  assert.match(engine, /OBJLoader/);
  assert.match(engine, /loadStripeAssets/);
  assert.match(engine, /MeshPhysicalMaterial/);
  assert.match(engine, /addStripeFoilBlend/);
  assert.match(engine, /stripeBookCoverFacingRotationY = -Math\.PI \/ 2/);
  assert.match(
    engine,
    /runtime\.data\.thickness \/ this\.stripeGeometrySize\.x/,
  );
  assert.match(
    engine,
    /runtime\.data\.height \/ this\.stripeGeometrySize\.y/,
  );
  assert.match(engine, /targetWidth \/ this\.stripeGeometrySize\.z/);
  const focusDuration = Number(
    engine.match(/const focusInDuration = ([0-9.]+);/)?.[1],
  );
  const returnDuration = Number(
    engine.match(/const focusOutDuration = ([0-9.]+);/)?.[1],
  );
  assert.ok(focusDuration >= 0.35 && focusDuration <= 0.55);
  assert.ok(returnDuration >= 0.25 && returnDuration <= 0.45);
  assert.match(engine, /easeOutCubic\(this\.focusProgress\)/);
  assert.match(engine, /updateBrowseMotion\(delta\)/);
  assert.match(engine, /commitBookPose\(/);
  assert.match(engine, /bookFootprintsOverlap\(/);
  assert.match(engine, /private motionBookIndex: number \| null/);
  assert.doesNotMatch(engine, /const reveal = ease/);
  assert.match(engine, /frameFocusedBook\(worldPosition\)/);
  assert.match(engine, /this\.camera\.setViewOffset/);
  assert.match(engine, /this\.focusCameraTarget\.copy\(worldPosition\)/);
  assert.doesNotMatch(engine, /worldPosition\.x \+ stageCenterOffset/);
  assert.match(engine, /this\.controls\.target\.copy\(this\.focusCameraTarget\)/);
  assert.match(engine, /bookInspectionIdle:/);
  assert.match(engine, /this\.mode === "inspect" && !this\.reducedMotion/);
  assert.match(styles, /\.browse-caption::before/);
  assert.match(styles, /rgba\(238, 232, 219, 0\.96\)/);
  assert.doesNotMatch(
    engine,
    /focusProgress = damp\(\s*this\.focusProgress,\s*1/s,
  );
  assert.doesNotMatch(engine, /sourceBounds.*setFromObject\(root\)/s);
  assert.doesNotMatch(engine, /GLTFLoader|loadMintAssets/);
});

test("restores colored foil artwork from edition coverage maps", async () => {
  const { addStripeFoilBlend, stripeFoilSettings } = await import(
    "../app/stripe-foil.ts"
  );
  const shader = addStripeFoilBlend(`
    #include <map_pars_fragment>
    void main() {
      vec4 diffuseColor = vec4(1.0);
      vec3 normal = vec3(0.0, 0.0, 1.0);
      #include <normal_fragment_maps>
    }
  `);

  assert.match(shader, /uniform sampler2D stripeFoilMap/);
  assert.match(shader, /texture2D\(stripeFoilMap, vMapUv\)/);
  assert.match(shader, /texture2D\(map, stripeFoilIndex\)/);
  assert.match(shader, /diffuseColor\.rgb = mix/);
  const normalMapsIndex = shader.indexOf("#include <normal_fragment_maps>");
  const foilCoverageIndex = shader.indexOf("float stripeFoilCoverage");
  assert.ok(normalMapsIndex >= 0);
  assert.ok(foilCoverageIndex > normalMapsIndex);

  assert.deepEqual(
    stripeFoilSettings({ foilOpacity: 1.5, foilDetail: 3 }),
    { enabled: true, opacity: 1.5, detail: 3 },
  );
  assert.deepEqual(
    stripeFoilSettings({ foilOpacity: -1, foilDetail: 0 }),
    { enabled: false, opacity: 0, detail: 0.1 },
  );
});

test("keeps every book footprint separated throughout browse and focus routes", async () => {
  const [
    { catalog },
    {
      bookFootprintsOverlap,
      browseMotionPose,
      browsePhaseDuration,
      createMotionLayout,
      focusedBookPose,
      presentedBookPose,
      shelvedBookPose,
    },
  ] = await Promise.all([
    import(new URL("../app/catalog.ts", import.meta.url)),
    import(new URL("../app/book-motion.ts", import.meta.url)),
  ]);
  const gap = 0.045;
  let cursor = 0;
  const books = catalog.map((book, index) => {
    cursor += book.thickness * 0.5;
    const runtime = {
      id: book.id,
      x: cursor,
      width: 1.31 + ((index % 5) - 2) * 0.018,
      thickness: book.thickness,
    };
    cursor += book.thickness * 0.5 + gap;
    return runtime;
  });
  const layout = createMotionLayout(books);
  assert.ok(layout.rotationLaneZ > layout.presentedZ);
  assert.ok(layout.rotationLaneZ < 1.4);

  function footprint(book, pose) {
    return {
      id: book.id,
      x: book.x + pose.x,
      z: 0.04 + pose.z,
      yaw: pose.yaw,
      scale: pose.scale,
      width: book.width,
      thickness: book.thickness,
    };
  }

  function assertSeparated(poses, context) {
    for (let left = 0; left < books.length; left += 1) {
      for (let right = left + 1; right < books.length; right += 1) {
        assert.equal(
          bookFootprintsOverlap(
            footprint(books[left], poses[left]),
            footprint(books[right], poses[right]),
            layout.collisionMargin,
          ),
          false,
          `${context}: ${books[left].id} overlaps ${books[right].id}`,
        );
      }
    }
  }

  const outgoingPhases = [
    "retreat-current",
    "turn-current",
    "shelve-current",
  ];
  const incomingPhases = ["extract-next", "turn-next", "settle-next"];

  for (let from = 0; from < books.length; from += 1) {
    for (let to = 0; to < books.length; to += 1) {
      if (from === to) continue;
      const poses = books.map(() => shelvedBookPose(layout));
      poses[from] = presentedBookPose(layout);

      for (const phase of outgoingPhases) {
        const steps = Math.ceil(browsePhaseDuration[phase] * 240);
        for (let step = 0; step <= steps; step += 1) {
          poses[from] = browseMotionPose(phase, step / steps, layout);
          assertSeparated(poses, `${from}->${to} ${phase} ${step}/${steps}`);
        }
      }

      for (const phase of incomingPhases) {
        const steps = Math.ceil(browsePhaseDuration[phase] * 240);
        for (let step = 0; step <= steps; step += 1) {
          poses[to] = browseMotionPose(phase, step / steps, layout);
          assertSeparated(poses, `${from}->${to} ${phase} ${step}/${steps}`);
        }
      }
    }
  }

  for (let active = 0; active < books.length; active += 1) {
    for (const focus of [
      { x: -0.58, z: 1.66, scale: 1.08, viewport: "desktop" },
      { x: 0, z: 1.4, scale: 0.92, viewport: "mobile" },
    ]) {
      const poses = books.map(() => shelvedBookPose(layout));
      poses[active] = presentedBookPose(layout);
      for (let step = 0; step <= 120; step += 1) {
        poses[active] = focusedBookPose(
          step / 120,
          layout,
          focus.x,
          focus.z,
          focus.scale,
        );
        assertSeparated(
          poses,
          `${focus.viewport} focus ${active} ${step}/120`,
        );
      }
      for (let step = 120; step >= 0; step -= 1) {
        poses[active] = focusedBookPose(
          step / 120,
          layout,
          focus.x,
          focus.z,
          focus.scale,
        );
        assertSeparated(
          poses,
          `${focus.viewport} return ${active} ${step}/120`,
        );
      }
    }
  }
});
