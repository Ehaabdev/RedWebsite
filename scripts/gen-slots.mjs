// Generates placeholder card art. Deterministic, drawn from nothing but a seed,
// so it carries no licence and can be regenerated identically.
//
// These stand in for photographs, so they are deliberately LIGHT and varied in
// hue: near-black art on a near-black page made the cards vanish into the
// background instead of reading as panels. Each is stamped so it cannot pass
// for real work.
//
// The stamp is CENTRED, not inset from the left. The cards crop with
// object-fit:cover and then shift for parallax, which ate a left-aligned stamp;
// centred, it survives both.  Run: node scripts/gen-slots.mjs
import { writeFileSync } from 'node:fs';

const W = 1200, H = 750;
// One hue for the whole strip: six different colours made the carousel look
// like six unrelated things. The plates are a set, so they share a colour and
// differ only in the geometry drawn on them.
const HUE = 208;

const mul = (a) => () => (a = (a + 0x6d2b79f5) | 0,
  ((t) => (((t ^ (t >>> 15)) >>> 0) / 4294967296))(
    Math.imul(a ^ (a >>> 15), 1 | a) + (Math.imul(a ^ (a >>> 7), 61 | a) ^ a)));

for (let n = 1; n <= 6; n++) {
  const r = mul(n * 7717);
  const hue = HUE;
  const p = [];

  const base = `hsl(${hue} 22% 34%)`;
  const lift = `hsl(${(hue + 26) % 360} 30% 62%)`;

  // large soft forms, so the card has an image-like mass rather than a texture
  const blobs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const cx = r() * W, cy = r() * H, rad = 160 + r() * 340;
    p.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="url(#g${n}b)" opacity="${(0.35 + r() * 0.4).toFixed(2)}"/>`);
  }

  // structural bands
  for (let i = 0; i < 4 + Math.floor(r() * 4); i++) {
    const y = r() * H, h = 8 + r() * 46, x = -100 + r() * W, w = 220 + r() * 780;
    p.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#e8edf5" opacity="${(0.05 + r() * 0.14).toFixed(2)}"/>`);
  }

  // concentric arcs
  const cx = 180 + r() * 840, cy = 120 + r() * 520;
  for (let i = 0, rings = 5 + Math.floor(r() * 5); i < rings; i++) {
    p.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(70 + i * (28 + r() * 32)).toFixed(0)}" fill="none" stroke="#f2f5fa" stroke-width="${(0.8 + r() * 1.4).toFixed(2)}" opacity="${(0.10 + r() * 0.20).toFixed(2)}"/>`);
  }

  p.push(`<rect x="${(r() * W * 0.7).toFixed(0)}" y="${(r() * H).toFixed(0)}" width="${(60 + r() * 190).toFixed(0)}" height="4" fill="#e64749" opacity="0.9"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Placeholder artwork ${n}">
<defs>
  <linearGradient id="g${n}a" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${base}"/>
    <stop offset="1" stop-color="hsl(${hue} 26% 19%)"/>
  </linearGradient>
  <radialGradient id="g${n}b"><stop offset="0" stop-color="${lift}" stop-opacity="0.9"/><stop offset="1" stop-color="${lift}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g${n}a)"/>
${p.join('\n')}
<rect x="0" y="${H - 190}" width="${W}" height="190" fill="#0b0e13" opacity="0.55"/>
<g font-family="ui-monospace, monospace" fill="#f2f5fa" text-anchor="middle">
  <text x="${W / 2}" y="${H - 96}" font-size="34" letter-spacing="8" opacity="0.92">SLOT ${String(n).padStart(2, '0')}</text>
  <text x="${W / 2}" y="${H - 52}" font-size="19" letter-spacing="5" opacity="0.6">PLACEHOLDER — REPLACE WITH REAL WORK</text>
</g>
</svg>`;
  writeFileSync(`static/work/slot-${String(n).padStart(2, '0')}.svg`, svg);
}
console.log('generated 6 placeholder slots');
