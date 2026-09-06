<script>
	import ScrollEngine from '$lib/components/ScrollEngine.svelte';
	import Hud from '$lib/components/Hud.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import Cursor from '$lib/components/Cursor.svelte';
	import Preloader from '$lib/components/Preloader.svelte';
	import Field from '$lib/components/Field.svelte';
	import AudioWidget from '$lib/components/AudioWidget.svelte';
	import ContactForm from '$lib/components/ContactForm.svelte';
	import { COPY, SITE } from '$lib/site.js';
	import { scroll, scrollToSection } from '$lib/scroll/engine.svelte.js';
	import { SECTIONS } from '$lib/scroll/sections.js';

	// Read once at render. The copyright line should not need editing every
	// January, and it is the one date on the page we actually know.
	const YEAR = new Date().getFullYear();

	// Set once the sound gate is cleared.
	let entered = $state(false);
	let withSound = $state(false);

	// Carousel measurement. Only one section carries a track, so module-level
	// state is enough — the travel is whatever the track overflows its band by.
	let bandW = $state(0);
	let trackW = $state(0);

	// Measured once per layout. offsetLeft is relative to the track's padding
	// box and is NOT affected by the track's transform, so it stays valid as
	// the track slides — no per-frame getBoundingClientRect anywhere.
	let cardEls = $state([]);
	let offsets = $state([]);
	let cardW = $state(0);
	let hovered = $state(-1);

	$effect(() => {
		trackW; // re-measure whenever layout changes
		offsets = cardEls.map((el) => el?.offsetLeft ?? 0);
		cardW = cardEls[0]?.offsetWidth ?? 0;
	});

	/**
	 * Vertical scroll drives horizontal travel. The 0.08 / 0.92 window leaves a
	 * beat of stillness at each end, so the first and last cards are readable
	 * rather than already sliding as the section arrives.
	 */
	function travel(p) {
		const span = Math.max(0, trackW - bandW);
		const u = Math.min(1, Math.max(0, (p - 0.08) / 0.84));
		return span * u;
	}

	/**
	 * How each card sits relative to the middle of the frame.
	 *
	 * The card crossing the centre is the one being looked at: it stands
	 * upright, full size, full strength. Everything either side turns away,
	 * shrinks and dims, so the strip reads as a row of objects in a space
	 * rather than a filmstrip of flat tiles. The image inside counter-shifts,
	 * which gives the card the parallax of a window rather than a picture.
	 */
	// Must match `perspective` on .band, and the depth the cards travel through.
	const PERSPECTIVE = 1500;
	const PERSPECTIVE_PULL = 700;

	function focus(i, p, hot) {
		if (!cardW || !bandW) return { rot: 0, depth: 0, spread: 0, dim: 1, shift: 0, rise: 0 };
		const centre = (offsets[i] ?? 0) + cardW / 2 - travel(p);
		const d = (centre - bandW / 2) / bandW; // 0 at centre, ±~0.5 at the edges
		const away = Math.min(1, Math.abs(d) * 1.9);
		return {
			rot: -d * 14,
			// Depth, not scale. The band carries the perspective, so pushing a
			// card back along Z genuinely recedes it — it foreshortens and drifts
			// toward the vanishing point instead of merely shrinking in place.
			// At -700px against a 1500px perspective a card reads about two
			// thirds size, so the strip travels through real space.
			depth: -away * PERSPECTIVE_PULL,
			// Perspective drags anything pushed back toward the vanishing point,
			// so receding cards pile up in the middle. This pushes them out by
			// exactly what the projection is about to take away —
			//   Δx = x · |z| / perspective
			// — at 85%, so a little inward drift survives and the strip still
			// reads as an arc rather than a flat wall.
			spread: d * bandW * ((away * PERSPECTIVE_PULL) / PERSPECTIVE) * 0.85,
			// Hovering brings a card to full strength wherever it sits.
			dim: hot ? 1 : 1 - away * 0.55,
			shift: -d * 26,
			// A standing wave in screen space: `d` slides continuously as the
			// track travels, so each card rides up over the crest and down into
			// the trough on its way across. The centre lift rides on top, so the
			// card being looked at still sits proudest.
			rise: Math.sin(d * Math.PI * 3) * 26 + (1 - away) * 12
		};
	}
</script>

<svelte:head>
	<title>Astro — products, experiences, and data</title>
	<meta
		name="description"
		content="Astro is a technology company. We build our own software, design digital experiences for others, and develop products around data."
	/>
</svelte:head>

<Field />

<Preloader onenter={(sound) => { entered = true; withSound = sound; }} />

<ScrollEngine>
	{#snippet section(s, i)}
		{@const c = COPY[s.id]}
		<article class="panel" data-id={s.id} data-layout={s.layout ?? 'lower-left'}
			data-display={s.display ?? 'solid'}>
			<!-- Upper field: sits above the horizon rule -->
			<div class="upper">
				{#if s.id === 'hero'}
					<div class="intro">
						<p class="blurb meta">{SITE.blurb}</p>
						{#if SITE.base}<p class="base micro">{SITE.base}</p>{/if}
					</div>
				{:else}
					<p class="index micro">
						{String(i).padStart(2, '0')} / {String(SECTIONS.length - 1).padStart(2, '0')}
					</p>
				{/if}
			</div>

			<!-- Horizontal track: vertical scroll moves it sideways -->
			{#if s.layout === 'carousel' && c?.cards}
				{@const p = i === scroll.index ? scroll.progress : scroll.index > i ? 1 : 0}
				<div class="band" bind:clientWidth={bandW}>
					<div
						class="track"
						bind:clientWidth={trackW}
						style="transform:translate3d({-travel(p)}px,0,0)"
					>
						{#each c.cards as card, n (card.n)}
							{@const f = focus(n, p, hovered === n)}
							<figure
								class="card"
								class:hot={hovered === n}
								bind:this={cardEls[n]}
								data-cursor-text-label={card.title}
								onmouseenter={() => (hovered = n)}
								onmouseleave={() => (hovered = -1)}
								style="transform:translate3d({f.spread}px,{-f.rise}px,{f.depth}px) rotateY({f.rot}deg); opacity:{f.dim}"
							>
								<span class="frame">
									<!-- alt="" is correct while the art is a generated placeholder:
									     it carries no meaning the caption does not already give. -->
									<img
										src={card.img}
										alt=""
										width="1200"
										height="750"
										loading="lazy"
										style="transform:translate3d({f.shift}px,0,0) scale(1.1)"
									/>
									<i class="sheen" style="opacity:{0.05 + (1 - f.dim) * 0.5}"></i>
								</span>
								<figcaption>
									<b>{card.n}</b>
									<span>{card.title}</span>
								</figcaption>
							</figure>
						{/each}
					</div>
				</div>
			{/if}

			{#if s.layout === 'carousel'}
				<div class="car-intro">
					{#if c?.lede}<p class="lede">{c.lede}</p>{/if}
					{#if c?.note}<p class="note micro">{c.note}</p>{/if}
				</div>
			{/if}

			<!-- Lower field: headline anchored to the viewport baseline -->
			<div class="lower">
				{#if c?.lede && s.layout !== 'carousel'}
					<p class="lede">{c.lede}</p>
				{/if}

				<!-- Column lists: Work and Studio -->
				{#if c?.columns}
					<dl class="cols">
						{#each c.columns as col}
							<div>
								<dt>{col.title}</dt>
								{#each col.items as item}
									<dd>{item}</dd>
								{/each}
							</div>
						{/each}
					</dl>
				{/if}

				<!-- Named products, each carrying an honest status -->
				{#if c?.items}
					<ul class="items">
						{#each c.items as item}
							<li>
								<div class="row">
									<h3>{item.title}</h3>
									{#if item.status}<span class="status">{item.status}</span>{/if}
								</div>
								<p>{item.body}</p>
							</li>
						{/each}
					</ul>
				{/if}

				{#if s.id === 'founders'}
					<ul class="founders">
						{#each SITE.founders as person}
							<li>{person}</li>
						{/each}
					</ul>
				{/if}

				{#if c?.note && s.layout !== 'carousel'}
					<p class="note micro">{c.note}</p>
				{/if}

				<h1 class="display">
					{#each c?.headline ?? [s.title] as line, n}
						<span style="--n:{n}">{line}</span>
					{/each}
				</h1>

				{#if c?.cta}
					{@const target = SECTIONS.findIndex((x) => x.id === c.cta.to)}
					<div class="cta-row">
						<button
							class="cta-solid"
							data-cursor-text-label={c.cta.label}
							onclick={() => target >= 0 && scrollToSection(target)}
						>
							{c.cta.label}
						</button>
					</div>
				{/if}

				{#if s.id === 'contact'}
					<div class="actions">
						{#if SITE.email}
							<a class="cta" data-cursor-text-label="Write" href="mailto:{SITE.email}"
								>{SITE.email}</a
							>
						{/if}

						<!-- A social with no href renders as an <a> with no href, which
						     is plain text to the browser: not clickable, not focusable,
						     not a link that goes nowhere. Adding the URL in site.js is
						     the whole change. -->
						{#if SITE.socials.length}
							<ul class="socials">
								{#each SITE.socials as soc (soc.label)}
									<li>
										<a
											href={soc.href}
											class:pending={!soc.href}
											target={soc.href ? '_blank' : undefined}
											rel={soc.href ? 'noopener noreferrer' : undefined}>{soc.label}</a
										>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>

			<!-- The end of the page is the one place with something to do, so the
			     form gets its own column beside the headline rather than a link in
			     a list. It is a sibling of .lower, not a child, so the copy and the
			     form size themselves independently and both settle on the baseline.

			     `active` hands it the section's own state: the fields go inert the
			     moment the section is scrolled away from, which takes them out of
			     the tab order and releases focus. -->
			{#if s.id === 'contact'}
				<div class="form-col">
					<ContactForm active={i === scroll.index} />

					{#if c?.footer}
						<p class="legal">
							<span>© {YEAR} {SITE.name}. {c.footer.rights}</span>
							{#each c.footer.links as l (l.label)}
								<a href={l.href} class:pending={!l.href}>{l.label}</a>
							{/each}
						</p>
					{/if}
				</div>
			{/if}

			<!-- Section progress, drawn on the baseline -->
			<div class="progress" aria-hidden="true">
				<span style="transform:scaleX({i === scroll.index ? scroll.progress : 0})"></span>
			</div>
		</article>
	{/snippet}
</ScrollEngine>

<Wordmark />
<Menu />
<Hud />
<AudioWidget active={entered && withSound} />
<Cursor />

<style>
	.panel {
		flex: 1;
		position: relative;
		display: grid;
		grid-template-rows: var(--horizon) 1fr;
		padding: 0 var(--gutter);
	}

	/* Type sits over a live particle field, and the field's bright core lands
	   wherever the shape puts it. This scrim buys back contrast without dimming
	   the art: it fades in only over the lower band, where the copy lives. It
	   uses --bg-primary, which the theme driver interpolates, so it darkens the
	   dark sections and lightens the light one without a second rule. */
	.panel::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 68%;
		z-index: -1;
		pointer-events: none;
		background: linear-gradient(to top, var(--bg-primary) 12%, transparent 100%);
		opacity: 0.78;
	}

	.upper {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding-bottom: 0.9rem;
	}
	.intro {
		display: grid;
		gap: 0.4rem;
	}
	.blurb {
		white-space: pre-line;
	}
	.base,
	.index {
		font-variant-numeric: tabular-nums;
	}

	.lower {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 1.5rem;
		padding-bottom: 12vh;
	}

	/* --- layout variants ---------------------------------------------------
	   Four compositions rather than one template shown eight times. Each moves
	   the headline to a different part of the frame and re-orders what leads,
	   so consecutive sections do not resolve into the same silhouette. The
	   variants only reposition and re-order; they never change what is said.  */

	/* Headline leads, supporting copy falls beneath it, block hangs from the
	   horizon rule. The inverse reading order of the default. */
	.panel[data-layout='upper-left'] .lower {
		justify-content: flex-start;
		/* Tightened when the CTA joined this layout: the extra block pushed the
		   column list into the corner chip. */
		padding-top: 1rem;
		padding-bottom: 5rem;
		gap: 1rem;
	}
	.panel[data-layout='upper-left'] .display {
		order: -1;
		/* A headline that leads does not need to shout as loud as one used as a
		   baseline. Scaling it also keeps the block clear of the section chip. */
		font-size: calc(var(--t-display) * 0.72);
	}

	/* Mirrored: the stagger falls the other way, so the block leans right. */
	.panel[data-layout='lower-right'] .lower {
		align-items: flex-end;
		text-align: right;
	}
	.panel[data-layout='lower-right'] .display span {
		margin-left: 0;
		margin-right: calc(var(--n) * 2.6ch);
	}

	/* Headline centred on the baseline; the cards own the middle of the frame. */
	.panel[data-layout='carousel'] .lower {
		align-items: center;
		text-align: center;
	}
	.panel[data-layout='carousel'] .display span {
		margin-left: 0;
	}
	/* Only the headline lives down here now. */
	.panel[data-layout='carousel'] .lower {
		justify-content: flex-end;
		padding-bottom: 4vh;
	}
	.panel[data-layout='carousel'] .display {
		font-size: calc(var(--t-display) * 0.82);
	}
	/* The horizon row now sits inside the card band, so the index would land on
	   the cards. It is dropped here — the corner chip already reports position. */
	.panel[data-layout='carousel'] .upper {
		visibility: hidden;
	}

	/* Full-bleed: the track runs past both gutters, so cards enter and leave
	   the frame rather than lining up inside a box.

	   The perspective lives on the BAND, not the track. The band is fixed to the
	   viewport, so the vanishing point stays at the centre of the screen; putting
	   it on the track would drag the vanishing point along with the scroll. */
	.band {
		position: absolute;
		left: 0;
		right: 0;
		top: 18vh;
		height: 54vh;
		overflow: hidden;
		pointer-events: none;
		perspective: 1500px;
		perspective-origin: 50% 50%;
	}
	.track {
		position: absolute;
		/* The gutters live INSIDE the track as padding, so `trackW - bandW` is
		   the exact travel: the last card lands on the right gutter instead of
		   overshooting it by one gutter's width. */
		left: 0;
		padding: 0 var(--gutter);
		top: 0;
		height: 100%;
		display: flex;
		/* Cards are shorter than the band so the wave has room to move them
		   without the band's overflow clipping their tops and bottoms. */
		align-items: center;
		gap: 1.5rem;
		width: max-content;
		will-change: transform;
		transform-style: preserve-3d;
	}

	.card {
		position: relative;
		width: clamp(280px, 42vw, 620px);
		height: 84%;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		pointer-events: auto;
		transform-origin: 50% 50%;
		will-change: transform, opacity;
	}

	/* Clips the oversized image so it can slide inside a fixed opening. */
	.frame {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		border-radius: 5px;
		border: 1px solid var(--rule);
		background: var(--bg-raise-hi);
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
	}
	.card img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		will-change: transform;
	}

	/* Light raking across the card as it turns away from centre. */
	.sheen {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, 0.5) 50%, transparent 70%);
		mix-blend-mode: overlay;
	}

	.card figcaption {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		color: var(--hud-dim);
	}
	.card figcaption b {
		color: var(--accent);
		font-weight: 500;
	}

	/* The card's own transform is rewritten every frame by focus(), so it must
	   NOT be transitioned — it would smear the whole strip while scrolling. The
	   hover pop lives on .frame, which carries no inline transform, so it can
	   animate on its own without fighting the scroll. */
	.frame {
		transition:
			transform 0.42s var(--ease-standard),
			border-color 0.42s var(--ease-standard),
			box-shadow 0.42s var(--ease-standard);
	}
	.card.hot .frame {
		transform: scale(1.07);
		border-color: var(--accent);
		box-shadow: 0 26px 70px rgba(0, 0, 0, 0.62);
	}
	.card.hot figcaption {
		color: var(--ink);
	}
	figcaption {
		transition: color 0.42s var(--ease-standard);
	}

	/* Lede and note ride at the top of the frame so the cards can own the
	   middle: the section reads lede / cards / headline top to bottom. */
	.car-intro {
		position: absolute;
		top: 8vh;
		left: var(--gutter);
		max-width: 38ch;
		display: grid;
		gap: 0.5rem;
	}

	@media (max-width: 720px) {
		.band {
			top: 26vh;
			height: 38vh;
		}
		.track {
			gap: 0.9rem;
		}
		.car-intro {
			top: 12vh;
		}
		/* Clears the fixed section chip in the bottom-left corner. */
		.panel[data-layout='carousel'] .lower {
			padding-bottom: 9vh;
		}
	}

	/* Drawn as outline rather than fill. Guarded by @supports because the
	   fallback for an unsupported text-stroke would be transparent text — an
	   invisible headline is a worse outcome than a solid one. */
	@supports (-webkit-text-stroke: 1px currentColor) {
		.panel[data-display='outline'] .display span {
			-webkit-text-stroke: 0.025em var(--ink);
			color: transparent;
		}
	}

	/* Two columns: what we say on the left, what you do on the right, both
	   hanging off the same baseline so the send button and the headline finish
	   on one line.

	   The split happens on the PANEL, not inside .lower. .lower stays the flex
	   column it is everywhere else and simply takes the left track; the form
	   takes the right one. Putting the form inside .lower and spanning it down
	   the rows does not work: with no explicit rows on the container, `1 / -1`
	   resolves to a single row, and a 270px form then forces the first row —
	   the one-line lede — to 270px and shoves the headline off the bottom of
	   the screen. Two tracks that size themselves is the simpler shape. */
	.panel[data-layout='split'] {
		grid-template-columns: 1fr minmax(300px, 38%);
		column-gap: clamp(2rem, 6vw, 5rem);
	}
	.panel[data-layout='split'] .upper {
		grid-column: 1 / -1;
	}
	.panel[data-layout='split'] .lower {
		grid-column: 1;
	}
	.panel[data-layout='split'] .form-col {
		grid-column: 2;
		grid-row: 2;
		align-self: end;
		display: grid;
		gap: 0.7rem;
		/* Matches .lower's own baseline offset, so the two columns land level. */
		padding-bottom: 12vh;
	}

	/* Copyright and the policy link, closing the right column under the form —
	   the same place the reference puts them. Sentence case, not the uppercase
	   .micro the rest of the HUD uses: this is a sentence, not a label, and
	   small caps make a sentence harder to read for no gain. */
	.legal {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		font-size: var(--t-meta);
		letter-spacing: 0.02em;
		color: var(--hud-dim);
	}
	.legal a:not(.pending):hover {
		color: var(--ink);
	}
	/* One solid action per screen. The form's button is it, so the direct
	   address beside it steps back to a plain link. */
	.panel[data-layout='split'] .cta {
		padding: 0 0 3px;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--accent);
		border-radius: 0;
		color: var(--hud);
	}
	.panel[data-layout='split'] .cta:hover {
		background: none;
		color: var(--ink);
	}

	/* Symmetric. The stagger is dropped entirely — a centred block that also
	   steps sideways reads as a mistake rather than a decision. */
	.panel[data-layout='centre'] .lower {
		align-items: center;
		justify-content: center;
		text-align: center;
		padding-bottom: 0;
	}
	.panel[data-layout='centre'] .display {
		justify-items: center;
	}
	.panel[data-layout='centre'] .display span {
		margin-left: 0;
	}
	.panel[data-layout='centre'] .founders {
		justify-content: center;
	}

	.display {
		font-size: var(--t-display);
		display: grid;
	}
	/* Each line steps right, so the block reads as one falling shape. */
	.display span {
		display: block;
		margin-left: calc(var(--n) * 2.6ch);
	}

	.cols {
		display: flex;
		flex-wrap: wrap;
		gap: 3.25rem;
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
	}
	dt {
		color: var(--ink);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid var(--rule);
	}
	dd {
		color: var(--hud);
		line-height: 1.85;
	}

	.items {
		list-style: none;
		display: grid;
		gap: 1rem;
		max-width: 46rem;
	}
	.items li {
		border-top: 1px solid var(--rule);
		padding-top: 0.75rem;
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.items h3 {
		font-size: 1.15rem;
		line-height: 1.15;
	}
	.status {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		text-transform: uppercase;
		color: var(--accent);
		border: 1px solid var(--accent);
		border-radius: 2px;
		padding: 2px 7px;
	}
	.items p {
		font-size: var(--t-meta);
		color: var(--hud);
		margin-top: 0.3rem;
	}

	.founders {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 2.5rem;
	}
	.founders li {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: clamp(1.2rem, 2.2vw, 1.9rem);
		text-transform: uppercase;
		color: var(--ink);
		border-top: 1px solid var(--rule);
		padding-top: 0.6rem;
	}

	.note {
		max-width: 52ch;
		line-height: 1.8;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.9rem 1.6rem;
	}

	/* Sits on the same line as the direct address: both are ways to reach us,
	   and the left column has no room for a row of its own. */
	.socials {
		display: flex;
		flex-wrap: wrap;
		gap: 1.3rem;
		list-style: none;
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
	}
	.socials a:not(.pending):hover {
		color: var(--ink);
	}

	/* No URL yet. Dimmed and with no pointer affordance, so it reads as a name
	   we have not wired up rather than a link that swallows the click. */
	.pending {
		color: var(--hud-dim);
		opacity: 0.65;
	}

	/* The mid-page call to action: a solid block, not an outlined link, so it
	   reads as the one thing on the page you are meant to press.

	   It takes --ink for its fill and --bg-primary for its text, so it inverts
	   with the theme for free: a light block on the dark sections, a black block
	   on the light ones — which is how the reference draws it. */
	.cta-row {
		display: flex;
	}
	.cta-solid {
		font-family: var(--font-display);
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
		text-transform: uppercase;
		padding: 1.05rem 2.4rem;
		background: var(--ink);
		color: var(--bg-primary);
		border: 0;
		border-radius: 3px;
		cursor: pointer;
		transition:
			background var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard);
	}
	.cta-solid:hover {
		background: var(--accent);
		color: #fff;
	}

	/* Where the headline leads, the button belongs directly under it — same
	   order group as .display, later in the DOM, so it follows it. */
	.panel[data-layout='upper-left'] .cta-row {
		order: -1;
	}
	.cta {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
		color: var(--ink);
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		border-radius: 3px;
		cursor: pointer;
		transition: background var(--dur-fast) var(--ease-standard);
	}
	.cta:hover {
		background: var(--accent);
	}

	.progress {
		position: absolute;
		left: var(--gutter);
		right: var(--gutter);
		bottom: 0;
		height: 1px;
		background: var(--rule);
	}
	.progress span {
		display: block;
		height: 100%;
		background: var(--accent);
		transform-origin: left;
	}

	@media (max-width: 720px) {
		/* One column, stacked: index / headline / form. The middle row is auto
		   and the last is 1fr, so the form still settles on the baseline. */
		.panel[data-layout='split'] {
			grid-template-columns: 1fr;
			grid-template-rows: 15% auto 1fr;
		}
		.panel[data-layout='split'] .form-col {
			grid-column: 1;
			grid-row: 3;
			padding-bottom: 9vh;
		}
		.panel[data-layout='split'] .lower {
			padding-bottom: 0.8rem;
		}
		/* The lede says "tell us what you are building"; so does the message
		   field's own placeholder. On a screen this size, one of them goes.
		   The direct address stays: on a phone it is a one-tap way to write to
		   us, which is worth more here than it is on a desktop. */
		.panel[data-layout='split'] .lede {
			display: none;
		}
		.panel[data-layout='split'] .display {
			font-size: calc(var(--t-display) * 0.62);
		}
		/* One column means the copy sits where the object is brightest, and the
		   default scrim only covers the bottom 68%. Here it covers the frame and
		   reaches solid higher up, so the address and the social names hold
		   against the field behind them. */
		.panel[data-layout='split']::before {
			height: 100%;
			background: linear-gradient(to top, var(--bg-primary) 55%, transparent 100%);
			opacity: 0.9;
		}

		.lower {
			padding-bottom: 15vh;
			gap: 1.1rem;
		}
		.display span {
			margin-left: calc(var(--n) * 1.2ch);
		}
		.cols {
			gap: 1.6rem;
		}
		.founders {
			gap: 1.2rem;
		}
	}

	/* --- short viewports -------------------------------------------------
	   Driven by height, not width: a laptop window at 1440×600 and a phone
	   with the keyboard up are the same problem. Contact is the only section
	   with controls that must stay reachable, so it is the only one that
	   compacts. */
	@media (max-height: 640px) {
		.panel[data-layout='split'] .form-col {
			padding-bottom: 3vh;
		}
		.panel[data-layout='split'] .display {
			font-size: calc(var(--t-display) * 0.5);
		}
		.panel[data-layout='split'] .lower {
			padding-bottom: 3vh;
		}
		/* The form has ~20px of slack at this height; a legal line is 31px. */
		.legal {
			display: none;
		}
	}

	/* A phone in landscape, or the keyboard up on a phone. At this size the
	   copy and the form cannot both have room, and the visitor is mid-sentence
	   in the form — so the copy stands down and the form takes the screen. */
	@media (max-width: 720px) and (max-height: 640px) {
		.panel[data-layout='split'] {
			grid-template-rows: 0 0 1fr;
		}
		.panel[data-layout='split'] .upper,
		.panel[data-layout='split'] .lower {
			display: none;
		}
	}
</style>
