export const COMMUNITY_SIZE = Object.freeze({ width: 1200, height: 760 });
export const COMMUNITY_ANCHORS = Object.freeze([
  Object.freeze({ id: 'food', x: 365, y: 480 }),
  Object.freeze({ id: 'material', x: 850, y: 480 }),
  Object.freeze({ id: 'research', x: 600, y: 570 }),
  Object.freeze({ id: 'home', x: 640, y: 340 }),
]);

// An authored illustration of labour and way of life, not a building inventory.
// Slate, lichen, bone and ember follow the Hochland board's visual direction.
const SEASONS = {
  spring: { sky: '#899f9f', haze: '#d4d5ba', land: '#89956a', light: '#b1b887', grass: '#c6c89a', trees: '#415e50', leaf: '#8d9e65', snow: '#eee9d6', water: '#719ca2' },
  summer: { sky: '#82a4aa', haze: '#ded5ad', land: '#929b63', light: '#bdbe7c', grass: '#d7cb91', trees: '#3c5b48', leaf: '#80955a', snow: '#ece7d8', water: '#75a0a1' },
  autumn: { sky: '#95a4a2', haze: '#decba9', land: '#97876a', light: '#bdab7d', grass: '#d4bd89', trees: '#485b4c', leaf: '#bb874d', snow: '#eee8d7', water: '#839f9f' },
  winter: { sky: '#84969f', haze: '#c5cdca', land: '#b4c0b7', light: '#dee1cf', grass: '#eef0df', trees: '#405b55', leaf: '#697b65', snow: '#f0f0df', water: '#6d8f9b' },
};

function polygon(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
}
function line(ctx, points, color, width = 1) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function seeded(seed) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (index) => {
    let n = Math.imul(index + 1, 374761393) ^ value;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
}
function pine(ctx, x, y, scale, palette, snow = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  polygon(ctx, [[-3, 0], [-2, -43], [3, -43], [4, 0]], '#514f3d');
  polygon(ctx, [[0, -90], [-15, -61], [-8, -62], [-24, -36], [-15, -38], [-30, -8], [28, -8], [15, -38], [23, -36], [8, -62], [15, -61]], palette.trees);
  polygon(ctx, [[0, -90], [-15, -61], [-8, -62], [-24, -36], [-15, -38], [-30, -8], [-2, -15]], '#ffffff14');
  if (snow) {
    polygon(ctx, [[0, -90], [-12, -66], [-3, -70], [2, -67], [11, -67]], palette.snow);
    polygon(ctx, [[-10, -51], [-21, -36], [-7, -40], [1, -36], [16, -39], [6, -45]], '#e9ecdbb3');
  }
  ctx.restore();
}
function mountain(ctx, x, y, w, h, snow) {
  polygon(ctx, [[x - w / 2, y], [x - w * .22, y - h * .59], [x - w * .1, y - h * .52], [x + w * .05, y - h], [x + w * .22, y - h * .64], [x + w * .31, y - h * .69], [x + w * .55, y]], '#718386');
  polygon(ctx, [[x + w * .05, y - h], [x + w * .22, y - h * .64], [x + w * .31, y - h * .69], [x + w * .55, y], [x - w * .02, y]], '#556b70');
  polygon(ctx, [[x + w * .05, y - h], [x + w * .16, y - h * .76], [x + w * .08, y - h * .79], [x + w * .025, y - h * .71], [x - w * .015, y - h * .81], [x - w * .07, y - h * .72]], snow);
  polygon(ctx, [[x - w * .22, y - h * .59], [x - w * .1, y - h * .52], [x - w * .15, y - h * .42], [x - w * .19, y - h * .48], [x - w * .28, y - h * .45]], '#e0e3d3');
  line(ctx, [[x + w * .05, y - h], [x - w * .01, y - h * .5], [x - w * .02, y]], '#d2d6c233', 2);
}
function backdrop(ctx, palette, winter, rnd, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, 350);
  sky.addColorStop(0, palette.sky); sky.addColorStop(1, palette.haze);
  ctx.fillStyle = sky; ctx.fillRect(-1200, -760, 3600, 2280);
  ellipse(ctx, 850, 95, 180, 120, '#f5ebc819');
  polygon(ctx, [[0, 184], [90, 150], [150, 168], [275, 101], [350, 161], [425, 130], [540, 190], [640, 130], [780, 151], [900, 110], [1050, 167], [1200, 113], [1200, 360], [0, 360]], '#7d9391');
  mountain(ctx, 170, 290, 460, 246, palette.snow);
  mountain(ctx, 545, 288, 475, 257, palette.snow);
  mountain(ctx, 930, 298, 510, 238, palette.snow);
  const mist = ctx.createLinearGradient(0, 150, 0, 325);
  mist.addColorStop(0, '#c8cdb700'); mist.addColorStop(1, '#c8cdb7b0');
  ctx.fillStyle = mist; ctx.fillRect(0, 130, 1200, 230);
  polygon(ctx, [[0, 242], [120, 225], [245, 255], [380, 233], [520, 280], [670, 253], [810, 227], [980, 225], [1200, 183], [1200, 420], [0, 420]], '#526f61');
  for (let i = 0; i < 65; i++) {
    const x = i * 20 - 20;
    const y = 270 + rnd(i + 90) * 45 + Math.sin(x * .006) * 18;
    pine(ctx, x, y, .4 + rnd(i + 240) * .36, palette, winter);
  }
  polygon(ctx, [[345, 282], [403, 275], [379, 307], [309, 332], [267, 376], [156, 423], [0, 488], [0, 600], [141, 480], [218, 427], [296, 368], [328, 332], [390, 303]], palette.water);
  line(ctx, [[369, 287], [350, 315], [288, 344], [245, 391], [126, 450], [0, 535]], '#cee2d25c', 5);
  for (let i = 0; i < 18; i++) {
    const p = (i + time * .12) % 18;
    line(ctx, [[345 - p * 20, 315 + p * 12], [361 - p * 20 + rnd(i) * 20, 313 + p * 12]], '#dce7db6b', 1.3);
  }
}
function ground(ctx, palette, winter, rnd) {
  polygon(ctx, [[-50, 470], [200, 372], [374, 302], [710, 284], [965, 319], [1250, 414], [1250, 790], [-50, 790]], palette.land);
  polygon(ctx, [[165, 432], [360, 326], [685, 307], [947, 340], [1150, 437], [1060, 608], [853, 696], [530, 719], [224, 629]], palette.light);
  polygon(ctx, [[-40, 650], [200, 616], [371, 684], [649, 705], [887, 651], [1200, 589], [1200, 760], [0, 760]], winter ? '#84978e' : '#6c7c58');
  polygon(ctx, [[1050, 330], [1200, 372], [1200, 760], [1080, 679], [1109, 575], [1029, 495]], '#4d61534f');
  for (let i = 0; i < 390; i++) {
    const x = rnd(i + 1000) * 1200, y = 350 + rnd(i + 2000) * 410, h = 2 + rnd(i + 3000) * 6;
    line(ctx, [[x - 3, y - h], [x, y], [x + 2, y - h * .7]], i % 3 ? '#3e594627' : palette.grass, .8);
  }
  const paths = [
    [[-20, 735], [250, 644], [455, 594], [611, 507], [667, 388]],
    [[268, 491], [431, 509], [611, 507], [871, 493], [1210, 563]],
    [[455, 594], [534, 628], [695, 631], [883, 701]],
  ];
  for (const points of paths) {
    line(ctx, points, '#605d4433', 28);
    line(ctx, points, winter ? '#abb4a0' : '#c4b68c', 23);
    line(ctx, points, '#e9d5a43d', 14);
  }
  for (let i = 0; i < 90; i++) {
    if (rnd(i + 740) > .65) ellipse(ctx, 190 + rnd(i + 900) * 850, 345 + rnd(i + 800) * 340, 2 + rnd(i) * 3, 1.4, '#e7d5a764');
  }
}
function tent(ctx, x, y, s, palette, winter, time) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ellipse(ctx, 13, 7, 77, 17, '#263d3436');
  polygon(ctx, [[-67, -10], [-15, -97], [65, -52], [90, 8], [8, 26]], '#d2c8a5', '#4b4e3e', 1.3);
  polygon(ctx, [[-67, -10], [-15, -97], [8, 26]], '#efe3bb');
  polygon(ctx, [[-15, -97], [65, -52], [90, 8], [8, 26]], '#b3ae91');
  polygon(ctx, [[-18, -48], [-15, -97], [8, 26], [-28, 11]], '#d6c9a5');
  polygon(ctx, [[-26, 10], [-15, -49], [1, 20]], '#35483e');
  polygon(ctx, [[-25, 10], [-15, -49], [-17, 10]], '#756f57');
  line(ctx, [[-15, -110], [-15, -97], [8, 26]], '#665e45', 2);
  line(ctx, [[-67, -10], [-89, 11]], '#706e51', 1);
  line(ctx, [[65, -52], [110, 11]], '#706e51', 1);
  line(ctx, [[-89, 5], [-89, 16]], '#544f3b', 2.5);
  line(ctx, [[110, 6], [110, 17]], '#544f3b', 2.5);
  for (let i = 0; i < 5; i++) line(ctx, [[3 + i * 16, -76 + i * 9], [22 + i * 15, 21 - i * 3]], '#7a7f6638', 1);
  polygon(ctx, [[-20, -70], [-30, -49], [-18, -56], [-6, -47]], '#4e6554');
  if (winter) polygon(ctx, [[-66, -10], [-15, -97], [65, -52], [63, -45], [-15, -85], [-60, -6]], palette.snow);
  line(ctx, [[-15, -110], [-15, -141]], '#514f3d', 2);
  polygon(ctx, [[-14, -139], [18, -133 + Math.sin(time * 1.9) * 4], [10, -122 + Math.sin(time * 1.9) * 4], [-14, -126]], '#b47a46');
  ctx.restore();
}
function cottage(ctx, x, y, s, palette, winter) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ellipse(ctx, 10, 10, 81, 20, '#263d3436');
  polygon(ctx, [[-65, -45], [9, -29], [9, 28], [-65, 10]], '#c5b58e');
  polygon(ctx, [[9, -29], [81, -59], [81, 1], [9, 28]], '#9b9c7f');
  polygon(ctx, [[-79, -42], [-31, -105], [53, -85], [93, -58], [9, -20]], '#6f6952');
  polygon(ctx, [[-79, -42], [-31, -105], [9, -20]], '#b3a076');
  polygon(ctx, [[-31, -105], [53, -85], [93, -58], [9, -20]], '#858369');
  for (let i = 0; i < 5; i++) line(ctx, [[-22 + i * 15, -98 + i * 3], [17 + i * 14, -24 - i * 6]], '#4f5d4d5c', 2);
  polygon(ctx, [[-38, -26], [-15, -21], [-15, 21], [-38, 15]], '#364a40');
  polygon(ctx, [[34, -22], [55, -31], [55, -8], [34, 0]], '#435e50');
  line(ctx, [[44, -26], [44, -4]], '#c1b48b', 2);
  line(ctx, [[34, -11], [55, -19]], '#c1b48b', 2);
  line(ctx, [[-63, 0], [7, 17]], '#7d81633d', 2);
  if (winter) polygon(ctx, [[-79, -42], [-31, -105], [53, -85], [93, -58], [84, -56], [49, -78], [-30, -96], [-72, -38]], palette.snow);
  ctx.restore();
}
function person(ctx, x, y, s, time, role = 'walk', tone = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const phase = Math.sin(time * 3 + tone * 1.7), step = role === 'walk' ? phase * 3 : 0, lean = role === 'work' ? phase * 1.6 : 0;
  ellipse(ctx, 3, 1, 10, 3, '#233e343c');
  line(ctx, [[-2, -15], [-4 - step, 0]], '#39483e', 4);
  line(ctx, [[3, -15], [5 + step, -1]], '#39483e', 4);
  polygon(ctx, [[-5 + lean, -32], [5 + lean, -32], [8, -13], [-7, -13]], tone % 3 === 0 ? '#b97948' : tone % 3 === 1 ? '#d0c79f' : '#5b7260');
  line(ctx, [[-4 + lean, -29], [-10, -17 - phase * 2]], '#b4a17e', 3.5);
  line(ctx, [[5 + lean, -29], [12, role === 'work' ? -22 + phase * 5 : -19 + phase * 2]], '#c7b28a', 3.5);
  ellipse(ctx, lean, -38, 5, 6, '#c4b18b');
  polygon(ctx, [[-5 + lean, -39], [-4 + lean, -45], [3 + lean, -45], [5 + lean, -39]], '#354c42');
  if (role === 'work') line(ctx, [[11, -23 + phase * 5], [18, -34 + phase * 5]], '#685d42', 2);
  if (role === 'read') polygon(ctx, [[5, -23], [15, -27], [21, -22], [11, -18]], '#ddd0a3', '#6e775e', 1);
  ctx.restore();
}
function fence(ctx, points) {
  line(ctx, points.map(([x, y]) => [x, y - 13]), '#6c6748', 4);
  line(ctx, points.map(([x, y]) => [x, y - 25]), '#92815a', 3);
  for (const [x, y] of points) {
    line(ctx, [[x, y + 3], [x, y - 31]], '#6a6247', 4.5);
    line(ctx, [[x - 1, y - 31], [x - 1, y - 2]], '#b2a076', 1);
  }
}
function sheep(ctx, x, y, s, winter, phase) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ellipse(ctx, 0, 1, 16, 4, '#304b3233');
  line(ctx, [[-8, -9], [-9, 0]], '#525742', 2.5); line(ctx, [[8, -9], [9, 0]], '#525742', 2.5);
  ellipse(ctx, 0, -12, 15, 9, winter ? '#d6d5bb' : '#e6dfbf');
  ellipse(ctx, -8, -17, 6, 5, '#f1e9cc'); ellipse(ctx, 3, -18, 7, 5, '#f1e9cc');
  ellipse(ctx, 12, -10 + phase * 2, 5, 6, '#4b5947');
  line(ctx, [[13, -11 + phase * 2], [19, -12 + phase * 2]], '#4b5947', 2.2);
  ctx.restore();
}
function foodArea(ctx, palette, winter, time, herds) {
  ellipse(ctx, 342, 484, 125, 62, '#687a453b');
  polygon(ctx, [[218, 448], [343, 410], [455, 451], [401, 535], [260, 537]], winter ? '#bec8b7' : '#9aab6e');
  fence(ctx, [[220, 454], [267, 440], [313, 426], [357, 414], [405, 432], [453, 450]]);
  const spots = [[265, 478, .9], [322, 457, .85], [380, 475, 1], [304, 510, 1.05], [411, 495, .85], [357, 521, .85]];
  spots.slice(0, Math.max(0, Math.min(spots.length, herds ?? 0))).forEach(([x, y, s], i) => sheep(ctx, x, y, s, winter, Math.sin(time * .8 + i)));
  fence(ctx, [[235, 503], [263, 537], [309, 548], [357, 554], [404, 535]]);
  polygon(ctx, [[255, 557], [311, 546], [348, 559], [291, 573]], '#937a51');
  line(ctx, [[258, 556], [258, 585]], '#685e43', 4); line(ctx, [[339, 558], [339, 585]], '#685e43', 4);
  for (let i = 0; i < 6; i++) line(ctx, [[268 + i * 11, 558], [273 + i * 11, 571]], '#cfb275', 4);
  if (!winter) {
    polygon(ctx, [[441, 546], [495, 527], [525, 544], [474, 562]], '#817b4e');
    for (let i = 0; i < 4; i++) line(ctx, [[453 + i * 13, 545 - i * 3], [473 + i * 13, 553 - i * 4]], palette.leaf, 5);
  }
}
function log(ctx, x, y, length, width = 8) {
  line(ctx, [[x, y], [x + length, y - length * .19]], '#6c6247', width);
  line(ctx, [[x, y - 2], [x + length, y - length * .19 - 2]], '#9b875d', width * .48);
  ellipse(ctx, x, y, width * .48, width * .43, '#c0a574'); ellipse(ctx, x, y, width * .22, width * .2, '#917953');
}
function materialArea(ctx, winter, palette) {
  ellipse(ctx, 863, 505, 105, 40, '#334c3629');
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) log(ctx, 884 + i * 10, 531 - row * 9 + i * 2, 60, 10);
  polygon(ctx, [[763, 455], [851, 438], [892, 456], [801, 475]], '#ad9869', '#706b4c', 1);
  polygon(ctx, [[801, 475], [892, 456], [892, 464], [801, 483]], '#736d4e');
  line(ctx, [[775, 459], [775, 492]], '#625f45', 7); line(ctx, [[878, 461], [878, 493]], '#625f45', 7); line(ctx, [[808, 476], [808, 507]], '#625f45', 7);
  log(ctx, 789, 451, 58, 7); line(ctx, [[831, 440], [844, 423]], '#5b624a', 3);
  polygon(ctx, [[840, 421], [851, 416], [854, 424], [845, 427]], '#abb1a1');
  ellipse(ctx, 756, 519, 16, 10, '#746a48'); ellipse(ctx, 756, 510, 16, 9, '#b4a06e'); ellipse(ctx, 755, 509, 7, 4, '#7b7d58');
  if (winter) line(ctx, [[889, 510], [950, 499]], palette.snow, 4);
}
function hearth(ctx, time) {
  const glow = ctx.createRadialGradient(607, 572, 3, 607, 572, 90);
  glow.addColorStop(0, '#ffc77d40'); glow.addColorStop(1, '#ffc77d00');
  ctx.fillStyle = glow; ctx.fillRect(515, 480, 184, 184);
  ellipse(ctx, 604, 579, 43, 17, '#48554243');
  for (let i = 0; i < 9; i++) {
    const a = i * Math.PI * 2 / 9;
    ellipse(ctx, 605 + Math.cos(a) * 25, 575 + Math.sin(a) * 10, 7, 5, i % 2 ? '#8d9076' : '#c0b99a');
  }
  log(ctx, 591, 575, 25, 5); log(ctx, 603, 578, 20, 5);
  const flicker = Math.sin(time * 5) * 2;
  polygon(ctx, [[589, 573], [594, 556 + flicker], [600, 562], [607, 537 - flicker], [614, 559], [620, 550], [620, 574]], '#dd8a47');
  polygon(ctx, [[596, 573], [602, 556], [606, 561], [610, 549 + flicker], [615, 573]], '#f4cc7e');
  for (let i = 0; i < 6; i++) {
    const p = (i / 6 + time * .045) % 1;
    ellipse(ctx, 607 + Math.sin(p * 4 + time * .15) * (6 + p * 12), 543 - p * 95, 6 + p * 11, 9 + p * 11, `rgba(227,226,201,${(1 - p) * .11})`);
  }
  polygon(ctx, [[531, 594], [551, 586], [573, 598], [553, 606]], '#a48a5d');
  line(ctx, [[539, 600], [539, 617]], '#716b4b', 5); line(ctx, [[565, 599], [565, 614]], '#716b4b', 5);
  polygon(ctx, [[645, 593], [675, 585], [695, 594], [665, 604]], '#a48a5d');
  line(ctx, [[653, 599], [653, 615]], '#716b4b', 5); line(ctx, [[686, 596], [686, 611]], '#716b4b', 5);
  polygon(ctx, [[663, 587], [675, 584], [681, 587], [670, 592]], '#e0d2a8');
  line(ctx, [[659, 545], [662, 495], [695, 503], [692, 551]], '#676a4b', 3);
  for (let i = 0; i < 6; i++) line(ctx, [[666 + i * 4, 500 + i], [665 + i * 4, 544 + i]], '#d4b67d', 1.2);
  line(ctx, [[666, 520], [691, 526]], '#aa784b', 4);
}
function foreground(ctx, palette, winter, rnd) {
  for (let i = 0; i < 18; i++) {
    const x = i < 9 ? -28 + rnd(i + 5000) * 170 : 1080 + rnd(i + 5000) * 170;
    pine(ctx, x, 410 + rnd(i + 5100) * 420, .7 + rnd(i + 5200) * .9, palette, winter);
  }
  for (const [x, y, s] of [[80, 681, 45], [152, 704, 33], [1015, 699, 29], [1076, 730, 45], [446, 708, 15]]) {
    polygon(ctx, [[x - s, y], [x - s * .6, y - s * .6], [x + s * .2, y - s * .85], [x + s, y - s * .2], [x + s * .4, y + s * .15]], '#65766b');
    polygon(ctx, [[x - s * .6, y - s * .6], [x + s * .2, y - s * .85], [x + s * .4, y + s * .15], [x - s * .2, y - s * .05]], winter ? palette.snow : '#9ea38a');
  }
  const shade = ctx.createLinearGradient(0, 630, 0, 760);
  shade.addColorStop(0, '#203c3200'); shade.addColorStop(1, '#203c3252');
  ctx.fillStyle = shade; ctx.fillRect(0, 630, 1200, 130);
}

/** Paints a deterministic, DOM-free community illustration in the exported world coordinates. */
export function drawCommunity(ctx, state = {}, time = 0) {
  const palette = SEASONS[state.season] || SEASONS.spring, winter = state.season === 'winter';
  const t = state.reducedMotion || !Number.isFinite(time) ? 0 : time, rnd = seeded(state.seed || 'hochland');
  const count = (value, max = 8) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
  const labour = state.labour || {};
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  backdrop(ctx, palette, winter, rnd, t); ground(ctx, palette, winter, rnd);
  for (const [x, y, s] of [[452, 363, .94], [651, 334, 1.1], [838, 369, .85]]) {
    if (state.settled) cottage(ctx, x, y, s, palette, winter);
    else tent(ctx, x, y, s, palette, winter, t);
  }
  line(ctx, [[688, 331], [688, 272]], '#5a644c', 3);
  polygon(ctx, [[690, 275], [728, 285 + Math.sin(t * 1.8) * 3], [711, 298], [690, 290]], '#b57b44');
  polygon(ctx, [[696, 284], [701, 277], [707, 286], [703, 286], [701, 282], [698, 287]], '#e6d7ad');
  foodArea(ctx, palette, winter, t, state.herds); materialArea(ctx, winter, palette); hearth(ctx, t);
  const zones = {
    food: [[453, 510], [328, 584], [278, 457], [405, 568], [310, 480], [430, 490], [360, 530], [260, 550]],
    material: [[850, 488], [792, 502], [913, 550], [808, 536], [942, 478], [869, 544], [770, 466], [895, 511]],
    research: [[549, 603], [680, 611], [704, 553], [565, 542], [650, 640], [521, 569], [720, 616], [618, 613]],
  };
  for (const [role, positions] of Object.entries(zones)) {
    for (let i = 0; i < count(labour[role]); i++) {
      const [x, y] = positions[i];
      person(ctx, x, y, role === 'food' && i === 2 ? .83 : 1, t, role === 'research' ? 'read' : 'work', i + (role === 'material' ? 2 : 0));
    }
  }
  const assigned = count(labour.food, 30) + count(labour.material, 30) + count(labour.research, 30);
  const idle = count(Math.max(0, (Number.isFinite(state.clans) ? state.clans : 0) - assigned), 4);
  for (let i = 0; i < idle; i++) person(ctx, 502 + i * 35, 425 + i % 2 * 24, .9, t, 'walk', i + 3);
  // Passers-by establish human scale without representing additional clans.
  person(ctx, 725 + Math.sin(t * .12) * 13, 426 + Math.sin(t * .12) * 6, .75, t, 'walk', 1);
  person(ctx, 465 + Math.sin(t * .1) * 12, 625 - Math.sin(t * .1) * 4, 1.05, t + 1, 'walk', 2);
  foreground(ctx, palette, winter, rnd); ctx.restore();
}
