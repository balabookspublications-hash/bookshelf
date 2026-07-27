import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

const PAGE_URL = "https://press.stripe.com/poor-charlies-almanack";
const outputRoot = resolve(
  process.argv[2] ?? "artifacts/stripe-press-3d-book-assets",
);
const sourceDirectory = join(outputRoot, "source");
const javascriptDirectory = join(sourceDirectory, "js");
const textureDirectory = join(outputRoot, "textures");
const meshDirectory = join(outputRoot, "mesh");
const shaderDirectory = join(outputRoot, "shaders");
const sampleDirectory = join(outputRoot, "book-sample");

const requestHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 StripePressAssetArchiver/1.0",
};

await Promise.all(
  [
    outputRoot,
    sourceDirectory,
    javascriptDirectory,
    textureDirectory,
    meshDirectory,
    shaderDirectory,
    sampleDirectory,
  ].map((directory) => mkdir(directory, { recursive: true })),
);

async function fetchResponse(url) {
  const response = await fetch(url, { headers: requestHeaders });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  return response;
}

async function fetchText(url) {
  return (await fetchResponse(url)).text();
}

async function fetchBytes(url) {
  const response = await fetchResponse(url);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] ?? null,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function contentTypeExtension(contentType, url) {
  const knownTypes = {
    "image/avif": ".avif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return knownTypes[contentType] ?? extname(new URL(url).pathname) ?? ".bin";
}

function extractJsonScript(html, id) {
  const pattern = new RegExp(
    `<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,
  );
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not locate JSON script #${id}`);
  }
  return JSON.parse(match[1]);
}

function extractBalancedArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Could not locate ${marker}`);
  }

  const start = source.indexOf("[", markerIndex);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unterminated array after ${marker}`);
}

function extractTemplateLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Could not locate template literal ${marker}`);
  }

  const start = source.indexOf("`", markerIndex) + 1;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "`") {
      return source.slice(start, index);
    }
  }
  throw new Error(`Unterminated template literal after ${marker}`);
}

function parseTextureDefinitions(source) {
  const arraySource = extractBalancedArray(source, "var at=");
  const definitions = [];
  const pattern =
    /\{name:"([^"]+)",path:`([^`]+)`(?:,bookIndex:(\d+))?\}/g;

  for (const match of arraySource.matchAll(pattern)) {
    const runtimeUrl = match[2]
      .replaceAll("${d}", "60")
      .replaceAll("${u}", "webp")
      .replaceAll("${r}", "1920");
    const originalUrl = new URL(runtimeUrl);
    originalUrl.search = "";
    definitions.push({
      name: match[1],
      runtime_url: runtimeUrl,
      original_url: originalUrl.toString(),
      ...(match[3] === undefined ? {} : { eager_book_index: Number(match[3]) }),
    });
  }

  if (definitions.length === 0) {
    throw new Error("No Stripe Press book textures were found");
  }
  return definitions;
}

function importedJavascriptUrls(source, sourceUrl) {
  const urls = new Set();
  const pattern = /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g;
  for (const match of source.matchAll(pattern)) {
    urls.add(new URL(match[1], sourceUrl).toString());
  }
  return [...urls];
}

async function downloadJavascriptGraph(entryUrl) {
  const queue = [entryUrl];
  const sources = new Map();

  while (queue.length > 0) {
    const url = queue.shift();
    if (sources.has(url)) {
      continue;
    }
    const source = await fetchText(url);
    sources.set(url, source);
    await writeFile(join(javascriptDirectory, basename(new URL(url).pathname)), source);
    queue.push(...importedJavascriptUrls(source, url));
  }

  return sources;
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

const pageHtml = await fetchText(PAGE_URL);
await writeFile(join(sourceDirectory, "poor-charlies-almanack.html"), pageHtml);

const catalog = extractJsonScript(pageHtml, "js-book-materials");
const books = catalog.filter((product) => product.productType === "book");
const poorCharliesAlmanack = books.find(
  (book) => book.slug === "poor-charlies-almanack",
);
if (!poorCharliesAlmanack?.zine?.pdf) {
  throw new Error("The official Poor Charlie's Almanack sampler PDF was not found");
}

const scriptRegistryMatch = pageHtml.match(
  /<script[^>]+data-js-script-registry[^>]*>([\s\S]*?)<\/script>/,
);
if (!scriptRegistryMatch) {
  throw new Error("Could not locate the Stripe Press JavaScript registry");
}
const scriptRegistry = JSON.parse(scriptRegistryMatch[1]);
const canvasEntry = scriptRegistry.find(({ path }) =>
  /\/v1-Canvas-[^/]+\.js$/.test(path),
);
if (!canvasEntry) {
  throw new Error("Could not locate the Stripe Press Canvas bundle");
}

const javascriptSources = await downloadJavascriptGraph(canvasEntry.path);
const textureSourceEntry = [...javascriptSources.entries()].find(([, source]) =>
  source.includes("var at=["),
);
if (!textureSourceEntry) {
  throw new Error("Could not locate the Stripe Press book texture manifest");
}
const textureDefinitions = parseTextureDefinitions(textureSourceEntry[1]);

const textureManifest = await mapWithConcurrency(
  textureDefinitions,
  6,
  async (definition) => {
    const { bytes, contentType } = await fetchBytes(definition.original_url);
    const localFilename = `${definition.name}${contentTypeExtension(
      contentType,
      definition.original_url,
    )}`;
    const localPath = join(textureDirectory, localFilename);
    await writeFile(localPath, bytes);
    return {
      ...definition,
      local_file: relative(outputRoot, localPath),
      content_type: contentType,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  },
);

const geometrySourceEntry = [...javascriptSources.entries()].find(([, source]) =>
  source.includes("var $=String.raw`"),
);
if (!geometrySourceEntry) {
  throw new Error("Could not locate the embedded Stripe Press book OBJ");
}
const geometrySource = geometrySourceEntry[1];
const bookObj = extractTemplateLiteral(geometrySource, "var $=String.raw");
const vertexShader = extractTemplateLiteral(geometrySource, "var t0=");
const fragmentShader = extractTemplateLiteral(geometrySource, "var e0=");
const bookObjBytes = Buffer.from(bookObj);
const vertexShaderBytes = Buffer.from(vertexShader);
const fragmentShaderBytes = Buffer.from(fragmentShader);
await Promise.all([
  writeFile(join(meshDirectory, "stripe-press-book.obj"), bookObjBytes),
  writeFile(
    join(shaderDirectory, "stripe-press-book.vert.glsl"),
    vertexShaderBytes,
  ),
  writeFile(
    join(shaderDirectory, "stripe-press-book.frag.glsl"),
    fragmentShaderBytes,
  ),
]);

const samplePdf = await fetchBytes(poorCharliesAlmanack.zine.pdf);
const sampleFilename = basename(new URL(poorCharliesAlmanack.zine.pdf).pathname);
const samplePath = join(sampleDirectory, sampleFilename);
await writeFile(samplePath, samplePdf.bytes);

const localTextureByName = Object.fromEntries(
  textureManifest.map((texture) => [texture.name, texture.local_file]),
);
const materialKeys = [
  "diffuseMapBase",
  "diffuseMapCustom",
  "bumpMapBase",
  "bumpMapCustom",
  "foilMap",
  "glossMap",
  "glitterMap",
];
const bookManifest = books.map((book, index) => ({
  index,
  slug: book.slug,
  title: book.title,
  short_title: book.shortTitle ?? null,
  material: book.material,
  palette: book.palette,
  textures: Object.fromEntries(
    materialKeys
      .filter((key) => typeof book.material?.[key] === "string")
      .map((key) => [
        key,
        {
          name: book.material[key],
          local_file: localTextureByName[book.material[key]] ?? null,
        },
      ]),
  ),
}));

const sourceFiles = await Promise.all(
  [...javascriptSources.entries()].map(async ([url]) => {
    const localPath = join(javascriptDirectory, basename(new URL(url).pathname));
    const bytes = await readFile(localPath);
    return {
      url,
      local_file: relative(outputRoot, localPath),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }),
);

const manifest = {
  archived_at: new Date().toISOString(),
  source_page: PAGE_URL,
  notes: [
    "Stripe Press renders its books from one shared OBJ mesh; it does not publish a separate GLB for each book.",
    "Texture files are original-resolution CDN sources. runtime_url records the exact 1920px/quality-60 variant requested by the current site.",
    "The included PDF is Stripe Press's public 56-page selection, not the complete paid book.",
  ],
  counts: {
    books: bookManifest.length,
    textures: textureManifest.length,
    javascript_files: sourceFiles.length,
  },
  geometry: {
    local_file: "mesh/stripe-press-book.obj",
    source_bundle: geometrySourceEntry[0],
    bytes: bookObjBytes.length,
    sha256: sha256(bookObjBytes),
  },
  shaders: [
    {
      local_file: "shaders/stripe-press-book.vert.glsl",
      bytes: vertexShaderBytes.length,
      sha256: sha256(vertexShaderBytes),
    },
    {
      local_file: "shaders/stripe-press-book.frag.glsl",
      bytes: fragmentShaderBytes.length,
      sha256: sha256(fragmentShaderBytes),
    },
  ],
  poor_charlies_almanack_sample: {
    url: poorCharliesAlmanack.zine.pdf,
    local_file: relative(outputRoot, samplePath),
    bytes: samplePdf.bytes.length,
    sha256: sha256(samplePdf.bytes),
  },
  books: bookManifest,
  textures: textureManifest,
  source_javascript: sourceFiles,
};
await writeFile(
  join(outputRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const readme = `# Stripe Press 3D book assets

Downloaded from the public assets referenced by:

- ${PAGE_URL}

Contents:

- \`book-sample/${sampleFilename}\`: the official 56-page Poor Charlie's Almanack selection (not the full paid book)
- \`mesh/stripe-press-book.obj\`: the shared book-cover mesh embedded in Stripe Press's viewer bundle
- \`shaders/\`: the viewer's book vertex and fragment shaders
- \`textures/\`: ${textureManifest.length} original-resolution texture, bump, foil, gloss, glitter, and shared material maps
- \`books.json\`: material settings and local texture mappings for ${bookManifest.length} books
- \`manifest.json\`: source URLs, byte sizes, and SHA-256 checksums
- \`source/\`: the archived page and JavaScript dependency graph used to recover the mesh and shaders

Stripe Press does not expose a separate GLB for each book. The books are generated
from one OBJ mesh, per-book material settings, and texture maps.

These files remain subject to their owners' copyright and terms. This archive only
contains assets that were publicly accessible without authentication or DRM bypass.
`;
await Promise.all([
  writeFile(join(outputRoot, "README.md"), readme),
  writeFile(
    join(outputRoot, "books.json"),
    `${JSON.stringify(bookManifest, null, 2)}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      output: outputRoot,
      books: bookManifest.length,
      textures: textureManifest.length,
      javascript_files: sourceFiles.length,
      sample_pdf_bytes: samplePdf.bytes.length,
    },
    null,
    2,
  ),
);
