// Reads colour tokens from :root once and hands the canvas renderer derived
// oklch() strings. Tokens stay the single source of colour; the renderer only
// shifts lightness, chroma or alpha of a token, it never invents a hue.

const cache = new Map();

function parseOklch(str) {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)/i.exec(str);
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const a = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1);
  return { L, C: Number(m[3]), H: Number(m[4]), A: a };
}

/** Parsed token {L, C, H, A}; falls back to --terrain-unknown and warns once. */
export function token(name) {
  const n = name.startsWith('--') ? name : `--${name}`;
  if (cache.has(n)) return cache.get(n);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let parsed = parseOklch(raw);
  if (!parsed) {
    console.warn(`Spielbrett: colour token ${n} missing or not oklch, using --terrain-unknown`);
    parsed = parseOklch(getComputedStyle(document.documentElement).getPropertyValue('--terrain-unknown').trim()) || { L: 0.5, C: 0, H: 0, A: 1 };
  }
  cache.set(n, parsed);
  return parsed;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * CSS colour string derived from a token.
 * @param {string|{L:number,C:number,H:number,A:number}} t token name or parsed token
 * @param {{dL?: number, dC?: number, cScale?: number, a?: number}} [mod]
 */
export function col(t, mod = {}) {
  const c = typeof t === 'string' ? token(t) : t;
  const L = clamp01(c.L + (mod.dL || 0));
  const C = Math.max(0, (c.C + (mod.dC || 0)) * (mod.cScale ?? 1));
  const A = mod.a === undefined ? c.A : mod.a * c.A;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${c.H.toFixed(1)} / ${A.toFixed(3)})`;
}
