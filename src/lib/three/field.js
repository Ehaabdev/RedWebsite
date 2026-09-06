import * as THREE from "three";

/**
 * Particle field spanning the whole site.
 *
 * One system, eight shapes. Every section owns a shape, and scrolling between
 * sections morphs the rest positions from one into the next — so the transition
 * *is* the animation, rather than eight scenes cross-fading.
 *
 * This works because the physics never reads the shape. A shape is only an
 * array of rest positions, so morphing is a lerp between two arrays and the
 * pointer interaction is untouched by it.
 *
 * WebGL, not WebGPU: no compute shaders needed.
 */

const P = {
  radius: 4.0,
  strength: 0.185,
  stiffness: 0.02,
  damping: 0.905,
  jitter: 0.6,
  nearT: 10.0,
  depthRange: 10.0,
  aberration: 0.0022,
};

/**
 * Palettes.
 *
 * The particles themselves render white; colour is applied in the post pass.
 * The old look was not a colour choice at all — a plain RGB split of white
 * produces green and magenta fringes as a side effect. Here the three samples
 * are tinted explicitly instead: `core` is the body of each dot, `fringeA` and
 * `fringeB` are the leading and trailing edges of the split.
 *
 * Note black particles cannot work on a dark ground — they would be invisible.
 * These keep a bright core and put the colour in the fringes.
 */
export const PALETTES = {
  // The reference look: white particles with a true RGB channel split, which
  // is what produces its blue/green/magenta fringing. `split: true` takes the
  // r/g/b path in the shader rather than tinting three samples.
  reference: {
    core: "#e2e7f0",
    fringeA: "#ffffff",
    fringeB: "#ffffff",
    split: true,
  },
  // warm white core, red fringes — ties to --accent
  ember: { core: "#ffe9dd", fringeA: "#e64749", fringeB: "#5e1420" },
  // full red, hotter and more monochrome
  signal: { core: "#ff6265", fringeA: "#ffb347", fringeB: "#3d0a12" },
  // neutral, aberration almost invisible
  mono: { core: "#e9edf5", fringeA: "#6b7484", fringeB: "#2a2f3a" },
  // cool alternative if red ever feels too loud
  ice: { core: "#e6f0fa", fringeA: "#4a9fd8", fringeB: "#16283a" },
};

export const DEFAULT_PALETTE = "reference";

export const QUALITY = {
  high: { count: 34000, size: 3.4 },
  medium: { count: 18000, size: 3.2 },
  low: { count: 7000, size: 3.0 },
};

export function pickQuality() {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency || 4;
  const small = matchMedia("(max-width: 720px)").matches;
  if (small || cores <= 4) return "low";
  if (cores <= 8) return "medium";
  return "high";
}

const hash = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- shapes --
   Each generator returns a plain array of xyz triples at its own natural
   density; resample() then fits every shape to the same particle count so any
   two can be morphed index-for-index.
--------------------------------------------------------------------------- */

function slab(out, cx, cy, cz, w, h, d, nx, ny, nz, rot) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        const x = (i / (nx - 1) - 0.5) * w;
        const y = (j / (ny - 1) - 0.5) * h;
        const z = (k / (nz - 1) - 0.5) * d;
        out.push(cx + (x * cos - y * sin), cy + (x * sin + y * cos), cz + z);
      }
}

/** 00 Astro — eight sectors of tangential slabs. */
function octagon() {
  const pts = [];
  const R = 5.6;
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = Math.cos(a) * R;
    const by = Math.sin(a) * R;
    const tan = a + Math.PI / 2;
    const n = 2 + (s % 2);
    for (let c = 0; c < n; c++) {
      const off = (c - (n - 1) / 2) * 1.15;
      const push = c % 2 ? 0.5 : -0.3;
      slab(
        pts,
        bx + Math.cos(tan) * off * 0.9 + Math.cos(a) * push,
        by + Math.sin(tan) * off * 0.9 + Math.sin(a) * push,
        (c - 1) * 0.5,
        2.4,
        0.62,
        0.62,
        20,
        6,
        5,
        tan + (c - 1) * 0.22,
      );
    }
  }
  return pts;
}

/** Fibonacci sphere, in a few shells so it reads as volume. */
function sphereAt(pts, cx, cy, cz, R, n) {
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = phi * i;
    const shell = R * (0.86 + 0.14 * ((i % 4) / 3));
    pts.push(
      cx + Math.cos(th) * rad * shell,
      cy + y * shell,
      cz + Math.sin(th) * rad * shell,
    );
  }
}

/** 01 About — a single body. */
function sphere() {
  const pts = [];
  sphereAt(pts, 0, 0, 0, 5.0, 14000);
  return pts;
}

/** 02 Work — three practices, three clusters. */
function threeClusters() {
  const pts = [];
  [-5.4, 0, 5.4].forEach((x, i) =>
    sphereAt(pts, x, i === 1 ? 0.6 : -0.4, 0, 2.5, 5000),
  );
  return pts;
}

/** 03 Products — a built thing: a solid lattice. */
function cube() {
  const pts = [];
  const N = 26;
  const S = 7.6;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < 8; k++) {
        pts.push(
          (i / (N - 1) - 0.5) * S,
          (j / (N - 1) - 0.5) * S,
          (k / 7 - 0.5) * S * 0.42,
        );
      }
  return pts;
}

/** 04 Studio — screens: a wide flat plane. */
function plane() {
  const pts = [];
  const NX = 92;
  const NY = 46;
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++)
      for (let k = 0; k < 3; k++) {
        pts.push(
          (i / (NX - 1) - 0.5) * 13.5,
          (j / (NY - 1) - 0.5) * 6.6,
          (k / 2 - 0.5) * 0.5,
        );
      }
  return pts;
}

/** 05 Data — streams: intertwined helices. */
function helix() {
  const pts = [];
  const TURNS = 5;
  const N = 5200;
  for (let s = 0; s < 2; s++)
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const a = t * Math.PI * 2 * TURNS + s * Math.PI;
      const r = 3.1 + (hash(i + s * 99) - 0.5) * 0.5;
      pts.push(Math.cos(a) * r, (t - 0.5) * 11.5, Math.sin(a) * r);
    }
  return pts;
}

/** 06 Founders — two bodies. */
function twoSpheres() {
  const pts = [];
  sphereAt(pts, -3.4, 0, 0, 3.0, 7000);
  sphereAt(pts, 3.4, 0, 0, 3.0, 7000);
  return pts;
}

/** 07 Contact — an opening. */
function ring() {
  const pts = [];
  const R = 4.8;
  const r = 1.35;
  const NU = 260;
  const NV = 44;
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const u = (i / NU) * Math.PI * 2;
      const v = (j / NV) * Math.PI * 2;
      pts.push(
        (R + r * Math.cos(v)) * Math.cos(u),
        (R + r * Math.cos(v)) * Math.sin(u),
        r * Math.sin(v),
      );
    }
  return pts;
}

/**
 * Diffuse wide cloud. The carousel section is carried by its cards, so its
 * object has to hold the frame without competing for it — no silhouette, no
 * edges, just depth behind the content.
 */
function haze() {
  const pts = [];
  for (let i = 0; i < 9000; i++) {
    // Wide, shallow and deep, so a fixed particle count spreads thin enough to
    // read as distant dust rather than static. Density is volume, not choice:
    // the same 8k points in a compact slab looked like noise over the copy.
    pts.push(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 6.4,
      (Math.random() - 0.5) * 13,
    );
  }
  return pts;
}

/**
 * One shape per section, in order.
 *
 * The regular lattices — `plane` and `cube` — are kept OFF the light sections.
 * Sampled at pixel scale against white they moiré into coloured speckle rather
 * than reading as geometry; on black the same lattice reads as a glow. So the
 * light run gets shapes with curvature and a clear silhouette (`ring`, `helix`,
 * `sphere`) and the dark sections absorb the grids.
 *
 * Two assignments are semantic and should not be shuffled for looks:
 * `threeClusters` on Work (three practices) and `twoSpheres` on Founders (two
 * founders).
 */
const GENERATORS = [
  octagon, // 0 hero
  cube, // 1 about
  threeClusters, // 2 work      — three practices, three clusters
  ring, // 3 products  LIGHT
  helix, // 4 studio    LIGHT
  sphere, // 5 data      LIGHT
  haze, // 6 selected  — recedes behind the carousel
  twoSpheres, // 7 founders  — two founders
  plane, // 8 contact
];

/**
 * Atmosphere.
 *
 * The reference site paints a flat colour on <body> too — its depth comes from
 * the 3D scene (a grid, fog and a soft light), not from CSS. So the canvas is
 * opaque here and paints its own ground: base colour, a soft light above
 * centre, a vignette, and a far dot-grid that parallaxes as the camera moves.
 */
/** hex -> raw 0..1 components, bypassing THREE.Color's colour management. */
function v3(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
}

const ATMOSPHERE = {
  // Near-black. The reference's --bg-primary (#20242d) is the <body> colour
  // sitting underneath; its canvas paints far darker over the top.
  bg: "#0a0c0f",
  smoke: "#aab6cc", // drifting haze
  dot: "#7d879c", // fixed screen-space grid
  dotPitch: 26, // px between dots
  vignette: 0.72,

  // The inverted ground. One section flips to light, which is the single
  // biggest thing that stops the run of sections reading as one long slide.
  // On light the haze and dots SUBTRACT rather than add, so the same noise
  // field that glows on black reads as shadow on white.
  light: {
    bg: "#eef0f3",
    smoke: "#5c6675",
    dot: "#39404b",
    vignette: 0.94, // barely there; a dark vignette on white looks like a bruise
  },
};

/** Far dot grid — gives the void depth and something to move against. */
function backdrop() {
  const pts = [];
  const NX = 118;
  const NY = 64;
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NY; j++) {
      pts.push(
        (i / (NX - 1) - 0.5) * 52,
        (j / (NY - 1) - 0.5) * 30,
        -15 - ((i + j) % 3) * 2.5,
      );
    }
  return new Float32Array(pts);
}

/** Camera distance per shape — some forms want more room. */
const CAM_Z = [16.4, 15.5, 16.5, 17.6, 17, 16, 18.5, 16.2, 17.6];

/**
 * Where the object sits in each section, as [x, y] world offsets.
 *
 * A centred object collides with whatever the layout puts in the middle of the
 * frame, so each entry leans away from that section's copy: right when the text
 * is left-anchored, left when it is right-anchored, up when it is centred. This
 * is the third axis of per-section difference, after layout and theme.
 */
/**
 * How each boundary is crossed — TRANSITIONS[i] governs section i → i+1.
 *
 *   morph    rest positions lerp straight from one shape to the next
 *   scatter  the field bursts apart along per-particle directions and reforms
 *
 * A single transition type applied eight times stops reading as a transition
 * and starts reading as the way the site moves. Alternating gives the sequence
 * a rhythm: three quiet crossings, then one that comes apart.
 */
const TRANSITIONS = [
  "morph", // 0 hero     → about
  "morph", // 1 about    → work
  "scatter", // 2 work     → products   — the page inverts to light here
  "morph", // 3 products → studio
  "morph", // 4 studio   → data
  "scatter", // 5 data     → selected   — and back to dark here
  "morph", // 6 selected → founders
  "scatter", // 7 founders → contact
  "morph", // 8 contact  → (end)
];

/**
 * Markers pinned to points inside the 3D scene, per section index.
 *
 * Only Work has them, and only because its object has discrete parts that mean
 * something: `threeClusters` puts spheres at x = -5.4 / 0 / 5.4, and the three
 * practices are exactly what those clusters stand for. Positions are in the
 * points' LOCAL space, so they follow the object's placement, rotation and
 * scatter for free — the field projects them to screen coordinates each frame
 * and the DOM just reads the result.
 *
 * Anchoring markers to an object whose parts mean nothing would be decoration;
 * that is why this is one entry and not eight.
 */
const ANCHORS = {
  2: [
    // Lifted ~0.8 above each cluster's crown (radius 2.5, centres at y -0.4 /
    // 0.6 / -0.4) so the label sits on clean ground instead of on the particles
    // it points at.
    { id: "products", section: 3, at: [-5.4, 2.9, 0] },
    { id: "studio", section: 4, at: [0.0, 3.9, 0] },
    { id: "data", section: 5, at: [5.4, 2.9, 0] },
  ],
};

const NO_ANCHORS = [];

/**
 * Particle opacity per section. The carousel is carried by its cards, and a
 * drifting field behind them competed with the thing you are meant to look at,
 * so the particles fade out entirely for that one section. The painted ground —
 * haze, dot grid, vignette — stays; only the moving points go.
 *
 * Interpolated on the morph curve like CAM_Z, so they fade rather than pop.
 */
const PARTICLE_ALPHA = [1, 1, 1, 1, 1, 1, 0, 1, 1];

/** How far a scatter throws particles, in world units. */
const SCATTER = 3.4;

const OBJECT_POS = [
  [0.0, 0.0], // hero      — copy lower-left, object holds the centre
  [2.4, -0.5], // about     — copy upper-left, object drops right
  [1.8, 0.7], // work      — copy lower-left
  [-2.3, 0.5], // products  — copy lower-right, object swings left
  [2.6, 0.1], // studio    — copy upper-left on light
  [1.8, 0.6], // data      — copy lower-left
  [0.0, 0.5], // selected  — behind the cards, which now hold the middle
  [0.0, 2.0], // founders  — copy centred, object lifts clear of it
  [1.2, 2.4], // contact   — copy now runs the full width, object lifts clear
];

/** Fit any shape to the target particle count so shapes can morph 1:1. */
function resample(src, count) {
  const out = new Float32Array(count * 3);
  const n = src.length / 3;
  for (let i = 0; i < count; i++) {
    const j = Math.floor((i * n) / count) % n;
    out[i * 3] = src[j * 3] + (hash(i) - 0.5) * 0.07;
    out[i * 3 + 1] = src[j * 3 + 1] + (hash(i + 7919) - 0.5) * 0.07;
    out[i * 3 + 2] = src[j * 3 + 2] + (hash(i + 15013) - 0.5) * 0.07;
  }
  return out;
}

export function createField({
  canvas,
  quality = "high",
  reducedMotion = false,
  palette = DEFAULT_PALETTE,
}) {
  const pal = PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE];
  const q = QUALITY[quality] ?? QUALITY.medium;
  const COUNT = q.count;
  const dpr = Math.min(devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(dpr);
  // The render target holds particles on black; the post pass composites them
  // over a background it paints itself, and outputs opaque.
  renderer.setClearColor(0x000000, 1);
  // No output conversion: the shader writes final sRGB values directly.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  // every shape, pre-resampled to the same count
  const SHAPES = GENERATORS.map((g) => resample(g(), COUNT));

  const pos = new Float32Array(SHAPES[0]);
  const vel = new Float32Array(COUNT * 3);
  const morphed = new Float32Array(COUNT * 3); // scratch for mid-transition

  // A fixed random unit vector per particle. Generated once so a scatter throws
  // the same particle the same way every time — the field comes apart along a
  // consistent grain instead of shimmering differently on each pass.
  const scatterDir = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    scatterDir[i * 3] = r * Math.cos(th);
    scatterDir[i * 3 + 1] = r * Math.sin(th);
    scatterDir[i * 3 + 2] = u;
  }
  let restRef = SHAPES[0];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSize: { value: q.size },
      uPR: { value: dpr },
      uOpacity: { value: 1 },
    },
    vertexShader: `
			uniform float uSize, uPR;
			varying float vD;
			void main(){
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vD = -mv.z;
				gl_PointSize = uSize * uPR * (8.0 / vD);
				gl_Position = projectionMatrix * mv;
			}`,
    fragmentShader: `
			uniform float uOpacity;
			varying float vD;
			void main(){
				vec2 c = gl_PointCoord - 0.5;
				float d = dot(c, c);
				if (d > 0.25) discard;
				float a = smoothstep(0.25, 0.04, d);
				float fade = clamp(1.0 - (vD - 8.0) / 22.0, 0.3, 1.0);
				gl_FragColor = vec4(vec3(0.88, 0.91, 0.97), a * 0.9 * fade * uOpacity);
			}`,
  });

  const points = new THREE.Points(geom, material);
  scene.add(points);

  // (The far 3D grid was removed: the reference's dots do not parallax, they
  // are fixed in screen space, so they are drawn in the post pass.)
  const backGeom = new THREE.BufferGeometry();
  backGeom.setAttribute("position", new THREE.BufferAttribute(backdrop(), 3));
  const backMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPR: { value: dpr } },
    vertexShader: `
			uniform float uPR;
			varying float vD;
			void main(){
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vD = -mv.z;
				gl_PointSize = 1.7 * uPR * (14.0 / vD);
				gl_Position = projectionMatrix * mv;
			}`,
    fragmentShader: `
			varying float vD;
			void main(){
				vec2 c = gl_PointCoord - 0.5;
				if (dot(c, c) > 0.25) discard;
				float fade = clamp(1.0 - (vD - 14.0) / 34.0, 0.0, 1.0);
				gl_FragColor = vec4(vec3(0.62, 0.68, 0.82), 0.16 * fade);
			}`,
  });
  const backPoints = new THREE.Points(backGeom, backMat);
  backPoints.visible = false;

  // --- post: chromatic aberration + scanline ---
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      tDiffuse: { value: rt.texture },
      uAmount: { value: P.aberration },
      uTime: { value: 0 },
      uCore: { value: v3(pal.core) },
      uFringeA: { value: v3(pal.fringeA) },
      uFringeB: { value: v3(pal.fringeB) },
      uSplit: { value: pal.split ? 1 : 0 },
      uBg: { value: v3(ATMOSPHERE.bg) },
      uSmoke: { value: v3(ATMOSPHERE.smoke) },
      uDot: { value: v3(ATMOSPHERE.dot) },
      uPitch: { value: ATMOSPHERE.dotPitch },
      uRes: { value: new THREE.Vector2(1, 1) },
      uVignette: { value: ATMOSPHERE.vignette },
      uLight: { value: 0 },
      uBgL: { value: v3(ATMOSPHERE.light.bg) },
      uSmokeL: { value: v3(ATMOSPHERE.light.smoke) },
      uDotL: { value: v3(ATMOSPHERE.light.dot) },
      uVignetteL: { value: ATMOSPHERE.light.vignette },
    },
    vertexShader: `
			varying vec2 vUv;
			void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
			uniform sampler2D tDiffuse;
			uniform float uAmount, uTime, uSplit, uVignette, uPitch, uLight, uVignetteL;
			uniform vec3 uCore, uFringeA, uFringeB, uBg, uSmoke, uDot;
			uniform vec3 uBgL, uSmokeL, uDotL;
			uniform vec2 uRes;
			varying vec2 vUv;

			float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

			float vnoise(vec2 p){
				vec2 i = floor(p), f = fract(p);
				vec2 u = f * f * (3.0 - 2.0 * f);
				return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
				           mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
			}

			float fbm(vec2 p){
				float v = 0.0, a = 0.5;
				for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; }
				return v;
			}

			void main(){
				vec2 c = vUv - 0.5;
				float d = length(c);
				float band = step(0.995, fract(sin(floor(vUv.y * 190.0) * 43.7 + floor(uTime * 3.0)) * 4371.0));
				vec2 skew = vec2(band * 0.012, 0.0);
				vec2 off = c * uAmount * (0.55 + d * 2.4) + skew;

				vec3 particles;
				if (uSplit > 0.5) {
					// True RGB channel separation — what gives the reference its fringing.
					particles = vec3(
						texture2D(tDiffuse, vUv + off).r,
						texture2D(tDiffuse, vUv).g,
						texture2D(tDiffuse, vUv - off).b
					) * uCore;
				} else {
					float lead  = texture2D(tDiffuse, vUv + off).r;
					float core  = texture2D(tDiffuse, vUv).r;
					float trail = texture2D(tDiffuse, vUv - off).r;
					particles = uCore * core + uFringeA * lead * 0.55 + uFringeB * trail * 0.55;
				}

				// ---- the ground the scene paints for itself ----
				float aspect = uRes.x / max(uRes.y, 1.0);
				vec2 sp = vec2(vUv.x * aspect, vUv.y);

				// Drifting haze. Two fbm layers at different scales and speeds, so it
				// never settles into a recognisable loop. This is the "smoke".
				float n1 = fbm(sp * 2.3 + vec2(uTime * 0.011, uTime * -0.007));
				float n2 = fbm(sp * 4.7 - vec2(uTime * 0.006, uTime * 0.009));
				float smoke = smoothstep(0.28, 0.82, n1 * 0.68 + n2 * 0.32);
				float centre = pow(max(0.0, 1.0 - length((vUv - vec2(0.5, 0.55)) * vec2(1.05, 0.92))), 1.15);
				float haze = smoke * centre * 0.35;

				// Fixed screen-space dot grid — these do not parallax on the reference.
				vec2 gcell = fract(vUv * uRes / max(uPitch, 1.0));
				float dotMask = 1.0 - smoothstep(0.0, 0.085, length(gcell - 0.5));

				// Same two fields, opposite signs. On dark they emit, on light they shade.
				vec3 bg = mix(
					uBg  + uSmoke  * haze + uDot  * dotMask * 0.09,
					uBgL - uSmokeL * haze - uDotL * dotMask * 0.05,
					uLight
				);

				float edge = smoothstep(1.05, 0.3, d);
				bg *= mix(mix(uVignette, 1.0, edge), mix(uVignetteL, 1.0, edge), uLight);

				// Particles add light to the dark ground and take it from the light one,
				// so one white point sprite serves both themes without a blend change.
				gl_FragColor = vec4(mix(bg + particles, bg - particles * 0.62, uLight), 1.0);
			}`,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  // --- pointer, as a ray through the scene ---
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const rayO = new THREE.Vector3();
  const rayD = new THREE.Vector3();
  const invMat = new THREE.Matrix4();
  let pointerActive = false;
  let pointerSpeed = 0;
  let lightAmt = 0; // last theme value, shared with the render tail
  let viewW = 1;
  let viewH = 1;

  // Projected anchor positions, rebuilt in place each frame so reading them
  // never allocates.
  const projected = [];
  const projV = new THREE.Vector3();
  let lastPx = null;

  function setPointer(x, y) {
    ndc.x = (x / innerWidth) * 2 - 1;
    ndc.y = -(y / innerHeight) * 2 + 1;
    pointerActive = true;
    if (lastPx) pointerSpeed = Math.hypot(x - lastPx.x, y - lastPx.y);
    lastPx = { x, y };
  }
  const clearPointer = () => (pointerActive = false);

  function resize(w, h) {
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    rt.setSize(w * dpr, h * dpr);
    postMat.uniforms.uRes.value.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Only rebuild the morph buffer when the blend actually changes.
  let lastIndex = -1;
  let lastT = -1;

  function setShape(index, t) {
    const i = Math.min(Math.max(index, 0), SHAPES.length - 1);
    const j = Math.min(i + 1, SHAPES.length - 1);

    // Peaks at the midpoint and returns to zero, so both shapes are still
    // reached exactly — the scatter happens between them, not instead of them.
    const burst =
      TRANSITIONS[i] === 'scatter' && t > 0.001 && t < 0.999 ? Math.sin(t * Math.PI) : 0;

    if (t <= 0.001) {
      restRef = SHAPES[i];
    } else if (t >= 0.999) {
      restRef = SHAPES[j];
    } else {
      if (i === lastIndex && Math.abs(t - lastT) < 0.002) return;
      const a = SHAPES[i];
      const b = SHAPES[j];

      if (burst > 0) {
        const throwDist = burst * SCATTER;
        for (let k = 0; k < COUNT * 3; k++) {
          morphed[k] = a[k] + (b[k] - a[k]) * t + scatterDir[k] * throwDist;
        }
      } else {
        for (let k = 0; k < COUNT * 3; k++) morphed[k] = a[k] + (b[k] - a[k]) * t;
      }
      restRef = morphed;
    }
    lastIndex = i;
    lastT = t;
  }

  /**
   * @param dt   frame delta in 60fps units
   * @param opts { index, progress, opacity, time, light }
   */
  function update(
    dt,
    { index = 0, progress = 0, opacity = 1, time = 0, light = 0 } = {},
  ) {
    const alphaA = PARTICLE_ALPHA[Math.min(index, PARTICLE_ALPHA.length - 1)];
    const alphaB = PARTICLE_ALPHA[Math.min(index + 1, PARTICLE_ALPHA.length - 1)];

    postMat.uniforms.uLight.value = light;
    lightAmt = light;

    // Hold the shape for most of the section, then morph into the next over
    // the last quarter — so the transition lands as you arrive.
    const t = smoothstep(0.72, 1.0, progress);
    setShape(index, t);

    material.uniforms.uOpacity.value = opacity * (alphaA + (alphaB - alphaA) * t);

    const camA = CAM_Z[Math.min(index, CAM_Z.length - 1)];
    const camB = CAM_Z[Math.min(index + 1, CAM_Z.length - 1)];

    // Slides between placements on the same curve as the morph, so the object
    // travels to its new corner as it changes shape rather than after.
    const pa = OBJECT_POS[Math.min(index, OBJECT_POS.length - 1)];
    const pb = OBJECT_POS[Math.min(index + 1, OBJECT_POS.length - 1)];
    points.position.x = pa[0] + (pb[0] - pa[0]) * t;
    points.position.y = pa[1] + (pb[1] - pa[1]) * t;
    camera.position.z = camA + (camB - camA) * t - progress * 1.2;
    camera.position.y = Math.sin(progress * Math.PI) * 0.6;
    camera.lookAt(0, 0, 0);

    if (!reducedMotion) {
      points.rotation.y = Math.sin(time * 0.12) * 0.09 + index * 0.14;
      points.rotation.x = Math.cos(time * 0.09) * 0.05;
    } else {
      points.rotation.y = index * 0.14;
    }

    // Anchors are projected once the object's transform is final for this
    // frame, so a marker can never lag the geometry it is pinned to.
    const anchors = ANCHORS[index] ?? NO_ANCHORS;
    projected.length = 0;
    if (anchors.length) {
      // Held while the shape is legible, released before it morphs away.
      const show = smoothstep(0.04, 0.14, progress) * (1 - smoothstep(0.58, 0.74, progress));
      if (show > 0.001) {
        points.updateMatrixWorld();
        for (const a of anchors) {
          projV.set(a.at[0], a.at[1], a.at[2]).applyMatrix4(points.matrixWorld).project(camera);
          projected.push({
            id: a.id,
            section: a.section,
            x: (projV.x * 0.5 + 0.5) * viewW,
            y: (-projV.y * 0.5 + 0.5) * viewH,
            fade: projV.z < 1 ? show : 0,
          });
        }
      }
    }

    if (pointerActive) {
      ray.setFromCamera(ndc, camera);
      points.updateMatrixWorld();
      invMat.copy(points.matrixWorld).invert();
      rayO.copy(ray.ray.origin).applyMatrix4(invMat);
      rayD.copy(ray.ray.direction).transformDirection(invMat);
    }

    const R2 = P.radius * P.radius;
    const rest = restRef;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      let px = pos[i3],
        py = pos[i3 + 1],
        pz = pos[i3 + 2];
      let vx = vel[i3],
        vy = vel[i3 + 1],
        vz = vel[i3 + 2];

      if (pointerActive) {
        const wx = px - rayO.x,
          wy = py - rayO.y,
          wz = pz - rayO.z;
        const tt = wx * rayD.x + wy * rayD.y + wz * rayD.z;
        if (tt > 0) {
          const lx = wx - rayD.x * tt,
            ly = wy - rayD.y * tt,
            lz = wz - rayD.z * tt;
          const d2 = lx * lx + ly * ly + lz * lz;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 0.0001;
            let f = 1 - d / P.radius;
            f = f * f * P.strength;
            const depth =
              1 -
              Math.min(Math.max((tt - P.nearT) / P.depthRange, 0), 1) * 0.55;
            const j = 1 + (Math.random() - 0.5) * P.jitter;
            vx += (lx / d) * f * j * depth * dt;
            vy += (ly / d) * f * j * depth * dt;
            vz += (lz / d) * f * j * depth * dt;
          }
        }
      }

      vx += (rest[i3] - px) * P.stiffness * dt;
      vy += (rest[i3 + 1] - py) * P.stiffness * dt;
      vz += (rest[i3 + 2] - pz) * P.stiffness * dt;

      const damp = Math.pow(P.damping, dt);
      vx *= damp;
      vy *= damp;
      vz *= damp;

      pos[i3] = px + vx * dt;
      pos[i3 + 1] = py + vy * dt;
      pos[i3 + 2] = pz + vz * dt;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
    }

    geom.attributes.position.needsUpdate = true;

    pointerSpeed *= 0.9;
    // Fringing that reads as a glow on black reads as coloured dirt on white,
    // so the split narrows as the page lightens rather than switching off.
    postMat.uniforms.uAmount.value =
      (P.aberration + Math.min(pointerSpeed, 90) * 0.00007) * (1 - 0.55 * lightAmt);
    postMat.uniforms.uTime.value = reducedMotion ? 0 : time;

    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  function dispose() {
    geom.dispose();
    material.dispose();
    postMat.dispose();
    rt.dispose();
    renderer.dispose();
  }

  return {
    update,
    resize,
    setPointer,
    clearPointer,
    dispose,
    /** Screen positions of this frame's anchors. Reused array — copy to keep. */
    getAnchors: () => projected,
    count: COUNT,
    shapes: SHAPES.length,
  };
}
