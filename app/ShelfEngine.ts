import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { CatalogBook } from "./catalog";
import {
  createBackCover,
  createFrontCover,
  createSpineCover,
  createTitleDecal,
} from "./cover-art";
import type { MintAssetManifest, MintBookAsset } from "./mint-assets";

export type ShelfMode = "browse" | "focusing" | "inspect" | "returning";

type ShelfCallbacks = {
  onActiveIndex: (index: number) => void;
  onMode: (mode: ShelfMode, selectedIndex: number | null) => void;
  onStatus: (message: string) => void;
  onReady: () => void;
};

type RuntimeBook = {
  data: CatalogBook;
  index: number;
  slot: THREE.Group;
  content: THREE.Group;
  physical: THREE.Group;
  assetHolder: THREE.Group;
  titleDecal: THREE.Mesh;
  pickProxy: THREE.Mesh;
  livingMaterial?: THREE.ShaderMaterial;
  x: number;
  hover: number;
  targetHover: number;
  textures: THREE.Texture[];
};

const shelfTop = 0.34;
const browseCamera = new THREE.Vector3(0, 1.42, 6.65);
const browseTarget = new THREE.Vector3(0, 1.28, 0.15);
const pageColor = new THREE.Color("#e9dfca");
const shelfColor = new THREE.Color("#5a4132");
const clamp = THREE.MathUtils.clamp;

function damp(current: number, target: number, lambda: number, delta: number) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function ease(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function toTexture(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  anisotropy = 8,
) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    anisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function createLivingMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColor;

      void main() {
        float diagonal = fract(vUv.x * 0.72 + vUv.y * 0.31 + uTime * 0.045);
        float sheen = smoothstep(0.44, 0.5, diagonal) * (1.0 - smoothstep(0.5, 0.57, diagonal));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float alpha = sheen * edge * uStrength * 0.32;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

export class ShelfEngine {
  private canvas: HTMLCanvasElement;
  private booksData: CatalogBook[];
  private callbacks: ShelfCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private shelfGroup = new THREE.Group();
  private shelfFurniture = new THREE.Group();
  private runtimeBooks: RuntimeBook[] = [];
  private pickTargets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(10, 10);
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private mode: ShelfMode = "browse";
  private selectedIndex: number | null = null;
  private activeIndex = 0;
  private scrollIndex = 0;
  private targetScrollIndex = 0;
  private focusProgress = 0;
  private lastInputTime = 0;
  private pointerDown = false;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerLastX = 0;
  private pointerTravel = 0;
  private reducedMotion = false;
  private assetCount = 0;
  private assetFailures = 0;
  private focusCameraPosition = new THREE.Vector3();
  private focusCameraTarget = new THREE.Vector3();
  private responsiveBrowseCamera = browseCamera.clone();
  private lastTimestamp = 0;
  private lastDiagnosticsAt = 0;
  private isDisposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    books: CatalogBook[],
    callbacks: ShelfCallbacks,
  ) {
    this.canvas = canvas;
    this.booksData = books;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(27, 1, 0.08, 80);
    this.camera.position.copy(browseCamera);
    this.camera.lookAt(browseTarget);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 7.2;
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.controls.maxPolarAngle = Math.PI * 0.78;

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.setupScene();
    this.createBooks();
    this.bindEvents();
    this.resizeObserver.observe(canvas);
    this.handleResize();
    this.callbacks.onReady();
    this.animate();
    void this.loadMintAssets();

    (
      window as unknown as {
        __PRESS_LIBRARY__?: {
          diagnostics: () => ReturnType<ShelfEngine["getDiagnostics"]>;
          focus: (index: number) => void;
          browse: (index: number) => void;
          returnToShelf: () => void;
        };
      }
    ).__PRESS_LIBRARY__ = {
      diagnostics: () => this.getDiagnostics(),
      focus: (index) => this.focusBook(index),
      browse: (index) => this.browseTo(index),
      returnToShelf: () => this.returnToShelf(),
    };
  }

  private setupScene() {
    this.scene.background = new THREE.Color("#eee8db");
    this.scene.fog = new THREE.Fog("#eee8db", 10, 26);

    const hemisphere = new THREE.HemisphereLight("#fff8ea", "#6e5848", 2.4);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight("#fff6e7", 4.6);
    key.position.set(-4.2, 7.4, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(
      window.innerWidth < 700 ? 1024 : 2048,
      window.innerWidth < 700 ? 1024 : 2048,
    );
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight("#c8d5e5", 2.1);
    rim.position.set(5, 3, -4);
    this.scene.add(rim);

    const warmBounce = new THREE.PointLight("#d79b72", 1.2, 10, 2);
    warmBounce.position.set(-3, 0.4, 3.2);
    this.scene.add(warmBounce);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 18),
      new THREE.MeshStandardMaterial({
        color: "#eee8db",
        roughness: 1,
        metalness: 0,
      }),
    );
    wall.position.set(0, 5, -3.2);
    wall.receiveShadow = true;
    this.scene.add(wall);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 18),
      new THREE.MeshStandardMaterial({
        color: "#e7dfd0",
        roughness: 0.94,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.24;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(this.shelfGroup);
    this.shelfGroup.add(this.shelfFurniture);
  }

  private createBooks() {
    let cursor = 0;
    const gap = 0.045;

    this.booksData.forEach((book, index) => {
      cursor += book.thickness * 0.5;
      const runtime = this.createBook(book, index, cursor);
      this.runtimeBooks.push(runtime);
      this.shelfGroup.add(runtime.slot);
      cursor += book.thickness * 0.5 + gap;
    });

    const shelfWidth = cursor + 8;
    const shelfGeometry = new RoundedBoxGeometry(shelfWidth, 0.22, 1.72, 4, 0.045);
    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: shelfColor,
      roughness: 0.62,
      metalness: 0.03,
    });
    const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
    shelf.name = "continuousShelf";
    shelf.position.set(cursor * 0.5, shelfTop - 0.14, 0);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    this.shelfFurniture.add(shelf);

    const shelfEdge = new THREE.Mesh(
      new RoundedBoxGeometry(shelfWidth, 0.12, 0.16, 3, 0.025),
      new THREE.MeshPhysicalMaterial({
        color: "#4b3429",
        roughness: 0.46,
        clearcoat: 0.14,
        clearcoatRoughness: 0.5,
      }),
    );
    shelfEdge.position.set(cursor * 0.5, shelfTop - 0.08, 0.85);
    shelfEdge.castShadow = true;
    this.shelfFurniture.add(shelfEdge);
  }

  private createBook(book: CatalogBook, index: number, x: number): RuntimeBook {
    const width = 1.31 + ((index % 5) - 2) * 0.018;
    const depth = book.thickness;
    const slot = new THREE.Group();
    slot.name = `bookSlot:${book.id}`;
    slot.position.set(x, shelfTop + book.height * 0.5, 0.04);

    const content = new THREE.Group();
    content.name = `bookPresentation:${book.id}`;
    slot.add(content);

    const physical = new THREE.Group();
    physical.name = `proceduralBook:${book.id}`;
    content.add(physical);

    const assetHolder = new THREE.Group();
    assetHolder.name = `mintBook:${book.id}`;
    content.add(assetHolder);

    const boardMaterial = new THREE.MeshPhysicalMaterial({
      color: book.cover,
      roughness: 0.78,
      metalness: 0,
      sheen: 0.36,
      sheenColor: new THREE.Color(book.ink),
      sheenRoughness: 0.82,
      clearcoat: book.motif === "gather" ? 0.12 : 0.03,
      clearcoatRoughness: 0.7,
    });
    const paperMaterial = new THREE.MeshStandardMaterial({
      color: pageColor,
      roughness: 0.88,
      metalness: 0,
    });

    const pageBlock = new THREE.Mesh(
      new RoundedBoxGeometry(
        width - 0.075,
        book.height - 0.105,
        Math.max(0.08, depth - 0.052),
        3,
        0.018,
      ),
      paperMaterial,
    );
    pageBlock.name = "pageBlock";
    pageBlock.castShadow = true;
    pageBlock.receiveShadow = true;
    physical.add(pageBlock);

    const boardGeometry = new RoundedBoxGeometry(
      width,
      book.height,
      0.034,
      4,
      0.025,
    );
    const frontBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    frontBoard.name = "frontBoard";
    frontBoard.position.z = depth * 0.5;
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
    physical.add(frontBoard);

    const backBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    backBoard.name = "backBoard";
    backBoard.position.z = -depth * 0.5;
    backBoard.castShadow = true;
    backBoard.receiveShadow = true;
    physical.add(backBoard);

    const spine = new THREE.Mesh(
      new RoundedBoxGeometry(0.055, book.height - 0.01, depth + 0.012, 3, 0.018),
      boardMaterial,
    );
    spine.name = "spine";
    spine.position.x = -width * 0.5 + 0.022;
    spine.castShadow = true;
    physical.add(spine);

    const headbandMaterial = new THREE.MeshPhysicalMaterial({
      color: book.accent,
      roughness: 0.62,
      metalness: 0.2,
    });
    const headbandGeometry = new THREE.CylinderGeometry(0.017, 0.017, width - 0.1, 10);
    headbandGeometry.rotateZ(Math.PI / 2);
    const headbandTop = new THREE.Mesh(headbandGeometry, headbandMaterial);
    headbandTop.position.set(0, book.height * 0.5 - 0.045, 0);
    physical.add(headbandTop);
    const headbandBottom = headbandTop.clone();
    headbandBottom.position.y = -book.height * 0.5 + 0.045;
    physical.add(headbandBottom);

    const frontTexture = toTexture(createFrontCover(book), this.renderer);
    const titleTexture = toTexture(createTitleDecal(book), this.renderer);
    const spineTexture = toTexture(createSpineCover(book), this.renderer, 4);
    const backTexture = toTexture(createBackCover(book), this.renderer);
    const textures = [frontTexture, titleTexture, spineTexture, backTexture];

    const frontSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        roughness: 0.66,
        metalness: 0.02,
        clearcoat: book.motif === "gather" ? 0.18 : 0.05,
        clearcoatRoughness: 0.48,
      }),
    );
    frontSurface.name = "frontArtwork";
    frontSurface.position.z = depth * 0.5 + 0.019;
    physical.add(frontSurface);

    const titleDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
      new THREE.MeshBasicMaterial({
        map: titleTexture,
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    titleDecal.name = "accurateTitleDecal";
    titleDecal.position.z = depth * 0.5 + 0.026;
    titleDecal.visible = false;
    content.add(titleDecal);

    const backSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
      new THREE.MeshStandardMaterial({
        map: backTexture,
        roughness: 0.72,
      }),
    );
    backSurface.name = "backArtwork";
    backSurface.position.z = -depth * 0.5 - 0.019;
    backSurface.rotation.y = Math.PI;
    physical.add(backSurface);

    const spineSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(depth - 0.02, book.height - 0.04),
      new THREE.MeshPhysicalMaterial({
        map: spineTexture,
        roughness: 0.68,
        metalness: 0.015,
      }),
    );
    spineSurface.name = "spineArtwork";
    spineSurface.rotation.y = -Math.PI / 2;
    spineSurface.position.x = -width * 0.5 - 0.019;
    physical.add(spineSurface);

    let livingMaterial: THREE.ShaderMaterial | undefined;
    if (book.living) {
      livingMaterial = createLivingMaterial(book.accent);
      const shimmer = new THREE.Mesh(
        new THREE.PlaneGeometry(width - 0.07, book.height - 0.07),
        livingMaterial,
      );
      shimmer.name = "livingCoverShimmer";
      shimmer.position.z = depth * 0.5 + 0.034;
      content.add(shimmer);
    }

    const pickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, book.height, depth + 0.07),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    pickProxy.name = `pick:${book.id}`;
    pickProxy.userData.bookIndex = index;
    content.add(pickProxy);
    this.pickTargets.push(pickProxy);

    return {
      data: book,
      index,
      slot,
      content,
      physical,
      assetHolder,
      titleDecal,
      pickProxy,
      livingMaterial,
      x,
      hover: 0,
      targetHover: 0,
      textures,
    };
  }

  private bindEvents() {
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private handleWheel = (event: WheelEvent) => {
    if (this.mode !== "browse") return;
    event.preventDefault();
    const dominant =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    this.targetScrollIndex = clamp(
      this.targetScrollIndex + dominant * 0.0024,
      0,
      this.runtimeBooks.length - 1,
    );
    this.lastInputTime = performance.now();
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (this.mode !== "browse") return;
    this.pointerDown = true;
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerLastX = event.clientX;
    this.pointerTravel = 0;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    if (this.mode !== "browse") return;

    if (this.pointerDown && event.pointerId === this.pointerId) {
      const delta = event.clientX - this.pointerLastX;
      this.pointerLastX = event.clientX;
      this.pointerTravel += Math.abs(delta);
      this.targetScrollIndex = clamp(
        this.targetScrollIndex - delta / Math.max(105, this.canvas.clientWidth * 0.11),
        0,
        this.runtimeBooks.length - 1,
      );
      this.lastInputTime = performance.now();
      this.canvas.classList.add("is-dragging");
      return;
    }

    this.updateHover();
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    const wasClick = this.pointerTravel < 7 && Math.abs(event.clientX - this.pointerStartX) < 7;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.mode === "browse" && wasClick) {
      this.updatePointer(event);
      const hit = this.raycastBook();
      if (hit !== null) this.focusBook(hit);
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handlePointerLeave = () => {
    if (!this.pointerDown) {
      this.runtimeBooks.forEach((book) => {
        book.targetHover = 0;
      });
      this.canvas.style.cursor = "grab";
    }
  };

  private handleWindowBlur = () => {
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.returnToShelf();
      return;
    }
    if ((event.key === "r" || event.key === "R") && this.mode === "inspect") {
      this.resetFocusView();
      return;
    }
    if (this.mode !== "browse") return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.browseBy(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.browseBy(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.browseTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.browseTo(this.runtimeBooks.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.focusBook(this.activeIndex);
    }
  };

  private updatePointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastBook() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    return typeof hit?.object.userData.bookIndex === "number"
      ? (hit.object.userData.bookIndex as number)
      : null;
  }

  private updateHover() {
    const hit = this.raycastBook();
    this.runtimeBooks.forEach((book) => {
      book.targetHover = book.index === hit ? 1 : 0;
    });
    this.canvas.style.cursor = hit === null ? "grab" : "pointer";
  }

  private xAtIndex(index: number) {
    const lower = Math.floor(index);
    const upper = Math.min(this.runtimeBooks.length - 1, Math.ceil(index));
    const fraction = index - lower;
    return THREE.MathUtils.lerp(
      this.runtimeBooks[lower]?.x ?? 0,
      this.runtimeBooks[upper]?.x ?? 0,
      fraction,
    );
  }

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const timestamp = performance.now();
    const elapsed = timestamp / 1000;
    const delta = clamp((timestamp - this.lastTimestamp) / 1000 || 1 / 60, 0, 0.05);
    this.lastTimestamp = timestamp;

    this.updateState(delta, timestamp);
    this.updateBooks(delta, elapsed);

    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (timestamp - this.lastDiagnosticsAt > 500) {
      const diagnostics = this.getDiagnostics();
      this.canvas.dataset.drawCalls = String(diagnostics.drawCalls);
      this.canvas.dataset.triangles = String(diagnostics.triangles);
      this.canvas.dataset.geometries = String(diagnostics.geometries);
      this.canvas.dataset.textures = String(diagnostics.textures);
      this.canvas.dataset.mintAssets = String(diagnostics.mintAssetsLoaded);
      this.canvas.dataset.pixelRatio = String(diagnostics.pixelRatio);
      this.lastDiagnosticsAt = timestamp;
    }
  };

  private updateState(delta: number, timestamp: number) {
    if (this.mode === "browse") {
      if (!this.pointerDown && timestamp - this.lastInputTime > 150) {
        this.targetScrollIndex = damp(
          this.targetScrollIndex,
          Math.round(this.targetScrollIndex),
          this.reducedMotion ? 18 : 8.5,
          delta,
        );
      }
      this.scrollIndex = damp(
        this.scrollIndex,
        this.targetScrollIndex,
        this.reducedMotion ? 20 : 10,
        delta,
      );
      this.focusProgress = damp(this.focusProgress, 0, 10, delta);
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 18 : 7) * delta),
      );
      this.camera.lookAt(browseTarget);
    } else if (this.mode === "focusing") {
      this.focusProgress = damp(
        this.focusProgress,
        1,
        this.reducedMotion ? 18 : 5.4,
        delta,
      );
      this.updateFocusCamera(delta);
      if (this.focusProgress > 0.985) {
        this.focusProgress = 1;
        this.mode = "inspect";
        this.controls.enabled = true;
        this.controls.target.copy(this.focusCameraTarget);
        this.callbacks.onMode(this.mode, this.selectedIndex);
        if (this.selectedIndex !== null) {
          this.callbacks.onStatus(
            `Inspecting ${this.runtimeBooks[this.selectedIndex].data.shortTitle}`,
          );
        }
      }
    } else if (this.mode === "returning") {
      this.controls.enabled = false;
      this.focusProgress = damp(
        this.focusProgress,
        0,
        this.reducedMotion ? 20 : 6.4,
        delta,
      );
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 18 : 7.2) * delta),
      );
      this.camera.lookAt(browseTarget);
      if (this.focusProgress < 0.012) {
        this.focusProgress = 0;
        this.selectedIndex = null;
        this.mode = "browse";
        this.callbacks.onMode(this.mode, null);
        this.callbacks.onStatus(
          this.assetCount > 0
            ? `${this.assetCount} original Stripe Press editions ready`
            : "19 authored fallback volumes ready",
        );
        this.canvas.focus({ preventScroll: true });
      }
    }

    const nextActive = clamp(
      Math.round(this.scrollIndex),
      0,
      this.runtimeBooks.length - 1,
    );
    if (nextActive !== this.activeIndex) {
      this.activeIndex = nextActive;
      this.callbacks.onActiveIndex(this.activeIndex);
    }
    this.shelfGroup.position.x = -this.xAtIndex(this.scrollIndex);
  }

  private updateBooks(delta: number, elapsed: number) {
    const isolated = this.selectedIndex !== null && this.focusProgress > 0.72;
    this.shelfFurniture.visible = !isolated;

    this.runtimeBooks.forEach((book) => {
      const centerDistance = Math.abs(book.index - this.scrollIndex);
      const reveal = ease(1 - clamp(centerDistance / 0.82, 0, 1));
      book.hover = damp(book.hover, book.targetHover, 12, delta);

      const isSelected = book.index === this.selectedIndex;
      const focus = isSelected ? this.focusProgress : 0;
      const isSuppressed = this.selectedIndex !== null && !isSelected;
      book.content.visible = !isolated || isSelected;
      const focusOffsetX = window.innerWidth < 760 ? 0 : -0.58;
      const focusDepth = window.innerWidth < 760 ? 1.4 : 1.66;
      const focusScale = window.innerWidth < 760 ? 0.92 : 1.08;

      const baseZ =
        -(1 - reveal) * 0.64 + reveal * 0.4 + book.hover * 0.12;
      const baseScale = 1 + reveal * 0.035 + book.hover * 0.015;
      const baseRotation = THREE.MathUtils.lerp(Math.PI / 2, 0, reveal);

      book.content.rotation.y = damp(
        book.content.rotation.y,
        THREE.MathUtils.lerp(baseRotation, 0, focus),
        this.reducedMotion ? 22 : 10,
        delta,
      );
      book.content.position.x = damp(
        book.content.position.x,
        THREE.MathUtils.lerp(0, focusOffsetX, focus),
        this.reducedMotion ? 22 : 8,
        delta,
      );
      book.content.position.z = damp(
        book.content.position.z,
        isSelected
          ? THREE.MathUtils.lerp(baseZ, focusDepth, focus)
          : baseZ - (isSuppressed ? this.focusProgress * 0.78 : 0),
        this.reducedMotion ? 22 : 8,
        delta,
      );
      book.content.position.y = damp(
        book.content.position.y,
        isSelected ? focus * 0.04 : 0,
        this.reducedMotion ? 22 : 8,
        delta,
      );
      const targetScale = isSelected
        ? THREE.MathUtils.lerp(baseScale, focusScale, focus)
        : baseScale * (isSuppressed ? 1 - this.focusProgress * 0.055 : 1);
      const nextScale = damp(
        book.content.scale.x,
        targetScale,
        this.reducedMotion ? 22 : 8,
        delta,
      );
      book.content.scale.setScalar(nextScale);

      if (book.livingMaterial) {
        book.livingMaterial.uniforms.uTime.value = elapsed;
        const livingStrength =
          this.reducedMotion
            ? 0
            : isSelected
              ? 0.24 + focus * 0.55
              : reveal * 0.24;
        book.livingMaterial.uniforms.uStrength.value = damp(
          book.livingMaterial.uniforms.uStrength.value,
          livingStrength,
          5,
          delta,
        );
      }
    });
  }

  private updateFocusCamera(delta: number) {
    if (this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    const mobileOffset = window.innerWidth < 760 ? -0.28 : 0;
    this.focusCameraTarget.set(
      worldPosition.x,
      worldPosition.y + mobileOffset,
      worldPosition.z,
    );
    this.focusCameraPosition.set(
      worldPosition.x + 0.58,
      worldPosition.y + 0.12,
      worldPosition.z + (window.innerWidth < 760 ? 5.8 : 5.4),
    );
    this.camera.position.lerp(
      this.focusCameraPosition,
      1 - Math.exp(-(this.reducedMotion ? 20 : 5.6) * delta),
    );
    this.camera.lookAt(this.focusCameraTarget);
  }

  private handleResize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dprCap = width < 760 ? 1.5 : 1.75;
    this.responsiveBrowseCamera.set(
      0,
      width < 760 ? 1.5 : browseCamera.y,
      width < 760 ? 8.3 : browseCamera.z,
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 33 : width < 920 ? 30 : 27;
    this.camera.updateProjectionMatrix();
    if (this.mode === "browse" && this.focusProgress < 0.01) {
      this.camera.position.copy(this.responsiveBrowseCamera);
      this.camera.lookAt(browseTarget);
    }
  };

  private async loadMintAssets() {
    try {
      this.callbacks.onStatus("Loading nineteen original Mint editions");
      const response = await fetch("/assets/mint/manifest.json");
      if (!response.ok) throw new Error("Mint asset manifest unavailable");

      const manifest = (await response.json()) as MintAssetManifest;
      await Promise.allSettled(
        manifest.assets.map((bookAsset) => this.loadMintBook(bookAsset)),
      );
      this.callbacks.onStatus(
        this.assetFailures > 0
          ? `${this.assetCount} Mint editions loaded · ${this.assetFailures} authored fallbacks`
          : `${this.assetCount} original Mint editions ready`,
      );
    } catch {
      this.callbacks.onStatus("19 authored fallback volumes ready");
    }
  }

  private async loadMintBook(bookAsset: MintBookAsset) {
    const runtime = this.runtimeBooks.find(
      (book) => book.data.id === bookAsset.id,
    );
    if (!runtime) return;

    try {
      const gltf = await new GLTFLoader().loadAsync(bookAsset.file);
      if (this.isDisposed) return;

      const root = gltf.scene;
      root.name = `mintEdition:${bookAsset.id}`;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshPhysicalMaterial
          ) {
            material.envMapIntensity = 0.55;
            material.needsUpdate = true;
          }
        });
      });

      root.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(root);
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      const targetWidth = 1.31 + ((runtime.index % 5) - 2) * 0.018;
      root.scale.set(
        targetWidth / Math.max(0.001, sourceSize.x),
        runtime.data.height / Math.max(0.001, sourceSize.y),
        runtime.data.thickness / Math.max(0.001, sourceSize.z),
      );
      root.updateMatrixWorld(true);
      const normalized = new THREE.Box3().setFromObject(root);
      const center = normalized.getCenter(new THREE.Vector3());
      root.position.sub(center);

      runtime.assetHolder.add(root);
      runtime.physical.visible = false;
      runtime.titleDecal.visible = true;
      runtime.textures.forEach((texture) => texture.dispose());
      runtime.textures.length = 0;
      this.assetCount += 1;
    } catch {
      this.assetFailures += 1;
    }
  }

  browseBy(direction: number) {
    if (this.mode !== "browse") return;
    this.browseTo(Math.round(this.targetScrollIndex) + direction);
  }

  browseTo(index: number) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.targetScrollIndex = next;
    this.lastInputTime = performance.now() - 1000;
  }

  focusBook(index = this.activeIndex) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.targetScrollIndex = next;
    this.scrollIndex = next;
    this.activeIndex = next;
    this.selectedIndex = next;
    this.focusProgress = 0;
    this.mode = "focusing";
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
    this.callbacks.onActiveIndex(next);
    this.callbacks.onMode(this.mode, next);
    this.callbacks.onStatus(`Opening ${this.runtimeBooks[next].data.shortTitle}`);
  }

  returnToShelf() {
    if (this.mode === "browse" || this.mode === "returning") return;
    this.controls.enabled = false;
    this.mode = "returning";
    this.callbacks.onMode(this.mode, this.selectedIndex);
    this.callbacks.onStatus("Returning to the complete shelf");
  }

  resetFocusView() {
    if (this.mode !== "inspect" || this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.controls.target.set(
      worldPosition.x,
      worldPosition.y + (window.innerWidth < 760 ? -0.28 : 0),
      worldPosition.z,
    );
    this.camera.position.set(
      worldPosition.x + 0.58,
      worldPosition.y + 0.12,
      worldPosition.z + (window.innerWidth < 760 ? 5.8 : 5.4),
    );
    this.controls.update();
  }

  getDiagnostics() {
    const info = this.renderer.info;
    return {
      mode: this.mode,
      activeIndex: this.activeIndex,
      selectedIndex: this.selectedIndex,
      books: this.runtimeBooks.length,
      mintAssetsLoaded: this.assetCount,
      mintAssetFailures: this.assetFailures,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
      },
    };
  }

  dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("blur", this.handleWindowBlur);

    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material?.dispose());
    });
    this.runtimeBooks.forEach((book) => {
      book.textures.forEach((texture) => texture.dispose());
    });
    this.renderer.dispose();
    delete (
      window as unknown as {
        __PRESS_LIBRARY__?: unknown;
      }
    ).__PRESS_LIBRARY__;
  }
}
