<script>
	// Live local time with UTC offset — the reference reports it as instrument
	// state, so it updates on the minute rather than every second.
	let now = $state(new Date());

	$effect(() => {
		const id = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(id);
	});

	const two = (n) => String(n).padStart(2, '0');
	let time = $derived(`${two(now.getHours())}:${two(now.getMinutes())}`);
	let offset = $derived.by(() => {
		const mins = -now.getTimezoneOffset();
		const sign = mins < 0 ? '−' : '+';
		const h = Math.floor(Math.abs(mins) / 60);
		const m = Math.abs(mins) % 60;
		return `UTC${sign}${h}${m ? ':' + two(m) : ''}`;
	});
</script>

<span class="clock">
	<time datetime={now.toISOString()}>{time}</time>
	<span class="off">{offset}</span>
</span>

<style>
	.clock {
		display: inline-flex;
		align-items: baseline;
		gap: 0.55em;
		font-variant-numeric: tabular-nums;
	}
	time {
		color: var(--ink);
	}
	.off {
		font-size: var(--t-micro);
		letter-spacing: var(--track-micro);
		color: var(--hud-dim);
	}
</style>
