"use client";

import { useEffect, useRef } from "react";
import { catalog } from "./catalog";
import type { MintAssetManifest, MintBookAsset } from "./mint-assets";

type AssetLibraryProps = {
  books: MintBookAsset[];
  manifest: MintAssetManifest | null;
  open: boolean;
  onClose: () => void;
};

export function AssetLibrary({
  books,
  manifest,
  open,
  onClose,
}: AssetLibraryProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!manifest) return null;

  return (
    <>
      <button
        type="button"
        className={`asset-backdrop ${open ? "is-visible" : ""}`}
        aria-label="Close asset library"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <section
        className={`asset-library ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        inert={!open}
        aria-labelledby="asset-library-title"
      >
        <header className="asset-library__header">
          <div>
            <p className="eyebrow">MINT ARTIFACT MANIFEST</p>
            <h2 id="asset-library-title">Nineteen original volumes</h2>
            <p>
              A coherent, browser-ready hardcover collection generated in Mint
              auto mode. Each local GLB is paired with authored title overlays
              and catalog metadata in the experience.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="asset-library__close"
            onClick={onClose}
          >
            <span>Close</span>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="asset-library__scroll">
          <div className="asset-stats" aria-label="Asset totals">
            <div>
              <strong>{books.length}</strong>
              <span>Hardcovers</span>
            </div>
            <div>
              <strong>19</strong>
              <span>Local GLBs</span>
            </div>
            <div>
              <strong>01</strong>
              <span>Mint pack</span>
            </div>
            <div>
              <strong>00</strong>
              <span>Remote calls</span>
            </div>
          </div>

          <section className="asset-section">
            <div className="asset-section__heading">
              <h3>{manifest.collection}</h3>
              <span>{String(books.length).padStart(2, "0")} files</span>
            </div>
            <div className="asset-file-list">
              {books.map((asset) => {
                const book = catalog.find((entry) => entry.id === asset.id);
                return (
                  <a key={asset.id} href={asset.file} download>
                    <span>
                      <strong>{book?.shortTitle ?? asset.id}</strong>
                      <small>Mint-generated · GLB · local</small>
                    </span>
                    <span aria-hidden="true">↓</span>
                  </a>
                );
              })}
            </div>
          </section>

          <p className="asset-library__note">
            The volume artwork is an original thematic interpretation created
            for this project. No Stripe Press cover images, source files, or
            downloadable publisher assets are included.
          </p>
        </div>
      </section>
    </>
  );
}
