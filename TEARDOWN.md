# daoism.systems — Technical Teardown & Build Plan

Recon date: 2026-09-04. Method: Playwright (desktop 1440×900 + mobile 390×844), runtime DOM/WebGL
introspection, network waterfall, and reading the site's shipped JS/CSS bundles.

Built by **Lynksen** (credited in the footer) for Daoism Systems, a Berlin Web3/AI studio.

---

## 1. Verdict

**Yes — with one honest caveat about the 3D content.**

Roughly **80% of the perceived experience is architecture, design system, and interaction
choreography.** All of that is fully replicable. The remaining **20% is authored 3D content and
choreography** — bespoke models, a baked vertex-animation cache, 6MB of compressed environment
plates, and 212 hand-keyframed animation tracks. That's a 3D-artist-and-technical-director
deliverable, not something you write in code.

We can build a site that feels identical in structure, motion, mood, and polish. We cannot
reproduce *their specific 3D objects and keyframed camera work* without either a 3D artist or a
deliberate substitution (procedural geometry + code-driven motion). That substitution is the
single biggest decision to make up front.

This is a genuinely high-end build — meaningfully more sophisticated under the hood than it looks
from the outside, and it looks impressive from the outside.

---

## 2. Confirmed stack

Every item verified at runtime, not guessed.

| Layer | Technology | Evidence |
|---|---|---|
| Framework | **SvelteKit** | `X-Sveltekit-Page: true`, `_app/immutable/` layout |
| Hosting | **Vercel** | `Server: Vercel`, `X-Vercel-Cache` |
| 3D | **Three.js r184 — `three/webgpu`** | `__THREE__ = "184"`; the canvas holds a **`GPUCanvasContext`** |
| Shading | **TSL → WGSL node materials + compute shaders** | `Fn(`, `positionLocal`, `normalWorld`, `NodeMaterial`, `ComputeNode`, `StorageBufferAttribute`, `WGSL` |
| 3D choreography | **Theatre.js** | `@theatre`, `sheetsById`, `projectId`, `PositionalSequence`, **212 × `BasicKeyframedTrack`** |
| Fallback | WebGLRenderer | present in bundle for non-WebGPU browsers |
| Scroll | **Lenis 1.3.23** | `lenisVersion`; `.page-scroll-wrapper.lenis` |
| Animation | **GSAP 3.15.0** | `gsapVersions` |
| Audio | **Howler.js** | `Howler`, `Howl` globals |
| Geometry compression | **Draco** | `/draco/draco_decoder.wasm` (83KB) |
| Texture compression | **KTX2 / Basis Universal** | `/basis/basis_transcoder.wasm` (246KB) |
| Analytics | GTM + GA4 | `G-4VKMDZ1P33` |

### The headline finding: this is a WebGPU site

The fullscreen canvas returns `null` for `webgl2`, `webgl`, `2d` *and* `bitmaprenderer`, but
returns a `GPUCanvasContext` for `webgpu`. They ship the `three/webgpu` build with **TSL node
materials compiled to WGSL**, including **compute shaders** (`ComputeNode`,
`StorageBufferAttribute`) — which is what powers the GPU fluid simulation and particles. A
WebGL2 fallback path is bundled for browsers without WebGPU.

This is bleeding-edge for a production marketing site and directly affects our
WebGPU-first vs WebGL-first decision (§10).

**The 3D renders on the main thread.** A separate Web Worker (`workers/worker-Cnr0UiMU.js`, 7KB)
renders only the *preloader's* cell-grid into an `OffscreenCanvas` 2D context at rAF (with a
`document.createElement('canvas')` fallback) and posts frames back — keeping the loading
animation perfectly smooth while the main thread is saturated decoding 12MB of assets.

---

## 3. The scroll architecture — the load-bearing idea

Get this right first; everything else hangs off it.

- `body { overflow: hidden }` — **the page never natively scrolls.** `document.scrollHeight === innerHeight`.
- One `div.page-scroll-wrapper.lenis`: `position:fixed; inset:0; overflow-y:auto;
  overscroll-behavior:none;` with scrollbars hidden, and **`scrollHeight: 16000px`**.
- `<main>` holds **8 `<section>` elements**, all `position:absolute; inset:0` — **stacked and
  cross-faded, not translated.**
- Default state is `visibility:hidden; opacity:0; pointer-events:none` plus
  `contain: layout style paint` and `content-visibility: auto` — aggressive render containment.
- `.nearby` → `visibility:visible` + `content-visibility:visible` + `translateZ(0)`, with a
  `.6s cubic-bezier(.4,0,.2,1)` opacity transition (pre-mounts neighbours).
- `.active` → `opacity:1; pointer-events:auto; z-index:2`.
- Distant sections render **empty DOM**. This is the only reason 8 heavy 3D scenes stay viable.

**Lenis config, read from the shipped Theatre project (two presets — desktop / mobile):**

```js
{ lerp: 0.055, syncTouchLerp: 0.055, wheelMultiplier: 0.48, touchMultiplier: 0.85, scrollHeight: 16000 }
{ lerp: 0.07,  syncTouchLerp: 0.075, wheelMultiplier: 0.4,  touchMultiplier: 1.1,  scrollHeight: 16000 }
```

Note `wheelMultiplier < 0.5` — scrolling is deliberately *slowed*, which is a large part of why
the site feels cinematic rather than twitchy.

### Section scroll spans — measured, and NOT uniform

Swept 0→16000 in 250px steps (plus a 50px sweep across the s0/s2 boundary):

| Section | Scroll range | Span |
|---|---|---|
| 0 — Hero | 0 – ~1250 | ~1300 |
| 1 — About (wordmark reveal) | ~1300 – ~1340 | **~100** (transition sliver) |
| 2 — Services | ~1350 – 2750 | ~1400 |
| 3 — Collaboration | 3000 – 3500 | ~750 |
| 4 — Insights / Blog | 3750 – 8750 | **~5250** (longest by far) |
| 5 — Partners | 9000 – 10500 | ~1750 |
| 6 — Process | 10750 – 13000 | ~2500 |
| 7 — Contact | 13250 – 16000 | ~3000 |

⚠️ Measured by jump-scrolling and sampling the `.active` class, so boundaries are ±250px and
section 1's sliver is approximate. The important, reliable conclusion: **section lengths vary
7× (750px to 5250px).** Our engine must support **per-section scroll lengths as config**, not a
uniform constant. Scroll position is a *timeline scrubber*, not a document position.

---

## 4. Section map

Menu labels from the mobile DOM (`#section-N` anchors).

| # | Menu label | On-screen heading | Notable |
|---|---|---|---|
| 0 | — | EMERGING SYSTEMS OF THE FUTURE | Glitched **octagon** of instanced blocks; live UTC clock; "Founded in 2022" |
| 1 | About us | DAOISM SYSTEMS | Brief wordmark reveal (~100px of scroll) |
| 2 | Services | SERVICES `[2]` | Huge white radial sphere; two pyramid meshes; L/R "Hover to explore" → Technics / Consultancy |
| 3 | Collaboration | PARTNER WITH US | "Connect now" CTA |
| 4 | Insights | OUR BLOG | **Full dark→light theme inversion.** Longest section |
| 5 | Partners | THE NETWORK OF TRUST `[5]` | 5 partner cards (Safe, …) + manifesto pull-quote; internally a "TrainSlider" |
| 6 | Process | HOW WE WORK | "forest-card" cluster; "Listen (Click to Read)" card reveal + click SFX |
| 7 | — | GET IN TOUCH | Contact form, footer, "Website by Lynksen" |

**Services copy (from DOM):** *Technics* — Smart Contracts, User Interfaces, Interoperability
Solutions, AI Agents Tooling, AI Agents Workflows. *Consultancy* — Tokenomics, Governance
Systems, Treasury Management, Liquidity Allocation Strategies, Protocol Architectures.

**Blog:** section 4 contains a heading and standfirst but **zero `<a>` elements** in either
capture. Posts are likely hosted externally — a `paragraph.com/@0013700` link sits in the menu's
social group — but no post markup was found in-section, so treat this as probable, not confirmed.

**Contact form:** client-side only — no `action`/`method`, `novalidate`, fields
`name` (placeholder "Satoshi Nakamoto"), `email`, `message` ("Tell us what you're building").
Submission endpoint not verified (not going to POST to a real business).

---

## 5. The 3D system

Theatre.js animates these named objects across the scroll timeline — this is effectively the
feature list of their renderer:

| Object | What it is |
|---|---|
| `Camera`, `Lighting`, `Rotation`, `Visibility`, `Transition` | Core choreography |
| **`FluidSimulation`** | GPU fluid sim — explains the compute shaders |
| **`MousePhysics`** | Physics-driven pointer interaction |
| `Particles` | Particle systems |
| `DaoFog`, `GroundFog` | Volumetric fog (`/textures/daofog/*.ktx2`) |
| `MaterialPyramid`, `MaterialForestTree` | Section 2 pyramids, section 6 "forest" |
| `TrainSlider` | Section 5 partner carousel |
| `PostProcessing`, `Grid`, `Canvas`, `Annotations` | FX and HUD layers |

**Adaptive quality tiers** are configured in code — a real production concern they solved:

```js
maxResolution: {width: 2560, height: 1440}, resolutionScale, denoise, shadowMapType,
enableOctagonParticles, enableOctagonPhysics,
postProcessing: { bloom, fxaa, fluidDistortion, chromaticAberration, vignette,
                  cloudTransition, freezeTransitionScenes },
bloomMultiplier, bloomThresholdOffset
```

Lower tiers disable `fxaa`, `bloom`, `fluidDistortion` and octagon physics but **keep
`chromaticAberration`** — they correctly identified it as the identity-carrying effect.

---

## 6. Design system

From the shipped CSS `:root`:

```css
--bg-primary:              #20242d;   /* near-black blue-grey */
--accent-primary:          #e64749;   /* signal red */
--text-base:               1.0625rem;
--motion-ease-reveal:      cubic-bezier(.19, 1, .22, 1);   /* expo-out */
--motion-ease-standard:    cubic-bezier(.22, 1, .36, 1);
--motion-duration-fast:    .35s;
--motion-duration-base:    .5s;
--motion-duration-reveal:  .75s;
```

**Type**
- Body/UI: **IBM Plex Mono** (Regular + Medium) — free, OFL. Everything is monospace; that alone
  carries most of the "technical instrument" feel.
- Display: **KH Interference** at ~104px for all headlines — shipped as
  `KHInterferenceTRIAL-Regular.woff2`, i.e. **a trial file, in production.**

**The HUD language** — where the personality actually lives, and it's all cheap DOM/CSS:
- Fixed corner `+` tick marks and hairline rules
- Top-centre horizontal tick-ruler as scroll progress scrubber
- Bottom-left section counter chip (`02 • Services`)
- Live clock with `UTC+1` offset
- Audio widget with a real oscilloscope on a 2D canvas (`#oscilloscope`, 83×32)
- Rotated vertical "Menu" / "Connect Now" tabs pinned top-right, CTA in accent red
- Bracketed section indices (`[2]`, `[5]`), `01 / 5` counters

**Signature effect:** heavy **RGB chromatic aberration + scanline/glitch displacement**. Cheap as
a post-process, enormous identity payoff.

---

## 7. Asset inventory (~12.6MB total)

| Type | Detail |
|---|---|
| Models | `DAO_full_scene.glb` (1.0MB), `pyramids_source.glb` (961KB), `pyramids_merged.glb` (91KB) |
| **VAT** | `pyramids_vat.bin.gz` (**1.8MB**) — baked **Vertex Animation Texture** |
| Textures | `slider/Ktx2/01–08.ktx2` (~6MB, one per section), `daofog/Shine.ktx2`, `daofog/Light_01.ktx2`, `Transition/Transition 3_00015.ktx2` |
| Audio | `bg-music.mp3` (1.1MB ambient bed), `click-alt.wav`, `click.mp3` |
| Fonts | 2× IBM Plex Mono, 1× KH Interference TRIAL |
| JS | 36 chunks, ~680KB (Three.js core `CQ41u5WD.js` = 197KB) |

The **VAT** is the most specialist item: a mesh animation baked from a DCC tool (Houdini/Blender)
into a texture the vertex shader samples per frame. It needs a bake pipeline, not just code.

**Why 12.6MB is acceptable here:** it sits behind a click-gated preloader that reaches 100% before
revealing anything. Any clone **must** copy that pattern — ship this payload without the gate and
it reads as broken.

---

## 8. UX patterns worth stealing

1. **The sound gate.** "ENTER WITH SOUND — (Turn the sound on — It matters)" + START. Not just
   decoration: a user gesture is *required* to start an `AudioContext`, so they turned a browser
   constraint into an atmospheric ritual — and bought preload time with it.
2. **Preloader as content.** Animated cell-grid + `100 • Loading` counter, worker-driven so it
   never stutters while assets decode.
3. **Lazy section mounting** via `.nearby` + `content-visibility` — the only reason this works.
4. **Slowed scroll** (`wheelMultiplier: 0.48`) — a big part of the cinematic feel.
5. **Theme inversion** on the blog — one moment of light in an otherwise black site.
6. **Quality tiers** that preserve the signature effect and drop the expensive ones.
7. **Full mobile parity.** At 390×844: same 8 sections, same 16000px scroller, same 14 GLB/KTX2
   assets. They did **not** build a reduced mobile experience. Under
   `prefers-reduced-motion: reduce` the hero still renders the full animated 3D scene.

---

## 9. Replicable vs. not

**Replicable by us, no specialist:**
- SvelteKit + Vercel deployment
- The entire Lenis virtual-scroll section engine (with per-section lengths)
- GSAP scroll-linked timelines
- Howler ambient bed, sound gate, oscilloscope, UI SFX
- Worker-driven preloader
- The full mono/HUD design system and every piece of chrome
- Chromatic aberration / scanline post-processing
- Contact form, menu, footer, theme inversion
- WebGPU + TSL setup with WebGL fallback, and the quality-tier system

**Needs a 3D artist / technical director, or a substitution:**
- The pyramid meshes + baked VAT animation (section 2)
- The 8 KTX2 environment plates
- The 212 hand-keyframed Theatre.js tracks (camera, lighting, transitions)
- The GPU fluid simulation

Their GLB/KTX2 files are publicly fetchable but are someone else's work product — not ours to
ship. Plan on original assets or procedural geometry.

**Good news:** the hero is an **octagonal ring of instanced boxes** (their own config calls it
`enableOctagonParticles` / `enableOctagonPhysics`) — that's ~40 lines of procedural
`InstancedMesh`, no artist required. Most of its impact comes from the post-processing, not the
mesh. A procedural substitute gets very close for very little.

---

## 10. Build plan

De-risked ordering — the scroll engine is load-bearing, so it goes first, with no 3D at all.

**Phase 1 — Scroll engine (no 3D).** SvelteKit + Lenis. `body{overflow:hidden}`, a fixed
`.page-scroll-wrapper` whose height is the **sum of per-section lengths** (config array, not a
constant), absolutely-positioned stacked 100vh sections, `.active`/`.nearby` mount+preload with
`content-visibility`, and a normalized per-section progress store. Match their Lenis numbers
(`lerp .055`, `wheelMultiplier .48`). Validate with plain coloured divs. *If this architecture is
wrong, nothing above it survives — prove it here.*

**Phase 2 — Design system + chrome.** Tokens, IBM Plex Mono, corner ticks, tick-ruler scrubber,
section counter, live clock, menu, CTA tabs. The site should already feel like the target in
greyscale with zero 3D.

**Phase 3 — Preloader + sound gate.** Worker-rendered grid, real asset-progress counter, START
gate, Howler ambient bed + oscilloscope + UI SFX.

**Phase 4 — One 3D section end-to-end.** Section 0 only: `three/webgpu`, procedural octagon
`InstancedMesh`, chromatic-aberration + scanline post-process, scroll progress driving camera and
uniforms. Ship the WebGL2 fallback and the quality-tier switch here too.

**Phase 5 — Scale to remaining sections.** Content, partner carousel, blog + theme inversion,
process cards, contact form (+ decide the submission endpoint — Vercel function vs third-party).

**Phase 6 — Mobile + performance.** Match their parity decision, or deliberately improve on it —
a real `prefers-reduced-motion` path would be a genuine upgrade over the original.

**On Theatre.js:** worth adopting if we want their level of camera/lighting choreography. It
gives a visual keyframe editor wired to the scroll timeline, and its state exports to JSON. The
alternative is coding motion directly in GSAP — less expressive, much faster to start. Recommend
GSAP for v1, Theatre only if the camera work becomes the bottleneck.

---

## 11. Decisions needed before we start

1. ~~**Display font**~~ — **RESOLVED: Chakra Petch (display) + IBM Plex Mono (UI/body).**
   Both OFL, free, self-hostable, no licensing question. Chakra Petch carries the chamfered,
   squared-off technical character closest to KH Interference and has real weights (600/700).
   Michroma was the other candidate — wider and closer in proportion, but a single weight and
   too wide for long headlines. In use in the prototype; swap is one `font-family` line.
2. ~~**3D content strategy**~~ — **RESOLVED.** Client is happy to swap the shapes; the *pointer
   interaction* is what must match. Going procedural. See §12 — built and verified.
3. ~~**WebGPU-first or WebGL-first**~~ — **RESOLVED: WebGL-first.** The pointer-repulsion effect
   needs no compute shaders; it runs at 150–170fps on plain `THREE.Points` with a JS physics
   loop. WebGPU is deferred, not dropped — revisit only if we want their GPU fluid simulation.
4. **Content.** Same 8-section skeleton, or a different narrative?

---

## Correction logged during recon

Two early inferences were wrong and are corrected above:
- *"Three.js renders in a worker via `transferControlToOffscreen`"* — no chunk contains that call.
  The fullscreen canvas holds a `GPUCanvasContext`: 3D is **WebGPU on the main thread**. The
  worker's OffscreenCanvas is the preloader grid only.
- *"2000px per section"* — that was `16000/8` arithmetic, not a measurement. Measured spans vary
  from ~100px to ~5250px.

---

## 12. Prototype — pointer repulsion (built & verified)

`prototype/hero-particles.html` — self-contained, vendored three.js r150, no build step.
Open it directly in a browser.

### The interaction model, reverse-engineered

Verified against the live site by parking the pointer, flicking it through the ring, and
comparing frames (`recon/mouse-0-baseline.png`, `mouse-3-flick.png`, `mouse-4-recover.png`):

1. Every particle has a **rest position** — that array *is* the shape.
2. The pointer is a **repulsion field** with a smooth radial falloff.
3. Particles inside the radius gain outward velocity and scatter into a spray.
4. A **damped spring** pulls each back to rest. The original fully recovers in ~1.8s.

`MousePhysics` is registered with Theatre.js but has **empty `trackData`** — the parameters are
static in code, not keyframed. No third-party physics engine is in the bundle (no Rapier/Cannon/
Ammo); it's a custom solver in compute shaders. Which means the values below were tuned by eye
against the reference frames, not extracted.

### Tuned parameters

```js
radius:    4.0    // influence radius, world units (~270px on screen)
strength:  0.185  // outward impulse at field centre
stiffness: 0.020  // spring constant back to rest
damping:   0.905  // velocity retained per frame → ~1.2s settle
jitter:    0.60   // randomises the push — this is what makes it "spray" not "bulge"
```

Measured behaviour: flick displaces **3.35 world units**; after 1.8s max offset is **0.003**
— fully settled, matching the original's recovery time.

### What the prototype demonstrates

| | |
|---|---|
| Octagon (matches original) | 36,720 pts @ ~150fps |
| Torus | 11,700 pts @ 170fps |
| Sphere | 11,000 pts @ 170fps |
| Grid | ~10,800 pts |

**All four run the same physics loop, unmodified.** Swapping shapes changes only the rest-position
array. This is the key finding for scope: *the interaction is completely independent of the
geometry*, so replacing their bespoke models costs nothing in fidelity of feel.

### Implementation notes that mattered

- **Render as `Points`, not solid meshes.** The dot-lattice look does a lot of the work — each
  slab in the original is a dense regular grid of points, not a surface. Solid boxes with
  identical physics read as a completely different effect.
- **Project the pointer into the particles' world plane** (raycast onto z=0). Using screen pixels
  directly is the single most likely thing to look wrong.
- **Point size must scale with device pixel ratio.** First attempt was ~20× too large — 8,000
  huge dots merged into solid white blobs. `gl_PointSize = uSize * uPR * (8.0 / viewDepth)`.
- **Chromatic aberration is non-negotiable.** Their own low-quality tier drops bloom and FXAA but
  keeps it. A three-tap RGB offset in a post-pass, boosted by pointer speed.
- **The trailing cursor is a separate lerped DOM dot** — cheap, and a real part of why the
  original feels physical.

### Known gaps vs. the original

- Sphere/torus presets are dimmer than the octagon (fewer points over a larger area) — needs a
  density pass per shape, not a physics change.
- No scroll-linked camera choreography yet — that's Phase 1 of the main build.
- JS physics loop is fine to ~40k points. Beyond that, move to GPGPU ping-pong FBOs (still WebGL).

### Revision — the cursor is a ray, not a point on a plane

First implementation projected the cursor onto a fixed `z = 0` plane. That works for the octagon
(a flat ring already sitting at z≈0) but **breaks on any volumetric shape**: on a sphere the plane
slices through the middle, so the only particles ever in range are those at the silhouette rim.
Hovering the face pointing at you did nothing — the front cap is ~4.9 units away in Z, outside the
influence radius. Symptom: "particles only move on the right".

Fixed by treating the cursor as a **ray through the scene** and pushing particles away from the
ray *axis*:

```js
w = particle - rayOrigin
t = dot(w, rayDir)                    // distance along the ray
lateral = w - rayDir * t              // perpendicular offset from the axis
if (|lateral| < radius) push along normalize(lateral)
```

Plus a depth term so nearer particles push harder (`nearT`, `depthRange`), which makes it read as
touching the front surface rather than boring a clean tunnel. The ray is transformed into the
particle object's **local space** each frame (`invMat = points.matrixWorld.invert()`) so the idle
rotation can't desynchronise the physics from what's on screen.

This is shape-agnostic and is the version to carry into the build. Verified on all four shapes:

| Shape | Points | FPS | Disturbed |
|---|---|---|---|
| Octagon | 36,720 | ~150 | 8–20% |
| Torus | 34,320 | 136 | 29% |
| Grid | 10,816 | 164 | 57% |
| Sphere | 34,000 | 170 | 41% |

### Measurement gotcha — rAF throttling

Recovery appeared broken on the sphere: offset decayed slowly and `maxSpeed` sat pinned at a
constant value with the pointer disabled — impossible under damping. Cause was **not** physics:
with no mouse movement Chrome throttles `requestAnimationFrame`, so `dt` clamps to its ceiling and
only a frame or two elapses between probes. Keeping the pointer moving (far from the geometry)
during measurement showed the sphere settles to **exactly 0.0**. Worth remembering when
benchmarking any scroll- or pointer-driven scene under automation.

---

## 13. Phase 1 — scroll engine (BUILT)

SvelteKit 2.70 / Svelte 5 (runes) / Vite 8 / Lenis 1.3.23 (pinned to match theirs).
`npm run dev` → http://localhost:5178

```
src/lib/scroll/sections.js         table + pure sectionAt() resolver
src/lib/scroll/engine.svelte.js    Lenis setup, global $state, rAF loop
src/lib/components/ScrollEngine.svelte   wrapper, spacer, stacked sections
src/lib/components/Hud.svelte      tick-ruler, counter, anchor nav
src/routes/+page.svelte            plain coloured panels (no 3D, by design)
```

### The design

`sectionAt(scrollTop)` is pure and table-driven, returning `{ index, progress, global }`.
Active/nearby classes, the ruler, the counter and — later — every 3D uniform derive from those
two numbers and nothing else. It runs in plain node with no browser, and has 30 assertions
covering every section start, every section end-1, midpoint progress, and clamping past both ends.

**Per-section lengths, not a constant.** Lengths live in `SECTIONS[]` and `TOTAL` is their sum —
never hard-coded. Current table totals **17,350px** across 8 sections ranging 750px → 5250px.
Their 16000 is not reused; ours differs, which is correct.

### Decisions that differ from a naive build

- **Lenis is attached to the wrapper, not `window`** (`wrapper` + `content` options), matching the
  original's fixed `overflow-y:auto` container with a spacer child.
- **`<main>` lives *inside* the wrapper**, `position:fixed`. This is what makes wheel events over
  section content bubble to the element Lenis listens on. Putting main outside the wrapper
  silently breaks wheel input over any interactive content.
- **State is driven by Lenis's `scroll` event, never a native scroll listener** — a native listener
  also fires from Lenis's own writes and double-drives the state.
- **One rAF, owned by the engine.** The 3D loop joins this same rAF in Phase 4 rather than starting
  a second one.

### Verified

| Check | Result |
|---|---|
| `body{overflow:hidden}`, document never scrolls | ✓ |
| Wrapper scrollHeight | 17,350 = computed TOTAL ✓ |
| Section spans (250px sweep, 70 samples) | match config; §3–7 exact, §0–2 within the sampling step |
| Distant sections render empty DOM | ✓ only 2–3 of 8 ever populated |
| `.active` on current, `.nearby` on ±1 | ✓ |
| Anchor nav → `lenis.scrollTo` | ✓ "Partners" landed y=10100 = `OFFSETS[5]` exactly |
| Real trusted wheel input | ✓ 3600px raw → 2160px travel (`wheelMultiplier: 0.48`) |
| Production build | ✓ 1.3s, no errors |

`adapter-auto` warns it can't detect a production environment locally; that resolves on Vercel.
Swap to `adapter-vercel` at deploy time if we want it explicit.

### Not in Phase 1, by design

Live clock, ambient audio, sound gate, preloader (Phase 2/3) and all 3D (Phase 4). The panels are
deliberately plain — the point was to prove the architecture without anything hiding a flaw in it.

---

## 14. Phase 2 — design system + chrome (BUILT)

The site now reads like the target with zero 3D. That was the test for this phase.

```
src/app.css                       token system + type scale + motion floor
src/lib/site.js                   brand + all copy, one file
src/lib/components/Wordmark.svelte
src/lib/components/Clock.svelte   live local time + UTC offset
src/lib/components/Menu.svelte    vertical tabs + slide-in overlay
src/lib/components/Cursor.svelte  lerped trailing dot
src/lib/components/Hud.svelte     corner marks, ruler, counter, horizon
```

### Tokens

Palette and easings are the values read off the reference, since matching that look is the brief.
The type scale, spacing and layout rhythm are ours.

```css
--bg-primary #20242d   --bg-deep #161920   --ink #e9edf5
--hud rgba(255,255,255,.55)   --hud-dim .26   --rule .13
--accent #e64749       /* state and action only — never decoration */

--t-display clamp(2.5rem, 7.6vw, 7.25rem)   --t-title clamp(1.75rem, 3.4vw, 3.25rem)
--t-lede clamp(.95rem, 1.25vw, 1.1875rem)   --t-body 1.0625rem
--t-meta .6875rem      --t-micro .625rem
```

Type: **Chakra Petch 700** display / **IBM Plex Mono 400–500** everything else.

### Layout concept

An instrument panel. Chrome pins to the four edges and top centre; a **horizon rule at 47%**
splits every section into an upper field (meta, state) and a lower field where the headline is
anchored to the viewport baseline. Display lines are **staggered rightward** (`margin-left:
calc(var(--n) * 2.6ch)`) so a headline reads as one falling shape rather than a centred stack.
The upper field is deliberately left empty on most sections — that is where the 3D lands in Phase 4.

### On the design-skill defaults

The frontend-design guidance warns off monospace data labels, hairline rules, tracked-out caps
micro-labels and numbered markers. All four are the reference's actual visual language, and the
brief is to match it, so they stay. Two checks kept them honest: numbering is only used where the
content genuinely is a sequence (the section timeline, and the four process steps), and the accent
colour appears only as state or action — position head, active nav item, CTA, step numerals.

### Content

All copy is **ours**, not the reference's, and lives in `src/lib/site.js`. Placeholder brand is
"Meridian Systems". The reference's own brand and section titles have been purged from `src/`
(`grep -rni "daoism\|lynksen" src/` returns only two source comments crediting where the tokens
came from).

### Verified

| Check | Result |
|---|---|
| All 8 sections render, correct chip + headline | ✓ no console/page errors |
| Menu: opens, Escape closes, focus trapped, focus restored | ✓ |
| Mobile 390×844 | ✓ no horizontal overflow; ruler hidden; columns reflow |
| `prefers-reduced-motion` | ✓ custom cursor suppressed, transitions collapsed |
| Keyboard focus | ✓ `:focus-visible` ring, never on mouse click |
| Production build | ✓ 1.3s, clean |

### Known gaps

- Custom cursor is gated on `(hover: hover) and (pointer: fine)`; a desktop browser merely resized
  to phone dimensions still reports `hover: hover`, so it shows in that case. Real touch devices
  are unaffected.
- Insights/Partners sections have headline + lede but no item lists yet — they need real posts and
  partner logos, which is Phase 5 content work.

---

## 15. Phase 3 — preloader, sound gate, audio (BUILT)

```
src/lib/workers/grid-worker.js      OffscreenCanvas cell-grid + the ramp clock
src/lib/loader/assets.svelte.js     asset registry; Phase 4 pushes GLB/KTX2 here
src/lib/audio/engine.js             synthesised ambient bed + UI blips + analyser
src/lib/components/Preloader.svelte overlay, counter, sound gate
src/lib/components/AudioWidget.svelte  oscilloscope + mute toggle
```

### Audio is synthesised, not a file

Their `bg-music.mp3` is not ours to ship, so the ambient bed is built in Web Audio: five detuned
sine/triangle voices on a minor-9th spread, through one slow-drifting lowpass, each voice swelling
on its own cycle. UI blips are short enveloped squares. Zero assets, nothing to license, and the
analyser gets real signal to drive the oscilloscope. Swapping in a recorded track later means
replacing `startAmbient()` with a buffer source on the same graph — Howler only becomes worth
adding at that point.

### The lesson this phase actually taught: who owns the clock

First implementation put the grid in a worker (good) but computed progress on the main thread and
posted it in (wrong). Measured on the **production build**, the counter sat frozen at 0 for ~1.7s
and then snapped to 97 — the main thread is blocked through hydration and font loading, which is
exactly the window the loader exists to cover. A DOM counter cannot update through that, and the
worker was being starved of the value it needed to animate.

Fix: **the worker owns the minimum-duration ramp.** The main thread only reports *how much real
work has finished*; the worker runs its own clock, computes `min(real, floor)`, and posts the
result back for the counter. If the main thread stalls, the grid keeps animating correctly and the
counter catches up.

Measured after the change, same production build:

```
before   0 → 0 → 0 → 0 → 0 → 0 → (1.7s frozen) → 97 → 100
after    0 → 10 → 15 → 26 → 31 → 42 → 47 → … → 100
```

### Second real bug: chrome ate the scroll

Scrolling silently did nothing whenever the cursor rested over any fixed chrome — wordmark, HUD,
menu tabs, audio widget. All of it lives outside `.page-scroll-wrapper`, so wheel events never
reached the element Lenis was listening on. Only caught because a test happened to click the audio
widget before scrolling.

Fix: `eventsTarget: window` on the Lenis config — the wrapper still defines *what* scrolls, the
window defines *where events are captured*. Regions needing their own scroll opt out with
`data-lenis-prevent`. This supersedes the Phase 1 note about `<main>` needing to sit inside the
wrapper; that placement is still fine, but it is no longer what makes wheel input work.

### Deliberate departure from the reference

The gate offers **"Continue without sound"** alongside Start. The reference only offers the sound
path. Forcing an audio-only entry is a poor deal for anyone on a shared desk or using a screen
reader, and the gate's real job — capturing the user gesture that unlocks `AudioContext` — is
satisfied either way.

### Verified

| Check | Result |
|---|---|
| Progress ramps smoothly on production build | ✓ 0→100 in visible steps, no freeze |
| Grid renders in worker via `transferControlToOffscreen` | ✓ main-thread fallback for Safari < 16.4 |
| Scroll locked while gate is up | ✓ y stays 0 |
| Scroll works over section AND all fixed chrome | ✓ ~360px each: section, HUD, wordmark, audio widget |
| Start → audio starts, widget appears, scope shows live signal | ✓ |
| Mute toggle flips label and flattens the trace | ✓ |
| "Continue without sound" → entered, no widget | ✓ |
| Production build | ✓ 1.5s clean |

### Note

`window.__engine` and `window.__load` are `import.meta.env.DEV`-gated, so they are absent from
production builds — as intended. Drive the built site through the UI, not those handles.

### Fix — invisible pointer

Reported: no visible mouse in the browser. Cause was mine: the custom cursor sat at `z-index: 100`
while the preloader overlay is `200`, so on the loading and gate screens the native cursor was
hidden by `body.has-cursor { cursor: none }` and its replacement was painted *behind* the overlay.
No pointer at all, exactly where you need to find the Start button.

Three changes:

- **`z-index: 300`** — above the preloader and everything else.
- **Exact dot, lagging ring.** Previously one lerped dot, so even when visible it trailed the true
  pointer. Now the dot tracks `pointermove` with no smoothing (verified: dot centre `[430,640]` for
  a pointer at `[430,640]`) and only the ring lerps. You aim with something accurate; the ring
  carries the feel.
- **Dropped `mix-blend-mode: difference`** for a white dot with a dark halo, so it reads on any
  background without depending on blend behaviour inside a stacking context. Also restores the
  native cursor when the pointer leaves the window.

`ENABLED` at the top of `Cursor.svelte` turns the whole thing off and hands back the native cursor.

### Fix — mute was not silent, and the pad sounded like noise

**Mute bug.** `setMuted` called `linearRampToValueAtTime` with no preceding `setValueAtTime`. A
ramp interpolates from the last *scheduled* event, not from whatever value is currently on the
param — so it could start from the wrong place and never actually reach zero. Fixed by pinning the
current value first (`cancelScheduledValues` → `setValueAtTime` → ramp), then **suspending the
AudioContext** once the ramp completes, so nothing is running at all.

Verified by measuring the signal rather than trusting the label:

| | analyser peak | context | master gain |
|---|---|---|---|
| Sound on | 22 | running | 0.55 |
| Muted | **0** | **suspended** | **0** |
| Unmuted | 19 | running | 0.55 |

"Continue without sound" creates no AudioContext at all (`window.__audio` absent, no widget).

**Sound quality.** The first pad was harsh. Causes and fixes:

| Problem | Fix |
|---|---|
| Triangle/square voices → strong harmonics | sines only |
| Lowpass `Q = 3` swept by an LFO → whistling | `Q = 0.6`, no resonance |
| 55 Hz fundamentals → rumble on laptop speakers | nothing below 110 Hz, highpass at 70 |
| Amplitude LFOs swinging voices negative → phase cancellation | swell scaled to a fraction of each voice's own gain |
| Static drone reads as a fault | chord glides Am9 ↔ Fmaj9 every 24s over an 8s ramp |
| No space | stereo spread per voice + a 0.55s delay at 0.3 feedback |

Measured spectrum after: 12% sub-80 Hz, 55% 80–300, 33% 300 Hz–1 kHz, **0% above 1 kHz**. UI blips
are filtered sines now, not squares.

### Fix 2 — the pad was still noise: drone replaced with sparse generative notes

Spectral cleanup wasn't enough. The problem was the *form*, not the tone: a continuous pad is
hum-like by nature, and the chord-glide made it worse — six voices sliding between voicings over 8
seconds spent a third of their life at microtonal in-between pitches, feeding a delay line that
replayed the old pitches against the new ones.

Replaced with **sparse generative notes over a near-silent bed**:

- Soft bell tones (sine + quiet octave, fast attack, 2.4–4.2s exponential decay).
- Pitches drawn from **A minor pentatonic**, weighted toward the middle register — pentatonic
  means no random pick can land dissonant.
- One note every 2.6–7.2s, with a 32% chance of a second note trailing it to form an interval.
- Random stereo placement per note.
- Bed reduced to two fixed sines at 0.026 gain — audible only as "not dead air". **No pitch
  glides anywhere.**
- Delay feedback 0.2 / wet 0.17, so tails decay instead of filling the gaps.

Measured amplitude envelope over 22s, sampled at 4 Hz:

| | before | after |
|---|---|---|
| Fraction of time near-silent | 0.05 | **0.69** |
| Character | continuous wash | discrete attacks with decay |

Dials at the top of `engine.js`: `LEVEL` (master), `SCALE`/`WEIGHTS` (which notes), the
`scheduleNextNote(2600 + Math.random() * 4600)` interval (how often), and `playNote`'s `level`
and `dur`.

### Track support — drop-in file path

Requested: use a modern music track from the internet. Taking a commercial track is not an option
— a background track on a public site is a public performance of that recording, and the exposure
lands on the site owner, not the developer. So the audio engine now supports a real file, and the
choice of a properly-licensed one is a decision for whoever ships it.

**How it works:** put a file at `static/sounds/ambient.mp3` and it is used automatically — looped,
3-second fade-in, routed through the same analyser so the oscilloscope keeps working. Remove it and
the synthesised generative notes play instead. The site is never silent and never depends on an
asset that may not exist.

- `prefetch()` downloads the track during the preloader, before any AudioContext exists —
  registered with the loader so it counts toward the progress bar. Decoding happens after the gate,
  since that needs a context and a user gesture.
- A missing static file can return the SPA fallback HTML with a `200`, so the fetch trusts
  `content-type`, not the status code.
- `TRACK_URL` and `TRACK_LEVEL` at the top of `engine.js`.

`static/sounds/README.md` lists licence-safe sources (Pixabay Music, Free Music Archive, ccMixter,
YouTube Audio Library, Uppbeat/Epidemic/Artlist) and the practical constraints: keep it 2–4 MB
since it loads behind the gate, trim it to loop cleanly, and mix it quiet.

Verified with no file present: gate still reached, entry works, generative fallback produces signal
(peak 12), no page errors.

---

## 16. Phase 4 — hero scene, end to end (BUILT)

```
src/lib/three/hero-field.js          scene, physics, post-processing, quality tiers
src/lib/components/HeroField.svelte  canvas, pointer wiring, gating, loader hook
```

Three.js 0.185, **WebGL** — this needs no compute shaders, so WebGPU stays deferred (§10 decision 3).

### Integration decisions

- **One rAF.** Added `onFrame(cb)` to `engine.svelte.js`; the scene subscribes to the loop that
  already drives Lenis instead of starting a second scheduler. It receives `(time, dt)` with `dt`
  normalised to 60fps units.
- **Layering.** `.page-scroll-wrapper` painted `--bg-primary`, which would have hidden the canvas
  entirely. It is now transparent with an explicit `z-index: 1`; body paints the base colour.
  Full stack: canvas `0`, wrapper `1`, HUD `30`, tabs `40`, preloader `200`, cursor `300`.
- **Gated, not faded.** Sections beyond index 1 take an early return — no draw at all — plus a
  single clearing pass on the way out. Confirmed: section 4 renders an empty canvas.
- **Registered with the loader.** Scene construction is tracked as `Scene`, so the preloader
  finally covers a real payload rather than just fonts.
- **Quality tiers** from `hardwareConcurrency` and viewport: high 36,720 pts / medium ~18k /
  low ~5.7k. Mobile takes `low`.

### Scroll coupling

`camera.position.z` moves 15 → 10.5 and lifts slightly across the hero's progress, so the field
opens as the headline settles. Opacity holds until 55% through the section, then hands over.

### Reduced motion

A blank panel would have been the lazy reading. Instead: idle rotation and scanline drift **stop**,
while pointer scatter **stays** — that is motion the person asked for by moving the mouse. This
delivers the reduced-motion path claimed in Phase 1 rather than dropping it.

### Measured

| | fps | p95 frame |
|---|---|---|
| Desktop 1440×900, pointer sweeping | 159 | 9.8 ms |
| Mobile 390×844 (low tier) | 169 | 6.7 ms |
| Reduced motion | 164 | 9.6 ms |
| Scrolled away (draw skipped) | 169 | 6.4 ms |

The scene costs a little on worst-case frames (9.8 ms vs 6.4 ms) and nothing on the median.

### Measurement gotcha, again

First perf run reported **1 fps for both the active and skipped cases** — a nonsense result.
Chrome throttles rAF to ~1 Hz when it considers the page non-visible, and driving the pointer via
CDP round-trips let it idle between moves. Re-run with `page.bringToFront()` and the pointer
dispatched *inside* the page, and the real numbers appeared. Same family of error as the loader
ramp in Phase 3: **never measure a frame loop from outside the frame loop.**

### Also changed

Particle alpha lifted 0.62 → 0.9. The standalone prototype cleared to near-black; the site sits on
`#20242d`, and additive blending has less contrast to work with against a lighter ground.

---

## 17. Phase 5 — Astro content, morphing field, section navigation

### Rebrand

Placeholder "Meridian Systems" replaced with **Astro** (founders Ehab Hasan, Mohe Nader). Section
table rebuilt around the three stated areas of the business:

| # | Section | Shape |
|---|---|---|
| 00 | Astro | octagon |
| 01 | About | sphere |
| 02 | Work | three clusters |
| 03 | Products | solid lattice |
| 04 | Studio | wide plane |
| 05 | Data | double helix |
| 06 | Founders | two spheres |
| 07 | Contact | ring |

Shapes are chosen to mean something: three practices → three clusters, two founders → two bodies,
data → streams, studio → screens. Total scroll 14,800px; all 16 resolver assertions still pass.

**Nothing is invented.** The clinic product is labelled `In development`, the Data section states
plainly that scope and market are undefined, and unknown fields (`founded`, `base`, `email`,
`socials`, `suffix`) are `null` in `site.js` and **omitted from the page** rather than filled with
a guess. The chrome handles nulls: HUD shows the clock alone, menu hides the socials row.

### One field, eight shapes — the morph replaces per-section scenes

Rather than eight scenes cross-fading, there is one particle system whose **rest positions morph**
between shapes as you scroll. The transition *is* the animation.

This is the "shape is just an array" finding from the prototype paying off: the physics never reads
the shape, so morphing is a lerp between two arrays and the pointer interaction is untouched.

- Every generator is `resample()`d to the same particle count, so any two shapes morph index-for-index.
- The shape holds for the first 72% of a section, then morphs over the last 28% — so the new form
  lands as you arrive rather than shifting while you read.
- `setShape` assigns the source array **by reference** when the blend is 0 or 1, and only builds a
  scratch buffer mid-transition. Full-count lerps happen only while actually morphing.
- Camera distance is per-shape and lerps with the morph — some forms need more room.
- The visibility gate from Phase 4 is gone: the field now spans every section.

### Three ways through the site

1. **Scroll** — as before.
2. **Keyboard** — ArrowUp/Down, PageUp/Down, Home/End move section to section. Ignored while
   typing or while the menu dialog is open.
3. **The ruler is now clickable** — click anywhere along it to jump to that point in the timeline.

Plus the existing menu.

### Measured (field now renders on every section)

| | fps | p95 |
|---|---|---|
| Hero | 172 | 7.8 ms |
| Mid-morph (worst case — buffer rebuilt every frame) | 175 | 8.5 ms |
| Data section | 169 | 7.9 ms |
| Mobile 390×844 | 169 | 7.3 ms |

Removing the visibility gate cost nothing measurable.

### Still open

`site.js` needs: contact email, founding year, location, social links, the clinic product's real
name, and anything further on Data. All in one file.

---

## 18. Phase 6 — per-section treatment (BUILT)

Prompted by a second recon pass over the reference, scrolled with continuous wheel events rather
than jumps so transitions actually played (`recon/ref2-*.png`). `ref2-14.png` showed something the
first teardown missed entirely: at their fourth section the reference performs a **full light-theme
inversion** — white ground, dark outlined display type, a solid black button, and a different 3D
object (stacked horizontal slabs around a vertical column) rendered dark-on-light with chromatic
fringing. The HUD chrome persists and simply reads against the new ground.

So their sections differ along **three axes at once** — theme, layout, and object — not just by
particle arrangement. Ours differed along one. This phase closes that gap.

### Axis 1 — theme

`SECTIONS[].theme` (`dark` default, `light`). `lightnessAt(index, progress)` returns 0→1 and ramps
across `smoothstep(0.72, 1.0, progress)` — the *same* window as the shape morph, so theme and
geometry cross together instead of one trailing the other.

One value drives both halves of the page, computed once per frame in `Field.svelte` and handed to
each consumer, so the canvas and the DOM can never disagree about how light the page is:

- **Canvas** — `uLight` crossfades the ground in the post shader. The haze and dot grid are built
  once and applied with *opposite signs*: they add on dark, subtract on light. The same noise field
  that glows on black reads as shadow on white.
- **DOM** — `theme.js` interpolates the token palette onto `:root` and stamps
  `data-theme="light|dark"` for categorical choices. The accent is deliberately **not**
  interpolated; holding one colour constant through the inversion is what makes it read as the same
  site in a different light rather than as a second site.

Verified by sweeping the whole timeline in 400px steps: the theme flips exactly twice (light from
~6800 to ~8800, inside Studio's ramp windows), and nowhere else. No JS errors across the sweep.

### Axis 2 — layout

`SECTIONS[].layout` — `lower-left` (default), `upper-left`, `lower-right`, `centre`. The variants
only reposition and re-order; they never change what is said.

| | composition |
|---|---|
| `lower-left` | supporting copy above, headline anchored to the baseline |
| `upper-left` | headline leads (`order: -1`), copy falls beneath it, type scaled to 0.72 |
| `lower-right` | mirrored — the stagger falls right, so the block leans the other way |
| `centre` | symmetric; the stagger is dropped, since a centred block that also steps sideways reads as a mistake |

### Axis 3 — object placement

`OBJECT_POS[]` gives each section an `[x, y]` world offset, lerped on the same curve as the morph so
the object travels to its new corner *as* it changes shape. Each entry leans away from that
section's copy: right when the text is left-anchored, left when right-anchored, up when centred.

### Transition variety

`TRANSITIONS[i]` governs the crossing from section `i` to `i+1`:

- `morph` — rest positions lerp straight between shapes (as before)
- `scatter` — the field bursts apart along fixed per-particle directions and reforms

`burst = sin(t·π)`, so it is zero at both ends: **both shapes are still reached exactly**, and the
scatter happens between them rather than instead of them. Directions are seeded once at init, so a
scatter throws the same particle the same way every time — the field comes apart along a consistent
grain instead of shimmering differently on each pass. Applied to three of eight boundaries, which
gives the sequence a rhythm rather than a tic.

### Corrections made during this phase

- **Flat grid moirés badly on white.** `plane` was on the light section; sampled at pixel scale
  against white it read as coloured static, not geometry. Swapped `helix` onto Studio (a vertical
  column holds a silhouette on light, and it echoes the reference's own light-section object) and
  moved `plane` to Data, where a grid is also the more honest image.
- **Fringing became dirt.** Chromatic aberration that reads as a glow on black reads as coloured
  speckle on white. `uAmount` now scales by `(1 - 0.55 * light)` — the split narrows as the page
  lightens rather than switching off.
- **Particles buried the type on light.** Subtracting at full strength swamped the headline; reduced
  to 0.62.
- **`upper-left` content collided with the section chip.** Fixed by scaling that layout's display
  type to 0.72 and tightening its gaps — which also adds a *typographic* axis of difference, not
  just a positional one.
- **Hero octagon was cropped top and bottom.** Pre-existing tight framing that the new `y` offset
  made worse. Hero re-centred and `CAM_Z[0]` pulled back 15 → 16.4.
- **Copy was unreadable over bright particle cores.** Fixed generally rather than per-section: a
  `.panel::before` scrim fades `--bg-primary` in over the lower band only. Because the theme driver
  interpolates that token, the same rule darkens the dark sections and lightens the light one.

### Measurement note

The first collision check measured `.lower`'s bounding box, which is a flex container filling its
grid row regardless of content — it reported every section as colliding, including layouts that were
visibly fine. Re-measured against the leaf text elements. **A container's box is not its content's
extent**; the same class of error as measuring a frame loop from outside it (§16).

### Still open

Unchanged from §17 — `site.js` still needs the real email, founding year, location, and social
links. Deferred by the user: contact form, deploy, real-device testing, accessibility audit,
og:image, real audio track, analytics.

---

## 19. Reference recon, pass 3 — the complete section map

The first two passes stopped around 60% of their timeline. This pass covers the rest.

### Method correction

Synthetic `WheelEvent` dispatch does **not** drive their scroll — 40 bursts of 12 events moved the
page zero pixels. Neither did `page.mouse.wheel` via CDP at the rate I used. What works is that
their `.page-scroll-wrapper` is a *real* scroll container (`scrollHeight: 16000`), so setting
`scrollTop` directly drives Lenis and the whole scene follows. Earlier passes were slower and more
awkward than they needed to be.

That also settles an old question: **16000px total is real**, not my `16000/8` arithmetic. Per-section
spans still vary (§12), the total just happens to be round.

### Declarative attributes worth stealing (the pattern, not the content)

Read straight off their DOM:

| attribute | on | meaning |
|---|---|---|
| `data-scene-invert="0\|1"` | `<html>` | theme inversion as first-class page state |
| `data-cursor-text-label="…"` | buttons | the cursor label is declarative — the cursor reads it off whatever is hovered |
| `data-section-index="0..7"` | nav buttons | 8 sections, each directly addressable |
| `data-engine="three.js r184 webgpu"` | `<canvas>` | confirms the stack |

`data-cursor-text-label` is the good one. Labels seen: `Open`, `Connect now`, `Return`, `Send`. One
attribute on an element, one reader in the cursor component — no per-component wiring.

### Complete map

| # | section | span (approx) | invert | treatment |
|---|---|---|---|---|
| 0 | hero | 0–1000 | dark | octagon of slabs, headline split across the horizon |
| 1 | About us | 1500–3500 | **light** | |
| 2 | Services | 4000–5500 | **light** | |
| 3 | Collaboration | 5500–7500 | **light** | outlined display type, solid "Connect now" block, stacked-slab column, DOF blur |
| 4 | Blog | 8000–10500 | dark | horizontal media carousel driven by vertical scroll; cursor-attached item labels |
| 5 | Partners | 11000–12500 | dark | numbered list, 5 named partners |
| 6 | Process | 13000–13500 | dark | camera flies *into* a modelled 3D scene; 3D-anchored hotspots, "(Click to Read)" |
| 7 | Contact | 14000–16000 | dark | rounded sheet slides up over the scene: form, socials, footer bar |

### Correction to §18

I built the inversion as **one** light section. Theirs spans **three** — `data-scene-invert` is `1`
from ~1500 to ~7500, roughly 40% of the site. The inversion is a movement the site passes through,
not a single accent section. Ours reads as a blip by comparison.

### The part that needs a 3D artist

Partners and Process are not particle fields. They are a **modelled environment** — a trunk with
horizontal slab canopies standing over a city skyline, with real surfaces, lighting and shadows,
seen from outside and then flown into. This is the GLB from the asset inventory (§6), and it is the
one thing on the site that our approach cannot reach by rearranging points. Flagged as needing an
artist in the very first assessment; still true.

What *is* reachable without an artist: 3D-anchored DOM hotspots (project a world position to screen
space each frame, place a marker there), which is the interaction that makes Process work.

---

## 20. Phase 7 — light run + declarative cursor labels (BUILT)

Acting on §19's findings.

### The light run

`theme: 'light'` now covers **Products, Studio and Data** — the three practices. Measured: the page
is light from y=4800 to y=10500, **40% of the timeline**, with exactly two flips and dark at both
ends. That matches the reference's proportion (§19).

`lightnessAt()` needed no change to support a run. With consecutive light sections its `from`/`to`
lookup returns 1→1 through the middle and only ramps at the two edges, which is already the right
behaviour.

### Shapes had to move

Extending the run put two regular lattices (`cube`, `plane`) onto light sections — the exact failure
§18 fixed for `plane`. Reassigned so the light run gets shapes with curvature and a clear silhouette
and the dark sections absorb the grids:

| # | section | shape | theme |
|---|---|---|---|
| 0 | hero | octagon | dark |
| 1 | about | cube | dark |
| 2 | work | threeClusters | dark |
| 3 | products | ring | **light** |
| 4 | studio | helix | **light** |
| 5 | data | sphere | **light** |
| 6 | founders | twoSpheres | dark |
| 7 | contact | plane | dark |

Two assignments are semantic and should not be shuffled for looks: `threeClusters` on Work (three
practices) and `twoSpheres` on Founders (two founders).

`TRANSITIONS` moved so a `scatter` lands on both theme-flip boundaries (work→products,
data→founders) plus founders→contact. The flips are now the loudest moments in the sequence, which
is what they should be.

### Declarative cursor labels

Lifted the reference's pattern, including the attribute name: an element carries
`data-cursor-text-label="Send"` and the cursor reads it off whatever is hovered. `pointerover` fires
for every element entered, so re-reading the nearest labelled ancestor on each one both sets and
clears the label — no `pointerout` bookkeeping. A `wheel` listener clears it too, since scrolling can
move a labelled element out from under a stationary pointer.

Labelled so far: Menu (`Open`), Connect tab (`Get in touch`), menu close (`Close`), section nav
(`Go`), audio toggle (`Sound on`/`Sound off`), ruler (`Jump`), contact CTA (`Send`), wordmark (`Back
to top`). Adding a control means adding one attribute — nothing is wired up in the cursor.

The ring also flips colour on light; the dot keeps its dark halo and reads on both grounds.

### A contrast bug the light theme exposed

`.micro` is real copy — the section index, the notes — and it uses `--hud-dim`. Measured against its
own ground:

| | alpha | contrast | |
|---|---|---|---|
| dark, before | 0.26 | **2.36:1** | fail |
| light, before | 0.38 | **2.36:1** | fail |
| dark, after | 0.50 | 4.98:1 | AA |
| light, after | 0.66 | 5.45:1 | AA |

**This was already broken on the dark theme** — the light run only made it visible. Raising the
token alone would have made the decorative hairlines shout, so `--hud-line` was split off for the
corner ticks and ruler ticks, which are not text and are not held to 4.5:1.

### Measurement note (third of its kind)

A theme sweep at 60ms per step reported 3 flips and a `light` start. Both were stale reads — the
sweep began immediately after a jump to y=10000 and never let the engine settle. At 200ms with a
900ms initial settle: 2 flips, dark at both ends. Same lesson as §16 and §18 — **give the frame loop
time to catch up before sampling it**, and check a surprising measurement before believing it.

### Still open

Unchanged. `site.js` placeholders (email, founding year, location, socials) remain the only
launch blockers. Not yet built from §19: the horizontal carousel (needs real work to show), 3D-anchored
hotspots, outlined display type, a mid-page CTA block. The modelled environment still needs an artist.

---

## 21. Phase 8 — 3D-anchored hotspots + outlined display type (BUILT)

### Hotspots

The reference's Process section pins DOM markers to points inside the 3D scene ("Sustain (Click to
Read)", §19). Same mechanism here, on **Work** only.

Work is the one section whose object has discrete parts that mean something: `threeClusters` puts
spheres at x = -5.4 / 0 / 5.4, and the three practices are exactly what those clusters stand for.
Each marker names a practice and jumps to its section, so the object doubles as navigation.
Anchoring markers to an object whose parts mean nothing would be decoration — that is why `ANCHORS`
has one entry and not eight.

Positions are declared in the points' **local** space, so they inherit the object's placement,
rotation and scatter for free. `update()` projects them through `points.matrixWorld` and the camera
once the frame's transforms are final — a marker can never lag the geometry it is pinned to. The
projected array is rebuilt in place, so reading it never allocates; `Field.svelte` copies it for
reactivity and skips the assignment entirely on the seven sections that have no anchors.

Verified:

| check | result |
|---|---|
| fade envelope across Work (p = 0 → 0.98) | `—, 0.65, 1, 1, 0.16, —, —` — present while the shape is legible, released before the morph |
| markers track the live transform | yes; spacing 353 / 311 px is asymmetric, as perspective on x = -5.4 / 0 / +5.4 requires |
| click "Studio" | lands on index 4, theme `light` |
| outside Work | zero `.spot` elements in the DOM |

Anchors sit ~0.8 above each cluster's crown (radius 2.5, centres at y -0.4 / 0.6 / -0.4). First
attempt placed them at the centres, which put the labels on top of the particles they point at.

**Known rough edge:** Playwright refuses to click a marker — "element is not stable" — because the
object drifts continuously. The drift is ~1px/second, so a human clicks it without noticing, but it
is a genuinely moving target. Under `prefers-reduced-motion` the rotation is static and the markers
hold still. Worth revisiting if it ever annoys anyone.

### Outlined display type

`SECTIONS[].display` — `solid` (default) or `outline` — a fourth axis alongside layout, theme and
object placement. Set on **Products**, whose `lower-right` layout keeps the type clear of the ring,
so an outlined headline sits on clean ground rather than fighting particles.

```css
@supports (-webkit-text-stroke: 1px currentColor) { … }
```

The `@supports` guard is not decoration: the treatment needs `color: transparent`, and without
text-stroke support that yields an **invisible headline**. Failing to a solid headline is the only
acceptable fallback. Stroke is `0.025em` so it scales with the clamped display size (2.74px at the
current step) and takes `var(--ink)`, so it inverts with the theme like everything else.

### Still open

Unchanged. `site.js` placeholders remain the only launch blockers. Not yet built from §19: the
horizontal carousel (needs real work to show) and a mid-page CTA block. The modelled environment
still needs an artist.

---

## 22. Phase 9 — the horizontal carousel (BUILT)

The last structural piece from §19: a section whose content moves **sideways** while you scroll
down. On the reference this is Blog; here it is a new **Selected work** section, inserted at index 6
— right after the light run returns to dark, which is where theirs sits too.

### Inserting a section

The table went 8 → 9. Four arrays in `field.js` are indexed by section and all had to grow with it:
`GENERATORS`, `CAM_Z`, `OBJECT_POS`, `TRANSITIONS`. A test asserts all four are length 9 and that
the nine shapes are distinct — a silent length mismatch here would read as a wrong shape rather than
an error.

Inserting at 6 was deliberate: **Work stays at index 2**, so `ANCHORS[2]` (the hotspots, §21) and
the light run at 3/4/5 are both untouched. Verified after the fact: theme still flips exactly twice
at the same scroll positions, hotspots still read Products/Studio/Data.

New shape `haze` for the section — a wide, shallow, deep cloud. First attempt carved a hole in the
middle for the cards to sit in, which left two dense stripes across the frame reading as noise. The
fix was volume, not shape: **density is volume when the particle count is fixed**, so spreading the
same 8k points across x±40 / y±3.2 / z±13 thins them into drifting dust.

### The track

`travel(p) = max(0, trackW - bandW) · clamp((p - 0.08) / 0.84)`

The 0.08/0.92 window leaves a beat of stillness at each end, so the first and last cards are
readable rather than already sliding as the section arrives. Measured: track holds at 0 through
p=0.08, moves to −1356 by p=0.92, holds there to p=1.

The gutters live **inside** the track as padding rather than as a `left` offset. With `left: gutter`
the travel `trackW - bandW` was short by exactly one gutter and the last card overshot the right
edge by 48px. With padding, first card starts at x=48 and last ends at 1392 = 1440−48 — symmetric.

Cards reuse `data-cursor-text-label` from §21, so hovering one names it under the pointer. That is
what the reference does on its carousel, and it cost nothing.

Two layout bugs found and fixed by measurement: `height: 100%` on the image made cards taller than
the band, so `overflow: hidden` clipped every caption (`flex: 1; min-height: 0` instead); and the
band originally overlapped the section-index row, which a collision check limited to `.lower` had
missed — widened to include `.upper`.

### Placeholder artwork

Six cards, art generated by `scripts/gen-slots.mjs` — deterministic from a seed, drawn from nothing
but arithmetic, so it carries no licence and regenerates identically. Nothing was downloaded.

Each is stamped `SLOT NN` and `PLACEHOLDER — REPLACE WITH REAL WORK` in the image itself, and the
titles are `Project slot 01…06`. That is deliberate: no invented client names, no fake case studies.
The section note says so on the page too.

`alt=""` is correct **only while the art is a placeholder** — it carries no meaning the caption does
not already give. Real images need real alt text; the note in `site.js` says so.

### Verified

| | |
|---|---|
| travel | holds 0 → −1356 → holds; ends flush with both gutters |
| collisions | none, `.upper` and `.lower` both checked |
| assets | no 4xx on `/work/*` |
| theme run | unchanged: 2 flips, light 4800→10500, dark at both ends |
| hotspots | unchanged: Products / Studio / Data on Work |
| menu | lists `06 Selected` |
| 390×844 | 6 cards at the 240px clamp floor, no horizontal page overflow |
| page errors | none |

### Still open

`site.js` placeholders (email, founding year, location, socials) plus the six card slots. From §19
only the **mid-page CTA block** is unbuilt, and the modelled 3D environment still needs an artist.

### 22a. Carousel, second pass

Feedback: the cards should be in the middle, bigger, and have effects; the artwork on them does not
matter much.

**Composition.** The section now reads top to bottom as lede / cards / headline. Lede and note moved
out of `.lower` into a `.car-intro` block pinned near the top, the band moved to 20vh with a 50vh
height, and the headline scaled to 0.82 and anchored to the baseline. Measured at 1440×900: intro
ends 174, band 180→630, headline starts 706 — three clear bands, nothing overlapping.

The section index was dropped for this layout. The horizon row now falls inside the card band, so
the index had nowhere to go; the corner chip already reports position, so it was redundant anyway.
(First attempt moved it to the top instead, where it landed on top of the fixed wordmark.)

**Depth.** `focus(i, p)` gives each card its distance from the middle of the frame, and from that a
rotateY, a scale, an opacity and a counter-shift for the image inside. The card crossing the centre
stands upright at full size and strength; everything either side turns away, shrinks and dims, so
the strip reads as objects in a space rather than a row of flat tiles. Measured mid-travel: centre
card 0.98 opacity, neighbours 0.50–0.56.

Two things that matter in the implementation:

- **Perspective lives on the band, not the track.** The band is fixed to the viewport, so the
  vanishing point stays at the centre of the screen. On the track it would slide along with the
  scroll and the whole strip would shear.
- **No per-frame `getBoundingClientRect`.** Card `offsetLeft` is relative to the track's padding box
  and is unaffected by the track's transform, so it is measured once per layout and stays valid as
  the track slides.

**Artwork.** Regenerated lighter, with a different hue per slot. Near-black art on a near-black page
made the cards vanish into the background instead of reading as panels — the fix was the art, plus a
raised card surface and a drop shadow so a card reads as an object even where its image is dark.

The stamp is now **centred** rather than inset from the left. Cards crop with `object-fit: cover`
and then shift for parallax; a left-aligned stamp was eaten by both, which mattered because that
stamp is the thing stopping a placeholder from passing as real work. Parallax was also trimmed
(scale 1.16 → 1.10, shift ±46 → ±26) so the image can never shift further than its own overflow —
31px of overflow against 26px of travel.

Re-verified after the change: 2 theme flips, dark at both ends; hotspots still Products/Studio/Data;
no 4xx on `/work/*`; 390×844 gives 260px cards with no horizontal page overflow; no page errors.

### 22b. Carousel, third pass

Feedback: drop the moving particles behind the cards, put the plates on one colour, add a hover
effect, and do something fun with the way they travel.

**Particles.** `PARTICLE_ALPHA` is a per-section array like `CAM_Z`, interpolated on the same morph
curve so the field fades rather than pops. It is `0` for the carousel alone: the drifting points
competed with the thing you are meant to look at. Only the *points* go — the painted ground (fbm
haze, dot grid, vignette) still renders, so the section keeps its atmosphere. Confirmed by
screenshot that the field is absent mid-carousel and back at full strength on Founders either side.

**One colour.** Six hues made the strip look like six unrelated things. The plates are a set, so
`gen-slots.mjs` now takes a single hue (208) and lets the drawn geometry carry the variation.

**Hover.** The hovered card goes to full opacity (JS, since `dim` is an inline style) while its
frame scales to 1.07 with an accent border and a deeper shadow (CSS, transitioned).

The split matters: the card's own transform is rewritten every frame by `focus()`, so it must **not**
carry a CSS transition — that would smear the entire strip while scrolling. `.frame` holds no inline
transform, so it can animate on its own without fighting the scroll.

**The travel effect.** `rise = sin(d · π · 3) · 26 + centreLift`. Because `d` slides continuously as
the track moves, each card rides up over a crest and down into a trough on its way across — a
standing wave in screen space rather than per-card animation. The band grew to 54vh and cards were
capped at 84% height with `align-items: center`, so the wave has headroom instead of being clipped
by the band's overflow. Measured card tops mid-travel: 221 / 204 / 221 / 209 / 204 / 240.

### Two process notes

**A stale search string silently did nothing.** The template was updated to read `f.rise` but the
`focus()` edit missed, because its search string still carried `shift: -d * 46` from before the
previous pass changed it to `26`. A single `assert s != o` at the end of the block passed on the
*other* edits and hid it. The symptom was subtle: `f.rise` was `undefined`, so `translateY(NaNpx)`
made the whole `transform` declaration invalid and the browser dropped it — leaving `opacity`
working and every card unmoved. Multi-edit blocks now assert **per replacement** and check the match
is unique, and a follow-up check confirms every key the template reads is actually returned.

**A measurement that proved nothing.** Counting bright pixels via `drawImage` from the WebGL canvas
returned 0 everywhere — including sections that visibly have particles. Reading back a WebGL canvas
needs `preserveDrawingBuffer`, which is not set, so the sample was blank by construction. It was not
evidence the particles were gone; verified by screenshot instead. Same family as §16/§18/§20: check
that a measurement *can* see what it claims to measure before believing a clean result.

### Re-verified

2 theme flips, dark at both ends; hotspots still Products/Studio/Data; 390×844 gives 260px cards
with no horizontal overflow; no page errors.

### 22c. Carousel, fourth pass — real depth

Feedback: the cards at the sides should be smaller and grow as they reach the middle, as though
moving away and coming closer.

**Depth, not scale.** The old `scale: 1 - away * 0.14` shrank cards in place, which reads as
resizing rather than receding. Replaced with `translateZ`. The band already carries the perspective,
so pushing a card back along Z genuinely recedes it: it foreshortens, and the projection does the
sizing. At -700px against a 1500px perspective a card reads about two thirds size.

**The bunching problem.** Perspective drags anything pushed back toward the vanishing point, so the
receding cards piled into the middle and overlapped into a muddy mass — clearly visible in
`recon/v15-depth.png`. The fix pushes each card outward by exactly what the projection is about to
take away:

```
Δx = x · |z| / perspective
```

applied at 85%, so a little inward drift survives and the strip still reads as an arc rather than a
flat wall. `PERSPECTIVE` and `PERSPECTIVE_PULL` are named constants next to `focus()` and must match
the `perspective` on `.band` — the compensation is wrong if they drift apart.

Measured after the fix, at two scroll positions: **worst overlap 0px**, and apparent widths rise
toward the centre (437 → 481 → 549 at 1440×900).

**Mobile.** The taller lower block pushed the headline onto the corner chip at 390×844; padding
raised for that layout. Headline now ends at 768 against a chip top of 791.

### Re-verified

2 theme flips, dark at both ends; hotspots still Products/Studio/Data; track travel 0 → −2405 with
stillness at both ends; 390×844 no horizontal overflow; no page errors.

---

## 23. Phase 10 — the mid-page CTA block (BUILT)

The last item from the §19 inventory. The reference puts a solid "Connect now" block directly under
its light-section headline; this is the same move, on **Studio** — the practice a visitor can
actually hire.

Configured, not hardcoded. `COPY.studio.cta = { label, to }`, where `to` names a **section id** and
the button resolves it through the section table at render time. Inserting or reordering sections
cannot break it into pointing at the wrong place — which matters, since this table has already been
renumbered once (§22).

### Theme inversion for free

```css
background: var(--ink);
color: var(--bg-primary);
```

Both tokens are interpolated by the theme driver (§18), so the block is black-on-white through the
light run and white-on-dark elsewhere, with no second rule and no `[data-theme]` branch. Measured on
Studio: `rgb(20,23,28)` on `rgb(238,240,243)` — the reference's exact treatment.

Placement uses the existing order group: `.cta-row` takes `order: -1` under `upper-left`, the same
group as `.display` and later in the DOM, so it follows the headline instead of falling to the
bottom with the body copy.

### A collision it caused

Adding ~90px of block pushed Studio's column list into the corner chip — "Web applications" landed
on it, 858 against a chip top of 847. Fixed by tightening that layout's padding and gap rather than
shrinking the button. Re-measured: last text at 830, 17px of clearance, and **About** (the other
`upper-left` section, which has no CTA) is unaffected.

### Verified

| | |
|---|---|
| appearance | `rgb(20,23,28)` fill, `rgb(238,240,243)` text on the light run |
| position | sits directly under the headline (614 vs headline bottom 594) |
| action | click lands on index 8 `contact`, theme back to dark |
| uniqueness | at most **1** on screen across the whole 17,400px timeline |
| collisions | none on Studio; About unchanged |
| 390×844 | 187px button, no collisions, no horizontal overflow |
| page errors | none |

### §19 inventory: closed

Everything reachable from the recon is now built — light run, cursor labels, hotspots, outlined
type, carousel, CTA. What remains is not a missing feature: the modelled 3D environment behind
Partners/Process needs a 3D artist, and the six card slots plus the four `site.js` placeholders need
real content.

---

## 24. Pacing on Data, and a contact form (phase 11)

Two requests: *"the data page now goes too fast"*, and *"at the end of the website i want to add a
form and people fill it, just like the real website."*

### Data: length was the knob

Data was 1600px against 2200px for the other two light sections, and it carries the least copy on
the site — a headline, a lede and a note, with no columns, items or cards. But dwell was only half
the story. Because Data is the **last** light section, its final 28% is also where three separate
things land at once: the light→dark ramp, the `scatter` transition, and the shape morph into the
carousel. At 1600px that window was **448px**. Everything happened in the space of half a screen.

Raising it to 2200px widens that window to **616px** and gives the section 37% more reading time,
for one number changed and no new code. Total goes 17,400 → **18,000px**.

Swept 0→18000 in 400px steps: **two** theme flips (`dark→light` between 4400 and 4800, `light→dark`
between 10800 and 11200), dark at both ends, light across 35% of the timeline — the reference holds
its light state for about 40% of theirs.

### The form

Their contact block is headline and lede on the left, a three-field form on the right, with a footer
bar under it. Ours takes the same composition through a new `split` layout.

**Where it sends is config, not code.** `CONTACT.endpoint` in `site.js` is `null`, so today the form
composes the message in the visitor's own mail client. Set it to a URL and the same form POSTs
`{ name, email, message }` as JSON instead — nothing else changes.

The rule that decided that design: **the form never reports a message as sent when nothing was
sent.** With no endpoint the status line says "Opening your mail app with the message" and gives the
address as a fallback, because a false "thanks, we'll be in touch" is worse than an obviously
unfinished form — the visitor stops waiting for a reply they were never going to get.

The button says **"Send message"**, not the reference's "Submit". "Submit" names the form's
mechanism; "Send message" names what the person is doing.

### Four things this page breaks that an ordinary page does not

Each is a property of the scroll architecture, and each fails silently:

| | |
|---|---|
| **A form submit navigates.** The document doesn't scroll — Lenis, the 3D field and the whole timeline live in memory. A GET navigation would tear all of it down. | `preventDefault` on every submit path. |
| **Lenis listens on `window`.** A wheel over a filled textarea would scroll the page, not the text. | `data-lenis-prevent-wheel` on the textarea — the `-wheel` variant deliberately, because the full `data-lenis-prevent` opts out of touch as well and would turn a textarea with nothing to scroll into a patch of the page a phone cannot drag. Verified with a real trusted wheel: over the textarea the page moves **0px** and the text scrolls **300px**; over the headline the same wheel moves the page 163px. |
| **Inactive sections still hold focus and still take Tab.** They are transparent, unclickable and `aria-hidden`, but not removed. Focus a field, scroll to Founders, and you are typing into an invisible field inside an `aria-hidden` subtree. | `inert` on the form whenever the section is not active. Setting it also blurs whatever is inside, so one attribute closes both holes. Verified: leaving contact for Founders leaves the form mounted, `inert`, `activeElement` back to `BODY`, and a six-step Tab walk never enters it. |
| **`cursor: none`.** A dot cannot show a caret position or a selection. | The I-beam comes back over `input, textarea`, and `Cursor.svelte` hides its own dot over the same elements — one pointer at a time, never two, never none. |

### A grid mistake worth keeping

First attempt put the form *inside* `.lower` and spanned it down the rows with `grid-row: 1 / -1`.
With no explicit rows on the container, `-1` resolves to the end of the explicit grid — which is
line 1 — so the span collapses to a single row and the 267px form forced the **one-line lede's**
row to 267px. The headline was pushed to y=905 on a 900px viewport.

The fix was to stop nesting: the split now happens on the **panel**, so `.lower` stays the flex
column it is everywhere else and simply takes the left track. Two tracks that size themselves is a
simpler shape than one item spanning another's rows.

### The field had to move

With copy now running the full width, contact's `plane` cut straight through the lede. `OBJECT_POS[8]`
went `[1.6, 0.7]` → `[1.2, 2.4]` and `CAM_Z[8]` 15.2 → 17.6, which lifts the plane into the empty
band above the copy and sits it in the gutter between the two columns.

### Verified

| | |
|---|---|
| empty submit | no navigation, no scroll, 3 field errors, focus moves to the first bad field, `aria-invalid` + `aria-describedby` wired |
| live correction | fixing a field clears only that field's error |
| no endpoint | status reads "Opening your mail app…", page stays on section 8 |
| endpoint 200 | `POST {name,email,message}` as JSON, "Message sent.", fields cleared |
| endpoint 500 | "That did not go through." plus the fallback address — never a success |
| wheel isolation | page 0px over the textarea, 163px over the headline (real wheel events) |
| focus release | `inert` on leaving; `activeElement` back to `BODY`; Tab never re-enters |
| tab order | name → email → message → send → out to the wordmark |
| baseline | form bottom 792 = email link bottom 792; both clear the chip at 847 |
| error growth | form grows upward, baseline stays pinned |
| 390×844 | one column, form bottom 768 vs chip top 791, no horizontal overflow |
| page errors | none new (the `sounds/ambient.mp3` 404 is the still-missing audio track) |

### Still deliberately not built

Their contact block also carries socials, a copyright line and a Privacy Policy link. The ask was
the form; the footer bar is a separate decision and the privacy policy was already on the deferred
list.

### Three things Playwright could not see

The browser tests above all pass in a fresh headless profile at one viewport size. Three real-world
conditions are invisible from there, and each needed handling on the reasoning rather than the
screenshot.

**Autofill repaints the fields.** `autocomplete="name"` and `autocomplete="email"` mean Chrome and
Safari will fill these for a large share of visitors — and paint their own background while doing
it, a bright box in the middle of a dark panel. Playwright has no saved profile, so every capture
here shows the un-autofilled state. The inset `-webkit-box-shadow` is the only override the engines
honour, and `color` is ignored inside an autofilled field, so the text colour has to go through
`-webkit-text-fill-color`.

**A terminal status line goes stale.** After a send, `phase` stayed `'sent'`, so "Message sent." sat
above a half-typed second message — the page describing something that was no longer happening,
which is the exact failure the whole endpoint design exists to avoid. The first keystroke after a
terminal state now returns it to idle.

**The soft keyboard.** It cannot be simulated, but its consequence can be: it takes the bottom third
of the screen, which here is where the send button lives. And there is no document scroll to fall
back on — `.page-scroll-wrapper` is fixed and `body` is `overflow: hidden`, so a control pushed
below the fold is simply unreachable, not merely awkward.

Measured at 390×430 (roughly a phone with the keyboard up): the **send button sat 37px below the
viewport**. Fixed in three moves, all height-driven rather than width-driven, because a laptop
window at 1440×600 is the same problem:

- Below 640px tall, the form gives up padding: tighter fields, a 14vh cap on the message, no
  reserved space for the status line.
- Below 640px tall **and** narrow, the copy stands down entirely and the form takes the screen.
  The visitor is mid-sentence in the form; the headline can wait.
- The HUD stands down with it. Below 560px the horizon rule, the founded/clock stamp and the
  registration marks stop framing the composition and start cutting across the fields; below 640px
  and narrow, the counter chip and the two lower corner marks are in the send button's own footprint.
  A control someone is using outranks a position readout. The wordmark and the menu tabs stay —
  they are the way out, and they are at the top.

Re-measured across **11 viewports** (1920×1080, 1440×900, 1440×600, 1280×720, 768×1024, 844×390,
414×896, 390×844, 390×430, 360×640, 320×568) with true rectangle intersection against every piece
of chrome: **zero collisions, send button fully on screen everywhere**, smallest clearance 13px.

### Two corrections found by measuring properly

**The first overlap metric was wrong.** It compared each field's bottom against the next field's
top, which reports the side-by-side Name and Email pair as a 59px overlap — they are adjacent
horizontally, not stacked. Replaced with a real rectangle intersection. Same lesson as §16 and §22b,
in a new costume: *check that the measurement can see what it claims to measure.*

**`.field` is not a unique class.** The first sweep matched four "fields" — three form fields and
the canvas layer, which uses the same class name. The canvas's full-viewport box then produced a
414px phantom overlap. Scoped to `.form .field`.

### One thing the screenshots did catch

At 390×430 the copy is hidden, so the particle plane has nothing to sit above and lands directly
behind the fields — placeholders washed out to unreadable. `--bg-raise` is a 5.5% white wash, which
is enough over a quiet background and nothing at all over a bright one. The fields now take
`color-mix(in srgb, var(--bg-primary) 82%, transparent)`, with the old `--bg-raise` left in place on
the line above as the fallback where `color-mix` is unavailable. Still theme-driven, no hard-coded
colour.

---

## 25. A footer, and a scroll you can watch (phase 12)

Three requests: socials and a footer under the form with no real links yet; the jump from the ruler
and the menu "takes me there fast, it should be more smooth"; and where to put an ambient track.

### The jump was a teleport, and the cause was a constant

`scrollToSection` used `duration: 1.5` and `scrollToY` used `1.2` — **fixed** durations. The same
1.5s covered a 1,400px nudge and a 15,600px crossing, so the long one arrived as a smear. Lenis's
default `scrollTo` easing compounds it: an exponential-out puts almost all the distance in the first
fraction of a second and then crawls to a stop.

Measured, hero → the far end, as percentage of the distance covered:

| | 250ms | 500ms | 1000ms | 2000ms | 3000ms | 4000ms |
|---|---|---|---|---|---|---|
| **before** — fixed 1.5s, easeOutExpo | 0 | **99** | 99 | 100 | 100 | 100 |
| **after** — distance-scaled, sine in-out | 0 | 0 | 22 | 68 | 99 | 100 |

Two changes, both in `engine.svelte.js`:

- **Roughly constant speed instead of constant time.** `duration = clamp(1.15, 0.75 + 2.65·d, 3.4)`
  where `d` is the distance as a fraction of the timeline. A neighbouring section lands at the 1.15s
  floor — about where it was, because a nudge was never the problem. End to end goes from 1.5s to
  3.4s, which is the case that actually read as being thrown across the page.
- **Sinusoidal in-out** instead of the exponential-out. Zero acceleration at both ends, so the page
  gathers speed and sheds it rather than lurching and then trailing.

A longer travel is only tolerable if you can change your mind during it, so: no `lock`. Verified
with a wheel mid-flight — a travel to 17,000 that was passing 3,704 stopped and settled at 3,128,
while the same travel left alone reached 17,000.

### Socials and footer, with nothing invented

`href: null`, not `href: '#'`. An `<a>` with no href attribute is plain text to the browser: not
clickable, not focusable, not a link that silently goes nowhere. Pasting a real URL in `site.js`
turns it into a working link and nothing else changes. They render dimmed so they read as names not
yet wired up.

That change also removes them from the Menu's focus trap, which queries `button, a[href]`. Checked:
8 focusables (Close plus 7 nav items), first is Close, last is Founders, Shift+Tab wraps, Escape
closes.

Placement follows the reference's split without a new bar: the socials join the direct address on
one row at the bottom-left, and `© 2026 Astro. All rights reserved.` and a pending `Privacy policy`
close the right column under the form. Both columns finish level — socials bottom 792, legal bottom
792. The legal line is sentence case rather than the uppercase `.micro` the rest of the HUD uses,
because it is a sentence, not a label.

### The HUD stands down on contact

The footer pushed the contact panel into the frame the HUD occupies, and the collision sweep found
four: the socials row on the counter chip at 1440×600 and 844×390, the horizon rule crossing a form
field at 1280×720, the founded/clock stamp landing on the first field at 390×844.

So the instrument frame fades out on the split layout — horizon, counter and stamp — and comes back
on every other section. It is the one screen you are meant to work on rather than read, and a
control someone is using outranks a position readout. Keyed off `layout === 'split'`, not an index,
so it follows the section table.

Re-swept across the same 11 viewports: **zero collisions, send button on screen everywhere.**

### The measurement lied for an hour

Worth writing down, because it cost more than the feature. `getComputedStyle(el).opacity` in this
headless browser returned `"0"` for the horizon rule on **every** section — including ones where the
screenshot plainly shows it. Chasing that reading produced a wrong diagnosis (that Svelte had pruned
a `.bare .horizon` descendant rule) which I wrote into a source comment before testing it; compiling
the descendant version and reading the served CSS showed Svelte keeps it perfectly.

What was actually true: the inline value was correct all along —

| | work | contact |
|---|---|---|
| inline `style.opacity` | `1` | `0` |
| `getComputedStyle` | `0` | `0` |
| screenshot | chip, stamp, rule all visible | all three gone |

The inline value and the render agree; the computed value agrees with neither. §16, §18, §20, §22b
and now §25: **establish that the measurement can see what it claims to measure before you believe
it — and before you write its conclusion into the code.** A screenshot settled in one look what six
programmatic probes could not.

The fade is now an inline style bound to the derived flag, with only the transition in CSS: the same
value on the server, on first paint and after every rebuild, with no ordering or specificity to
reason about.

### Mobile

One column puts the copy where the object is brightest, and the address and social names washed out
against it. The panel scrim covers the full frame there and reaches solid higher up, instead of only
the bottom 68%.

### The ambient track

`static/sounds/ambient.mp3` — that exact path and filename. `static/sounds/README.md` already
documents it, including licence-safe sources. The engine prefetches it during the preloader and
falls back to the synthesised generative notes if it is absent, so nothing else needs changing. The
`sounds/ambient.mp3` 404 in every console check in this teardown disappears once the file lands.
