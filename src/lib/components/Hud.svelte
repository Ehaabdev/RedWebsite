<script>
	import { SECTIONS } from '$lib/scroll/sections.js';
	import { SITE } from '$lib/site.js';
	import { scroll, scrollToY } from '$lib/scroll/engine.svelte.js';
	import { TOTAL } from '$lib/scroll/sections.js';
	import Clock from './Clock.svelte';

	const TICKS = 33;

	let current = $derived(SECTIONS[scroll.index]);
	let atStart = $derived(scroll.global < 0.01);

	/**
	 * The contact section is the one screen you are meant to work on rather than
	 * read, and its two columns run the full width and the full height — the
	 * horizon rule and both readouts end up drawn across the form's own fields.
	 * So the instrument frame stands down there and lets the form have the
	 * frame. Keyed off the layout, not an index, so it follows the table.
	 */
	let bare = $derived(current?.layout === 'split');
</script>

<div class="hud">
	<i class="tick tl"></i><i class="tick tr"></i>
	<i class="tick bl"></i><i class="tick br"></i>

	<!-- Horizon: the rule the whole composition sits against -->
	<hr class="horizon" style:opacity={bare ? 0 : 1} />

	<!-- Position along the whole timeline -->
	<button
		class="ruler"
		data-cursor-text-label="Jump"
		aria-label="Jump to a position in the page"
		onclick={(e) => {
			const r = e.currentTarget.getBoundingClientRect();
			scrollToY(((e.clientX - r.left) / r.width) * TOTAL);
		}}
	>
		{#each Array(TICKS) as _, i}
			<span class="t" class:major={i % 4 === 0}></span>
		{/each}
		<span class="head" style="left:{scroll.global * 100}%"></span>
	</button>

	<!-- Where you are, reported as instrument state -->
	<div class="chip" style:opacity={bare ? 0 : 1}>
		<b>{String(scroll.index).padStart(2, '0')}</b>
		<span class="sep">•</span>
		<span>{current?.label ?? current?.title}</span>
	</div>

	<div class="stamp meta" style:opacity={bare ? 0 : 1}>
		{#if SITE.founded}<span>Founded {SITE.founded}</span>{/if}
		<Clock />
	</div>

	<p class="hint micro" class:show={atStart}>Scroll</p>
</div>

<style>
	.hud {
		position: fixed;
		inset: 0;
		z-index: 30;
		pointer-events: none;
	}

	/* --- corner registration marks --- */
	.tick {
		position: absolute;
		width: 10px;
		height: 10px;
		opacity: 0.6;
	}
	.tick::before,
	.tick::after {
		content: '';
		position: absolute;
		background: var(--hud-line);
	}
	.tick::before {
		left: 50%;
		top: 0;
		width: 1px;
		height: 100%;
		transform: translateX(-50%);
	}
	.tick::after {
		top: 50%;
		left: 0;
		height: 1px;
		width: 100%;
		transform: translateY(-50%);
	}
	.tick.tl { top: var(--edge); left: var(--edge); }
	.tick.tr { top: var(--edge); right: var(--edge); }
	.tick.bl { bottom: var(--edge); left: var(--edge); }
	.tick.br { bottom: var(--edge); right: var(--edge); }

	/* The value itself is an inline style bound to `bare` (see the markup); only
	   the transition lives here. Three elements do not need a class and a rule
	   to say one number, and an inline style is the same on the server, on
	   first paint and after every rebuild — nothing to order or outrank. */
	.horizon,
	.chip,
	.stamp {
		transition: opacity var(--dur-base) var(--ease-standard);
	}

	.horizon {
		position: absolute;
		top: var(--horizon);
		left: var(--gutter);
		right: var(--gutter);
		height: 0;
		border: 0;
		border-top: 1px solid var(--rule);
	}

	/* --- timeline scrubber --- */
	.ruler {
		position: absolute;
		top: var(--edge);
		left: 50%;
		transform: translateX(-50%);
		width: min(360px, 34vw);
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 9px;
		background: var(--bg-raise);
		border-radius: 3px;
		border: none;
		cursor: pointer;
		pointer-events: auto;
		transition: background var(--dur-fast) var(--ease-standard);
	}
	.ruler:hover {
		background: var(--bg-raise-hi);
	}
	.ruler .t {
		width: 1px;
		height: 6px;
		background: var(--hud-line);
	}
	.ruler .t.major {
		height: 11px;
	}
	.ruler .head {
		position: absolute;
		top: 4px;
		width: 2px;
		height: 18px;
		background: var(--accent);
		transform: translateX(-1px);
	}

	/* --- section counter --- */
	.chip {
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
	.chip b {
		color: var(--ink);
		font-weight: 500;
	}
	.chip .sep {
		color: var(--accent);
		margin: 0 5px;
	}

	/* --- founded / clock, sitting on the horizon --- */
	.stamp {
		position: absolute;
		top: var(--horizon);
		right: var(--gutter);
		transform: translateY(-140%);
		display: flex;
		gap: 2.5rem;
		align-items: baseline;
	}

	.hint {
		position: absolute;
		bottom: var(--edge);
		left: 50%;
		transform: translateX(-50%);
		opacity: 0;
		transition: opacity var(--dur-base) var(--ease-standard);
	}
	.hint.show {
		opacity: 1;
	}

	@media (max-width: 720px) {
		.stamp {
			gap: 1.2rem;
			font-size: var(--t-micro);
		}
		.ruler {
			display: none;
		}
	}

	/* Short viewports of any width — a phone in landscape, or one with the
	   keyboard up. The horizon sits at 47% and the registration marks are
	   calibrated to a tall frame; below this height they stop framing the
	   composition and start cutting across the contact form's fields. The
	   stamp hangs off the horizon, so it goes with it. */
	@media (max-height: 560px) {
		.horizon,
		.stamp,
		.tick {
			display: none;
		}
	}

	/* Narrow as well, and the whole bottom edge is where a full-width send
	   button has to sit — the counter and the two lower registration marks are
	   all in it. A control the visitor is using outranks a position readout and
	   two 10px crosses. The wordmark and the menu tabs stay: they are the way
	   out, and they are at the top. */
	@media (max-width: 720px) and (max-height: 640px) {
		.chip,
		.tick.bl,
		.tick.br {
			display: none;
		}
	}
</style>
