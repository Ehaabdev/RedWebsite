/**
 * Theme inversion.
 *
 * One section flips the page to light. Rather than toggling a class at the
 * boundary — which snaps — the whole palette is interpolated by the same 0→1
 * value that drives the shader's ground, so the canvas and the DOM cross the
 * boundary together instead of one lagging the other.
 *
 * The accent is deliberately NOT interpolated. Holding one colour constant
 * through the inversion is what makes it read as the same site in a different
 * light, rather than as a second site.
 */

/** [r, g, b, a] pairs: dark theme → light theme. */
const TOKENS = {
  "--bg-primary": [
    [32, 36, 45, 1],
    [238, 240, 243, 1],
  ],
  "--ink": [
    [233, 237, 245, 1],
    [20, 23, 28, 1],
  ],
  "--hud": [
    [255, 255, 255, 0.55],
    [20, 23, 28, 0.66],
  ],
  "--hud-dim": [
    [255, 255, 255, 0.5],
    [20, 23, 28, 0.66],
  ],
  "--hud-line": [
    [255, 255, 255, 0.26],
    [20, 23, 28, 0.3],
  ],
  "--rule": [
    [255, 255, 255, 0.13],
    [20, 23, 28, 0.18],
  ],
  "--bg-raise": [
    [255, 255, 255, 0.055],
    [20, 23, 28, 0.06],
  ],
  "--bg-raise-hi": [
    [255, 255, 255, 0.12],
    [20, 23, 28, 0.12],
  ],
  "--accent-soft": [
    [230, 71, 73, 0.16],
    [230, 71, 73, 0.13],
  ],
};

const KEYS = Object.keys(TOKENS);
let applied = -1;

/**
 * Write the interpolated palette to :root. Cheap enough to call every frame,
 * but skips the write when nothing visible would change.
 *
 * @param {number} light 0 = dark, 1 = light
 */
export function applyLightness(light) {
  const n = light < 0 ? 0 : light > 1 ? 1 : light;
  if (Math.abs(n - applied) < 0.004) return;
  applied = n;

  const style = document.documentElement.style;
  for (const key of KEYS) {
    const [a, b] = TOKENS[key];
    const r = Math.round(a[0] + (b[0] - a[0]) * n);
    const g = Math.round(a[1] + (b[1] - a[1]) * n);
    const bl = Math.round(a[2] + (b[2] - a[2]) * n);
    const al = a[3] + (b[3] - a[3]) * n;
    style.setProperty(key, `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`);
  }

  // Lets components make categorical choices (icon sets, blend modes) that
  // cannot be expressed as a colour interpolation.
  document.documentElement.dataset.theme = n > 0.5 ? "light" : "dark";
}
