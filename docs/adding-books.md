# Adding books

Each shelf volume starts as one object in `app/catalog.ts`. The renderer uses
that object for layout, cover generation, accessible labels, and the details
panel. You do not need to model a book or create an image.

## 1. Add a catalog entry

Copy this object into the `catalog` array:

```ts
{
  id: "my-book",
  title: "My Book",
  shortTitle: "My Book",
  author: "Your Name",
  description:
    "A short description shown when the reader inspects the volume.",
  quote: "A short line you wrote or have permission to reproduce.",
  quoteBy: "Your Name",
  format: "Hardcover · 240 pages",
  availability: "Available now",
  url: "https://example.com/my-book",
  linkLabel: "Learn more",
  cover: "#203a5f",
  accent: "#e7b55f",
  ink: "#f5efe2",
  motif: "lattice",
  height: 2.05,
  thickness: 0.22,
  coverImage: "/books/my-book/cover.webp",
}
```

`id` must be unique, lowercase, and URL-safe. Use letters, numbers, and hyphens.
The same ID becomes the stable key used by optional assets.

`shortTitle` appears in the browse view and on the generated spine. Keep it
compact. `title`, `author`, `description`, `quote`, `quoteBy`, `format`,
`availability`, and `url` appear in the inspection view.

`cover`, `accent`, and `ink` accept CSS colors:

- `cover` is the board and generated-cover background.
- `accent` drives the motif and physical details.
- `ink` is the primary generated-cover text color.

`motif` selects one deterministic procedural design. Available values are:

```text
lattice, corrosion, efficiency, network, boom, organization, schematic,
flight, circuit, orbit, branches, wave, runner, gather, maze, fracture,
continuum, windows, steps
```

`height` and `thickness` are scene units, not inches or centimeters. Existing
books use heights around `1.9`–`2.2` and thicknesses around `0.16`–`0.30`.
Staying near those ranges keeps the shelf composition balanced.

Set `living: true` to add the subtle animated sheen used by selected demo
volumes.

## 2. Choose the cover treatment

### Procedural cover

Omit `coverImage`. The app creates the cover, spine, and back from the catalog
entry. This is the simplest, fastest, and safest option for a public fork.

### Your own front-cover image

Place an image you have the right to distribute at:

```text
public/books/my-book/cover.webp
```

Then add:

```ts
coverImage: "/books/my-book/cover.webp",
```

Use a portrait image close to a 2:3 aspect ratio. WebP or AVIF around
1200 × 1800 pixels and below 500 KB is a practical target. The image replaces
only the front face; the generated palette still controls the boards, spine,
back, and physical details.

If the image is missing or cannot load, the procedural cover remains visible.
Local files are recommended. Remote images need permissive CORS headers.

The book title and author remain exposed through the surrounding interface, so
decorative cover images should not repeat essential information solely for
accessibility.

## 3. Understand shelf order

The catalog is sorted from tallest to shortest at the bottom of
`app/catalog.ts`:

```ts
sort((left, right) => right.height - left.height)
```

Adding a book may therefore move other volumes. Remove that sort or replace it
with your own rule if you want the source-file order to be authoritative.

## 4. Rename the collection

Edit `app/site-config.ts` when turning the demo into your own library. That one
file controls the document title, description, wordmark, collection name,
edition eyebrow, generated-cover imprint and tagline, spine mark, default
external-link label, social-image alternative text, and independence note.

Individual books can override the default external-link copy with `linkLabel`.

Replace `public/og.png` with artwork you own if you change the collection.

## 5. Validate the result

```bash
npm run check
npm run security:audit
```

`npm run check` lints, type-checks, builds, server-renders the page, verifies the
shelf’s collision-free motion paths, and checks the repo-local Mint tooling.

## Optional edition archives and 3D models

The demo contains an adapter for a local, separately licensed Stripe Press
edition archive. That archive is intentionally excluded from source control and
is not needed for user books.

For an ordinary personal shelf, use the procedural book plus an optional
contributor-owned `coverImage`. A custom GLB or OBJ requires a loader and
orientation contract specific to that model; do not assume that dropping a
model into `public/` will wire it automatically. If you add a Mint-generated
model, follow the vendored Mint skill’s `mint-assets.json` registry and
Draco-loader guidance.

## Content checklist

Before committing a book, confirm that:

- the ID is unique;
- the external URL is intentional and uses HTTPS;
- the description and quote are yours or licensed for redistribution;
- any cover image is yours, licensed, or in the public domain;
- the cover remains recognizable at shelf size;
- `npm run check` passes.
