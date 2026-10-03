// A real campaign on the board: loads the player's projection, the pinned
// world package and the released campaign content, keeps the draft of the
// turn, previews every change with the kernel in the browser and stores the
// draft through the server. Server-Sent-Events bring the kernel's and the
// agents' writes (view, status, chronicle, report) back onto the board.

import { buildEnv, previewDraft, bandOf, eventBand, eventBands, SUCCESS_BANDS, sameWorld, CONTENT_FILES } from './kernel.js';
import { makeLabels, bandKey } from './labels.js';
import { server, turnStem } from './server.js';
import { adaptView, orderRows, resourceRows, messages, issueText, describeParams, seasonOf, boardPhase, volkOf, previewDeltas } from './adapter.js';
import { draftFor, withOrder, withoutOrder, withRoll, withMandate, withChoice, withAssign, openRolls } from './draft.js';
import { optionsFor, previewOption } from './options.js';

const SAVE_DELAY = 250;
// Agents of status.json and sources of log entries on the origin tokens the board colours by.
const ORIGIN = { kernel: 'kern', player: 'kern', world: 'welt', rival: 'rivalen', research: 'forschung', council: 'rat', chronicler: 'chronist', image: 'chronist' };
export const originOf = (agentOrSource) => {
  const a = String(agentOrSource ?? '').replace(/^agent:/, '');
  if (ORIGIN[a]) return ORIGIN[a];
  if (a.startsWith('judge')) return 'kern';
  const head = a.split(/[-.]/)[0];
  return ORIGIN[head] ?? 'kern';
};
const STEP_STATE = { waiting: 'wartet', running: 'arbeitet', done: 'fertig', failed: 'gescheitert' };
const POSITIONAL = new Set(['tile', 'settlement', 'unit', 'region']);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Campaign to open: ?campaign=<cid>, else the most recently updated one that is still playing. */
export function pickCampaign(index, wanted) {
  const rows = index?.campaigns ?? [];
  if (wanted) return rows.find((r) => r.id === wanted) ?? null;
  const playing = rows.filter((r) => r.status === 'playing');
  return [...(playing.length ? playing : rows)].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null;
}

async function loadPack(worldId) {
  const [welt, regeln, labels, ...content] = await Promise.all([
    server.pack(worldId, 'welt.json'), server.pack(worldId, 'regeln.json'), server.pack(worldId, 'labels.json'),
    ...CONTENT_FILES.map((f) => server.pack(worldId, `content/${f}.json`)),
  ]);
  return { welt, regeln, labels, ...Object.fromEntries(CONTENT_FILES.map((f, i) => [f, content[i]])) };
}

export async function createGame(model, { cid: wanted } = {}) {
  const index = await server.index();
  const row = pickCampaign(index, wanted);
  if (!row) return null;
  const cid = row.id;
  const pid = row.player;
  const pack = await loadPack(row.world);
  const t = makeLabels(pack.labels);
  const listeners = new Set();
  const g = {
    cid, pid, t, pack,
    view: null, env: null, world: null, draft: null, base: null,
    status: null, chronik: [], report: null, saving: null, saveError: null,
  };

  const emit = (kind, detail) => { for (const fn of listeners) fn(kind, detail); };

  async function loadView() {
    const [view, content] = await Promise.all([server.view(cid, pid), server.content(cid)]);
    g.view = view;
    g.env = buildEnv(pack, content?.items ?? []);
    g.world = g.env.world(view.map.seed);
  }

  /** Recomputes everything that depends on the draft: preview, stores, orders, council questions, messages. */
  function refresh() {
    g.base = previewDraft(g.view, g.env, g.draft);
    const { ressourcen, module } = resourceRows(g.view, g.env, t, g.base);
    model.ressourcen = ressourcen;
    model.module = module;
    model.orders = orderRows(g.view, g.env, t, g.draft, g.base, g.world);
    model.ratsfragen = councilQuestions();
    model.meldungen = [...messages(g.view, g.env, t, g.base), ...worldMessages()];
    model.slots = g.base.slots;
    model.offeneWuerfe = openRolls(g.draft, g.base);
    model.phase = boardPhase(g.view);
    model.kernPhase = g.view.phase;
  }

  function worldMessages() {
    const out = [];
    if (!sameWorld(g.view, g.env)) out.push({ id: 'welt-abweichung', art: 'warnung', titel: 'Weltpaket abweichend', text: 'Das Weltpaket im Browser ist nicht das, mit dem die Kampagne angelegt wurde. Vorschauen können abweichen.' });
    if (g.saveError) out.push({ id: 'entwurf-fehler', art: 'warnung', titel: 'Entwurf nicht gespeichert', text: g.saveError });
    if (model.zz) out.unshift({ id: 'weltgeschehen', art: 'welt', titel: t('view.weltgeschehen', 'Weltgeschehen'), text: 'Was Regelkern und Agenten in dieser Runde taten.' });
    return out;
  }

  function councilQuestions() {
    const own = g.view.peoples[pid];
    const name = (id) => own.council.find((m) => m.id === id)?.name ?? id;
    const out = [];
    g.draft.orders.forEach((o) => {
      const v = g.base.votes.find((x) => x.order === o.id);
      if (!v?.required) return;
      out.push({
        kind: 'vote',
        orderId: o.id,
        titel: `${t(`order.${o.type}`, o.type)}, ${describeParams(g.view, g.env, t, o, g.world)}`,
        regel: t(`governance.${v.rule}`, v.rule ?? ''),
        passed: v.passed,
        decree: g.draft.mandate?.[o.id] === 'decree',
        override: v.override === true,
        stimmen: v.votes.map((x) => ({ id: x.member, name: name(x.member), wahl: x.vote === 'yes' ? 'ja' : 'nein', grund: x.reason })),
      });
    });
    for (const c of g.view.pendingChoices ?? []) {
      const card = g.env.ereignis(c.event);
      out.push({
        kind: 'choice',
        choiceId: c.id,
        titel: card?.name ?? c.event,
        worum: card?.text ?? '',
        frist: seasonOf(g.env, t, c.deadline),
        gewaehlt: g.draft.choices?.[c.id] ?? null,
        optionen: c.options.map((id) => {
          const o = card?.options?.find((x) => x.id === id);
          return { id, text: o?.label ?? id, folgen: (o?.effects ?? []).map((e) => effectChip(e)).filter(Boolean) };
        }),
      });
    }
    return out;
  }

  // Declared effects of an event option, as the card states them.
  function effectChip(e) {
    if (e.op === 'resource.delta') return { icon: e.res, wert: signed(e.amount), text: t(`resource.${e.res}`, e.res) };
    if (e.op === 'loyalty.delta') return { icon: 'rat', wert: signed(e.amount), text: t('ui.loyalitaet', 'Loyalität') };
    if (Number.isInteger(e.amount)) return { icon: 'pfeil', wert: signed(e.amount), text: e.op };
    return { icon: 'pfeil', wert: '', text: e.op };
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    const sent = g.draft;
    g.saving = server.saveDraft(cid, pid, sent);
    const res = await g.saving;
    g.saving = null;
    const errors = (res.issues ?? []).filter((i) => i.severity === 'error' && i.code !== 'roll_missing');
    g.saveError = res.stored ? null : errors.map((i) => `${issueText(i, t)}: ${i.message}`).join(' ') || 'Der Server hat den Entwurf nicht angenommen.';
    if (sent === g.draft) {
      refresh();
      emit('draft');
    }
    return res;
  }

  function setDraft(next) {
    g.draft = next;
    refresh();
    emit('draft');
    scheduleSave();
  }

  // --- report, status, chronicle -------------------------------------------------

  async function loadStatus() {
    g.status = await server.status(cid);
    applyStatus();
  }

  function applyStatus() {
    const s = g.status;
    if (!s || s.turn !== g.view.turn && s.turn !== g.view.turn - 1) return;
    const kernelRow = model.zz?.agenten.find((a) => a.id === 'kern');
    const agenten = [];
    const rows = new Map();
    for (const step of s.steps ?? []) {
      const id = originOf(step.agent);
      const people = step.id.split('-').slice(1).join('-');
      const name = `${t(`agent.${step.agent}`, step.agent)}${people && people !== 'all' && g.view.peoples[people] ? `, ${g.view.peoples[people].name}` : ''}`;
      const row = {
        id, step: step.id, name, status: STEP_STATE[step.state] ?? step.state, taetigkeit: step.summary ?? '',
        results: (step.proposals ?? []).map((p) => ({
          cls: p.verdict === 'accepted' ? 'angenommen' : p.verdict === 'rejected' ? 'abgelehnt' : 'info',
          icon: p.verdict === 'accepted' ? 'ja' : p.verdict === 'rejected' ? 'nein' : 'dauer',
          titel: p.title,
          budget: p.budget ? `Netto ${p.budget.net}, Stufe ${p.budget.tier}` : null,
          grund: p.reason ?? t(`verdict.${p.verdict}`, p.verdict),
          info: `${t(`verdict.${p.verdict}`, p.verdict)}${p.budget ? `, Wirkung ${p.budget.effect}, Preis ${p.budget.price}` : ''}`,
        })),
      };
      rows.set(step.id, row);
      agenten.push(row);
    }
    ensureZz();
    model.zz.agenten = [kernelRow ?? kernelAgent(), ...agenten];
    emit('status');
  }

  function kernelAgent() {
    return { id: 'kern', name: t('agent.kernel', 'Regelkern'), status: g.view.phase === 'resolving' ? 'arbeitet' : 'fertig', taetigkeit: '', results: [] };
  }

  function ensureZz() {
    if (model.zz) return;
    const von = seasonOf(g.env, t, g.view.phase === 'agents' ? Math.max(0, g.view.turn - 1) : g.view.turn);
    const nach = seasonOf(g.env, t, g.view.phase === 'agents' ? g.view.turn : g.view.turn + 1);
    model.zz = { phase: boardPhase(g.view), phaseTitel: phaseTitle(), von, nach, agenten: [kernelAgent()] };
  }

  function phaseTitle() {
    const p = g.view.phase;
    if (g.view.status === 'ended') return 'Die Partie ist beendet';
    if (p === 'resolving') return `${t('phase.resolving', 'Auflösung')}, Befehle sind gesperrt`;
    if (p === 'agents') return `${t('phase.agents', 'Agentenrunde')}, planen ist frei, der Zug öffnet danach`;
    return `${t('phase.planning', 'Planung')}, Befehle sind frei`;
  }

  /** Round report of a resolved turn: kernel results, store changes and map highlights by origin. */
  async function loadReport(turn) {
    const rep = await server.report(cid, turnStem(turn));
    if (!rep) return;
    g.report = rep;
    ensureZz();
    const kern = model.zz.agenten.find((a) => a.id === 'kern') ?? kernelAgent();
    kern.status = 'fertig';
    kern.taetigkeit = '';
    const res = [];
    for (const o of rep.sections?.orders ?? []) {
      const ok = o.status === 'executed' && (!o.band || SUCCESS_BANDS.includes(o.band));
      res.push({ cls: o.status === 'rejected' ? 'abgelehnt' : ok ? 'angenommen' : 'info', icon: ok ? 'ja' : 'nein', titel: t(`order.${o.type}`, o.type), grund: o.band ? t(bandKey(o.band), o.band) : o.status, info: o.band ? t(bandKey(o.band), o.band) : '' });
    }
    const verlauf = new Map();
    const highlights = [];
    const now = performance.now();
    for (const e of rep.events ?? []) {
      const ch = e.change;
      const field = ch?.field ?? '';
      if (e.target.kind === 'people' && e.target.id === pid && field.startsWith('resources.') && Number.isInteger(ch.delta)) {
        const k = field.slice('resources.'.length);
        (verlauf.get(k) ?? verlauf.set(k, []).get(k)).push({ delta: ch.delta, grund: kindText(e) });
      }
      if (!POSITIONAL.has(e.target.kind) || !ch) continue;
      const pos = positionOf(e);
      if (pos) highlights.push({ q: pos.q, r: pos.r, origin: originOf(e.source), t0: now, event: e.id });
    }
    for (const r of [...model.ressourcen, ...model.module]) r.verlauf = verlauf.get(r.key) ?? [];
    for (const [k, list] of verlauf) {
      const total = list.reduce((a, x) => a + x.delta, 0);
      if (total) res.push({ cls: 'info', icon: k, titel: t(`resource.${k}`, k), delta: total, info: list.map((x) => `${x.grund} ${signed(x.delta)}`).join(', ') });
    }
    kern.results = res;
    if (!model.zz.agenten.includes(kern)) model.zz.agenten.unshift(kern);
    model.highlights = highlights;
    emit('report', { turn, highlights });
  }

  function kindText(e) {
    const k = e.kind;
    if (k.startsWith('economy.harvest')) return 'Ernte';
    if (k.startsWith('economy.flow')) return 'Zufluss';
    if (k.startsWith('economy.consumption') || k.startsWith('economy.consume')) return 'Verbrauch';
    if (k.startsWith('economy.upkeep')) return 'Unterhalt';
    if (k === 'order.cost') return 'Befehlskosten';
    if (k.startsWith('event')) return 'Ereignis';
    return e.reason;
  }

  function positionOf(e) {
    const id = e.target.id;
    const tile = (k) => { const [q, r] = String(k).split(',').map(Number); return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null; };
    if (e.target.kind === 'tile') return tile(id);
    if (e.target.kind === 'settlement') {
      const s = g.view.map.settlements.find((x) => x.id === id);
      return s ? tile(s.tile) : null;
    }
    if (e.target.kind === 'unit') {
      for (const p of Object.values(g.view.peoples)) {
        const u = (p.units ?? []).find((x) => x.id === id);
        if (u) return tile(u.tile);
      }
      return null;
    }
    if (e.target.kind === 'region') {
      const known = Object.keys(g.view.map.known[pid] ?? {}).find((k) => { const p = tile(k); return p && g.world && regionOfTile(p) === id; });
      return known ? tile(known) : null;
    }
    return null;
  }
  const regionOfTile = (p) => g.world.tiles?.[`${p.q},${p.r}`]?.regionId ?? null;

  async function loadChronik() {
    const res = await server.chronik(cid);
    g.chronik = res?.entries ?? [];
  }

  // --- full rebuild on a new view --------------------------------------------------

  function rebuild({ keepDraft = true } = {}) {
    if (!keepDraft || !g.draft || g.draft.turn !== g.view.turn) g.draft = draftFor(g.view, null);
    const base = previewDraft(g.view, g.env, g.draft);
    Object.assign(model, adaptView({ view: g.view, env: g.env, t, world: g.world, preview: base, chronik: g.chronik }));
    model.world = g.world;
    model.pack = g.env.welt;
    model.terrains = new Map(g.env.welt.terrains.map((x) => [x.id, x]));
    model.resourceDefs = new Map(g.env.welt.resources.map((x) => [x.key, x]));
    model.regionNames = new Map();
    refresh();
  }

  await loadView();
  const stored = await server.draft(cid);
  g.draft = draftFor(g.view, stored?.draft ?? null);
  await loadChronik();
  rebuild();
  if (g.view.phase !== 'planning') await loadStatus();
  if (g.view.phase === 'agents' && g.view.turn > 0) await loadReport(g.view.turn - 1);

  // --- SSE ----------------------------------------------------------------------------

  let viewTimer = 0;
  server.subscribe(cid, (ev, data) => {
    if (ev === 'view') {
      clearTimeout(viewTimer);
      viewTimer = setTimeout(async () => {
        const before = { turn: g.view.turn, phase: g.view.phase, rev: g.view.rev };
        await loadView();
        if (g.view.rev === before.rev && g.view.turn === before.turn) return;
        rebuild();
        if (g.view.phase !== before.phase && model.zz) {
          model.zz.phase = boardPhase(g.view);
          model.zz.phaseTitel = phaseTitle();
        }
        emit('view', { before, after: { turn: g.view.turn, phase: g.view.phase } });
        if (g.view.turn !== before.turn) await loadReport(before.turn);
      }, 80);
    } else if (ev === 'status') {
      loadStatus();
    } else if (ev === 'chronik') {
      const known = new Set(g.chronik.map((c) => c.file));
      loadChronik().then(() => {
        const fresh = g.chronik.filter((c) => !known.has(c.file));
        model.chronik = adaptView({ view: g.view, env: g.env, t, world: g.world, preview: g.base, chronik: g.chronik }).chronik;
        for (const f of fresh) emit('chronik', model.chronik.find((c) => c.turn === f.turn));
      });
    } else if (ev === 'report') {
      const turn = Number(/T(\d{4})/.exec(data.file)?.[1]);
      if (Number.isInteger(turn)) loadReport(turn);
    }
  });

  // --- actions --------------------------------------------------------------------------

  const ctx = () => ({ view: g.view, env: g.env, t, draft: g.draft, base: g.base, world: g.world });

  Object.assign(g, {
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    optionsFor: (target) => optionsFor(ctx(), target),
    previewOption: (opt, extra) => previewOption(ctx(), { type: opt.type, params: opt.params }, extra),
    /** Adds an option to the draft; with a probe the roll arrives together with the order. */
    addOption(opt, { roll = null, extra = {} } = {}) {
      let next = withOrder(g.draft, { type: opt.type, params: opt.params }, extra);
      if (roll) next = withRoll(next, roll.probe, roll.value, roll.fingerprint);
      setDraft(next);
      return next.orders.at(-1).id;
    },
    removeOrder(id) {
      const row = model.orders.find((o) => o.id === id);
      setDraft(withoutOrder(g.draft, id, row?.probe ?? null));
    },
    roll(probeId, value, fingerprint) { setDraft(withRoll(g.draft, probeId, value, fingerprint)); },
    setMandate(orderId, on) { setDraft(withMandate(g.draft, orderId, on)); },
    setChoice(choiceId, option) { setDraft(withChoice(g.draft, choiceId, option)); },
    setAssign(assign) { setDraft(withAssign(g.draft, assign)); },
    /** Preview of the draft with a change, for hover previews outside the order list. */
    previewWith: (change) => previewDraft(g.view, g.env, change(g.draft)),
    /** Store changes at season end that a change of the draft would cause (D15). */
    deltasWith: (change) => previewDeltas(g.view, g.base, previewDraft(g.view, g.env, change(g.draft))),
    /** Outcome of every face of the d10 against a probe, from the kernel's band rule. */
    faces(probe) {
      return Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        if (probe.target == null) {
          const band = eventBand(n, eventBands(g.env));
          return { n, band, label: t(`eventband.${band}`, String(band)), gut: band >= 3 };
        }
        const band = bandOf(n, probe.modTotal, probe.target);
        return { n, band, label: t(bandKey(band), band), gut: SUCCESS_BANDS.includes(band) };
      });
    },
    canSeal() {
      if (g.view.status === 'ended') return { ok: false, reason: 'Partie beendet' };
      if (g.view.phase === 'resolving') return { ok: false, reason: t('phase.resolving', 'Auflösung') };
      if (g.view.phase === 'agents') return { ok: false, reason: t('phase.agents', 'Agentenrunde') };
      const errors = g.base.issues.filter((i) => i.severity === 'error');
      if (errors.length) return { ok: false, reason: issueText(errors[0], t), issues: errors };
      if (model.offeneWuerfe.length) return { ok: false, reason: 'Würfe offen', rolls: model.offeneWuerfe };
      return { ok: true };
    },
    async seal() {
      clearTimeout(saveTimer);
      if (g.saving) await g.saving;
      const stored = await save();
      if (!stored.stored) return { ok: false, issues: stored.issues };
      const res = await server.seal(cid);
      if (res.ok) {
        model.zz = null;
        ensureZz();
        model.zz.phase = 'A';
        model.zz.phaseTitel = `${t('phase.resolving', 'Auflösung')}, Befehle sind gesperrt`;
        model.zz.agenten = [{ ...kernelAgent(), status: 'arbeitet', taetigkeit: 'wartet auf die Spielleitung (/zug)' }];
        model.phase = 'A';
        emit('sealed', res);
      }
      return res;
    },
    peopleVolk: (id) => volkOf(g.view, id),
  });
  return g;
}
