/**
 * Preloader cell-grid, rendered off the main thread.
 *
 * The main thread hands us the canvas via transferControlToOffscreen(), so we
 * draw straight into it — no frame copying. The whole point is that the loading
 * animation stays smooth while the main thread is busy decoding assets, which
 * is exactly when a main-thread rAF would stutter.
 */

const CELL_W = 18, CELL_H = 10, GAP_X = 8, GAP_Y = 8;
const PITCH_X = CELL_W + GAP_X, PITCH_Y = CELL_H + GAP_Y;

const IDLE = 'rgba(255, 255, 255, 0.025)';
const LIT = 'rgba(255, 255, 255, 0.18)';
const ACCENT = '#e64749';
const ACCENT_SOFT = 'rgba(230, 71, 73, 0.5)';

let ctx = null, W = 0, H = 0, dpr = 1;
let shown = 0, raf = 0, t0 = 0, lastPost = 0;

// The worker owns the minimum-duration clock. The main thread is blocked for
// most of a second during hydration and font loading — exactly when the loader
// should be animating — so if it fed us progress we would freeze with it. It
// only tells us how much real work has finished; the ramp is ours.
let minMs = 1800;
let real = 1;

// Deterministic per-cell hash → stable threshold, so the fill pattern doesn't
// reshuffle between frames.
function hash(c, r) {
	const n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
	return n - Math.floor(n);
}

function draw(now) {
	if (!ctx) return;
	if (!t0) t0 = now;
	const time = (now - t0) / 1000;

	const floor = Math.min(1, (now - t0) / minMs);
	const target = Math.min(real, floor);

	// ease the displayed value so progress never jumps
	shown += (target - shown) * 0.08;

	// report back for the counter, throttled — the main thread may be busy
	if (now - lastPost > 90) {
		lastPost = now;
		self.postMessage({ type: 'progress', value: target });
	}

	ctx.clearRect(0, 0, W, H);

	const cols = Math.ceil(W / PITCH_X) + 1;
	const rows = Math.ceil(H / PITCH_Y) + 1;

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			// vertical bias makes the fill sweep downward as progress climbs
			const bias = r / rows;
			const threshold = hash(c, r) * 0.55 + bias * 0.45;
			const delta = shown - threshold;

			let fill;
			if (delta < 0) {
				fill = IDLE;
			} else if (delta < 0.06) {
				fill = ACCENT;                     // the advancing front
			} else if (delta < 0.14) {
				fill = ACCENT_SOFT;
			} else {
				// settled cells breathe very slightly so the field stays alive
				const a = 0.18 + 0.05 * Math.sin(time * 1.6 + c * 0.4 + r * 0.7);
				fill = `rgba(255, 255, 255, ${a.toFixed(3)})`;
			}

			ctx.fillStyle = fill;
			ctx.fillRect(c * PITCH_X, r * PITCH_Y, CELL_W, CELL_H);
		}
	}

	raf = requestAnimationFrame(draw);
}

self.onmessage = (e) => {
	const m = e.data;

	if (m.type === 'init') {
		const canvas = m.canvas;
		ctx = canvas.getContext('2d');
		dpr = m.dpr;
		minMs = m.minMs ?? minMs;
		W = m.width; H = m.height;
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		ctx.scale(dpr, dpr);
		raf = requestAnimationFrame(draw);
	}

	// how much real asset work has completed, 0→1
	if (m.type === 'real') real = m.value;

	if (m.type === 'resize' && ctx) {
		W = m.width; H = m.height; dpr = m.dpr;
		ctx.canvas.width = W * dpr;
		ctx.canvas.height = H * dpr;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
	}

	if (m.type === 'stop') {
		cancelAnimationFrame(raf);
		ctx = null;
	}
};
