/**
 * Ambient sound, synthesised in Web Audio. No files.
 *
 * Approach: sparse generative notes over a very quiet bed — not a drone.
 *
 * A continuous pad is hum-like almost by definition, and the previous version
 * compounded that: six voices gliding between chords over 8 seconds meant
 * everything spent a third of its life at microtonal in-between pitches, fed
 * into a delay line that replayed the old pitches against the new ones. That
 * smear is what read as noise.
 *
 * Now: soft bell tones drawn from a pentatonic scale at irregular intervals.
 * Pentatonic means no interval can land dissonant, no matter what the random
 * picker does. Silence between notes is the point — it makes the sound read as
 * composed rather than as a fault in the machine.
 */

let ctx = null;
let master = null;
let analyser = null;
let delay = null;
let bedVoices = [];
let noteTimer = null;
let muteTimer = null;
let started = false;

const LEVEL = 0.6;

/**
 * Drop a track you have the rights to at static/sounds/ambient.mp3 and it is
 * used automatically. If the file is absent, the synthesised generative notes
 * below play instead — so the site is never silent and never depends on an
 * asset that may not exist.
 */
const TRACK_URL = '/sounds/ambient.mp3';
const TRACK_LEVEL = 0.55;
let trackBytes = null;
let usingTrack = false;

export const isUsingTrack = () => usingTrack;

/**
 * Fetch the track during preload, before any AudioContext exists. Decoding
 * needs a context and a user gesture; downloading does not, so this is the part
 * worth doing while the loader is on screen.
 */
export async function prefetch() {
	try {
		const res = await fetch(TRACK_URL, { cache: 'force-cache' });
		if (!res.ok) return null;
		// A missing static file can come back as the SPA fallback HTML with a
		// 200, so trust the content type rather than the status.
		const type = res.headers.get('content-type') || '';
		if (!/audio|mpeg|ogg|wav|octet-stream/i.test(type)) return null;
		trackBytes = await res.arrayBuffer();
		return trackBytes;
	} catch {
		return null;
	}
}

/** A minor pentatonic. Weighted toward the middle so it stays calm. */
const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const WEIGHTS = [3, 4, 4, 5, 4, 4, 3, 2, 1];

/** Sustained bed, kept very quiet — just enough that silence isn't dead air. */
const BED = [110.0, 164.81];

export const isStarted = () => started;
export const getAnalyser = () => analyser;

export async function start({ muted = false } = {}) {
	if (started) return;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return;

	ctx = new AC();
	await ctx.resume();

	master = ctx.createGain();
	master.gain.value = muted ? 0 : LEVEL;

	analyser = ctx.createAnalyser();
	analyser.fftSize = 1024;
	analyser.smoothingTimeConstant = 0.82;

	master.connect(analyser);
	analyser.connect(ctx.destination);

	// Shared space. Feedback stays well under unity so repeats decay away
	// instead of accumulating into a wash.
	delay = ctx.createDelay(2);
	delay.delayTime.value = 0.42;
	const fb = ctx.createGain();
	fb.gain.value = 0.2;
	const wet = ctx.createGain();
	wet.gain.value = 0.17;
	delay.connect(fb);
	fb.connect(delay);
	delay.connect(wet);
	wet.connect(master);

	// Prefer a real track when one is present; fall back to the generative bed.
	if (trackBytes) {
		try {
			const buf = await ctx.decodeAudioData(trackBytes.slice(0));
			playTrack(buf);
			usingTrack = true;
		} catch {
			usingTrack = false;
		}
	}

	if (!usingTrack) {
		buildBed();
		scheduleNextNote(1200);
	}

	started = true;

	if (import.meta.env.DEV && typeof window !== 'undefined') {
		window.__audio = { analyser: () => analyser, ctx: () => ctx, master: () => master };
	}
}

/** Loop a decoded track, easing it in so entry isn't abrupt. */
function playTrack(buffer) {
	const now = ctx.currentTime;

	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.loop = true;

	const g = ctx.createGain();
	g.gain.value = 0;
	g.gain.linearRampToValueAtTime(TRACK_LEVEL, now + 3);

	src.connect(g);
	g.connect(master);
	src.start(now);
	bedVoices.push(src);
}

function buildBed() {
	const now = ctx.currentTime;

	const bed = ctx.createGain();
	bed.gain.value = 0;
	bed.gain.linearRampToValueAtTime(0.026, now + 8); // very slow fade-in

	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 460;
	lp.Q.value = 0.5;

	const hp = ctx.createBiquadFilter();
	hp.type = 'highpass';
	hp.frequency.value = 70;

	BED.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = freq; // fixed pitch — no glides, ever
		osc.detune.value = i ? 3 : -3;

		const g = ctx.createGain();
		const base = 0.5;
		g.gain.value = base;

		// gentle breathing, scaled so it can never cross zero
		const swell = ctx.createOscillator();
		const amt = ctx.createGain();
		swell.frequency.value = 0.019 + i * 0.011;
		amt.gain.value = base * 0.3;
		swell.connect(amt);
		amt.connect(g.gain);
		swell.start();

		osc.connect(g);
		g.connect(lp);
		osc.start();
		bedVoices.push(osc, swell);
	});

	lp.connect(hp);
	hp.connect(bed);
	bed.connect(master);
}

function pickNote() {
	const total = WEIGHTS.reduce((a, b) => a + b, 0);
	let r = Math.random() * total;
	for (let i = 0; i < SCALE.length; i++) {
		r -= WEIGHTS[i];
		if (r <= 0) return SCALE[i];
	}
	return SCALE[3];
}

/** Soft bell: fast attack, long exponential decay. */
function playNote(freq, level = 0.17) {
	if (!ctx) return;
	const t = ctx.currentTime;
	const dur = 2.4 + Math.random() * 1.8;

	const g = ctx.createGain();
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(level, t + 0.015);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 2400;
	lp.Q.value = 0.4;

	// fundamental plus a quiet octave for a little shine
	const a = ctx.createOscillator();
	a.type = 'sine';
	a.frequency.value = freq;

	const b = ctx.createOscillator();
	b.type = 'sine';
	b.frequency.value = freq * 2;
	const bg = ctx.createGain();
	bg.gain.value = 0.18;

	a.connect(lp);
	b.connect(bg);
	bg.connect(lp);
	lp.connect(g);

	const pan = ctx.createStereoPanner?.();
	if (pan) {
		pan.pan.value = (Math.random() - 0.5) * 1.2;
		g.connect(pan);
		pan.connect(master);
		pan.connect(delay);
	} else {
		g.connect(master);
		g.connect(delay);
	}

	a.start(t);
	b.start(t);
	a.stop(t + dur + 0.1);
	b.stop(t + dur + 0.1);
}

function scheduleNextNote(delayMs) {
	noteTimer = setTimeout(() => {
		playNote(pickNote());

		// occasionally a second note just behind it, making an interval
		if (Math.random() < 0.32) {
			setTimeout(() => playNote(pickNote(), 0.1), 260 + Math.random() * 420);
		}

		scheduleNextNote(2600 + Math.random() * 4600);
	}, delayMs);
}

/** Soft filtered tick for UI feedback. */
export function click({ pitch = 660, dur = 0.12, level = 0.07 } = {}) {
	if (!ctx || !started) return;
	const t = ctx.currentTime;

	const osc = ctx.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(pitch, t);
	osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + dur);

	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 2000;

	const g = ctx.createGain();
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(level, t + 0.012);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

	osc.connect(lp);
	lp.connect(g);
	g.connect(master);
	osc.start(t);
	osc.stop(t + dur + 0.05);
}

/**
 * Mute must actually be silent. A bare linearRamp interpolates from the last
 * *scheduled* event, not the param's current value, so pin it first — then
 * suspend the context so nothing is running at all.
 */
export function setMuted(muted) {
	if (!master || !ctx) return;
	clearTimeout(muteTimer);
	const t = ctx.currentTime;

	if (muted) {
		master.gain.cancelScheduledValues(t);
		master.gain.setValueAtTime(master.gain.value, t);
		master.gain.linearRampToValueAtTime(0, t + 0.4);
		muteTimer = setTimeout(() => ctx?.state === 'running' && ctx.suspend(), 500);
	} else {
		const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
		resume.then(() => {
			if (!ctx) return;
			const t2 = ctx.currentTime;
			master.gain.cancelScheduledValues(t2);
			master.gain.setValueAtTime(master.gain.value, t2);
			master.gain.linearRampToValueAtTime(LEVEL, t2 + 0.4);
		});
	}
}

export function destroy() {
	clearTimeout(noteTimer);
	clearTimeout(muteTimer);
	bedVoices.forEach((n) => {
		try { n.stop(); } catch {}
	});
	bedVoices = [];
	ctx?.close();
	ctx = null;
	master = null;
	analyser = null;
	delay = null;
	started = false;
}
