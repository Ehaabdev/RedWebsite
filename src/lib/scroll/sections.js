/**
 * Section table — the single source of truth for the scroll timeline.
 *
 * `length` is how many pixels of scroll each section owns. Lengths are
 * deliberately NOT uniform: on daoism.systems the measured spans varied ~7×
 * (750px → 5250px), so the engine treats per-section length as config. Give
 * sections with more to read more room.
 *
 * The total scroll height falls out of the sum — never hard-code it.
 *
 * `layout` moves the headline around the viewport so sections do not all read
 * as the same template, and `theme` inverts one section to light. Both exist
 * to stop eight sections from feeling like one slide shown eight times.
 *
 *   layout   lower-left | upper-left | lower-right | centre | carousel | split
 *   theme    dark (default) | light
 *   display  solid (default) | outline — how the headline itself is drawn
 *
 * Data is held at the same length as the other two light sections. It carries
 * the least copy on the site, so at 1600px it read as a section you passed
 * through rather than one you arrived at — and its final 28% is also where the
 * light-to-dark ramp, the scatter transition and the particle fade all land.
 * Length is the knob that gives all three room.
 *
 * The light run covers Products, Studio and Data — the three practices — so the
 * inversion is a movement the site passes through rather than a single accent
 * section. The reference holds its light state across three of eight sections
 * (~40% of the timeline); one section reads as a blip next to that.
 */
export const SECTIONS = [
  {
    id: "hero",
    label: null,
    title: "Astro",
    length: 1400,
    layout: "lower-left",
  },
  {
    id: "about",
    label: "About",
    title: "About",
    length: 1500,
    layout: "upper-left",
  },
  {
    id: "work",
    label: "Work",
    title: "Work",
    length: 2000,
    layout: "lower-left",
  },
  {
    id: "products",
    label: "Products",
    title: "Products",
    length: 2200,
    layout: "lower-right",
    theme: "light",
    display: "outline",
  },
  {
    id: "studio",
    label: "Studio",
    title: "Studio",
    length: 2200,
    layout: "upper-left",
    theme: "light",
  },
  {
    id: "data",
    label: "Data",
    title: "Data",
    length: 2200,
    layout: "lower-left",
    theme: "light",
  },
  {
    id: "selected",
    label: "Selected",
    title: "Selected work",
    length: 2600,
    layout: "carousel",
  },
  {
    id: "founders",
    label: "Founders",
    title: "Founders",
    length: 1500,
    layout: "centre",
  },
  {
    id: "contact",
    label: null,
    title: "Contact",
    length: 2400,
    layout: "split",
  },
];

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How light the page should be, 0→1, for a given scroll position. Ramps across
 * the same window as the shape morph, so theme and geometry change together
 * rather than fighting each other.
 */
export function lightnessAt(index, progress) {
  const isLight = (i) => SECTIONS[i]?.theme === "light";
  const from = isLight(index) ? 1 : 0;
  const to = isLight(index + 1) ? 1 : 0;
  return from + (to - from) * smooth(0.72, 1.0, progress);
}

/** Cumulative start offset of each section, in px. */
export const OFFSETS = SECTIONS.reduce((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SECTIONS[i - 1].length);
  return acc;
}, []);

/** Total scrollable distance. */
export const TOTAL = SECTIONS.reduce((n, s) => n + s.length, 0);

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Resolve a scroll position to a section index and a local progress.
 *
 * Pure and table-driven on purpose: active/nearby classes, the ruler, the
 * counter and every 3D uniform derive from these two numbers and nothing else.
 * Testable without a browser.
 *
 * @param {number} scrollTop
 * @returns {{ index: number, progress: number, global: number }}
 *   progress = 0→1 within the section; global = 0→1 across the whole timeline
 */
export function sectionAt(scrollTop) {
  const y = scrollTop < 0 ? 0 : scrollTop > TOTAL ? TOTAL : scrollTop;

  let index = SECTIONS.length - 1;
  for (let i = 0; i < SECTIONS.length; i++) {
    if (y < OFFSETS[i] + SECTIONS[i].length) {
      index = i;
      break;
    }
  }

  const progress = clamp01((y - OFFSETS[index]) / SECTIONS[index].length);
  const global = clamp01(y / TOTAL);

  return { index, progress, global };
}

/** Scroll offset that makes section `i` active at its start. */
export function offsetOf(i) {
  return OFFSETS[Math.max(0, Math.min(SECTIONS.length - 1, i))];
}
