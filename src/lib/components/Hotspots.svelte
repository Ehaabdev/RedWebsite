<script>
	/**
	 * Markers pinned to points inside the 3D scene.
	 *
	 * The field projects world positions to screen coordinates each frame; this
	 * only paints what it is handed. Each marker names one of the three
	 * practices and jumps to its section, so the object doubles as navigation
	 * rather than carrying a label for the sake of it.
	 */
	import { scrollToSection } from '$lib/scroll/engine.svelte.js';
	import { SECTIONS } from '$lib/scroll/sections.js';

	let { spots = [] } = $props();

	const titleOf = (id) => SECTIONS.find((s) => s.id === id)?.title ?? id;
</script>

{#each spots as spot (spot.id)}
	<button
		class="spot"
		style="transform:translate3d({spot.x}px,{spot.y}px,0) translate(-50%,-50%); opacity:{spot.fade}"
		aria-hidden={spot.fade < 0.5}
		tabindex={spot.fade < 0.5 ? -1 : 0}
		data-cursor-text-label="Go"
		onclick={() => scrollToSection(spot.section)}
	>
		<i class="ring"></i>
		<span class="name">{titleOf(spot.id)}</span>
	</button>
{/each}

<style>
	.spot {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
		will-change: transform, opacity;
	}

	.ring {
		width: 15px;
		height: 15px;
		border-radius: 50%;
		border: 1px solid var(--ink);
		background: var(--bg-primary);
		flex: none;
		position: relative;
		transition: background var(--dur-fast) var(--ease-standard);
	}
	/* A filled centre, so the marker reads as a point on the object rather
	   than a bubble floating over it. */
	.ring::after {
		content: '';
		position: absolute;
		inset: 3.5px;
		border-radius: 50%;
		background: var(--ink);
	}

	.name {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		padding-bottom: 2px;
		border-bottom: 1px solid var(--rule);
	}

	.spot:hover .ring {
		background: var(--accent);
	}
	.spot:hover .name {
		border-bottom-color: var(--accent);
	}

	@media (max-width: 720px) {
		.name {
			display: none;
		}
	}
</style>
