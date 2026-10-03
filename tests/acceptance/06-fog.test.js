// Group 6, fog: what the player is shown never contains foreign stocks or
// foreign drafts.
// Spec: Regelkern section 16 (projectFor), section 15 (visibleTo), section 17
// (the server delivers only view/<player>/); Agentenvertrag (agents read only
// their own projection); kernel draft section 9 test 15.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// F1 Everything the player is shown is checked: the projection file (A7),
//    `status --as <player>`, the player's preview, the projected events of the
//    last turn and the tasks of agents working for the player (research and
//    council for the player people).
// F2 No reveal of kind intent or destiny is active in a fresh campaign, so no
//    foreign stock, draft, candidate, research, meter or destiny may appear.
// F3 A projected people object keeps its id as key, so a foreign stock would
//    show up as peoples.<foreign>.resources or as any object keyed by the
//    foreign id that carries `resources`. The test also searches for the
//    foreign stock object itself anywhere in the projection.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { T_SHORT, collect, createCampaign, deepEqual, dice, expectExit, isObj, removeRoot, walk } from './lib/harness.js';

const HIDDEN = ['resources', 'meters', 'shortfall'];
const HIDDEN_DEV = ['candidates', 'research', 'requests'];

function leaks(doc, state, player) {
  const out = [];
  if (!doc) return out;
  const foreign = Object.keys(state.peoples).filter((id) => id !== player);
  const own = state.peoples[player].resources;
  for (const f of foreign) {
    const real = state.peoples[f];
    walk(doc, (node, path) => {
      if (!isObj(node)) return;
      const at = path.join('.') || '(root)';
      const keyed = node[f];
      if (isObj(keyed)) {
        for (const k of HIDDEN) if (k in keyed) out.push(`${at}.${f}.${k}`);
        if (isObj(keyed.developments)) for (const k of HIDDEN_DEV) if (k in keyed.developments) out.push(`${at}.${f}.developments.${k}`);
        if ('bestimmung' in keyed || 'destiny' in keyed) out.push(`${at}.${f} destiny`);
      }
      if (node.format === 'realmcraft-draft' && node.people !== player) out.push(`${at} draft of ${node.people}`);
      if (Object.keys(real.resources).length >= 2 && !deepEqual(real.resources, own) && deepEqual(node, real.resources)) out.push(`${at} equals the stock of ${f}`);
    });
  }
  return out;
}

describe('fog', { timeout: T_SHORT }, () => {
  let c;
  let lastTurn;
  let preview;
  const next = dice(61);
  before(() => {
    c = createCampaign({ label: 'fog', id: 'acc-fog' });
    for (let i = 0; i < 3; i++) lastTurn = c.playTurn({ next }).turn;
    // Seal the next turn so sealed AI drafts are on file while the player looks.
    c.toPlanning();
    preview = expectExit(c.submit(c.emptyDraft()), [0, 3], 'preview');
    c.rollPending(preview, next);
    expectExit(c.seal(next), [0], 'seal');
  });
  after(() => removeRoot(c?.root));

  it('foreign AI drafts exist, so there is something to hide', () => {
    const s = c.state();
    const ai = Object.entries(s.peoples).filter(([, p]) => p.controller === 'ai').map(([id]) => id);
    assert.ok(ai.length > 0);
    for (const id of ai) assert.ok(c.storedDraft(id), `drafts/${id}.json exists after seal`);
  });

  it('the projection file of the player holds no foreign stocks or drafts', () => {
    const s = c.state();
    const view = c.view(s.campaign.player);
    assert.ok(view, 'a projection exists at view/<player>.json (assumption A7)');
    assert.deepEqual(leaks(view, s, s.campaign.player), []);
  });

  it('status as the player holds no foreign stocks or drafts', () => {
    const s = c.state();
    const res = expectExit(c.run('status', '--as', s.campaign.player), [0], 'status --as player');
    assert.deepEqual(leaks(res.json, s, s.campaign.player), []);
  });

  it('the preview of the player holds no foreign stocks or drafts', () => {
    const s = c.state();
    assert.ok(preview.json, 'preview answers with JSON');
    assert.deepEqual(leaks(preview.json, s, s.campaign.player), []);
  });

  it('the projected events of the last turn show nothing about foreign stocks', () => {
    const s = c.state();
    const player = s.campaign.player;
    const events = c.viewEvents(player, lastTurn);
    assert.ok(events, `view/${player}/events/T${String(lastTurn).padStart(4, '0')}.json exists`);
    const foreign = Object.keys(s.peoples).filter((id) => id !== player);
    const bad = collect(events, (e) => isObj(e) && 'target' in e && 'change' in e).filter((e) => {
      if (Array.isArray(e.visibleTo) && !e.visibleTo.includes(player)) return true;
      const t = typeof e.target === 'string' ? e.target : `${e.target?.kind}:${e.target?.id}:${e.change?.field ?? ''}`;
      return foreign.some((f) => t.includes(`peoples.${f}.resources`) || (t.startsWith(`people:${f}:`) && /resources|shortfall/.test(t)));
    });
    assert.deepEqual(bad, []);
    assert.deepEqual(leaks(events, s, player), []);
  });

  it('the projected events carry no trade bookkeeping and no draw history of another people', () => {
    const s = c.state();
    const player = s.campaign.player;
    const foreign = Object.keys(s.peoples).filter((id) => id !== player);
    const shown = collect(c.viewEvents(player, lastTurn), (e) => isObj(e) && 'target' in e && 'change' in e);
    assert.deepEqual(shown.filter((e) => e.kind === 'trade.seq' || e.kind === 'event.history-total'), []);
    for (const e of shown.filter((x) => x.kind === 'event.history')) {
      assert.deepEqual(foreign.filter((f) => JSON.stringify(e.change).includes(`"${f}"`)), [], `event ${e.id} names a foreign people`);
    }
  });

  it('tasks working for the player carry only the player projection', () => {
    const s = c.state();
    const player = s.campaign.player;
    const mine = c.tasksFromFiles().filter((t) => t.people === player);
    assert.ok(mine.length > 0, 'tasks for the player people exist under agents/tasks/');
    for (const t of mine) assert.deepEqual(leaks(t, s, player), [], `task ${t.respondAs.proposalId}`);
  });

  it('a rival task carries no draft and no stock of the player', () => {
    const s = c.state();
    const player = s.campaign.player;
    const rivals = c.tasksFromFiles().filter((t) => t.agent === 'rival');
    assert.ok(rivals.length > 0, 'rival tasks exist');
    for (const t of rivals) {
      assert.notEqual(t.people, player);
      assert.deepEqual(leaks(t, s, t.people), [], `task ${t.respondAs.proposalId} sees beyond ${t.people}`);
    }
  });
});
