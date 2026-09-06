<script>
	import { onMount } from 'svelte';
	import { SECTIONS, TOTAL } from '$lib/scroll/sections.js';
	import { scroll, createEngine, scrollToSection } from '$lib/scroll/engine.svelte.js';

	/** @type {{ section?: import('svelte').Snippet<[any, number]> }} */
	let { section } = $props();

	let wrapper = $state(null);
	let content = $state(null);

	onMount(() => createEngine(wrapper, content));

	const isNearby = (i) => Math.abs(i - scroll.index) <= 1;

	/**
	 * Keyboard is the third way through the site, alongside scrolling and the
	 * menu. Skipped while typing or while a dialog owns the screen.
	 */
	function onKey(e) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const el = document.activeElement;
		if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
		if (document.querySelector('[role="dialog"]')) return;

		const last = SECTIONS.length - 1;
		let target = null;
		if (e.key === 'ArrowDown' || e.key === 'PageDown') target = Math.min(scroll.index + 1, last);
		else if (e.key === 'ArrowUp' || e.key === 'PageUp') target = Math.max(scroll.index - 1, 0);
		else if (e.key === 'Home') target = 0;
		else if (e.key === 'End') target = last;
		if (target === null) return;

		e.preventDefault();
		scrollToSection(target);
	}
</script>

<svelte:window onkeydown={onKey} />

<!--
  The page itself never scrolls (`body { overflow: hidden }` in app.css).
  All scrolling happens inside this fixed wrapper, whose only scrollable
  content is a spacer sized to the sum of the section lengths.

  `<main>` lives INSIDE the wrapper and is position:fixed, so it stays put
  while the spacer scrolls — and, crucially, wheel events over section
  content still bubble to the wrapper where Lenis is listening.
-->
<div class="page-scroll-wrapper" bind:this={wrapper}>
	<div class="scroll-spacer" bind:this={content} style="height:{TOTAL}px"></div>

	<main class="sections">
		{#each SECTIONS as s, i (s.id)}
			<section
				id="section-{i}"
				class="section"
				class:active={i === scroll.index}
				class:nearby={isNearby(i)}
				aria-hidden={i !== scroll.index}
			>
				<!-- Distant sections render genuinely empty DOM. This is what makes
				     eight heavy scenes viable; it is not an optimisation to defer. -->
				{#if isNearby(i)}
					{@render section?.(s, i)}
				{/if}
			</section>
		{/each}
	</main>
</div>

<style>
	.page-scroll-wrapper {
		position: fixed;
		inset: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: none;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		/* Transparent: the 3D canvas sits behind this layer and body paints the
		   base colour. A background here would hide the scene entirely. */
		background: transparent;
		z-index: 1;
	}
	.page-scroll-wrapper::-webkit-scrollbar {
		display: none;
	}

	.scroll-spacer {
		width: 100%;
		pointer-events: none;
	}

	.sections {
		position: fixed;
		inset: 0;
	}

	.section {
		position: absolute;
		inset: 0;
		width: 100%;
		display: flex;
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
		contain: layout style paint;
		content-visibility: auto;
	}

	.section.nearby {
		visibility: visible;
		content-visibility: visible;
		transform: translateZ(0);
		transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.section.active {
		visibility: visible;
		opacity: 1;
		pointer-events: auto;
		z-index: 2;
		content-visibility: visible;
	}
</style>
