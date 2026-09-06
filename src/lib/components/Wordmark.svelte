<script>
	import { SITE } from '$lib/site.js';
	import { scrollToSection } from '$lib/scroll/engine.svelte.js';
</script>

<button class="wordmark" data-cursor-text-label="Back to top" onclick={() => scrollToSection(0)} aria-label="Back to top">
	<span class="name">{SITE.name}</span>
	{#if SITE.suffix}<span class="suffix">{SITE.suffix}</span>{/if}
</button>

<style>
	.wordmark {
		position: fixed;
		top: var(--edge);
		left: var(--gutter);
		z-index: 30;
		display: block;
		text-align: left;
		cursor: pointer;
		pointer-events: auto;
	}
	.name {
		display: block;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.55rem;
		line-height: 0.9;
		letter-spacing: -0.01em;
		text-transform: lowercase;
		color: var(--ink);
	}
	.suffix {
		display: block;
		font-size: var(--t-micro);
		letter-spacing: 0.42em;
		text-transform: uppercase;
		color: var(--hud-dim);
		padding-left: 0.12em;
	}
	.wordmark:hover .suffix {
		color: var(--hud);
		transition: color var(--dur-fast) var(--ease-standard);
	}
</style>
