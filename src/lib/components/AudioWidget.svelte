<script>
	import * as audio from '$lib/audio/engine.js';

	let { active = false } = $props();

	let canvas = $state(null);
	let muted = $state(false);

	// Oscilloscope: real signal off the analyser, drawn on a small 2D canvas.
	$effect(() => {
		if (!active || !canvas) return;

		const ctx = canvas.getContext('2d');
		const dpr = Math.min(devicePixelRatio || 1, 2);
		const w = 84, h = 30;
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		ctx.scale(dpr, dpr);

		const analyser = audio.getAnalyser();
		const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
		let raf;

		const draw = () => {
			ctx.clearRect(0, 0, w, h);
			ctx.strokeStyle = muted ? 'rgba(255,255,255,0.22)' : '#e64749';
			ctx.lineWidth = 1;
			ctx.beginPath();

			if (analyser && buf && !muted) {
				analyser.getByteTimeDomainData(buf);
				const step = Math.floor(buf.length / w) || 1;
				for (let x = 0; x < w; x++) {
					const v = (buf[x * step] - 128) / 128;
					const y = h / 2 + v * (h / 2 - 2) * 3.2;
					x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
				}
			} else {
				ctx.moveTo(0, h / 2);
				ctx.lineTo(w, h / 2);
			}

			ctx.stroke();
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	});

	function toggle() {
		muted = !muted;
		audio.setMuted(muted);
		if (!muted) audio.click({ pitch: 720 });
	}
</script>

{#if active}
	<button class="audio" data-cursor-text-label={muted ? "Sound on" : "Sound off"} onclick={toggle} aria-pressed={muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
		<canvas bind:this={canvas} class="scope" aria-hidden="true"></canvas>
		<span class="labels">
			<span class="micro">Ambient</span>
			<span class="state">{muted ? 'Sound off' : 'Sound on'}</span>
		</span>
	</button>
{/if}

<style>
	.audio {
		position: fixed;
		top: var(--edge);
		left: calc(50% + min(190px, 18vw));
		z-index: 35;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 26px;
		padding: 0 10px 0 4px;
		background: var(--bg-raise);
		border-radius: 3px;
		cursor: pointer;
		transition: background var(--dur-fast) var(--ease-standard);
	}
	.audio:hover {
		background: var(--bg-raise-hi);
	}

	.scope {
		width: 84px;
		height: 30px;
		display: block;
	}

	.labels {
		display: grid;
		line-height: 1.15;
		text-align: left;
	}
	.state {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		color: var(--ink);
	}

	@media (max-width: 940px) {
		.audio {
			left: auto;
			right: calc(var(--edge) + 68px);
		}
		.scope {
			width: 40px;
		}
		.labels {
			display: none;
		}
	}
</style>
