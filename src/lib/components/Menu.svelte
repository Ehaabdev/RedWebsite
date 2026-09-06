<script>
	import { SITE } from '$lib/site.js';
	import { SECTIONS } from '$lib/scroll/sections.js';
	import { scroll, scrollToSection } from '$lib/scroll/engine.svelte.js';
	import * as audio from '$lib/audio/engine.js';

	let open = $state(false);
	let panel = $state(null);
	let opener = $state(null);

	const items = SECTIONS.map((s, i) => ({ ...s, i })).filter((s) => s.label);

	function close() {
		open = false;
		opener?.focus();
	}

	function go(i) {
		audio.click({ pitch: 620 });
		scrollToSection(i);
		close();
	}

	// Escape to close, and keep Tab inside the panel while it's open.
	function onKeydown(e) {
		if (!open) return;
		if (e.key === 'Escape') return close();
		if (e.key !== 'Tab') return;

		const focusable = panel?.querySelectorAll('button, a[href]');
		if (!focusable?.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (open) panel?.querySelector('button')?.focus();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="tabs">
	<button class="tab menu-tab" data-cursor-text-label="Open" bind:this={opener} onclick={() => { audio.click({ pitch: 780 }); open = true; }} aria-expanded={open}>
		Menu
	</button>
	<button class="tab cta" data-cursor-text-label="Get in touch" onclick={() => go(SECTIONS.length - 1)}>
		Contact
	</button>
</div>

{#if open}
	<div class="scrim" role="presentation" onclick={close}></div>

	<div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label="Site menu">
		<button class="close" data-cursor-text-label="Close" onclick={close} aria-label="Close menu">Close</button>

		<nav>
			<ol>
				{#each items as item, n}
					<li>
						<button class:on={item.i === scroll.index} data-cursor-text-label="Go" onclick={() => go(item.i)}>
							<span class="n">{String(n + 1).padStart(2, '0')}</span>
							<span class="t">{item.label}</span>
						</button>
					</li>
				{/each}
			</ol>
		</nav>

		<div class="foot">
			<p class="lede">Tell us what you are building. We read everything that comes in.</p>
			{#if SITE.socials.length}
				<ul class="socials">
					{#each SITE.socials as s (s.label)}
						<li>
							<a
								href={s.href}
								class:pending={!s.href}
								target={s.href ? '_blank' : undefined}
								rel={s.href ? 'noopener noreferrer' : undefined}>{s.label}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}

<style>
	.tabs {
		position: fixed;
		top: 0;
		right: var(--edge);
		z-index: 40;
		display: flex;
		align-items: flex-start;
	}

	.tab {
		writing-mode: vertical-rl;
		padding: 1.1rem 0.6rem 1.3rem;
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 0 0 3px 3px;
		transition:
			background var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard);
	}

	.menu-tab {
		background: var(--bg-deep);
		color: var(--hud);
	}
	.menu-tab:hover {
		color: var(--ink);
	}

	.cta {
		background: var(--accent);
		color: #fff;
	}
	.cta:hover {
		background: #f2585a;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: rgba(10, 12, 16, 0.72);
		backdrop-filter: blur(3px);
		animation: fade var(--dur-fast) var(--ease-standard);
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		width: min(420px, 88vw);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 2rem;
		padding: 5.5rem var(--gutter) var(--gutter);
		background: var(--bg-deep);
		border-left: 1px solid var(--rule);
		animation: slide var(--dur-reveal) var(--ease-reveal);
	}

	.close {
		position: absolute;
		top: 1.6rem;
		right: var(--gutter);
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		color: var(--hud-dim);
		cursor: pointer;
	}
	.close:hover {
		color: var(--ink);
	}

	ol {
		list-style: none;
	}
	li + li {
		border-top: 1px solid var(--rule);
	}

	nav button {
		display: flex;
		align-items: baseline;
		gap: 1.1rem;
		width: 100%;
		padding: 0.85rem 0;
		text-align: left;
		cursor: pointer;
	}
	.n {
		font-size: var(--t-micro);
		color: var(--hud-dim);
		font-variant-numeric: tabular-nums;
	}
	.t {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.6rem;
		text-transform: uppercase;
		color: var(--hud);
		transition: color var(--dur-fast) var(--ease-standard);
	}
	nav button:hover .t {
		color: var(--ink);
	}
	nav button.on .t {
		color: var(--ink);
	}
	nav button.on .n {
		color: var(--accent);
	}

	.foot {
		display: grid;
		gap: 1.4rem;
	}
	.socials {
		display: flex;
		gap: 1.4rem;
		list-style: none;
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
	}
	.socials a:not(.pending):hover {
		color: var(--ink);
	}

	/* No URL yet. An <a> with no href is already inert and untabbable — which is
	   also why the focus trap's `a[href]` selector stops seeing these — so this
	   only has to make it look like the plain text it now is. */
	.pending {
		color: var(--hud-dim);
		opacity: 0.65;
	}

	@keyframes slide {
		from {
			transform: translateX(100%);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
