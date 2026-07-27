"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetLibrary } from "./AssetLibrary";
import { catalog } from "./catalog";
import { ShelfEngine, type ShelfMode } from "./ShelfEngine";
import {
  MINT_ASSET_ROOT,
  type MintAssetManifest,
  type MintBookAsset,
} from "./mint-assets";

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}>
      <span />
    </span>
  );
}

export function ProgressLibrary() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Preparing the complete catalog");
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [assetManifest, setAssetManifest] =
    useState<MintAssetManifest | null>(null);
  const [assetBooks, setAssetBooks] = useState<MintBookAsset[]>([]);

  const activeBook = catalog[activeIndex];
  const selectedBook = useMemo(
    () => (selectedIndex === null ? null : catalog[selectedIndex]),
    [selectedIndex],
  );
  const selectedBookAssets = useMemo(
    () =>
      selectedBook
        ? assetBooks.find((book) => book.id === selectedBook.id) ?? null
        : null,
    [assetBooks, selectedBook],
  );
  const isFocused = mode !== "browse";

  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngine | null = null;

    async function start() {
      if (!canvasRef.current) return;
      await document.fonts.ready;
      if (cancelled || !canvasRef.current) return;

      engine = new ShelfEngine(canvasRef.current, catalog, {
        onActiveIndex: setActiveIndex,
        onMode: (nextMode, index) => {
          setMode(nextMode);
          setSelectedIndex(index);
        },
        onStatus: setStatus,
        onReady: () => setReady(true),
      });
      engineRef.current = engine;
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${MINT_ASSET_ROOT}/manifest.json`)
      .then((response) => response.json())
      .then((manifest) => {
        if (cancelled) return;
        const typedManifest = manifest as MintAssetManifest;
        setAssetManifest(typedManifest);
        setAssetBooks(typedManifest.assets);
      })
      .catch(() => {
        if (!cancelled) setStatus("Books ready · asset index unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assetLibraryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssetLibraryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assetLibraryOpen]);

  return (
    <main
      className={`press-experience ${ready ? "is-ready" : ""} ${
        isFocused ? "is-focused" : "is-browsing"
      } ${assetLibraryOpen ? "is-assets-open" : ""}`}
    >
      <canvas
        ref={canvasRef}
        className="shelf-canvas"
        data-testid="shelf-canvas"
        role="application"
        tabIndex={0}
        aria-label="Interactive three-dimensional shelf of nineteen Stripe Press books. Drag or use the arrow keys to browse. Press Enter to inspect the selected book."
      />

      <header className="site-header">
        <div className="wordmark" aria-label="Stripe Press, the complete shelf">
          <span>STRIPE PRESS</span>
          <span className="wordmark__divider" />
          <span>THE COMPLETE SHELF</span>
        </div>
        <div className="header-actions">
          <div className="edition-mark">
            <span>19 VOLUMES</span>
            <span>01 CONTINUOUS SHELF</span>
          </div>
          <button
            type="button"
            className="asset-library-trigger"
            data-testid="open-asset-library"
            disabled={!assetManifest}
            onClick={() => setAssetLibraryOpen(true)}
          >
            <span>View all assets</span>
            <span>{assetManifest ? "19" : "…"}</span>
          </button>
        </div>
      </header>

      <section
        className="browse-caption"
        aria-hidden={isFocused}
        data-testid="browse-caption"
      >
        <p className="eyebrow">
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span className="eyebrow__line" />
          <span>{String(catalog.length).padStart(2, "0")}</span>
        </p>
        <h1>{activeBook.shortTitle}</h1>
        <p className="browse-caption__author">{activeBook.author}</p>
        <button
          type="button"
          className="inspect-button"
          data-testid="inspect-active"
          disabled={isFocused}
          onClick={() => engineRef.current?.focusBook(activeIndex)}
          aria-label={`Inspect ${activeBook.title}`}
        >
          <span>Inspect volume</span>
          <span aria-hidden="true">↗</span>
        </button>
      </section>

      <button
        type="button"
        className="shelf-arrow shelf-arrow--left"
        data-testid="browse-previous"
        aria-label="Previous book"
        disabled={isFocused || activeIndex === 0}
        onClick={() => engineRef.current?.browseBy(-1)}
      >
        <ArrowIcon direction="left" />
      </button>
      <button
        type="button"
        className="shelf-arrow shelf-arrow--right"
        data-testid="browse-next"
        aria-label="Next book"
        disabled={isFocused || activeIndex === catalog.length - 1}
        onClick={() => engineRef.current?.browseBy(1)}
      >
        <ArrowIcon direction="right" />
      </button>

      <nav className="shelf-index" aria-label="Catalog position">
        <div className="shelf-index__ticks">
          {catalog.map((book, index) => (
            <button
              key={book.id}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`Browse to ${book.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              disabled={isFocused}
              onClick={() => engineRef.current?.browseTo(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="input-hint" aria-hidden="true">
          <span>DRAG</span>
          <i />
          <span>SCROLL</span>
          <i />
          <span>ARROW KEYS</span>
        </div>
      </nav>

      <aside
        className="book-details"
        aria-hidden={!isFocused}
        aria-label={selectedBook ? `Details for ${selectedBook.title}` : "Book details"}
        data-testid="book-details"
      >
        {selectedBook ? (
          <div className="book-details__inner">
            <button
              type="button"
              className="back-button"
              data-testid="return-to-shelf"
              onClick={() => engineRef.current?.returnToShelf()}
            >
              <ArrowIcon direction="left" />
              <span>Return to shelf</span>
            </button>

            <div className="book-details__position">
              <span>{String(selectedIndex! + 1).padStart(2, "0")}</span>
              <span>{String(catalog.length).padStart(2, "0")}</span>
            </div>

            <div className="book-details__copy">
              <p className="eyebrow">STRIPE PRESS EDITION</p>
              <h2>{selectedBook.title}</h2>
              <p className="book-details__author">{selectedBook.author}</p>
              <p className="book-details__description">
                {selectedBook.description}
              </p>

              <blockquote>
                <p>“{selectedBook.quote}”</p>
                <cite>{selectedBook.quoteBy}</cite>
              </blockquote>

              <dl>
                <div>
                  <dt>Format</dt>
                  <dd>{selectedBook.format}</dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>{selectedBook.availability}</dd>
                </div>
              </dl>

              {selectedBookAssets ? (
                <a
                  className="mint-edition-note"
                  href={selectedBookAssets.file}
                  download
                >
                  <span>Mint artifact</span>
                  <span>Original local GLB ↓</span>
                </a>
              ) : null}

              <a
                className="official-link"
                data-testid="official-link"
                href={selectedBook.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>View at Stripe Press</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="focus-controls" aria-label="Inspection controls">
              <span>Drag to orbit</span>
              <span>Pinch or scroll to zoom</span>
              <button
                type="button"
                data-testid="reset-view"
                onClick={() => engineRef.current?.resetFocusView()}
              >
                Reset view
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div
        className="experience-status"
        role="status"
        aria-live="polite"
        data-testid="experience-status"
      >
        <span className="experience-status__dot" />
        <span>{status}</span>
      </div>

      <div className="loading-screen" aria-hidden={ready}>
        <div className="loading-screen__mark">
          <span />
          <span />
          <span />
        </div>
        <p>Assembling nineteen volumes</p>
      </div>

      <p className="independent-note">
        Independent editorial study · original Mint-generated 3D artwork.
      </p>

      <AssetLibrary
        books={assetBooks}
        manifest={assetManifest}
        open={assetLibraryOpen}
        onClose={() => setAssetLibraryOpen(false)}
      />

      <div className="sr-only" aria-live="polite">
        {isFocused && selectedBook
          ? `Inspecting ${selectedBook.title} by ${selectedBook.author}.`
          : `Selected ${activeBook.title} by ${activeBook.author}.`}
      </div>
    </main>
  );
}
