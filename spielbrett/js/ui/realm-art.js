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
