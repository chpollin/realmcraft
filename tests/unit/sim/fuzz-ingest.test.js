// Property-based fuzzing of the ingest trust boundary: valid agent proposals
// of every agent, structurally mutated, against campaigns in every phase,
// checked for no crash, untouched inputs, well-formed issues, determinism, and
// for a valid, integer successor state when the proposal is taken in. Fixed
// seed (FUZZ_SEED), case count scaled by FUZZ_RUNS; a failure message names
// the case to reproduce.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createCampaign, emptyDraft, open, preview, seal, stateHash } from '../../../engine/core/turn.js';
import { fallbackDraft } from '../../../engine/ai/fallback.js';
import { ingestProposal } from '../../../engine/harness/ingest.js';
import { buildJudgeTask, buildTasks } from '../../../engine/harness/tasks.js';
import { refOf } from '../../../engine/content/library.js';
import { validateCampaign } from '../../../engine/content/validate.js';
import { kern, peopleIds } from '../../../engine/core/state.js';
import { ITEMS_BY_AGENT } from '../../../engine/schemas/proposal.js';
import { mutate, rand, runs, SEED } from './lib/gen.js';
import { agentEntwicklung, hochland, proposalFor, taskOf, withPractice } from '../../fixtures/engine/k1/harness.js';

const { env, library, holder } = hochland();
const at = (label, i, extra = '') => `${label} case ${i} (FUZZ_SEED=${SEED})${extra}`;
const JUDGES = ['judge-coherence', 'judge-balance', 'judge-narrative'];

function withRolls(state, draft, die) {
  const probes = preview(state, env, draft, { as: draft.people }).probes.filter((p) => p.roller === 'player');
  return { ...draft, rolls: Object.fromEntries(probes.map((p) => [p.id, { value: die(), fingerprint: p.fingerprint }])) };
}

/** A campaign in phase agents after `seasons` seasons of fallback play for every people, practice rows on every people. */
function campaignAt(seed, seasons) {
  const r = rand('campaign', seed);
  let state = createCampaign(env, { id: 'fuzz', seed }).state;
  for (let i = 0; i < seasons && state.status !== 'ended'; i++) {
    const planning = open(state, env).state;
    const pid = planning.campaign.player;
    const res = apply(planning, env, { [pid]: withRolls(planning, fallbackDraft(planning, env, pid), () => r.int(1, 10)) });
    if (!res.ok) throw new Error(`setup apply failed: ${JSON.stringify(res.issues.slice(0, 3))}`);
    state = res.state;
  }
  for (const pid of peopleIds(state)) state = withPractice(state, pid);
  // A breakthrough token a candidate may name as its origin.
  if (seasons === 0) state.peoples[state.campaign.player].tokens = [{ id: 'tok-t0-1', kind: 'breakthrough', tags: ['weg'], turn: 0, source: 'natural 10' }];
  return state;
}

// The tasks every state is asked for: phase B tasks, the world task and the judges.
const TASKS = new WeakMap();
function tasksOf(state) {
  if (!TASKS.has(state)) TASKS.set(state, buildTasksOf(state));
  return TASKS.get(state);
}

function buildTasksOf(state) {
  const b = buildTasks(state, env, { library, phase: 'agents' }).map((t) => t.task);
  const world = buildTasks(state, env, { library, phase: 'resolving' }).map((t) => t.task);
  const judges = JUDGES.map((j) => buildJudgeTask(state, env, j).task);
  return [...b, ...world, ...judges];
}

// A state with one open council seat, so that a person item can fill it.
function withSeat(state, pid) {
  const next = structuredClone(state);
  kern(next.peoples[pid]).seats = [{ role: 'schamane', favor: [], oppose: [], since: next.turn }];
  return next;
}

const STATES = [];

function setup() {
  const agents = [campaignAt(1, 0), campaignAt(1, 3), campaignAt(2, 5)];
  for (const [i, state] of agents.entries()) STATES.push({ label: `agents ${i}`, state, canApply: false });
  const planning = open(agents[1], env).state;
  const pid = planning.campaign.player;
  STATES.push({ label: 'planning', state: planning, canApply: true });
  const sealed = seal(planning, env, { [pid]: withRolls(planning, fallbackDraft(planning, env, pid), () => 6) });
  if (!sealed.ok) throw new Error(`setup seal failed: ${JSON.stringify(sealed.issues.slice(0, 3))}`);
  STATES.push({ label: 'resolving', state: sealed.state, drafts: sealed.drafts, canApply: true });
  const seated = withSeat(agents[0], agents[0].campaign.player);
  STATES.push({ label: 'agents with open seat', state: seated, canApply: false });
}

const proposalIdOf = (task) => task.respondAs.proposalId;

// The ids of chronicle entries a text item may cite.
const cites = (r, state) => (state.chronicle.length ? [r.pick(state.chronicle).id] : []);

/** A valid item of the task's agent, drawn from realistic content. */
function itemFor(r, state, task, i) {
  const pid = task.people;
  const text = `Fuzz ${i}: Der Rauch steht still über dem Kamm.`;
  switch (task.agent) {
    case 'research': {
      if (r.chance(0.1)) {
        const b = structuredClone(r.pick(env.content.bestimmungen));
        return { type: 'bestimmung', data: { ...b, id: `fuzzziel${i}` } };
      }
      return { type: 'entwicklung', data: agentEntwicklung(env, proposalIdOf(task), `fuzzpfad${i}`) };
    }
    case 'rival': {
      if (r.chance(0.4)) return { type: 'stance', refs: cites(r, state), text };
      const draft = state.phase === 'agents' || state.phase === 'planning' ? fallbackDraft(state, env, pid) : emptyDraft(state, pid);
      return { type: 'orders', data: { ...draft, sealed: false } };
    }
    case 'council': {
      const council = state.peoples[pid].council;
      const member = r.pick(council);
      const goal = { text: 'Das Volk soll den Winter überstehen.', favor: ['winter'], oppose: [] };
      const seat = kern(state.peoples[pid]).seats[0];
      const kind = r.pick(['voice', 'goal', 'person']);
      if (kind === 'person' && seat) {
        return { type: 'person', seat: seat.role, data: { id: `fuzzperson${i}`, name: 'Neue Seherin', role: seat.role, goal, age: 30, lifeStage: 'ruestig', appearance: 'Grau gekleidet' } };
      }
      if (kind === 'goal') return { type: 'goal', member: member.id, goal };
      return { type: 'voice', member: member.id, refs: cites(r, state), text };
    }
    case 'world': {
      if (r.chance(0.35)) {
        const known = Object.keys(state.map.known[state.campaign.player] ?? {});
        return {
          type: 'feature', tile: known.length ? r.pick(known) : '0,0',
          data: { id: `fuzzkamm${i}`, kind: 'lagerstaette', name: 'Erzader am Kamm', tags: ['erz'], resources: [{ key: 'eisenerz', amount: r.int(1, 60) }] },
        };
      }
      const card = structuredClone(r.pick(env.content.ereignisse));
      return { type: 'event', data: { ...card, id: `fuzzkarte${i}`, if: r.chance(0.5) ? null : card.if } };
    }
    case 'chronicler': return { type: 'narrative', refs: cites(r, state), text };
    default: {
      const severity = r.pick(['info', 'warn', 'severe']);
      const id = `fuzzbefund${i}`;
      if (r.chance(0.5) || !pid) {
        const refs = cites(r, state);
        if (task.agent === 'judge-narrative' && r.chance(0.3)) return { type: 'memory', refs, text };
        return { type: 'finding', id, severity, for: ['research'], refs: refs.length ? refs : ['T0-e1'], text };
      }
      return null;
    }
  }
}

function itemsFor(r, state, task) {
  const n = task.agent === 'chronicler' ? 1 : r.int(1, 3);
  const items = [];
  for (let i = 0; i < n; i++) {
    const item = itemFor(r, state, task, i);
    if (item) items.push(item);
  }
  if (task.agent.startsWith('judge') && items.length) {
    const player = state.campaign.player;
    const effects = [{ op: 'resource.delta', res: 'nahrung', amount: r.pick([-2, -1, 1]) }];
    const goal = { text: 'Das Volk soll den Winter überstehen.', favor: ['winter'], oppose: [] };
    const wrapped = r.pick([
      { type: 'effects', effects },
      { type: 'goal', member: r.pick(state.peoples[player].council).id, goal },
      { type: 'entwicklung', data: agentEntwicklung(env, proposalIdOf(task), 'fuzzkorrektur') },
    ]);
    items.push({ type: 'correction', finding: items[0].id ?? 'fuzzbefund0', needsConsent: r.chance(0.5), people: player, item: wrapped });
  }
  return items.length ? items : [{ type: 'narrative', refs: [], text: 'Fuzz.' }];
}

// Edits that keep the proposal schema-valid but make it wrong about the
// campaign: another people, a stale revision, ids that exist already, repeated
// items, a member or tile of somebody else, a crowded candidate list.
function skew(r, state, proposal) {
  const out = structuredClone(proposal);
  const peoples = peopleIds(state);
  const known = [...env.content.entwicklungen, ...env.content.ereignisse, ...env.content.bestimmungen].map((x) => x.id);
  const members = Object.values(state.peoples).flatMap((p) => p.council.map((m) => m.id));
  const tiles = Object.values(state.map.known).flatMap((k) => Object.keys(k));
  // The tile pattern admits any number of digits, so far tiles are legal strings.
  const far = ['999,999', '-1000000,5', '12345678901234567890,1'];
  const edits = [
    () => { out.people = r.pick([...peoples, null]); },
    () => { out.turn += r.pick([-1, 1]); },
    () => { out.basedOnRev += r.pick([-1, 1, 5]); },
    () => { out.agent = r.pick(Object.keys(ITEMS_BY_AGENT)); },
    () => { out.items.push(...structuredClone(out.items).slice(0, r.int(1, 12))); out.items = out.items.slice(0, 12); },
    () => { out.items = out.items.map((it) => (it.data?.id ? { ...it, data: { ...it.data, id: r.pick(known) } } : it)); },
    () => { out.items = out.items.map((it) => ('member' in it ? { ...it, member: r.pick(members) } : it)); },
    () => { out.items = out.items.map((it) => ('tile' in it ? { ...it, tile: r.pick(r.chance(0.3) ? far : tiles) } : it)); },
    () => { out.items = out.items.map((it) => (it.type === 'orders' ? { ...it, data: { ...it.data, people: r.pick(peoples), turn: it.data.turn + r.pick([-1, 1]) } } : it)); },
    () => { out.items = out.items.map((it) => (it.type === 'correction' ? { ...it, people: r.pick([...peoples, null]) } : it)); },
    () => { out.items = out.items.map((it) => (it.data?.origin ? { ...it, data: { ...it.data, origin: { ...it.data.origin, token: r.pick(['tok-t0-1', 'nope']) } } } : it)); },
    () => {
      const ent = out.items.find((it) => it.type === 'entwicklung');
      if (ent) out.items.push(...Array.from({ length: r.int(1, 8) }, (_, k) => ({ ...structuredClone(ent), data: { ...structuredClone(ent.data), id: `fuzzmehr${k}` } })));
      out.items = out.items.slice(0, 12);
    },
  ];
  for (let k = r.int(1, 2); k > 0; k--) r.pick(edits)();
  return out;
}

function wellFormed(res, label) {
  const issues = [...res.issues, ...res.items.flatMap((i) => i.issues ?? [])];
  for (const x of issues) {
    assert.equal(typeof x.code, 'string', `${label}: issue code ${JSON.stringify(x)}`);
    assert.equal(typeof x.path, 'string', `${label}: issue path ${JSON.stringify(x)}`);
  }
}

function integerStocks(state, label) {
  for (const [id, p] of Object.entries(state.peoples)) {
    for (const [res, n] of Object.entries(p.resources)) assert.ok(Number.isInteger(n) && n >= 0, `${label}: ${id}.${res} = ${n}`);
    assert.ok(Number.isInteger(p.population.core) && p.population.core >= 0, `${label}: ${id} core ${p.population.core}`);
  }
}

describe('fuzz: ingest of agent proposals', () => {
  before(setup);

  it('takes mutated proposals in without a crash and leaves a valid, integer, deterministic state', (t) => {
    const r = rand('ingest');
    const verdicts = {};
    let cases = 0;
    let accepted = 0;
    for (let i = 0; i < runs(120); i++) {
      const { label, state, drafts, canApply } = r.pick(STATES);
      const task = r.pick(tasksOf(state));
      const base = proposalFor(task, itemsFor(r, state, task));
      const how = r.pick(['mutate', 'mutate', 'skew', 'skew', 'none']);
      const proposal = how === 'mutate' ? mutate(r, base) : how === 'skew' ? skew(r, state, base) : base;
      const consent = r.chance(0.5) ? [base.proposalId] : [];
      const where = at('ingest', i, ` ${label} ${task.agent}`);
      const shown = () => `\nproposal ${JSON.stringify(proposal)}`;
      const before = stateHash(state);
      const libBefore = JSON.stringify(library);
      const run = (p) => {
        holder.library = library;
        return ingestProposal(state, env, p, { task, library, holder, consent });
      };
      let res;
      try {
        res = run(proposal);
      } catch (err) {
        assert.fail(`${where} throws ${err.stack}${shown()}`);
      }
      cases++;
      const tally = `${task.agent}:${res.verdict}`;
      verdicts[tally] = (verdicts[tally] ?? 0) + 1;
      assert.equal(stateHash(state), before, `${where} mutated its input state${shown()}`);
      assert.equal(JSON.stringify(library), libBefore, `${where} mutated its input library${shown()}`);
      wellFormed(res, where + shown());
      const again = run(structuredClone(proposal));
      assert.deepEqual([again.verdict, again.hash, stateHash(again.state)], [res.verdict, res.hash, stateHash(res.state)], `${where} is not deterministic${shown()}`);

      if (!res.ok) {
        assert.equal(stateHash(res.state), before, `${where} rejected but changed the state${shown()}`);
        assert.equal(res.library, library, `${where} rejected but changed the library${shown()}`);
        continue;
      }
      if (res.verdict === 'duplicate') continue;
      accepted++;
      const next = res.state;
      const stored = new Set(res.items.filter((x) => x.verdict === 'accepted').map((x) => proposal.items[x.index]).map((x) => (x.type === 'correction' ? x.item : x)).filter((x) => x?.data?.id).map((x) => refOf(x.data)));
      const grown = res.library.entries.filter((e) => !library.entries.some((o) => o.ref === e.ref)).map((e) => e.ref);
      assert.deepEqual(grown.filter((ref) => !stored.has(ref)), [], `${where} stored content of an item it did not take in${shown()}`);
      const v = validateCampaign(next).issues.filter((x) => x.severity === 'error');
      assert.deepEqual(v, [], `${where}${shown()}`);
      integerStocks(next, where + shown());
      if (!canApply && next.status !== 'ended' && next.phase === 'agents') {
        const opened = open(next, env);
        assert.ok(opened.ok, `${where} cannot open the next season${shown()}`);
        // Drafts the ingest took for AI peoples must survive the season they were written for.
        const sealedDrafts = res.drafts;
        if (Object.keys(sealedDrafts).length) {
          const player = next.campaign.player;
          const planning = opened.state;
          const run2 = () => apply(planning, env, { [player]: withRolls(planning, fallbackDraft(planning, env, player), () => 6), ...structuredClone(sealedDrafts) });
          let applied;
          try {
            applied = run2();
          } catch (err) {
            assert.fail(`${where} throws in apply on the ingested drafts ${err.stack}${shown()}`);
          }
          if (applied.ok) integerStocks(applied.state, `${where} after apply${shown()}`);
        }
      } else if (next.phase === 'resolving') {
        let applied;
        try {
          applied = apply(next, env, drafts);
        } catch (err) {
          assert.fail(`${where} throws in apply after the ingest ${err.stack}${shown()}`);
        }
        assert.ok(applied.ok, `${where} cannot apply the season after the ingest ${JSON.stringify(applied.issues.slice(0, 3))}${shown()}`);
        assert.deepEqual(validateCampaign(applied.state).issues.filter((x) => x.severity === 'error'), [], `${where} after apply${shown()}`);
        integerStocks(applied.state, `${where} after apply${shown()}`);
      }
    }
    t.diagnostic(`${cases} cases, ${accepted} proposals taken in, verdicts ${JSON.stringify(verdicts)}`);
    assert.ok(accepted > 0, 'no random proposal was taken in');
  });

  it('keeps a state valid when several proposals, repeats included, are taken in one after the other', (t) => {
    const r = rand('chain');
    let taken = 0;
    for (let i = 0; i < runs(20); i++) {
      const { label, state: s0 } = r.pick(STATES.filter((x) => x.state.phase === 'agents'));
      let state = s0;
      let lib = library;
      const sent = [];
      for (let k = 0; k < r.int(3, 6); k++) {
        const task = r.pick(tasksOf(s0));
        // A repeat of an earlier proposal, or a fresh one that may clash with what the state holds by now.
        const proposal = sent.length && r.chance(0.3) ? structuredClone(r.pick(sent)) : skew(r, state, proposalFor(task, itemsFor(r, state, task)));
        sent.push(proposal);
        const where = at('chain', i, ` ${label} step ${k} ${task.agent}`);
        holder.library = lib;
        let res;
        try {
          res = ingestProposal(state, env, proposal, { task, library: lib, holder, consent: [proposal.proposalId] });
        } catch (err) {
          assert.fail(`${where} throws ${err.stack}
proposal ${JSON.stringify(proposal)}`);
        }
        if (!res.ok) continue;
        taken++;
        state = res.state;
        lib = res.library;
        const v = validateCampaign(state).issues.filter((x) => x.severity === 'error');
        assert.deepEqual(v, [], `${where}
proposal ${JSON.stringify(proposal)}`);
        integerStocks(state, where);
      }
      holder.library = lib;
      if (state.phase === 'agents' && state.status !== 'ended') assert.ok(open(state, env).ok, at('chain', i, ` ${label} cannot open after the chain`));
    }
    holder.library = library;
    t.diagnostic(`${taken} proposals taken in over the chains`);
  });

  it('takes the unmutated proposals of every agent in on a state of its phase', (t) => {
    const r = rand('valid');
    let taken = 0;
    for (let i = 0; i < runs(40); i++) {
      const { label, state } = STATES.find((s) => s.label === 'agents 1');
      const task = r.pick(tasksOf(state));
      const items = itemsFor(r, state, task);
      const proposal = proposalFor(task, items);
      holder.library = library;
      let res;
      try {
        res = ingestProposal(state, env, proposal, { task, library, holder, consent: [proposal.proposalId] });
      } catch (err) {
        assert.fail(`${at('valid', i, ` ${label} ${task.agent}`)} throws ${err.stack}\nproposal ${JSON.stringify(proposal)}`);
      }
      if (res.ok) taken++;
    }
    t.diagnostic(`${taken} of ${runs(40)} valid proposals taken in`);
    assert.ok(taken > 0);
  });
});
