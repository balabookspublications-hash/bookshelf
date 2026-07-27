"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  STRIPE_ASSET_ROOT,
  stripeAssetUrl,
  type StripeAssetManifest,
  type StripeBookAsset,
} from "./stripe-assets";

type AssetLibraryProps = {
  books: StripeBookAsset[];
  manifest: StripeAssetManifest | null;
  open: boolean;
  onClose: () => void;
};

function fileSize(bytes?: number) {
  if (typeof bytes !== "number") return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function textureKind(name: string) {
  if (name.startsWith("shared_")) return "Shared";
  const suffix = name.split("_").at(-1);
  return suffix ? suffix[0].toUpperCase() + suffix.slice(1) : "Texture";
}

export function AssetLibrary({
  books,
  manifest,
  open,
  onClose,
}: AssetLibraryProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const coreFiles = useMemo(() => {
    if (!manifest) return [];
    return [
      {
        label: "Shared book geometry",
        meta: "OBJ mesh",
        file: manifest.geometry.local_file,
        bytes: manifest.geometry.bytes,
      },
      ...manifest.shaders.map((shader, index) => ({
        label: index === 0 ? "Vertex shader" : "Fragment shader",
        meta: "GLSL",
        file: shader.local_file,
        bytes: shader.bytes,
      })),
      {
        label: "Poor Charlie’s selection",
        meta: "56-page PDF",
        file: manifest.poor_charlies_almanack_sample.local_file,
        bytes: manifest.poor_charlies_almanack_sample.bytes,
      },
      {
        label: "Book materials",
        meta: "JSON",
        file: "books.json",
      },
      {
        label: "Checksummed manifest",
        meta: "JSON",
        file: "manifest.json",
      },
      {
        label: "Archive notes",
        meta: "Markdown",
        file: "README.md",
      },
      {
        label: "Complete download",
        meta: "ZIP archive",
        file: "stripe-press-3d-book-assets.zip",
      },
    ];
  }, [manifest]);

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
            <p className="eyebrow">LOCAL ASSET ARCHIVE</p>
            <h2 id="asset-library-title">Optional edition files</h2>
            <p>
              Local geometry, material maps, and reference files available in
              this checkout. These files are not part of the open-source
              distribution.
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
              <span>Book materials</span>
            </div>
            <div>
              <strong>{manifest.counts.textures}</strong>
              <span>Texture maps</span>
            </div>
            <div>
              <strong>01</strong>
              <span>Shared OBJ</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Shaders</span>
            </div>
          </div>

          <a
            className="asset-download-all"
            href={`${STRIPE_ASSET_ROOT}/stripe-press-3d-book-assets.zip`}
            download
          >
            <span>
              <small>COMPLETE ARCHIVE</small>
              Download all 82 files
            </span>
            <span aria-hidden="true">↓</span>
          </a>

          <section className="asset-section">
            <div className="asset-section__heading">
              <h3>Core 3D kit</h3>
              <span>{String(coreFiles.length).padStart(2, "0")} files</span>
            </div>
            <div className="asset-file-list">
              {coreFiles.map((file) => (
                <a
                  key={file.file}
                  href={stripeAssetUrl(file.file)}
                  download
                >
                  <span>
                    <strong>{file.label}</strong>
                    <small>
                      {file.meta}
                      {fileSize(file.bytes)
                        ? ` · ${fileSize(file.bytes)}`
                        : ""}
                    </small>
                  </span>
                  <span aria-hidden="true">↓</span>
                </a>
              ))}
            </div>
          </section>

          <section className="asset-section">
            <div className="asset-section__heading">
              <h3>Material maps</h3>
              <span>{manifest.textures.length} files</span>
            </div>
            <div className="texture-asset-grid">
              {manifest.textures.map((texture) => (
                <a
                  key={texture.name}
                  className="texture-asset"
                  href={stripeAssetUrl(texture.local_file)}
                  download
                >
                  <span className="texture-asset__preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stripeAssetUrl(texture.local_file)}
                      alt={`${texture.name} texture map`}
                      loading="lazy"
                    />
                  </span>
                  <span className="texture-asset__copy">
                    <strong>{texture.name}</strong>
                    <small>
                      {textureKind(texture.name)} · {fileSize(texture.bytes)}
                    </small>
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className="asset-section">
            <div className="asset-section__heading">
              <h3>Viewer source capture</h3>
              <span>{manifest.source_javascript.length + 1} files</span>
            </div>
            <div className="asset-file-list asset-file-list--compact">
              <a
                href={`${STRIPE_ASSET_ROOT}/source/poor-charlies-almanack.html`}
                download
              >
                <span>
                  <strong>poor-charlies-almanack.html</strong>
                  <small>Archived page source</small>
                </span>
                <span aria-hidden="true">↓</span>
              </a>
              {manifest.source_javascript.map((source) => (
                <a
                  key={source.local_file}
                  href={stripeAssetUrl(source.local_file)}
                  download
                >
                  <span>
                    <strong>{source.local_file.split("/").at(-1)}</strong>
                    <small>JavaScript · {fileSize(source.bytes)}</small>
                  </span>
                  <span aria-hidden="true">↓</span>
                </a>
              ))}
            </div>
          </section>

          <p className="asset-library__note">
            Only deploy or redistribute files you own or have permission to
            use. Public accessibility does not grant an open-source license.
          </p>
        </div>
      </section>
    </>
  );
}
