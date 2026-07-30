# The Complete Shelf

Fork of [mintdotgg/bookshelf](https://github.com/mintdotgg/bookshelf).

This fork focuses on Three.js shelf renderer performance. Measured on a
production build with 19 books (1280×720, median of 3 Playwright runs):

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Draw calls | 239 | 175 | **27% fewer** |
| Geometries | 141 | 108 | **23% fewer** |
| Triangles | 113,532 | 112,528 | **~1,000 fewer** |

How: merged book body and headband meshes, raycast-only pick proxies on a
non-rendered layer, coalesced hover raycasts, and cached viewport reads.

---

An independent Three.js editorial bookshelf. The included demo catalog features
nineteen Stripe Press titles, while the application is designed to be forked
and filled with books of your own.

This project is not affiliated with or endorsed by Stripe. “Stripe” and
“Stripe Press” are trademarks of their respective owner.

## Features

- Drag, scroll, use arrow keys, or select a shelf tick to browse.
- Pull a volume forward, then orbit, pan, zoom, and reset the inspection view.
- Generate a deterministic procedural hardcover from catalog metadata.
- Optionally replace a generated front cover with contributor-owned artwork.
- Preserve a working shelf when optional images or edition assets are absent.
- Respect reduced-motion preferences and keyboard navigation.

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Before submitting a change, run:

```bash
npm run check
npm run security:audit
```

## Add your own books

The short version:

1. Add an object to [`app/catalog.ts`](app/catalog.ts).
2. Optionally put a cover image at
   `public/books/<book-id>/cover.webp` and set
   `coverImage: "/books/<book-id>/cover.webp"`.
3. Edit [`app/site-config.ts`](app/site-config.ts) if you are replacing the demo
   collection or branding.
4. Run `npm run check`.

No cover image is required. The title, author, palette, and motif in the catalog
are enough to produce a complete procedural hardcover.

See [Adding books](docs/adding-books.md) for the full field reference, a
copy-paste example, image guidance, ordering behavior, and troubleshooting.

## Assets and intellectual property

The open-source distribution intentionally excludes downloaded Stripe Press
geometry, cover textures, compiled site JavaScript, page captures, PDFs, and
archives. The optional local adapter still works for a checkout whose owner has
separately obtained the necessary rights, but `public/assets/stripe-press/` is
gitignored and is not required by the application.

Contributor-owned cover images belong under `public/books/`. Only commit art,
quotes, descriptions, and other material that you created or are authorized to
redistribute. Public availability is not the same as an open-source license.

See [Third-party notices](THIRD_PARTY_NOTICES.md) for details.

## Project structure

- `app/catalog.ts` — book metadata, palette, dimensions, and optional covers
- `app/site-config.ts` — collection-level title, labels, and metadata
- `app/ShelfEngine.ts` — renderer, shelf layout, input, animation, and assets
- `app/cover-art.ts` — deterministic procedural cover generator
- `app/book-motion.ts` — collision-safe browse and focus poses
- `public/books/` — contributor-owned cover images
- `tests/` — server-render and shelf-motion regression tests

For a detailed explanation of the object hierarchy, state machine, easing,
damping, collision safety, camera framing, performance decisions, and tuning
knobs, read [Motion, objects, and animation feel](docs/animation-system/README.md).

The package remains marked `"private": true` to prevent accidental publication
to npm. This does not prevent the source repository from being public.

## Deployment

Local development does not require a deployment account. If you connect the
checkout to OpenAI Sites, the integration creates `.openai/hosting.json`.
That machine-specific project association is gitignored so forks select their
own deployment target. See [the local deployment note](.openai/README.md).

## Mint agent tooling

The repository includes two optional pieces for Mint-assisted 3D work:

- `.codex/config.toml` registers the production
  [Mint MCP server](https://mcp.mint.gg/) as a repo-scoped OAuth connection.
- `.agents/skills/mint-threejs-skills` vendors the official
  [Mint Three.js Skills](https://github.com/mintdotgg/mint-threejs-skills) suite
  at upstream commit
  [`e563354`](https://github.com/mintdotgg/mint-threejs-skills/commit/e563354fae765ef49b6b0e2bd6b695554689ba40).

Mint is not required to run or customize the shelf. Contributors who want it
can trust the repository in Codex and run `codex mcp login mint`; OAuth
credentials remain outside the repository.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues using the private process in [SECURITY.md](SECURITY.md).
