// Ingest of one agent proposal into the campaign (Agentenvertrag, "Einlesen").
// Pure: state, library and files go in and come out, the CLI does the IO.
//
//   ingestProposal(state, env, proposal, { task, library, consent, fog }) ->
//     { ok, verdict, hash, issues, items, state, library, drafts, texts, events }
//
// verdict: accepted | partial | rejected | duplicate | deferred. Deferred means
// the campaign phase does not admit the proposal yet; nothing changes and the
// file stays where it is. A proposal without any accepted item is rejected and
// leaves state and library untouched. Every change is logged with the source
// agent:<id> and the proposal id in refs, inside one kernel context.

import { RULES } from '../core/rules.js';
import { hasErrors, issue } from '../core/issues.js';
import { createContext, finish, noteChange, notice, setMember, setPeople } from '../core/log.js';
import { clone, findMember, kern, peopleIds } from '../core/state.js';
import { applyOnceList, setKern } from '../core/effects.js';
import { offerDestiny } from '../core/bestimmung.js';
import { evalCondition } from '../core/conditions.js';
import { checkDraft, orderContext } from '../core/orders.js';
import { computeDerived } from '../core/derive.js';
import { projectFor } from '../core/project.js';
import { migrate } from '../core/turn.js';
import { reservedKeyPaths } from '../core/canon.js';
import { appendToLibrary, createLibrary, refOf } from '../content/library.js';
import { validateProposal } from '../content/validate.js';

const LIMITS = { chronicleTurns: RULES.chronicleTurns, chronicleMax: RULES.chronicleMax };
const MAX_CANDIDATES = 6;
const MAX_POOL = 200;
const INGESTED_TURNS = 8;
const TEXT_TYPES = new Set(['narrative', 'voice', 'stance', 'memory', 'finding', 'image']);

const stem = (turn) => `T${String(turn).padStart(4, '0')}`;

/** Whether a proposal carries any item beyond text, which changes state and needs its task's limits. */
export function changesState(proposal) {
  return (Array.isArray(proposal?.items) ? proposal.items : []).some((i) => !TEXT_TYPES.has(i?.type));
}

/** Whether the phase admits an item of this agent: agents all, planning text only, resolving the world cards. */
export function phaseAllows(phase, agent, type) {
  if (phase === 'agents') return true;
  if (phase === 'planning') return TEXT_TYPES.has(type);
  if (phase === 'resolving') return agent === 'world' && (type === 'event' || type === 'feature');
  return false;
}

const titleOf = (item) => {
  const it = item.type === 'correction' ? item.item : item;
  const t = it?.data?.name ?? it?.goal?.text ?? it?.text ?? it?.type ?? item.type;
  return String(t).slice(0, 80) || item.type;
};

// An entry nobody is shown (pool cards, the AI's drafts) reaches no projection.
function hide(entry) {
  entry.visibleTo = [];
  return entry;
}

function failed(state, library, verdict, hash, issues, items = []) {
  return { ok: false, verdict, hash, issues, items, state, library, drafts: {}, texts: [], events: [] };
}

function pruneIngested(ingested, turn) {
  const out = {};
  for (const [id, hash] of Object.entries(ingested)) {
    const m = /\.T(\d+)$/.exec(id);
    if (!m || Number(m[1]) > turn - INGESTED_TURNS) out[id] = hash;
  }
  return out;
}

/**
 * holder: the { library } object the env resolves through; it follows the
 * library while items are stored. fog (default true) checks drafted AI orders on the people's projection, as
 * seal and apply do; replay passes false for journal entries written before
 * that rule, so their recorded hashes still reproduce.
 */
export function ingestProposal(state, env, proposal, { task = null, library = createLibrary(), consent = [], fog = true, holder = null } = {}) {
  const reserved = reservedKeyPaths(proposal);
  if (reserved.length) {
    return failed(state, library, 'rejected', null, reserved.map((path) => issue('format', path, 'a reserved name cannot serve as an id or key', { params: { reason: 'reserved-name' } })));
  }
  // requireTask: the validator refuses state-changing items without the task
  // whose limits they answer to; journal entries before that rule replay without it.
  const v = validateProposal(proposal, { state, task: task ?? undefined, regeln: env.regeln, welt: env.welt, library, requireTask: fog });
  if (v.duplicate) return { ok: true, verdict: 'duplicate', hash: v.hash, issues: [], items: [], state, library, drafts: {}, texts: [], events: [] };
  if (hasErrors(v.issues)) return failed(state, library, 'rejected', v.hash, v.issues, v.items.map((it) => ({ ...it, type: proposal?.items?.[it.index]?.type ?? null, title: '' })));

  // A non-object item is already rejected by the validator and has no type to bar.
  const barred = proposal.items.filter((i) => i && typeof i === 'object' && !Array.isArray(i) && !phaseAllows(state.phase, proposal.agent, i.type));
  if (barred.length) {
    const issues = barred.map((i) => issue('phase', '/phase', `phase ${state.phase} does not admit "${i.type}" items of agent "${proposal.agent}"`, {
      params: { reason: 'item-barred', phase: state.phase, type: i.type, agent: proposal.agent },
    }));
    return failed(state, library, 'deferred', v.hash, issues);
  }

  const source = `agent:${proposal.agent}`;
  const tc = createContext(state, env, { source });
  tc.step = 'ingest';
  migrate(tc);
  const run = { lib: library, drafts: {}, texts: new Map() };
  const meta = { refs: [proposal.proposalId] };
  const addText = (path, part) => run.texts.set(path, [...(run.texts.get(path) ?? []), part]);
  const people = (pid) => (pid ? tc.state.peoples[pid] : null);

  const storeContent = (data) => {
    try {
      const r = appendToLibrary(run.lib, data, { turn: tc.turn, source });
      run.lib = r.library;
      // The env resolves agent content through the holder, so content stored
      // by this proposal is known to the rules that check its later items.
      if (holder) holder.library = run.lib;
      return { ref: r.ref, added: r.added };
    } catch (err) {
      return { error: issue('duplicate', '/data', err.message, { params: { reason: 'library-duplicate' } }) };
    }
  };

  function applyItem(item, pid, base) {
    const bad = (code, path, msg, params) => [issue(code, `${base}${path}`, msg, { severity: 'error', params })];
    const named = String(pid ?? '');
    switch (item.type) {
      case 'entwicklung': {
        const p = people(pid);
        if (!p) return bad('target', '', `an Entwicklung needs a people, the proposal names ${JSON.stringify(pid)}`, { reason: 'entwicklung-needs-people', people: named });
        const ref = refOf(item.data);
        const dev = p.developments;
        if (dev.known.some((k) => k.ref === ref) || dev.candidates.some((c) => c.ref === ref)) return bad('duplicate', '/data', `${ref} is already known or offered to ${pid}`, { reason: 'already-known', ref, people: named });
        if (dev.candidates.length >= MAX_CANDIDATES) return bad('limit', '', `${pid} already has ${MAX_CANDIDATES} candidates`, { reason: 'candidates-full', people: named, max: MAX_CANDIDATES });
        const stored = storeContent(item.data);
        if (stored.error) return [stored.error];
        const token = item.data.origin.token;
        const next = [...dev.candidates, { ref, offeredAt: tc.turn, expiresAt: tc.turn + RULES.candidateLife, origin: token ? 'breakthrough' : 'agent' }];
        setPeople(tc, pid, 'developments.candidates', next, `candidate ${ref} offered by ${source}`, { kind: 'ingest.candidate', ...meta });
        if (token && p.tokens.some((k) => k.id === token)) {
          setPeople(tc, pid, 'tokens', p.tokens.filter((k) => k.id !== token), `token ${token} spent on candidate ${ref}`, { kind: 'ingest.token', ...meta });
        }
        return [];
      }
      case 'bestimmung': {
        // A destiny becomes adoptable only as an offer to its people (Regelkern section 13).
        if (!people(pid)) return bad('target', '', `a destiny is offered to a people, the proposal names ${JSON.stringify(pid)}`, { reason: 'bestimmung-needs-people', people: named });
        const stored = storeContent(item.data);
        if (stored.error) return [stored.error];
        const refused = offerDestiny(tc, pid, stored.ref, 'agent', { path: `${base}/data`, refs: meta.refs });
        return refused;
      }
      case 'event': {
        if (tc.state.eventPool.length >= MAX_POOL) return bad('limit', '', `the event pool holds ${MAX_POOL} cards`, { reason: 'pool-full', max: MAX_POOL });
        const stored = storeContent(item.data);
        if (stored.error) return [stored.error];
        if (!tc.state.eventPool.includes(stored.ref)) {
          const before = tc.state.eventPool.length;
          tc.state.eventPool.push(stored.ref);
          hide(noteChange(tc, 'ingest.event', { kind: 'campaign', id: tc.state.campaign.id }, 'eventPool', before, before + 1, `card ${stored.ref} added to the pool`, meta));
        }
        if (tc.state.phase === 'resolving') assignDraw(stored.ref, item.data);
        return [];
      }
      case 'feature': {
        const tile = item.tile;
        if (tc.state.map.features[tile]) return bad('duplicate', '/tile', `tile ${tile} already holds a feature`, { reason: 'tile-has-feature', tile: String(tile) });
        const feature = { ...item.data, since: tc.turn, source };
        tc.state.map.features[tile] = feature;
        const seers = peopleIds(tc.state).filter((id) => Object.hasOwn(tc.state.map.known[id] ?? {}, tile));
        noteChange(tc, 'ingest.feature', { kind: 'tile', id: tile }, `map.features.${tile}`, null, feature, `feature ${feature.name} placed`, meta).visibleTo = seers;
        return [];
      }
      case 'person': {
        const p = people(pid);
        if (!p) return bad('target', '', 'a person needs a people', { reason: 'person-needs-people' });
        const seats = kern(p).seats;
        const at = seats.findIndex((s) => s.role === item.seat) >= 0 ? seats.findIndex((s) => s.role === item.seat) : seats.findIndex((s) => s.role === item.data.role);
        if (at < 0) return bad('target', '/seat', `${pid} has no open seat "${item.seat}"`, { reason: 'no-open-seat', people: named, seat: String(item.seat ?? '') });
        if (p.council.some((m) => m.id === item.data.id)) return bad('duplicate', '/data/id', `council member ${item.data.id} exists`, { reason: 'member-exists', member: String(item.data.id) });
        const member = { ...item.data, loyalty: env.regeln.tuning?.newMemberLoyalty ?? 0, hollow: false, leader: false, at: null };
        p.council.push(member);
        noteChange(tc, 'ingest.person', { kind: 'member', id: member.id }, 'council', null, member, `${member.name} takes the open seat ${seats[at].role}`, { ...meta, people: pid });
        setKern(tc, pid, 'seats', seats.filter((_, i) => i !== at), `seat ${seats[at].role} filled`, meta);
        return [];
      }
      case 'goal': {
        const p = people(pid);
        if (!p || !findMember(p, item.member)) return bad('dangling_ref', '/member', `${item.member} is no council member`, { reason: 'not-member', member: String(item.member) });
        setMember(tc, pid, item.member, 'goal', item.goal, `goal revised by ${source}`, { kind: 'ingest.goal', ...meta });
        return [];
      }
      case 'orders': {
        const p = people(pid);
        if (!p || p.controller !== 'ai') return bad('target', '', 'orders are accepted for AI peoples only', { reason: 'orders-ai-only' });
        const draft = { ...clone(item.data), sealed: true };
        const chk = checkDraft(fog ? projectFor(state, env, pid) : state, env, draft, { as: pid, mode: 'preview' });
        if (hasErrors(chk.issues)) return chk.issues.filter((i) => i.severity === 'error').map((i) => ({ ...i, path: `${base}/data${i.path}` }));
        run.drafts[pid] = draft;
        hide(notice(tc, 'ingest.orders', { kind: 'people', id: pid }, 'orders drafted for the coming season', meta));
        return [];
      }
      case 'narrative':
        addText(`narrative/chronik/${stem(proposal.turn)}.md`, item.text);
        return [];
      case 'voice':
        addText(`narrative/stimmen/${stem(proposal.turn)}.md`, `${item.member}: ${item.text}`);
        return [];
      case 'stance':
        addText(`narrative/haltungen/${stem(proposal.turn)}.md`, `${proposal.people ?? 'campaign'}: ${item.text}`);
        return [];
      case 'memory':
        addText('narrative/gedaechtnis.md', item.text);
        return [];
      case 'image':
        addText(`narrative/images/${stem(proposal.turn)}.md`, `${item.ref}: ${item.path}`);
        return [];
      case 'finding': {
        // The player sees a finding only when every entry it cites is visible to him.
        const seen = new Map(tc.state.chronicle.map((e) => [e.id, e.visibleTo]));
        const player = tc.state.campaign.player;
        const open = item.refs.every((r) => { const w = seen.get(r); return w && (w.includes('all') || w.includes(player)); });
        const e = notice(tc, 'ingest.finding', { kind: 'campaign', id: tc.state.campaign.id }, `${item.severity}: ${item.text}`, { refs: [item.id, ...item.refs] });
        e.visibleTo = open ? [player] : [];
        return [];
      }
      case 'correction': {
        if (item.needsConsent && !consent.includes(proposal.proposalId)) return bad('consent.required', '', `the correction of finding ${item.finding} waits for the player's consent`, { finding: String(item.finding) });
        // The validator checked the corrected item against item.people alone.
        const target = item.people ?? null;
        const reason = `correction of finding ${item.finding}`;
        let found;
        if (item.item.type === 'effects') {
          if (!people(target)) return bad('target', '/people', 'effects need a people', { reason: 'effects-need-people' });
          applyOnceList(tc, target, item.item.effects, { reason, source, refs: [proposal.proposalId] });
          found = [];
        } else {
          found = applyItem(item.item, target, `${base}/item`);
        }
        if (found.length) return found;
        // Shown to the corrected people (and the consenting player), never to all.
        const player = tc.state.campaign.player;
        if (item.needsConsent) notice(tc, 'ingest.consent', { kind: 'campaign', id: tc.state.campaign.id }, `player consented to ${proposal.proposalId}`, { source: 'player', refs: [proposal.proposalId, item.finding], people: player });
        const e = notice(tc, 'ingest.correction', { kind: 'campaign', id: tc.state.campaign.id }, reason, { refs: [proposal.proposalId, item.finding], people: target ?? undefined });
        if (!target) hide(e);
        return [];
      }
      default:
        return bad('format', '/type', `no ingest rule for "${item.type}"`, { reason: 'item-not-allowed', type: String(item.type) });
    }
  }

  // A card with a matching draw (band, condition) of a people whose card is still open.
  function assignDraw(ref, card) {
    for (const pid of Object.keys(tc.state.eventDraws ?? {}).sort()) {
      const d = tc.state.eventDraws[pid];
      if (d.card !== null || d.band !== card.band) continue;
      let fits = false;
      try {
        fits = evalCondition(card.if, orderContext(tc.s0, env, pid).cx);
      } catch {
        fits = false;
      }
      if (!fits) continue;
      d.card = ref;
      hide(noteChange(tc, 'ingest.draw', { kind: 'people', id: pid }, `eventDraws.${pid}.card`, null, ref, `card ${ref} assigned to the draw`, meta));
      return;
    }
  }

  const items = v.items.map((it) => {
    const item = proposal.items[it.index];
    const entry = { ...it, type: item?.type ?? null, title: item && typeof item === 'object' ? titleOf(item) : '' };
    if (it.verdict !== 'accepted') return entry;
    const kernelIssues = applyItem(item, proposal.people, `/items/${it.index}`);
    if (kernelIssues.length) return { ...entry, verdict: 'rejected', issues: [...entry.issues, ...kernelIssues] };
    return entry;
  });

  const accepted = items.filter((i) => i.verdict === 'accepted').length;
  const issues = [...v.issues, ...items.flatMap((i) => i.issues)];
  if (!accepted) return failed(state, library, 'rejected', v.hash, issues, items);

  hide(notice(tc, 'ingest.accepted', { kind: 'campaign', id: tc.state.campaign.id }, `proposal ${proposal.proposalId} accepted, ${accepted} of ${items.length} items`, meta));
  tc.state.ingested = pruneIngested({ ...tc.state.ingested, [proposal.proposalId]: v.hash }, tc.turn);
  tc.state.rev += 1;
  const next = finish(tc, LIMITS);
  next.derived = computeDerived(next, env);
  const texts = [...run.texts].map(([path, parts]) => ({ path, text: `${parts.join('\n\n')}\n` }));
  return {
    ok: true,
    verdict: accepted === items.length ? 'accepted' : 'partial',
    hash: v.hash,
    issues,
    items,
    state: next,
    library: run.lib,
    drafts: run.drafts,
    texts,
    events: tc.log,
  };
}

