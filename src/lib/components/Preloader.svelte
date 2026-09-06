<script>
	import GridWorker from '$lib/workers/grid-worker.js?worker';
	import {
		load,
		registerDefaults,
		realRatio,
		setProgress,
		track,
		MIN_MS
	} from '$lib/loader/assets.svelte.js';
	import * as audio from '$lib/audio/engine.js';
	import { getLenis } from '$lib/scroll/engine.svelte.js';

	let { onenter } = $props();

	let canvas = $state(null);
	let dismissed = $state(false);
	let leaving = $state(false);
	let worker = null;
	let fallbackRaf = 0;

	let pct = $derived(Math.round(load.progress * 100));

	// Hold the scroll engine until the gate is cleared, so the page can't be
	// scrolled behind the overlay.
	$effect(() => {
		const lenis = getLenis();
		if (!dismissed) lenis?.stop();
		else lenis?.start();
	});

	$effect(() => {
		registerDefaults();
		// Download the ambient track (if one exists) while the loader is up.
		// Resolves to null when the file is absent — the engine then falls back
		// to the synthesised notes, so this can never block entry.
		track(audio.prefetch(), 'Sound');

		const dpr = Math.min(devicePixelRatio || 1, 2);
		const w = innerWidth;
		const h = innerHeight;

		// Prefer rendering the grid in a worker. Falls back to the main thread
		// where OffscreenCanvas isn't available (Safari < 16.4, older mobile).
		if (canvas && 'transferControlToOffscreen' in canvas) {
			worker = new GridWorker();
			const off = canvas.transferControlToOffscreen();
			worker.postMessage(
				{ type: 'init', canvas: off, width: w, height: h, dpr, minMs: MIN_MS },
				[off]
			);

			// The worker drives the counter; it has a clock the main thread can't stall.
			worker.onmessage = (e) => {
				if (e.data.type === 'progress') setProgress(e.data.value);
			};

			// Tell it how much real work has finished. If the main thread is busy
			// and this lapses, the worker keeps ramping on its own clock.
			const realTimer = setInterval(
				() => worker?.postMessage({ type: 'real', value: realRatio() }),
				120
			);

			const onResize = () =>
				worker?.postMessage({
					type: 'resize',
					width: innerWidth,
					height: innerHeight,
					dpr: Math.min(devicePixelRatio || 1, 2)
				});
			addEventListener('resize', onResize);
			return () => {
				clearInterval(realTimer);
				removeEventListener('resize', onResize);
				worker?.postMessage({ type: 'stop' });
				worker?.terminate();
				worker = null;
			};
		}

		if (canvas) {
			fallbackRaf = mainThreadGrid(canvas, dpr);
			return () => cancelAnimationFrame(fallbackRaf);
		}
	});

	async function enter(withSound) {
		if (withSound) await audio.start();
		audio.click({ pitch: 660 });
		leaving = true;
		setTimeout(() => {
			dismissed = true;
			onenter?.(withSound);
		}, 620);
	}

	/** Minimal main-thread version of the same grid, for the fallback path. */
	function mainThreadGrid(el, dpr) {
		const ctx = el.getContext('2d');
		el.width = innerWidth * dpr;
		el.height = innerHeight * dpr;
		ctx.scale(dpr, dpr);
		const CW = 18, CH = 10, PX = 26, PY = 18;
		const hash = (c, r) => {
			const n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
			return n - Math.floor(n);
		};
		let shown = 0;
		const t0 = performance.now();
		const draw = () => {
			const target = Math.min(realRatio(), Math.min(1, (performance.now() - t0) / MIN_MS));
			setProgress(target);
			shown += (target - shown) * 0.08;
			ctx.clearRect(0, 0, innerWidth, innerHeight);
			const cols = Math.ceil(innerWidth / PX) + 1;
			const rows = Math.ceil(innerHeight / PY) + 1;
			for (let r = 0; r < rows; r++)
				for (let c = 0; c < cols; c++) {
					const d = shown - (hash(c, r) * 0.55 + (r / rows) * 0.45);
					ctx.fillStyle =
						d < 0 ? 'rgba(255,255,255,0.025)'
						: d < 0.06 ? '#e64749'
						: d < 0.14 ? 'rgba(230,71,73,0.5)'
						: 'rgba(255,255,255,0.18)';
					ctx.fillRect(c * PX, r * PY, CW, CH);
				}
			return (fallbackRaf = requestAnimationFrame(draw));
		};
		return draw();
	}
</script>

{#if !dismissed}
	<div class="preloader" class:leaving role="dialog" aria-modal="true" aria-label="Loading">
		<canvas bind:this={canvas} class="grid"></canvas>

		{#if !load.ready}
			<p class="status micro">Ensuring the best experience</p>
		{:else}
			<div class="gate">
				<span class="mark" aria-hidden="true">
					{#each Array(7) as _, i}
						<i style="--i:{i}"></i>
					{/each}
				</span>

				<h2>Enter with sound</h2>
				<p class="sub meta">It is a small part of the thing, but it matters.</p>

				<div class="actions">
					<button class="start" onclick={() => enter(true)}>Start</button>
					<button class="quiet" onclick={() => enter(false)}>Continue without sound</button>
				</div>
			</div>
		{/if}

		<div class="counter">
			<b>{pct}</b>
			<span class="sep">•</span>
			<span>{load.label}</span>
		</div>
	</div>
{/if}

<style>
	.preloader {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		background: var(--bg-deep);
		transition:
			opacity var(--dur-reveal) var(--ease-reveal),
			transform var(--dur-reveal) var(--ease-reveal);
	}
	.preloader.leaving {
		opacity: 0;
		transform: scale(1.03);
		pointer-events: none;
	}

	.grid {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* the field is atmosphere, not the message — keep it under the text */
		mask-image: linear-gradient(to bottom, #000 0%, transparent 62%);
		-webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 62%);
	}

	.status,
	.gate {
		position: relative;
		z-index: 1;
		text-align: center;
	}

	.status {
		letter-spacing: 0.3em;
	}

	.gate {
		display: grid;
		justify-items: center;
		gap: 0.9rem;
		animation: rise var(--dur-reveal) var(--ease-reveal);
	}

	/* Waveform mark — bars that idle, hinting at what Start turns on */
	.mark {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 74px;
		width: 74px;
		justify-content: center;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(230, 71, 73, 0.55), rgba(230, 71, 73, 0.08) 70%);
		margin-bottom: 0.4rem;
	}
	.mark i {
		width: 2px;
		height: 8px;
		background: var(--ink);
		border-radius: 1px;
		animation: bar 1.5s var(--ease-standard) infinite;
		animation-delay: calc(var(--i) * 0.11s);
	}

	h2 {
		font-size: clamp(1.5rem, 3vw, 2.35rem);
		letter-spacing: 0.02em;
	}

	.sub {
		color: var(--hud-dim);
	}

	.actions {
		display: grid;
		justify-items: center;
		gap: 0.75rem;
		margin-top: 0.6rem;
	}

	.start {
		padding: 0.7rem 2.4rem;
		font-size: var(--t-meta);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		color: #fff;
		background: var(--accent);
		border-radius: 3px;
		cursor: pointer;
		transition: background var(--dur-fast) var(--ease-standard);
	}
	.start:hover {
		background: #f2585a;
	}

	.quiet {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		color: var(--hud-dim);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.quiet:hover {
		color: var(--hud);
	}

	.counter {
		position: absolute;
		bottom: var(--edge);
		left: var(--gutter);
		padding: 6px 12px;
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
		background: var(--bg-raise);
		border-radius: 3px;
		font-variant-numeric: tabular-nums;
	}
	.counter b {
		color: var(--ink);
		font-weight: 500;
	}
	.counter .sep {
		color: var(--accent);
		margin: 0 5px;
	}

	@keyframes bar {
		0%, 100% { height: 8px; }
		50% { height: 26px; }
	}
	@keyframes rise {
		from { opacity: 0; transform: translateY(10px); }
	}

	@media (prefers-reduced-motion: reduce) {
		.mark i { animation: none; height: 14px; }
	}
</style>
