// Code-drawn marks for authoring. These are schematics, never generated world maps.
const NS = 'http://www.w3.org/2000/svg';
export function svgNode(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}
export function brandMark() {
  return svgNode('svg', { viewBox: '0 0 48 48', class: 'realm-brand-mark', 'aria-hidden': 'true' },
    svgNode('path', { d: 'M24 3 44 15v18L24 45 4 33V15ZM4 15l20 12 20-12M24 27v18M13 20V10m22 10V10M13 31l11-6 11 6', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }),
    svgNode('circle', { cx: 24, cy: 24, r: 4, fill: 'currentColor' }));
}
export function landscapeArt(landscape = 'highlands') {
  const svg = svgNode('svg', { viewBox: '0 0 360 300', class: 'realm-landscape-art', 'aria-hidden': 'true' });
  svg.append(svgNode('circle', { cx: 180, cy: 146, r: 119, class: 'realm-art-orbit' }));
  for (let i = 0; i < 6; i++) {
    const y = 80 + i * 27;
    svg.append(svgNode('path', { d: `M22 ${y + 16} C75 ${y - 38}, 102 ${y + 46}, 167 ${y + 8} S276 ${y - 19}, 338 ${y + 17}`, class: 'realm-art-contour' }));
  }
  if (landscape === 'riverlands') {
    svg.append(svgNode('path', { d: 'M213 19C265 62 154 70 184 110S266 142 203 190 188 245 217 282', class: 'realm-art-water' }),
      svgNode('path', { d: 'M228 20C275 61 172 73 200 108S280 143 218 192 203 245 231 280', class: 'realm-art-water-line' }));
  } else if (landscape === 'drylands') {
    svg.append(svgNode('path', { d: 'M35 185Q104 76 174 168T329 173M37 216Q102 127 175 199T324 204', class: 'realm-art-ridge' }),
      svgNode('circle', { cx: 264, cy: 76, r: 19, class: 'realm-art-sun' }));
  } else {
    svg.append(svgNode('path', { d: 'M29 211 111 102 148 151 211 54 334 211M111 102l11 76 26-27 30 60M211 54l-5 101 43-36 44 92', class: 'realm-art-ridge' }),
      svgNode('path', { d: 'M85 137l26-35 15 20 10 13M184 97l27-43 33 43-17-7-16 10-11-12Z', class: 'realm-art-snow' }));
  }
  svg.append(svgNode('path', { d: 'M180 222v-31m-7 9 7-9 7 9', class: 'realm-art-home' }),
    svgNode('circle', { cx: 180, cy: 222, r: 7, class: 'realm-art-home' }));
  return svg;
}

// Static relief studies communicate authoring state, not kernel geography.
export function workshopArt(landscape) {
  const svg = svgNode('svg', { viewBox: '0 70 760 300', class: 'realm-relief', 'aria-hidden': 'true', 'data-landscape': landscape });
  function contour(cx, cy, rx, ry, phase, lift = 0) {
    const points = Array.from({ length: 96 }, (_, i) => {
      const a = i * Math.PI / 48;
      const edge = 1 + 0.10 * Math.sin(a * 3 + phase) + 0.065 * Math.cos(a * 5 - phase) + 0.035 * Math.sin(a * 9);
      return `${(cx + Math.cos(a) * rx * edge).toFixed(1)},${(cy + Math.sin(a) * ry * edge - lift).toFixed(1)}`;
    });
    return 'M' + points.join('L') + 'Z';
  }
  const base = contour(383, 239, 287, 113, 0.6);
  svg.append(svgNode('path', { d: base, transform: 'translate(0 24)', class: 'relief-shadow' }));
  for (let i = 6; i >= 0; i--) {
    svg.append(svgNode('path', { d: base, transform: `translate(0 ${i * 3.4})`, class: i === 0 ? 'relief-base' : 'relief-edge' }));
  }
  const forms = landscape === 'highlands'
    ? [[291, 201, 140, 61, 0.3, 12], [452, 219, 131, 59, 2, 10], [377, 263, 84, 40, 1, 7]]
    : landscape === 'riverlands'
      ? [[252, 223, 132, 67, 1, 8], [476, 212, 127, 61, 2.2, 8], [456, 295, 62, 25, 1.7, 4]]
      : [[290, 215, 136, 58, 0.2, 7], [479, 239, 118, 53, 1.5, 6], [346, 292, 67, 28, 2.3, 4]];
  for (const [cx, cy, rx, ry, phase, count] of forms) {
    for (let i = 0; i < count; i++) {
      const scale = 1 - i / (count + 1);
      const band = i > count * 0.7 ? 'upper' : i > count * 0.35 ? 'middle' : 'lower';
      svg.append(svgNode('path', { d: contour(cx, cy, rx * scale, ry * scale, phase + i * 0.055, i * 5), class: `relief-land relief-land-${band}` }));
    }
  }
  if (landscape === 'riverlands') {
    svg.append(svgNode('path', { d: 'M389 137C440 169 326 179 369 213S433 258 366 280 339 307 358 329', class: 'relief-river' }));
  }
  return svg;
}
