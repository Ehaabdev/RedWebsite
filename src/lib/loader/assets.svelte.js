/**
 * Asset progress.
 *
 * This module only tracks *what has finished*. The ramp itself — the minimum
 * duration that stops the loader flashing past on a warm cache — is owned by
 * the grid worker, because the main thread is blocked for most of a second
 * during hydration and font loading and cannot animate anything through it.
 *
 * Phase 4 pushes GLB/texture loads in here via track().
 */
export const MIN_MS = 1800;

export const load = $state({
	progress: 0, // 0→1, driven by the worker
	ready: false,
	label: 'Booting'
});

let tasks = [];
let registered = false;

/** Register a promise as part of the load. Returns the promise unchanged. */
export function track(promise, label) {
	const entry = { done: false, label };
	tasks.push(entry);
	promise.then(() => (entry.done = true)).catch(() => (entry.done = true));
	return promise;
}

/** Fraction of registered work that has finished, 0→1. */
export function realRatio() {
	if (!tasks.length) return 1;
	return tasks.filter((t) => t.done).length / tasks.length;
}

export function registerDefaults() {
	if (registered) return;
	registered = true;
	if (typeof document !== 'undefined' && document.fonts?.ready) {
		track(document.fonts.ready, 'Typefaces');
	}
}

/**
 * Stage labels follow progress, not which promise is outstanding — on a warm
 * cache everything resolves before the first frame, and a counter reading
 * "Ready" at 3% looks broken.
 */
function labelFor(p) {
	if (p < 0.3) return 'Booting';
	if (p < 0.6) return 'Typefaces';
	if (p < 0.92) return 'Scene';
	return 'Ready';
}

export function setProgress(p) {
	load.progress = p;
	load.label = labelFor(p);
	if (p >= 0.999) load.ready = true;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
	window.__load = load;
}
