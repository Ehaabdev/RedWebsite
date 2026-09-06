<script>
	import { onMount } from 'svelte';
	import { scroll, onFrame } from '$lib/scroll/engine.svelte.js';
	import { lightnessAt } from '$lib/scroll/sections.js';
	import { applyLightness } from '$lib/theme.js';
	import Hotspots from './Hotspots.svelte';
	import { track } from '$lib/loader/assets.svelte.js';
	import { createField, pickQuality } from '$lib/three/field.js';

	let canvas = $state(null);
	let field = null;
	let spots = $state([]);

	onMount(() => {
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

		let ready;
		track(new Promise((res) => (ready = res)), 'Scene');

		field = createField({ canvas, quality: pickQuality(), reducedMotion: reduced });
		field.resize(innerWidth, innerHeight);
		ready();

		const onResize = () => field?.resize(innerWidth, innerHeight);
		const onMove = (e) => field?.setPointer(e.clientX, e.clientY);
		const onLeave = () => field?.clearPointer();

		addEventListener('resize', onResize);
		addEventListener('pointermove', onMove, { passive: true });
		document.addEventListener('mouseleave', onLeave);

		// Joins the engine's rAF rather than starting a second one. The field now
		// spans every section, so there is no visibility gate — the shape morph
		// is what carries you from one section to the next.
		const stop = onFrame((t, dt) => {
			// Computed once and handed to both consumers, so the ground and the
			// type can never disagree about how light the page currently is.
			const light = lightnessAt(scroll.index, scroll.progress);
			applyLightness(light);

			field.update(dt, {
				index: scroll.index,
				progress: scroll.progress,
				time: t / 1000,
				light
			});

			// getAnchors() hands back a reused array, so copy for reactivity. The
			// guard stops this assigning — and re-rendering — on every frame of
			// the seven sections that have no anchors at all.
			const a = field.getAnchors();
			if (a.length || spots.length) spots = a.map((s) => ({ ...s }));
		});

		return () => {
			stop();
			removeEventListener('resize', onResize);
			removeEventListener('pointermove', onMove);
			document.removeEventListener('mouseleave', onLeave);
			field?.dispose();
			field = null;
		};
	});
</script>

<canvas bind:this={canvas} class="field" aria-hidden="true"></canvas>

<Hotspots {spots} />

<style>
	/* Behind the scroll wrapper (z-index 1); body paints the base colour. */
	.field {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		display: block;
		pointer-events: none;
	}
</style>
