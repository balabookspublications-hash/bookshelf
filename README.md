# Stripe Press — The Complete Shelf

An original Three.js editorial bookshelf for browsing the complete nineteen-book
Stripe Press catalog as tactile hardcover volumes.

## Experience

- Drag, scroll, arrow keys, or the shelf index to move across one continuous
  shelf.
- Each volume rotates from spine to cover as it becomes active.
- Select a book to pull it forward, orbit, pan, zoom, inspect its metadata, and
  continue to the official Stripe Press product page.
- Responsive layouts preserve the full browse-and-reveal flow on desktop and
  mobile.

## Assets

The browser loads nineteen local GLB artifacts generated as one coherent pack
with Mint in auto mode. Original Canvas2D cover typography and procedural
hardcover fallbacks keep every title legible and available if a model is slow
or unavailable.

No Mint MCP calls run in browser code. No Stripe Press cover files, source
bundles, or downloadable publisher assets are redistributed.

See [docs/mint-asset-ledger.md](docs/mint-asset-ledger.md) for the asset handoff
and integration record.

## Development

```bash
npm install
npm run dev
npm test
npm run lint
```

Requires Node.js 22.13 or newer.
