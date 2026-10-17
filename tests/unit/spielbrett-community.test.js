import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNITY_ANCHORS, COMMUNITY_SIZE, DRYLANDS_SEASON, drawCommunity } from '../../spielbrett/js/community/scene.js';

globalThis.document ??= { addEventListener() {} };
const { CommunityView, supported } = await import('../../spielbrett/js/community/view.js');

function recordingContext() {
  const ops = [];
  const gradient = (kind, args) => {
    const stops = [];
    return {
      kind,
      args,
      stops,
      addColorStop(offset, color) {
        stops.push([offset, color]);
      },
    };
  };
  return {
    ops,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    translate(x, y) { ops.push(['translate', x, y]); },
    scale(x, y) { ops.push(['scale', x, y]); },
    beginPath() { ops.push(['beginPath']); },
    closePath() { ops.push(['closePath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    fill() { ops.push(['fill', typeof this.fillStyle === 'string' ? this.fillStyle : this.fillStyle?.stops]); },
    stroke() { ops.push(['stroke', this.strokeStyle, this.lineWidth]); },
    ellipse(x, y, rx, ry) { ops.push(['ellipse', x, y, rx, ry]); },
    fillRect(x, y, w, h) { ops.push(['fillRect', x, y, w, h, typeof this.fillStyle === 'string' ? this.fillStyle : this.fillStyle?.stops]); },
    createLinearGradient(...args) { return gradient('linear', args); },
    createRadialGradient(...args) { return gradient('radial', args); },
  };
}

describe('community scene drylands diorama', () => {
  test('DRYLANDS_SEASON defines spring, summer, autumn, and winter palettes', () => {
    assert.deepEqual(Object.keys(DRYLANDS_SEASON), ['spring', 'summer', 'autumn', 'winter']);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const p = DRYLANDS_SEASON[season];
      for (const key of ['sky', 'haze', 'land', 'light', 'grass', 'trees', 'leaf', 'snow', 'water', 'mesa', 'salt']) {
        assert.match(p[key], /^#[0-9a-f]{6}$/i, `${season}.${key}`);
      }
    }
    assert.equal(COMMUNITY_SIZE.width, 1200);
    assert.equal(COMMUNITY_SIZE.height, 760);
    assert.equal(COMMUNITY_ANCHORS.length, 4);
  });

  test('drawCommunity renders drylands deterministically across all seasons and settlement modes', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      for (const settled of [false, true]) {
        const ctx1 = recordingContext();
        const ctx2 = recordingContext();
        const state = {
          season,
          settled,
          clans: 6,
          labour: { food: 2, material: 2, research: 1 },
          seed: '20261017',
          reducedMotion: false,
          herds: 3,
          landscape: 'drylands',
        };
        drawCommunity(ctx1, state, 1.25);
        drawCommunity(ctx2, state, 1.25);
        assert.deepEqual(ctx1.ops, ctx2.ops, `deterministic for ${season} settled=${settled}`);

        const fills = ctx1.ops.filter((op) => op[0] === 'fill').map((op) => op[1]);
        const palette = DRYLANDS_SEASON[season];
        assert.ok(fills.includes(palette.mesa), `uses mesa ridge color in ${season}`);
        assert.ok(fills.includes(palette.salt), `uses salt pan color in ${season}`);
        assert.ok(fills.includes(palette.water), `uses oasis water color in ${season}`);
        assert.ok(fills.includes(palette.trees), `uses acacia tree color in ${season}`);
      }
    }
  });

  test('drylandssettled and nomadic dwellings differ and drylands differs from highlands and riverlands', () => {
    const base = { season: 'summer', clans: 5, labour: { food: 2, material: 1, research: 1 }, seed: '42', herds: 2 };
    const dryNomad = recordingContext();
    const drySettled = recordingContext();
    const highSettled = recordingContext();
    const riverSettled = recordingContext();

    drawCommunity(dryNomad, { ...base, landscape: 'drylands', settled: false }, 0.5);
    drawCommunity(drySettled, { ...base, landscape: 'drylands', settled: true }, 0.5);
    drawCommunity(highSettled, { ...base, landscape: 'highlands', settled: true }, 0.5);
    drawCommunity(riverSettled, { ...base, landscape: 'riverlands', settled: true }, 0.5);

    assert.notDeepEqual(dryNomad.ops, drySettled.ops);
    assert.notDeepEqual(drySettled.ops, highSettled.ops);
    assert.notDeepEqual(drySettled.ops, riverSettled.ops);
  });

  test('drawCommunity respects reducedMotion in drylands', () => {
    const state = { season: 'spring', settled: false, clans: 4, labour: { food: 1, material: 1, research: 1 }, seed: '99', reducedMotion: true, landscape: 'drylands' };
    const a = recordingContext();
    const b = recordingContext();
    drawCommunity(a, state, 0);
    drawCommunity(b, state, 17.5);
    assert.deepEqual(a.ops, b.ops);
  });
});

describe('CommunityView landscape support', () => {
  test('supports highlands, riverlands, and drylands landscapes', () => {
    for (const landscape of ['highlands', 'riverlands', 'drylands']) {
      assert.equal(supported(landscape), true, `string ${landscape}`);
      assert.equal(CommunityView.supported(landscape), true, `static ${landscape}`);
      assert.equal(CommunityView.supported({ pack: { welt: { creation: { world: { landscape } } } } }), true, `game object ${landscape}`);
    }
    assert.equal(CommunityView.supported({ pack: { welt: {} } }), true, 'canonical pack without creation defaults to highlands');
    assert.equal(CommunityView.supported('archipelago'), false);
    assert.equal(CommunityView.supported({ pack: { welt: { creation: { world: { landscape: 'archipelago' } } } } }), false);
  });
});
