# Mint asset ledger

## Progress Library Hardcover Collection

- Surface: nineteen distinct closed hardcover volumes for the complete Stripe Press catalog.
- Generation mode: automatic.
- Generation status: succeeded.
- Optimization: production browser optimization requested for all nineteen models.
- Mint handoff: https://mint.gg/chat/ph72jhdscwsn9nkt3tz5gfx9ph8baf7j
- Runtime paths: `public/assets/mint/books/*.glb`
- Browser manifest: `public/assets/mint/manifest.json`
- Integration: GLTFLoader imports each volume, normalizes its bounds into the authored shelf contract, and retains accurate local title, spine, and back-cover overlays.
- Fallback: every catalog entry has an authored procedural edition so a failed or slow GLB never leaves an empty shelf slot.
- Verification: scale, orientation, material response, texture loading, bounds, renderer cost, and disposal are checked in the final browser QA pass.

The generated models use original thematic artwork and do not contain downloaded Stripe cover images, publisher assets, or source PDFs.
