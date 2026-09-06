<script>
	/**
	 * Custom pointer: an exact dot plus a trailing ring.
	 *
	 * The dot tracks the true pointer position with no smoothing, so the thing
	 * you aim with is never where the cursor isn't. Only the ring lerps — that
	 * carries the feel without costing you accuracy.
	 *
	 * Elements can name their own action by carrying
	 * `data-cursor-text-label="Send"`. The cursor reads it off whatever is
	 * hovered, so a new control gets a label by adding one attribute — nothing
	 * has to be wired up here. (Pattern lifted from the reference, which does
	 * the same thing with the same attribute name.)
	 *
	 * Set ENABLED to false to hand the native cursor back.
	 */
	const ENABLED = true;

	const LABEL_ATTR = 'data-cursor-text-label';

	let dx = $state(-100);
	let dy = $state(-100);
	let rx = $state(-100);
	let ry = $state(-100);
	let active = $state(false);
	let down = $state(false);
	let label = $state('');
	// Text fields are the one place the replacement cursor is worse than the
	// real one: a dot cannot show a caret position or a selection. Over an
	// input we stand down and hand the I-beam back.
	let typing = $state(false);

	$effect(() => {
		if (!ENABLED) return;
		const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!fine || still) return;

		active = true;
		document.body.classList.add('has-cursor');

		let tx = -100, ty = -100, raf;
		const move = (e) => {
			tx = e.clientX;
			ty = e.clientY;
			dx = tx; // dot is exact, always
			dy = ty;
		};
		const onDown = () => (down = true);
		const onUp = () => (down = false);
		// If the pointer leaves the window, give the native cursor back rather
		// than stranding the user with nothing.
		const onOut = (e) => {
			if (!e.relatedTarget && !e.toElement) {
				document.body.classList.remove('has-cursor');
			}
		};
		// pointerover fires for every element entered, so re-reading the nearest
		// labelled ancestor on each one both sets and clears the label — moving
		// within a labelled element keeps it, leaving drops it.
		const onOver = (e) => {
			document.body.classList.add('has-cursor');
			const t = e.target;
			const hit = t instanceof Element ? t.closest(`[${LABEL_ATTR}]`) : null;
			label = hit?.getAttribute(LABEL_ATTR) ?? '';
			typing = t instanceof Element && !!t.closest('input, textarea');
		};

		// Any scroll can move a labelled element out from under a stationary
		// pointer, which would otherwise strand the label on screen.
		const onScroll = () => (label = '');

		addEventListener('pointermove', move, { passive: true });
		addEventListener('wheel', onScroll, { passive: true });
		addEventListener('pointerdown', onDown, { passive: true });
		addEventListener('pointerup', onUp, { passive: true });
		document.addEventListener('mouseout', onOut);
		document.addEventListener('mouseover', onOver);

		const loop = () => {
			rx += (tx - rx) * 0.19;
			ry += (ty - ry) * 0.19;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			removeEventListener('pointermove', move);
			removeEventListener('wheel', onScroll);
			removeEventListener('pointerdown', onDown);
			removeEventListener('pointerup', onUp);
			document.removeEventListener('mouseout', onOut);
			document.removeEventListener('mouseover', onOver);
			cancelAnimationFrame(raf);
			document.body.classList.remove('has-cursor');
		};
	});
</script>

{#if active}
	<div class="ring" class:down class:gone={typing} style="transform:translate3d({rx}px,{ry}px,0) translate(-50%,-50%)"></div>
	<div class="dot" class:gone={typing} style="transform:translate3d({dx}px,{dy}px,0) translate(-50%,-50%)"></div>
	<div
		class="label"
		class:show={!!label && !typing}
		style="transform:translate3d({rx}px,{ry}px,0) translate(14px, 14px)"
	>
		{label}
	</div>
{/if}

<style>
	/* Above everything, including the preloader overlay (z-index 200) —
	   otherwise the native cursor is hidden while its replacement is painted
	   underneath, and there is no pointer at all on the loading screen. */
	.dot,
	.ring {
		position: fixed;
		top: 0;
		left: 0;
		border-radius: 50%;
		pointer-events: none;
		z-index: 300;
		will-change: transform;
	}

	/* Solid centre with a dark halo, so it reads on any background without
	   depending on blend modes. */
	.dot {
		width: 7px;
		height: 7px;
		background: #fff;
		box-shadow:
			0 0 0 1.5px rgba(0, 0, 0, 0.5),
			0 0 8px rgba(0, 0, 0, 0.4);
	}

	.ring {
		width: 26px;
		height: 26px;
		border: 1px solid rgba(255, 255, 255, 0.5);
		transition: width 0.2s var(--ease-standard), height 0.2s var(--ease-standard);
	}
	.ring.down {
		width: 17px;
		height: 17px;
		border-color: var(--accent);
	}

	.gone {
		opacity: 0;
	}

	/* Names the action under the pointer. Never wraps and never reflows the
	   page — it is fixed, unhittable, and sized by its own text. */
	.label {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 300;
		pointer-events: none;
		will-change: transform;
		padding: 4px 9px;
		border-radius: 3px;
		background: var(--accent);
		color: #fff;
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		white-space: nowrap;
		opacity: 0;
		transition: opacity var(--dur-fast) var(--ease-standard);
	}
	.label.show {
		opacity: 1;
	}

	/* The ring is a hairline of white; on the light sections that is invisible.
	   The dot keeps its dark halo and reads on both, so only the ring flips. */
	:global(html[data-theme='light']) .ring {
		border-color: rgba(20, 23, 28, 0.45);
	}
</style>
