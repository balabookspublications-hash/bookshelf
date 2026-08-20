import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CatalogBook } from "./catalog";
import {
  bookFootprintsOverlap,
  createMotionLayout,
  focusedBookPose,
  presentedBookPose,
  type BookFootprint,
  type BookPose,
  type MotionLayout,
} from "./book-motion";
import {
  createBackCover,
  createFrontCover,
  createSpineCover,
} from "./cover-art";
import {
  STRIPE_ASSET_ROOT,
  stripeAssetUrl,
  type StripeBookAsset,
} from "./stripe-assets";
import {
  addStripeFoilBlend,
  stripeFoilSettings,
} from "./stripe-foil";

export type ShelfMode = "browse" | "focusing" | "inspect" | "returning";

type ShelfCallbacks = {
  onActiveIndex: (index: number) => void;
  onMode: (mode: ShelfMode, selectedIndex: number | null) => void;
  onReady: () => void;
};

type RuntimeBook = {
  data: CatalogBook;
  index: number;
  slot: THREE.Group;
  content: THREE.Group;
  inspectionIdle: THREE.Group;
  physical: THREE.Group;
  assetHolder: THREE.Group;
  frontSurface: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshPhysicalMaterial
  >;
  pickProxy: THREE.Mesh;
  livingMaterial?: THREE.ShaderMaterial;
  x: number;
  row: number;
  width: number;
  pose: BookPose;
  hover: number;
  targetHover: number;
  idleAmount: number;
  textures: THREE.Texture[];
};

const shelfTop = 0.34;
const browseCamera = new THREE.Vector3(0, 1.42, 6.65);
const browseTarget = new THREE.Vector3(0, 1.28, 0.15);
const pageColor = new THREE.Color("#e8dcc4");
const shelfColor = new THREE.Color("#ffffff");
const brassColor = new THREE.Color("#b48736");
const navyColor = new THREE.Color("#142437");
const clamp = THREE.MathUtils.clamp;
const focusInDuration = 0.46;
const focusOutDuration = 0.34;
const desktopDetailWidthRatio = 0.41;
const compactDetailWidthRatio = 0.48;
const desktopDetailMaxWidth = 620;
const compactDetailMaxWidth = 570;
const desktopFocusX = -0.58;
const desktopFocusZ = 1.82;
const desktopFocusScale = 1.12;
const mobileFocusZ = 1.52;
const mobileFocusScale = 1.06;
const hoverExtraction = 0.032;
const hoverLift = 0.018;
const libraryColumns = 3;
const libraryColumnSpacing = 1.72;
const libraryRowSpacing = 2.58;
const librarySidePadding = 0.58;
const compactLibraryScale = 0.46;

// Downloaded Stripe OBJ basis: X = thickness, Y = up/height, Z = width,
// and the front cover is on +X. Rotating -90° maps that cover to world +Z,
// toward the browse camera.
const stripeBookCoverFacingRotationY = -Math.PI / 2;

// Raycast-only geometry lives here. The camera renders layer 0 exclusively, so
// pick proxies keep their animated transforms without ever being drawn.
const pickLayer = 1;

function damp(current: number, target: number, lambda: number, delta: number) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function easeOutCubic(value: number) {
  const t = 1 - clamp(value, 0, 1);
  return 1 - t * t * t;
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

function createWalnutTexture(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#3a2118");
  gradient.addColorStop(0.48, "#2c1711");
  gradient.addColorStop(1, "#1f100c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // A small deterministic grain texture gives the shelf material identity
  // without adding a downloaded asset or a unique texture per shelf piece.
  for (let line = 0; line < 46; line += 1) {
    const y = 4 + ((line * 29) % 119);
    const amplitude = 1.2 + (line % 5) * 0.42;
    context.beginPath();
    for (let x = -12; x <= canvas.width + 12; x += 12) {
      const wave = Math.sin(x * 0.021 + line * 1.73) * amplitude;
      if (x === -12) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.strokeStyle =
      line % 4 === 0 ? "rgba(9, 4, 2, 0.2)" : "rgba(151, 92, 56, 0.08)";
    context.lineWidth = line % 4 === 0 ? 1.2 : 0.7;
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "sharedWalnutGrain";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5.5, 1);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
  private hoverNeedsUpdate = false;
  private pointer = new THREE.Vector2(10, 10);
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private mode: ShelfMode = "browse";
  private selectedIndex: number | null = null;
  private activeIndex = 0;
  private presentedIndex: number | null = 0;
  private motionLayout: MotionLayout = createMotionLayout([]);
  private libraryRows = 1;
  private libraryWidth = 1;
  private libraryCenterY = 1.4;
  private collisionRejects = 0;
  private lastCollisionPair: [string, string] | null = null;
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
  private stripeTextureCache = new Map<
    string,
    Promise<THREE.Texture | null>
  >();
  private stripeTextures = new Set<THREE.Texture>();
  private environmentTextures = new Set<THREE.Texture>();
  private stripeGeometry: THREE.BufferGeometry | null = null;
  private stripeGeometrySize = new THREE.Vector3();
  private focusCameraPosition = new THREE.Vector3();
  private focusCameraTarget = new THREE.Vector3();
  private responsiveBrowseCamera = browseCamera.clone();
  private responsiveBrowseTarget = browseTarget.clone();
  private isCompactViewport = false;
  private viewWidth = 1;
  private viewHeight = 1;
  private canvasRect: DOMRect | null = null;
  private lastTimestamp = 0;
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
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(27, 1, 0.08, 80);
    this.camera.position.copy(browseCamera);
    this.camera.lookAt(browseTarget);
    this.camera.layers.disable(pickLayer);
    this.raycaster.layers.set(pickLayer);

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
    this.scheduleStripeAssetLoad();
  }

  private setupScene() {
    this.scene.background = new THREE.Color("#17110e");
    this.scene.fog = new THREE.Fog("#17110e", 11, 27);

    const hemisphere = new THREE.HemisphereLight("#f4dfb9", "#24140e", 1.35);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight("#ffdca4", 3.15);
    key.position.set(-3.6, 8.4, 3.8);
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

    const coverFill = new THREE.DirectionalLight("#f7e8ce", 1.25);
    coverFill.position.set(1.2, 2.6, 7.5);
    this.scene.add(coverFill);

    const rim = new THREE.DirectionalLight("#617a9a", 0.72);
    rim.position.set(5.5, 3.6, -4.5);
    this.scene.add(rim);

    const warmBounce = new THREE.PointLight("#c48752", 0.82, 9, 2);
    warmBounce.position.set(-2.8, 0.25, 2.8);
    this.scene.add(warmBounce);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 18),
      new THREE.MeshStandardMaterial({
        color: "#1d1715",
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
        color: "#211713",
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
    this.booksData.forEach((book, index) => {
      const runtime = this.createBook(book, index, 0);
      this.runtimeBooks.push(runtime);
      this.shelfGroup.add(runtime.slot);
      if (book.coverImage) {
        void this.loadCustomCover(runtime, book.coverImage);
      }
    });

    const visibleColumns = Math.min(
      libraryColumns,
      Math.max(1, this.runtimeBooks.length),
    );
    this.libraryRows = Math.max(
      1,
      Math.ceil(this.runtimeBooks.length / visibleColumns),
    );
    this.libraryWidth =
      (visibleColumns - 1) * libraryColumnSpacing +
      1.31 +
      librarySidePadding * 2;
    this.libraryCenterY =
      shelfTop + 1.08 + ((this.libraryRows - 1) * libraryRowSpacing) / 2;

    this.runtimeBooks.forEach((book, index) => {
      const row = Math.floor(index / visibleColumns);
      const rowStart = row * visibleColumns;
      const booksInRow = Math.min(
        visibleColumns,
        this.runtimeBooks.length - rowStart,
      );
      const column = index - rowStart;
      const x = (column - (booksInRow - 1) / 2) * libraryColumnSpacing;
      book.x = x;
      book.row = row;
      book.slot.position.set(
        x,
        shelfTop + row * libraryRowSpacing + book.data.height * 0.5,
        0.04,
      );
    });

    this.motionLayout = createMotionLayout(
      this.runtimeBooks.map((book) => ({
        width: book.width,
        thickness: book.data.thickness,
      })),
    );
    this.runtimeBooks.forEach((book) => {
      this.commitBookPose(
        book,
        presentedBookPose(this.motionLayout),
        false,
      );
    });

    const walnutTexture = createWalnutTexture(this.renderer);
    if (walnutTexture) this.environmentTextures.add(walnutTexture);
    const shelfGeometry = new RoundedBoxGeometry(
      this.libraryWidth,
      0.22,
      1.72,
      4,
      0.045,
    );
    const shelfEdgeGeometry = new RoundedBoxGeometry(
      this.libraryWidth,
      0.12,
      0.16,
      3,
      0.025,
    );
    const brassGeometry = new RoundedBoxGeometry(
      this.libraryWidth - 0.18,
      0.024,
      0.028,
      2,
      0.008,
    );
    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: shelfColor,
      map: walnutTexture,
      roughness: 0.7,
      metalness: 0.02,
    });
    const shelfEdgeMaterial = new THREE.MeshPhysicalMaterial({
      color: "#c2a28d",
      map: walnutTexture,
      roughness: 0.58,
      clearcoat: 0.08,
      clearcoatRoughness: 0.62,
    });
    const brassMaterial = new THREE.MeshStandardMaterial({
      color: brassColor,
      roughness: 0.46,
      metalness: 0.68,
    });

    for (let row = 0; row <= this.libraryRows; row += 1) {
      const rowY = shelfTop + row * libraryRowSpacing;
      const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
      shelf.name = row === this.libraryRows ? "libraryCrown" : `libraryShelf:${row}`;
      shelf.position.set(0, rowY - 0.14, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      this.shelfFurniture.add(shelf);

      const shelfEdge = new THREE.Mesh(shelfEdgeGeometry, shelfEdgeMaterial);
      shelfEdge.name = `walnutShelfEdge:${row}`;
      shelfEdge.position.set(0, rowY - 0.08, 0.85);
      shelfEdge.castShadow = true;
      this.shelfFurniture.add(shelfEdge);

      const brassInlay = new THREE.Mesh(brassGeometry, brassMaterial);
      brassInlay.name = `brassShelfInlay:${row}`;
      brassInlay.position.set(0, rowY - 0.025, 0.94);
      this.shelfFurniture.add(brassInlay);
    }

    const cabinetHeight = this.libraryRows * libraryRowSpacing + 0.38;
    const backPanel = new THREE.Mesh(
      new RoundedBoxGeometry(this.libraryWidth, cabinetHeight, 0.1, 3, 0.025),
      new THREE.MeshStandardMaterial({
        color: navyColor,
        roughness: 0.92,
        metalness: 0,
      }),
    );
    backPanel.name = "navyShelfBacking";
    backPanel.position.set(0, shelfTop + cabinetHeight * 0.5 - 0.15, -1.38);
    backPanel.receiveShadow = true;
    this.shelfFurniture.add(backPanel);

    const uprightGeometry = new RoundedBoxGeometry(
      0.18,
      cabinetHeight,
      1.82,
      3,
      0.035,
    );
    for (const side of [-1, 1]) {
      const upright = new THREE.Mesh(uprightGeometry, shelfMaterial);
      upright.name = side < 0 ? "libraryUpright:left" : "libraryUpright:right";
      upright.position.set(
        side * (this.libraryWidth * 0.5 - 0.09),
        shelfTop + cabinetHeight * 0.5 - 0.15,
        0,
      );
      upright.castShadow = true;
      upright.receiveShadow = true;
      this.shelfFurniture.add(upright);
    }
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
    const pose = presentedBookPose(this.motionLayout);
    content.position.set(pose.x, 0, pose.z);
    content.rotation.y = pose.yaw;
    content.scale.setScalar(pose.scale);

    const inspectionIdle = new THREE.Group();
    inspectionIdle.name = `bookInspectionIdle:${book.id}`;
    content.add(inspectionIdle);

    const physical = new THREE.Group();
    physical.name = `proceduralBook:${book.id}`;
    inspectionIdle.add(physical);

    const assetHolder = new THREE.Group();
    assetHolder.name = `stripePressBook:${book.id}`;
    inspectionIdle.add(assetHolder);

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

    // One mesh for every part that shares the same shadow flags. The material
    // array keeps the paper block and the boards visually distinct while the
    // whole body travels as a single culled, single-transform object.
    const pageGeometry = new RoundedBoxGeometry(
      width - 0.075,
      book.height - 0.105,
      Math.max(0.08, depth - 0.052),
      3,
      0.018,
    );
    const boardGeometry = new RoundedBoxGeometry(
      width,
      book.height,
      0.034,
      4,
      0.025,
    );
    const boardsGeometry = mergeGeometries(
      [
        boardGeometry.clone().translate(0, 0, depth * 0.5),
        boardGeometry.clone().translate(0, 0, -depth * 0.5),
      ],
      false,
    );
    boardGeometry.dispose();
    const bodyGeometry = mergeGeometries([pageGeometry, boardsGeometry], true);
    pageGeometry.dispose();
    boardsGeometry.dispose();
    const body = new THREE.Mesh(bodyGeometry, [paperMaterial, boardMaterial]);
    body.name = "bookBody";
    body.castShadow = true;
    body.receiveShadow = true;
    physical.add(body);

    // The spine casts but does not receive, so it stays its own mesh.
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
    const headbandSource = new THREE.CylinderGeometry(
      0.017,
      0.017,
      width - 0.1,
      10,
    );
    headbandSource.rotateZ(Math.PI / 2);
    const headbandGeometry = mergeGeometries(
      [
        headbandSource.clone().translate(0, book.height * 0.5 - 0.045, 0),
        headbandSource.clone().translate(0, -book.height * 0.5 + 0.045, 0),
      ],
      false,
    );
    headbandSource.dispose();
    const headbands = new THREE.Mesh(headbandGeometry, headbandMaterial);
    headbands.name = "headbands";
    physical.add(headbands);

    const frontTexture = toTexture(createFrontCover(book), this.renderer);
    const spineTexture = toTexture(createSpineCover(book), this.renderer, 4);
    const backTexture = toTexture(createBackCover(book), this.renderer);
    const textures = [frontTexture, spineTexture, backTexture];

    const frontSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshPhysicalMaterial
    >(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        roughness: 0.72,
        metalness: 0.01,
        clearcoat: book.motif === "gather" ? 0.1 : 0.025,
        clearcoatRoughness: 0.68,
        emissive: new THREE.Color(book.accent),
        emissiveIntensity: 0,
      }),
    );
    frontSurface.name = "frontArtwork";
    frontSurface.position.z = depth * 0.5 + 0.019;
    physical.add(frontSurface);

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
      inspectionIdle.add(shimmer);
    }

    // The pick proxy only ever answers raycasts. Parking it on the pick layer
    // keeps it parented — so it still inherits the animated transform — while
    // the camera never renders it. `visible = false` would not work here: an
    // invisible mesh is still submitted, and a raycast ignores the flag.
    const pickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, book.height, depth + 0.07),
    );
    pickProxy.name = `pick:${book.id}`;
    pickProxy.userData.bookIndex = index;
    pickProxy.layers.set(pickLayer);
    inspectionIdle.add(pickProxy);
    this.pickTargets.push(pickProxy);

    return {
      data: book,
      index,
      slot,
      content,
      inspectionIdle,
      physical,
      assetHolder,
      frontSurface,
      pickProxy,
      livingMaterial,
      x,
      row: 0,
      width,
      pose,
      hover: 0,
      targetHover: 0,
      idleAmount: 0,
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

    this.hoverNeedsUpdate = true;
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
      this.hoverNeedsUpdate = false;
      this.pointer.set(10, 10);
      this.runtimeBooks.forEach((book) => {
        book.targetHover = 0;
      });
      this.canvas.style.cursor = "grab";
    }
  };

  private handleWindowBlur = () => {
    this.pointerDown = false;
    this.pointerId = null;
    this.hoverNeedsUpdate = false;
    this.pointer.set(10, 10);
    this.canvas.classList.remove("is-dragging");
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
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
    // The rect is refreshed on resize and scroll rather than per event, so a
    // fast pointer sweep no longer forces a layout on every move.
    const rect = this.canvasRect ?? this.refreshCanvasRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private refreshCanvasRect() {
    this.canvasRect = this.canvas.getBoundingClientRect();
    return this.canvasRect;
  }

  private raycastBook() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    return typeof hit?.object.userData.bookIndex === "number"
      ? (hit.object.userData.bookIndex as number)
      : null;
  }

  private applyHover() {
    const hit = this.raycastBook();
    this.runtimeBooks.forEach((book) => {
      book.targetHover = book.index === hit ? 1 : 0;
    });
    const cursor = hit === null ? "grab" : "pointer";
    if (this.canvas.style.cursor !== cursor) {
      this.canvas.style.cursor = cursor;
    }
  }

  private footprintFor(
    book: RuntimeBook,
    pose: BookPose = book.pose,
  ): BookFootprint {
    return {
      id: book.data.id,
      x: book.x + pose.x,
      z: book.slot.position.z + pose.z,
      yaw: pose.yaw,
      scale: pose.scale,
      width: book.width,
      thickness: book.data.thickness,
    };
  }

  private collisionFor(book: RuntimeBook, pose: BookPose) {
    const proposed = this.footprintFor(book, pose);
    return (
      this.runtimeBooks.find(
        (other) => {
          if (other === book) return false;
          const bookCenterY = book.slot.position.y + book.content.position.y;
          const otherCenterY = other.slot.position.y + other.content.position.y;
          const minimumVerticalDistance =
            (book.data.height * pose.scale +
              other.data.height * other.pose.scale) *
              0.5 +
            this.motionLayout.collisionMargin;
          if (
            Math.abs(bookCenterY - otherCenterY) >= minimumVerticalDistance
          ) {
            return false;
          }
          return bookFootprintsOverlap(
            proposed,
            this.footprintFor(other),
            this.motionLayout.collisionMargin,
          );
        },
      ) ?? null
    );
  }

  private commitBookPose(
    book: RuntimeBook,
    pose: BookPose,
    guardCollision = true,
  ) {
    if (guardCollision) {
      const collidedWith = this.collisionFor(book, pose);
      if (collidedWith) {
        this.collisionRejects += 1;
        this.lastCollisionPair = [book.data.id, collidedWith.data.id];
        return false;
      }
    }

    book.pose = { ...pose };
    book.content.position.x = pose.x;
    book.content.position.z = pose.z;
    book.content.rotation.y = pose.yaw;
    book.content.scale.setScalar(pose.scale);
    return true;
  }

  private beginFocus(index: number) {
    if (this.mode !== "browse") return;
    this.selectedIndex = index;
    this.focusProgress = 0;
    this.mode = "focusing";
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
    this.callbacks.onMode(this.mode, index);
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

    // Hover raycasts collapse to at most one per frame. A fast pointer sweep
    // fires far more pointermove events than there are frames to show them.
    if (this.hoverNeedsUpdate) {
      this.hoverNeedsUpdate = false;
      this.applyHover();
    }

    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
      this.camera.lookAt(this.responsiveBrowseTarget);
    } else if (this.mode === "focusing") {
      this.focusProgress = clamp(
        this.focusProgress +
          delta / (this.reducedMotion ? 0.08 : focusInDuration),
        0,
        1,
      );
      this.updateFocusCamera(delta);
      if (this.focusProgress >= 1) {
        this.mode = "inspect";
        this.controls.enabled = true;
        this.controls.target.copy(this.focusCameraTarget);
        this.callbacks.onMode(this.mode, this.selectedIndex);
      }
    } else if (this.mode === "returning") {
      this.controls.enabled = false;
      this.focusProgress = clamp(
        this.focusProgress -
          delta / (this.reducedMotion ? 0.08 : focusOutDuration),
        0,
        1,
      );
      this.applyFocusViewOffset(easeOutCubic(this.focusProgress));
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 24 : 14) * delta),
      );
      this.camera.lookAt(this.responsiveBrowseTarget);
      if (this.focusProgress <= 0) {
        if (this.selectedIndex !== null) {
          this.commitBookPose(
            this.runtimeBooks[this.selectedIndex],
            presentedBookPose(this.motionLayout),
          );
          this.presentedIndex = this.selectedIndex;
        }
        this.selectedIndex = null;
        this.mode = "browse";
        this.callbacks.onMode(this.mode, null);
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
      this.presentedIndex = nextActive;
      this.callbacks.onActiveIndex(this.activeIndex);
    }
    this.shelfGroup.position.x = 0;
    const targetLibraryScale =
      this.mode === "browse" && this.isCompactViewport
        ? compactLibraryScale
        : 1;
    const nextLibraryScale = damp(
      this.shelfGroup.scale.x,
      targetLibraryScale,
      this.reducedMotion ? 24 : 11,
      delta,
    );
    this.shelfGroup.scale.setScalar(nextLibraryScale);
  }

  private updateBooks(delta: number, elapsed: number) {
    const motionFocus =
      this.mode === "returning"
        ? this.focusProgress
        : easeOutCubic(this.focusProgress);
    const isolated = this.selectedIndex !== null && motionFocus > 0.72;
    this.shelfFurniture.visible = !isolated;
    // Resolved on resize, not per frame: reading layout inside the loop can
    // force a synchronous reflow.
    const compact = this.isCompactViewport;
    const desiredFocusX = compact ? 0 : desktopFocusX;
    const focusZ = compact ? mobileFocusZ : desktopFocusZ;
    const focusScale = compact ? mobileFocusScale : desktopFocusScale;

    if (this.selectedIndex !== null) {
      const selected = this.runtimeBooks[this.selectedIndex];
      const focusX = desiredFocusX - selected.slot.position.x;
      this.commitBookPose(
        selected,
        focusedBookPose(
          motionFocus,
          this.motionLayout,
          focusX,
          focusZ,
          focusScale,
        ),
      );
    }

    this.runtimeBooks.forEach((book) => {
      book.hover = damp(book.hover, book.targetHover, 12, delta);

      const isSelected = book.index === this.selectedIndex;
      book.content.visible = !isolated || isSelected;
      const verticalFocusProgress = easeOutCubic(
        clamp((motionFocus - 0.55) / 0.45, 0, 1),
      );
      const focusYOffset =
        shelfTop + book.data.height * 0.5 - book.slot.position.y;
      book.content.position.y = isSelected
        ? focusYOffset * verticalFocusProgress + motionFocus * 0.04
        : 0;

      const activeStrength = book.index === this.activeIndex ? 0.22 : 0;
      const hoverStrength =
        this.mode === "browse" ? Math.max(book.hover, activeStrength) : 0;
      const extraction = hoverStrength * hoverExtraction;
      book.inspectionIdle.position.set(
        -Math.sin(book.pose.yaw) * extraction,
        hoverStrength * hoverLift,
        Math.cos(book.pose.yaw) * extraction,
      );
      book.inspectionIdle.rotation.set(0, 0, 0);
      book.frontSurface.material.emissiveIntensity = hoverStrength * 0.055;

      if (book.livingMaterial) {
        book.livingMaterial.uniforms.uTime.value = elapsed;
        const livingStrength =
          this.reducedMotion
            ? 0
            : isSelected
              ? 0.24 + motionFocus * 0.55
              : book.index === this.presentedIndex
                ? 0.24 + book.hover * 0.08
                : book.hover * 0.04;
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
    this.frameFocusedBook(worldPosition, easeOutCubic(this.focusProgress));
    this.camera.position.lerp(
      this.focusCameraPosition,
      1 - Math.exp(-(this.reducedMotion ? 28 : 13) * delta),
    );
    this.camera.lookAt(this.focusCameraTarget);
  }

  private applyFocusViewOffset(progress: number) {
    const width = this.viewWidth;
    const height = this.viewHeight;
    const isMobile = width < 760;
    const detailWidth =
      width <= 1020
        ? Math.min(compactDetailMaxWidth, width * compactDetailWidthRatio)
        : Math.min(desktopDetailMaxWidth, width * desktopDetailWidthRatio);
    const focusDistance = isMobile ? 6.25 : 5.4;
    const verticalHalfSpan =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * focusDistance;
    const clampedProgress = clamp(progress, 0, 1);
    const horizontalOffset = isMobile
      ? 0
      : detailWidth * 0.5 * clampedProgress;
    const verticalOffset = isMobile
      ? (0.28 / verticalHalfSpan) * height * 0.5 * clampedProgress
      : 0;

    if (clampedProgress <= 0.001) {
      this.camera.clearViewOffset();
      return;
    }

    // Shift the composition through an asymmetric frustum. The camera and
    // OrbitControls can then keep the exact center of the book as their target.
    this.camera.setViewOffset(
      width,
      height,
      horizontalOffset,
      verticalOffset,
      width,
      height,
    );
  }

  private frameFocusedBook(
    worldPosition: THREE.Vector3,
    compositionProgress = 1,
  ) {
    const isMobile = this.viewWidth < 760;
    const focusDistance = isMobile ? 6.25 : 5.4;
    this.applyFocusViewOffset(compositionProgress);

    this.focusCameraTarget.copy(worldPosition);
    this.focusCameraPosition.set(
      worldPosition.x + (isMobile ? 0 : 0.58),
      worldPosition.y + 0.12,
      worldPosition.z + focusDistance,
    );
  }

  private handleResize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.viewWidth = width;
    this.viewHeight = height;
    this.isCompactViewport = window.innerWidth < 760;
    this.canvasRect = null;
    const dprCap = width < 760 ? 1.5 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 33 : width < 920 ? 30 : 27;
    this.camera.updateProjectionMatrix();
    const browseScale = width < 760 ? compactLibraryScale : 1;
    const framedLibraryHeight =
      (2.35 + (this.libraryRows - 1) * libraryRowSpacing) * browseScale;
    const verticalDistance =
      (framedLibraryHeight * 1.08) /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)));
    const browseDistance = Math.max(width < 760 ? 9.5 : 7.1, verticalDistance);
    this.responsiveBrowseTarget.set(
      0,
      this.libraryCenterY * browseScale,
      0.1 * browseScale,
    );
    this.responsiveBrowseCamera.set(
      0,
      this.responsiveBrowseTarget.y + (width < 760 ? 0.16 : 0.2),
      browseDistance,
    );
    if (this.mode === "browse" && this.focusProgress < 0.01) {
      this.camera.clearViewOffset();
      this.shelfGroup.scale.setScalar(browseScale);
      this.camera.position.copy(this.responsiveBrowseCamera);
      this.camera.lookAt(this.responsiveBrowseTarget);
    } else if (this.mode === "inspect" && this.selectedIndex !== null) {
      const worldPosition = new THREE.Vector3();
      this.runtimeBooks[this.selectedIndex].content.getWorldPosition(
        worldPosition,
      );
      this.frameFocusedBook(worldPosition);
    }
  };

  private scheduleStripeAssetLoad() {
    const run = () => {
      void this.loadStripeAssets();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 5000 });
      return;
    }
    window.setTimeout(run, 300);
  }

  private async loadStripeAssets() {
    try {
      const [{ OBJLoader }, booksResponse, objResponse] = await Promise.all([
        import("three/addons/loaders/OBJLoader.js"),
        fetch(`${STRIPE_ASSET_ROOT}/books.json`),
        fetch(`${STRIPE_ASSET_ROOT}/mesh/stripe-press-book.obj`),
      ]);
      if (!booksResponse.ok || !objResponse.ok) {
        throw new Error("Stripe Press asset archive unavailable");
      }
      const bookAssets = (await booksResponse.json()) as StripeBookAsset[];
      const parsed = new OBJLoader().parse(await objResponse.text());
      const sourceMesh = parsed.children.find(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh,
      );
      if (!sourceMesh) throw new Error("Shared book mesh unavailable");

      // Normalize the imported asset once. Every edition then shares a centered
      // canonical mesh while presentation rotation remains on its wrapper.
      const geometry = sourceMesh.geometry.clone();
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) throw new Error("Shared book bounds unavailable");
      geometry.boundingBox.getSize(this.stripeGeometrySize);
      if (
        this.stripeGeometrySize.x <= 0 ||
        this.stripeGeometrySize.y <= 0 ||
        this.stripeGeometrySize.z <= 0
      ) {
        throw new Error("Shared book bounds are invalid");
      }
      const geometryCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.translate(
        -geometryCenter.x,
        -geometryCenter.y,
        -geometryCenter.z,
      );
      geometry.computeBoundingBox();
      this.stripeGeometry = geometry;
      await Promise.allSettled(
        bookAssets.map((bookAsset) => this.loadStripeBook(bookAsset)),
      );
    } catch {
      // Stripe archive is optional; procedural covers remain in place.
    }
  }

  private textureFor(
    reference: { local_file: string | null } | undefined,
    color = false,
  ) {
    if (!reference?.local_file) {
      return Promise.resolve<THREE.Texture | null>(null);
    }
    const key = reference.local_file;
    const cached = this.stripeTextureCache.get(key);
    if (cached) return cached;

    const promise = new THREE.TextureLoader()
      .loadAsync(stripeAssetUrl(key))
      .then((texture) => {
        texture.name = key;
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = Math.min(
          8,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
        this.stripeTextures.add(texture);
        return texture;
      })
      .catch(() => null);
    this.stripeTextureCache.set(key, promise);
    return promise;
  }

  private async loadCustomCover(runtime: RuntimeBook, coverImage: string) {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(coverImage);
      if (this.isDisposed) {
        texture.dispose();
        return;
      }

      texture.name = `customCover:${runtime.data.id}`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );

      const material = runtime.frontSurface.material;
      const proceduralTexture = material.map;
      material.map = texture;
      material.needsUpdate = true;
      runtime.textures.push(texture);

      if (proceduralTexture) {
        const index = runtime.textures.indexOf(proceduralTexture);
        if (index >= 0) runtime.textures.splice(index, 1);
        proceduralTexture.dispose();
      }
    } catch {
      // Keep the generated procedural cover when an optional image is missing
      // or blocked by cross-origin policy.
    }
  }

  private async loadStripeBook(bookAsset: StripeBookAsset) {
    const runtime = this.runtimeBooks.find(
      (book) => book.data.id === bookAsset.slug,
    );
    if (!runtime || !this.stripeGeometry) return;

    try {
      const [diffuse, bump, foil] = await Promise.all([
        this.textureFor(bookAsset.textures.diffuseMapCustom, true),
        this.textureFor(
          bookAsset.textures.bumpMapCustom ?? bookAsset.textures.bumpMapBase,
        ),
        this.textureFor(bookAsset.textures.foilMap),
      ]);
      if (!diffuse || this.isDisposed) {
        throw new Error(`Missing cover texture for ${bookAsset.slug}`);
      }

      const foilSettings = stripeFoilSettings(bookAsset.material);
      const material = new THREE.MeshPhysicalMaterial({
        name: `stripePressMaterial:${bookAsset.slug}`,
        map: diffuse,
        bumpMap: bump,
        bumpScale: Number(bookAsset.material.bumpScaleCustom ?? 0.035),
        metalnessMap: foil,
        metalness: foil ? 0.22 : 0.04,
        roughness: 0.68,
        clearcoat: 0.12,
        clearcoatRoughness: 0.55,
      });
      if (foil && foilSettings.enabled) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.stripeFoilMap = { value: foil };
          shader.uniforms.stripeFoilOpacity = {
            value: foilSettings.opacity,
          };
          shader.uniforms.stripeFoilDetail = {
            value: foilSettings.detail,
          };
          shader.fragmentShader = addStripeFoilBlend(
            shader.fragmentShader,
          );
        };
        material.customProgramCacheKey = () => "stripe-colored-foil-v1";
        material.userData.stripeFoil = {
          opacity: foilSettings.opacity,
          detail: foilSettings.detail,
        };
      }
      const mesh = new THREE.Mesh(this.stripeGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const root = new THREE.Group();
      root.name = `stripePressEdition:${bookAsset.slug}`;
      root.add(mesh);
      root.rotation.y = stripeBookCoverFacingRotationY;

      const targetWidth = 1.31 + ((runtime.index % 5) - 2) * 0.018;
      root.scale.set(
        runtime.data.thickness / this.stripeGeometrySize.x,
        runtime.data.height / this.stripeGeometrySize.y,
        targetWidth / this.stripeGeometrySize.z,
      );
      root.updateMatrixWorld(true);
      root.userData.displaySize = {
        width: targetWidth,
        height: runtime.data.height,
        thickness: runtime.data.thickness,
      };
      root.userData.coverFacing = "+Z";

      runtime.assetHolder.add(root);
      runtime.physical.visible = false;
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
    this.presentedIndex = next;
    this.callbacks.onActiveIndex(next);
    this.beginFocus(next);
  }

  returnToShelf() {
    if (this.mode === "browse" || this.mode === "returning") return;
    this.controls.enabled = false;
    this.mode = "returning";
    this.callbacks.onMode(this.mode, this.selectedIndex);
  }

  resetFocusView() {
    if (this.mode !== "inspect" || this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.frameFocusedBook(worldPosition);
    this.controls.target.copy(this.focusCameraTarget);
    this.camera.position.copy(this.focusCameraPosition);
    this.controls.update();
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
    this.stripeTextures.forEach((texture) => texture.dispose());
    this.environmentTextures.forEach((texture) => texture.dispose());
    this.stripeTextureCache.clear();
    this.stripeTextures.clear();
    this.environmentTextures.clear();
    this.stripeGeometry = null;
    this.stripeGeometrySize.set(0, 0, 0);
    this.renderer.dispose();
  }
}
