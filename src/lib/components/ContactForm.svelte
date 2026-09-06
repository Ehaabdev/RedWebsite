<script>
	/**
	 * The contact form.
	 *
	 * Three things about this page make a form harder than usual, and each one
	 * is handled explicitly below rather than discovered later:
	 *
	 *   1. The document does not scroll. A native form submit would navigate,
	 *      which would tear down Lenis, the 3D field and the whole timeline.
	 *      Submit is always intercepted.
	 *   2. Lenis listens on `window`, so a wheel over a filled textarea would
	 *      scroll the page instead of the text. The textarea opts out with
	 *      `data-lenis-prevent-wheel`.
	 *   3. Sections that are not active are transparent, unclickable and
	 *      aria-hidden, but still reachable by Tab and still able to hold
	 *      focus. `inert` closes both: it removes the fields from the tab order
	 *      and blurs anything inside them the moment the section is left.
	 *
	 * Where it sends is config, not code — see CONTACT in site.js. With no
	 * endpoint it composes the message in the visitor's own mail client and
	 * says exactly that. It never claims a message was sent.
	 */
	import { COPY, SITE, CONTACT } from '$lib/site.js';

	/** @type {{ active?: boolean }} */
	let { active = true } = $props();

	const form = COPY.contact.form;

	let values = $state({ name: '', email: '', message: '' });
	let errors = $state({});
	/** idle | sending | sent | handoff | error */
	let phase = $state('idle');

	// Only true once a submit has been attempted. Validating as someone types
	// their first character is scolding them for an unfinished thought.
	let tried = $state(false);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function validate() {
		const e = {};
		if (values.name.trim().length < 2) e.name = 'Tell us who you are.';
		if (!EMAIL.test(values.email.trim())) e.email = 'We need an address to reply to.';
		if (values.message.trim().length < 10) e.message = 'A sentence or two is enough.';
		return e;
	}

	// Re-validate live, but only after the first failed attempt — so a field
	// clears itself as it is fixed instead of waiting for another submit.
	$effect(() => {
		if (tried) errors = validate();
	});

	// A terminal message describes something that has finished happening. The
	// moment someone starts a second message, "Message sent." is describing the
	// wrong thing, so it goes.
	function onInput() {
		if (phase === 'sent' || phase === 'handoff' || phase === 'error') phase = 'idle';
	}

	function mailto() {
		const subject = `New enquiry from ${values.name.trim()}`;
		const body = `${values.message.trim()}\n\n— ${values.name.trim()}\n${values.email.trim()}`;
		return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}

	async function submit(event) {
		// Never let this navigate: the whole page state lives in memory.
		event.preventDefault();
		tried = true;

		const found = validate();
		errors = found;
		if (Object.keys(found).length) {
			document.getElementById(`cf-${Object.keys(found)[0]}`)?.focus();
			return;
		}

		if (!CONTACT.endpoint) {
			// No server yet. Hand the message to the visitor's mail client and
			// tell them that is what happened — the one thing we must not do
			// here is show a confirmation for a message nobody received.
			phase = 'handoff';
			window.location.href = mailto();
			return;
		}

		phase = 'sending';
		try {
			const res = await fetch(CONTACT.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					name: values.name.trim(),
					email: values.email.trim(),
					message: values.message.trim()
				})
			});
			if (!res.ok) throw new Error(String(res.status));
			phase = 'sent';
			values = { name: '', email: '', message: '' };
			tried = false;
		} catch {
			phase = 'error';
		}
	}
</script>

<form
	class="form"
	novalidate
	oninput={onInput}
	inert={active ? undefined : true}
	onsubmit={submit}
	aria-labelledby="cf-heading"
>
	<h2 class="sr-only" id="cf-heading">Contact us</h2>

	<div class="grid">
		{#each form.fields as f (f.name)}
			<div class="field" class:bad={!!errors[f.name]} class:wide={f.type === 'textarea'}>
				<label for="cf-{f.name}">{f.label}</label>

				{#if f.type === 'textarea'}
					<!-- Opted out of Lenis so a wheel here scrolls the message,
					     not the page. Wheel only: the full `data-lenis-prevent`
					     would take touch as well, and a textarea with nothing to
					     scroll would become a patch of the page a phone cannot
					     drag. -->
					<textarea
						id="cf-{f.name}"
						name={f.name}
						rows="3"
						data-lenis-prevent-wheel
						placeholder={f.placeholder}
						autocomplete={f.autocomplete}
						aria-invalid={errors[f.name] ? 'true' : undefined}
						aria-describedby={errors[f.name] ? `cf-${f.name}-err` : undefined}
						bind:value={values[f.name]}
					></textarea>
				{:else}
					<input
						id="cf-{f.name}"
						name={f.name}
						type={f.type}
						placeholder={f.placeholder}
						autocomplete={f.autocomplete}
						aria-invalid={errors[f.name] ? 'true' : undefined}
						aria-describedby={errors[f.name] ? `cf-${f.name}-err` : undefined}
						bind:value={values[f.name]}
					/>
				{/if}

				{#if errors[f.name]}
					<p class="err micro" id="cf-{f.name}-err">{errors[f.name]}</p>
				{/if}
			</div>
		{/each}
	</div>

	<button
		class="send"
		type="submit"
		data-cursor-text-label={form.submit}
		disabled={phase === 'sending'}
	>
		{phase === 'sending' ? 'Sending…' : form.submit}
	</button>

	<!-- One line, announced when it changes. Each message says what actually
	     happened rather than what we would like to have happened. -->
	<p class="status meta" aria-live="polite">
		{#if phase === 'handoff'}
			Opening your mail app with the message. If nothing opened, write to
			<a href="mailto:{SITE.email}">{SITE.email}</a>.
		{:else if phase === 'sent'}
			Message sent. We will reply to the address you gave.
		{:else if phase === 'error'}
			That did not go through. Try again, or write to
			<a href="mailto:{SITE.email}">{SITE.email}</a>.
		{/if}
	</p>
</form>

<style>
	.form {
		display: grid;
		gap: 0.7rem;
		width: 100%;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	.wide {
		grid-column: 1 / -1;
	}

	/* A filled box, not a bare underline. These sit over a live particle field
	   that can be at full brightness directly behind them — on a short screen
	   the object has nowhere else to go — so the fill has to be genuinely
	   opaque, not a 5% white wash. It is mixed from --bg-primary rather than
	   hard-coded, so it still follows the theme. The --bg-raise line before it
	   is the fallback wherever color-mix is unavailable. */
	.field {
		display: grid;
		gap: 0.1rem;
		padding: 0.55rem 0.85rem 0.6rem;
		background: var(--bg-raise);
		background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
		border: 1px solid var(--hud-line);
		border-radius: 4px;
		transition:
			border-color var(--dur-fast) var(--ease-standard),
			background var(--dur-fast) var(--ease-standard);
	}
	/* The box carries the focus ring, so the control inside can drop its own
	   outline — two rings around one field reads as an error state. */
	.field:focus-within {
		background: var(--bg-raise-hi);
		background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.field.bad {
		border-color: var(--accent);
	}

	label {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		color: var(--hud-dim);
	}

	input,
	textarea {
		width: 100%;
		font: inherit;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--ink);
		background: none;
		border: 0;
		padding: 0;
		resize: none;
	}
	input:focus-visible,
	textarea:focus-visible {
		outline: none;
	}
	textarea {
		max-height: 22vh;
		overflow-y: auto;
	}
	::placeholder {
		color: var(--hud-dim);
		opacity: 1;
	}
	/* Chrome and Safari paint their own background over an autofilled field —
	   a bright yellow box in the middle of a dark instrument panel. The inset
	   shadow is the only way to override it; `color` is ignored, so the text
	   colour has to be set through -webkit-text-fill-color. */
	input:-webkit-autofill,
	input:-webkit-autofill:hover,
	input:-webkit-autofill:focus {
		-webkit-box-shadow: 0 0 0 100px var(--bg-primary) inset;
		-webkit-text-fill-color: var(--ink);
		caret-color: var(--ink);
		transition: background-color 5000s;
	}

	.err {
		color: var(--accent);
		text-transform: none;
		letter-spacing: 0;
		font-size: var(--t-micro);
	}

	/* The one action at the end of the page, so it takes the signal colour and
	   the full width — nothing else here competes with it. */
	.send {
		font-family: var(--font-display);
		font-size: var(--t-meta);
		letter-spacing: var(--track-meta);
		text-transform: uppercase;
		padding: 1.05rem 2rem;
		background: var(--accent);
		color: #fff;
		border-radius: 3px;
		cursor: pointer;
		transition: filter var(--dur-fast) var(--ease-standard);
	}
	.send:hover:not(:disabled) {
		filter: brightness(1.15);
	}
	.send:disabled {
		cursor: default;
		filter: saturate(0.4);
	}

	.status {
		min-height: 1.7em;
		color: var(--hud);
	}
	.status a {
		color: var(--ink);
		border-bottom: 1px solid var(--accent);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	/* Short viewports: a phone in landscape, or — the case that actually
	   matters — a soft keyboard taking the bottom third of the screen while
	   someone is typing in these very fields. There is no document scroll to
	   fall back on here (the page is a fixed wrapper), so a send button pushed
	   below the fold is simply unreachable. The form gives up padding instead. */
	@media (max-height: 640px) {
		.form {
			gap: 0.45rem;
		}
		.grid {
			gap: 0.45rem;
		}
		.field {
			padding: 0.35rem 0.7rem 0.4rem;
		}
		textarea {
			max-height: 14vh;
		}
		.send {
			padding: 0.75rem 1.5rem;
		}
		.status {
			min-height: 0;
		}
	}
</style>
