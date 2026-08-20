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
    /<title>Bala Books – An Interactive 3D Bookshelf<\/title>/i,
  );
  assert.match(html, /data-testid="shelf-canvas"/);
  assert.match(html, /data-testid="inspect-active"/);
  assert.match(html, /Because Some Books Must Exist/);
  assert.match(html, /Browse to బిలం/);
  const shelfOrder = [
    "బిలం",
    "C/O వైఢూర్యపురం",
    "కీకారణ్యంలో జింక",
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
  assert.match(engine, /const libraryColumns = 5/);
  assert.match(engine, /const booksPerSection = libraryColumns \* libraryRowsPerSection/);
  assert.match(engine, /Math\.ceil\(this\.runtimeBooks\.length \/ booksPerSection\)/);
  assert.match(engine, /sectionOffsetX/);
  assert.match(engine, /ensureSectionCovers/);
  assert.match(engine, /index < booksPerSection/);
  assert.match(engine, /const desktopLibraryWidthFill = 0\.9/);
  assert.match(engine, /horizontalDistance/);
  assert.match(engine, /compactBrowseCenterX/);
  assert.match(engine, /const pageSize = this\.viewWidth < 360 \? 1 : 2/);
  assert.match(styles, /@media \(max-width: 359px\)/);
  assert.match(styles, /min-height: 52px/);
  assert.match(engine, /Math\.ceil\(this\.runtimeBooks\.length \/ visibleColumns\)/);
  assert.match(engine, /presentedBookPose\(this\.motionLayout\)/);
  assert.match(engine, /`libraryShelf:\$\{section\}:\$\{row\}`/);
  assert.match(engine, /commitBookPose\(/);
  assert.match(engine, /bookFootprintsOverlap\(/);
  assert.doesNotMatch(engine, /motionBookIndex|updateBrowseMotion/);
  assert.doesNotMatch(engine, /const reveal = ease/);
  assert.match(engine, /frameFocusedBook\(worldPosition\)/);
  assert.match(engine, /this\.camera\.setViewOffset/);
  assert.match(engine, /this\.focusCameraTarget\.copy\(worldPosition\)/);
  assert.doesNotMatch(engine, /worldPosition\.x \+ stageCenterOffset/);
  assert.match(engine, /this\.controls\.target\.copy\(this\.focusCameraTarget\)/);
  assert.match(engine, /bookInspectionIdle:/);
  assert.match(engine, /Math\.max\(book\.hover, activeStrength\)/);
  assert.match(engine, /frameMaterial\.emissiveIntensity = hoverStrength/);
  assert.match(engine, /new THREE\.MeshBasicMaterial\(\{/);
  assert.match(engine, /toneMapped: false/);
  assert.match(engine, /fog: false/);
  assert.doesNotMatch(engine, /inspectionIdleLift|inspectionIdlePitch/);
  assert.match(styles, /\.browse-caption::before/);
  assert.match(styles, /rgba\(18, 12, 10, 0\.82\)/);
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

test("keeps the face-out browse row separated throughout focus routes", async () => {
  const [
    { catalog },
    {
      bookFootprintsOverlap,
      createMotionLayout,
      focusedBookPose,
      presentedBookPose,
    },
  ] = await Promise.all([
    import(new URL("../app/catalog.ts", import.meta.url)),
    import(new URL("../app/book-motion.ts", import.meta.url)),
  ]);
  const books = catalog.map((book, index) => {
    const runtime = {
      id: book.id,
      x: (index - (catalog.length - 1) / 2) * 1.72,
      width: 1.31 + ((index % 5) - 2) * 0.018,
      thickness: book.thickness,
    };
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

  const browsePoses = books.map(() => presentedBookPose(layout));
  assertSeparated(browsePoses, "face-out browse row");

  for (let active = 0; active < books.length; active += 1) {
    for (const focus of [
      { x: -0.58, z: 1.82, scale: 1.12, viewport: "desktop" },
      { x: 0, z: 1.52, scale: 1.06, viewport: "mobile" },
    ]) {
      const poses = books.map(() => presentedBookPose(layout));
      const focusOffsetX = focus.x - books[active].x;
      for (let step = 0; step <= 120; step += 1) {
        poses[active] = focusedBookPose(
          step / 120,
          layout,
          focusOffsetX,
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
          focusOffsetX,
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
