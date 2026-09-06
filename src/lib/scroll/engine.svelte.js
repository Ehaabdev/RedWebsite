import Lenis from 'lenis';
import { sectionAt, offsetOf, TOTAL } from './sections.js';

/**
 * Global scroll state. Everything downstream — active/nearby classes, the
 * ruler, the counter, and later every 3D uniform — reads from here.
 */
export const scroll = $state({
	y: 0,
	index: 0,
	progress: 0, // 0→1 within the active section
	global: 0 // 0→1 across the whole timeline
});

let lenis = null;

/**
 * Anything that needs a per-frame tick subscribes here rather than starting its
 * own rAF. One loop for scroll, DOM and 3D keeps them in step and avoids paying
 * for a second scheduler.
 */
const frameSubs = new Set();

export function onFrame(cb) {
	frameSubs.add(cb);
	return () => frameSubs.delete(cb);
}

/**
 * Attach Lenis to the scroll wrapper. Returns a teardown function.
 *
 * Note we drive `lenis.raf` from a single rAF we own, and read position from
 * Lenis's `scroll` event — never a native scroll listener on the wrapper,
 * which would also fire from Lenis's own writes and double-drive the state.
 * The 3D loop will join this same rAF later.
 */
export function createEngine(wrapper, content) {
	lenis = new Lenis({
		wrapper,
		content,
		// Listen on the window, not the wrapper. All the chrome — wordmark, HUD,
		// menu tabs, audio widget — is fixed-position and lives outside the
		// wrapper, so wheel events over any of it would never reach Lenis and
		// scrolling would silently die wherever the cursor happened to rest.
		// Opt a region out with data-lenis-prevent if it needs its own scroll.
		eventsTarget: typeof window !== 'undefined' ? window : undefined,
		lerp: 0.055,
		wheelMultiplier: 0.48,
		syncTouch: true,
		syncTouchLerp: 0.055,
		touchMultiplier: 0.85,
		overscroll: false
	});

	const update = () => {
		const y = lenis?.scroll ?? 0;
		const s = sectionAt(y);
		scroll.y = y;
		scroll.index = s.index;
		scroll.progress = s.progress;
		scroll.global = s.global;
	};

	lenis.on('scroll', update);
	update();

	// Dev-only test handle. Driving the engine via lenis.scrollTo (rather than
	// poking wrapper.scrollTop) is the only way to move it without fighting
	// Lenis's own smoothing — the state reads lenis.scroll, not the DOM.
	if (import.meta.env.DEV && typeof window !== 'undefined') {
		window.__engine = {
			state: scroll,
			jump: (y) => lenis?.scrollTo(y, { immediate: true }),
			// The eased travels, so their timing can be measured without going
			// through a click. Importing this module from a console gets a second
			// instance with its own `lenis = null`, so the animated helpers have
			// to be reachable from the instance that actually owns the engine.
			to: (i) => scrollToSection(i),
			toY: (y) => scrollToY(y),
			lenis: () => lenis
		};
	}

	let prev = performance.now();
	let rafId = requestAnimationFrame(function loop(t) {
		lenis?.raf(t);
		const dt = Math.min((t - prev) / 16.667, 3);
		prev = t;
		for (const cb of frameSubs) cb(t, dt);
		rafId = requestAnimationFrame(loop);
	});

	return () => {
		cancelAnimationFrame(rafId);
		lenis?.destroy();
		lenis = null;
	};
}

/**
 * How long a programmatic scroll should take, in seconds.
 *
 * A fixed duration is the bug: 1.5s covers a 1,400px nudge and a 15,600px
 * crossing alike, so the long one arrives as a teleport with motion blur. This
 * is a roughly constant speed instead — duration grows with the distance — with
 * a floor so a one-section hop still feels like a press rather than a lurch.
 *
 * Bounds: a neighbouring section lands near the old 1.5s; end to end takes 3.4s
 * instead of 1.5s, which is the case that actually reads as being thrown.
 */
function travelDuration(to) {
	const d = Math.abs(to - (lenis?.scroll ?? 0)) / TOTAL;
	return Math.min(3.4, Math.max(1.15, 0.75 + 2.65 * d));
}

/**
 * Lenis's default scrollTo easing is an exponential-out: almost all of the
 * distance is covered in the first fraction of a second, then it crawls to a
 * stop. Over 15,600px that start is a lurch. Sinusoidal in-out has zero
 * acceleration at both ends, so the page gathers speed and sheds it — the
 * motion has a shape rather than a jolt and a tail.
 */
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/** Animate to the start of a section. */
export function scrollToSection(i) {
	const to = offsetOf(i);
	// No `lock`: a wheel or a touch during the travel cancels it, which is the
	// behaviour you want the moment someone changes their mind mid-flight.
	lenis?.scrollTo(to, { duration: travelDuration(to), easing: easeInOutSine });
}

/** Jump to an absolute offset. `immediate` skips the easing — use this for tests. */
export function scrollToY(y, { immediate = false } = {}) {
	if (immediate) return lenis?.scrollTo(y, { immediate: true, duration: 0 });
	lenis?.scrollTo(y, { duration: travelDuration(y), easing: easeInOutSine });
}

export function getLenis() {
	return lenis;
}
