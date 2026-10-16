// Authored fiction stays editable; the server compiles only supported rules.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t, language } from '../i18n/index.js';
import { server } from '../data/server.js';
import { issueText } from '../data/adapter.js';
import { normalizeCreation } from '../../../engine/creation/realm.js';
import { landscapeArt, svgNode } from './realm-art.js';

const STORAGE = 'realmcraft.creation.v1';
const validGeneration = (value) => value === null || (typeof value === 'string' && /^[0-9a-f]{32}$/.test(value));
const TAGS = ['erkundung', 'bau', 'verhandlung', 'angriff'];
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const WORKSHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const draftFields = ['brief', 'draft', 'step', 'preview', 'error', 'issues', 'startKey', 'attempted', 'fingerprint', 'created'];

export function createRealmStart({ generation } = {}) {
  const root = el('div', { id: 'realm-flow', class: 'realm-flow' });
  let cached;
  try { cached = JSON.parse(sessionStorage.getItem(STORAGE)); } catch { /* Optional per-tab recovery. */ }
  const cachedGeneration = cached?.generation ?? null;
  const observed = validGeneration(generation);
  // A confirmed library reset invalidates old attempts. Failed reads and empty
  // campaign lists do not establish a reset and must preserve unfinished work.
  if (observed && validGeneration(cachedGeneration) && generation !== cachedGeneration) {
    cached = null;
    try { sessionStorage.removeItem(STORAGE); } catch { /* Recovery storage is optional. */ }
  }
  const cacheGeneration = observed ? generation : cached && validGeneration(cachedGeneration) ? cachedGeneration : 'unknown';
  const attempt = cached?.chatAttempt;
  const chatAttempt = attempt && WORKSHOP_ID.test(attempt.id ?? '') && WORKSHOP_ID.test(attempt.startKey ?? '')
    && Number.isSafeInteger(attempt.rev) && attempt.rev >= 0 && /^[0-9a-f]{16}$/.test(attempt.fingerprint ?? '')
    && !normalizeCreation(attempt.draft).issues.length ? copy(attempt) : null;
  const recovered = normalizeCreation(cached?.draft);
  const draft = recovered.issues.length ? null : recovered.draft;
  const st = {
    brief: { world: typeof cached?.brief?.world === 'string' ? cached.brief.world : '', people: typeof cached?.brief?.people === 'string' ? cached.brief.people : '' },
    draft, step: draft ? 'edit' : 'brief', preview: null, busy: false, error: '', issues: [],
    startKey: typeof cached?.startKey === 'string' ? cached.startKey : null,
    attempted: cached?.attempted === true, completed: false, fingerprint: typeof cached?.fingerprint === 'string' ? cached.fingerprint : null, created: null,
    mode: cached?.mode === 'manual' ? 'manual' : 'chat', workshopId: WORKSHOP_ID.test(cached?.workshopId ?? '') ? cached.workshopId : null,
    workshop: null, prompt: '', notice: '', promptOpen: false, previewRev: null, chatAttempt,
  };
  let manual = Object.fromEntries(draftFields.map((key) => [key, copy(st[key])]));
  let active = false, disposed = false, reading = false, timer = null, readEpoch = 0;
  if (st.mode === 'chat') Object.assign(st, { draft: null, step: 'chat', preview: null, error: '', issues: [], startKey: null, attempted: false, fingerprint: null });
  const binding = () => st.mode === 'chat' && st.workshop ? { id: st.workshop.id, rev: st.attempted && st.chatAttempt?.id === st.workshop.id ? st.chatAttempt.rev : st.workshop.rev } : undefined;
  const isVisible = () => active && !disposed && document.visibilityState !== 'hidden';
  const validWorkshop = (value) => value?.format === 'realmcraft-workshop' && value.version === 1
    && value.id === st.workshopId && validGeneration(value.generation) && Number.isSafeInteger(value.rev) && value.rev >= 0
    && ['de', 'en'].includes(value.language) && ['draft', 'starting', 'started'].includes(value.state)
    && (value.draft === null || !normalizeCreation(value.draft).issues.length)
    && ['questions', 'ruleIdeas'].every((key) => Array.isArray(value[key]) && value[key].every((item) => typeof item === 'string'))
    && (value.start === null || (WORKSHOP_ID.test(value.start?.key ?? '') && /^[0-9a-f]{16}$/.test(value.start?.fingerprint ?? '')
      && (value.start.campaign === null || typeof value.start.campaign === 'string')));
  function acceptWorkshop(result) {
    const next = result?.workshop;
    if (!validWorkshop(next) || typeof result.prompt !== 'string') throw new Error('Invalid workshop response');
    if (st.workshop && next.rev < st.workshop.rev) return;
    const differs = JSON.stringify(next) !== JSON.stringify(st.workshop) || result.prompt !== st.prompt;
    if (!differs) return;
    st.workshop = next; st.prompt = result.prompt;
    if (st.mode === 'chat') {
      let pending = st.chatAttempt?.id === next.id ? st.chatAttempt : null;
      // A newer unfrozen revision proves the old CAS-bound start cannot reserve.
      if (pending && next.state === 'draft' && next.rev > pending.rev) {
        pending = null; st.chatAttempt = null; st.attempted = false;
        st.error = ''; st.notice = t('realm.chat.changed');
      }
      const target = next.start ? next.draft : pending?.draft ?? next.draft;
      const sameDraft = JSON.stringify(st.draft) === JSON.stringify(target);
      // A local attempt is kept even before its POST is visible to the reader.
      if (pending && JSON.stringify(pending.draft) !== JSON.stringify(next.draft)) st.error = t('realm.start-failed');
      if (st.preview && st.previewRev !== next.rev) {
        st.preview = null; st.previewRev = null; st.step = 'chat';
        st.notice = t('realm.chat.changed');
      }
      st.draft = copy(target);
      if (next.start) {
        st.startKey = next.start.key; st.fingerprint = next.start.fingerprint;
        st.attempted = true; st.created = next.start.campaign;
        st.chatAttempt = { id: next.id, rev: next.rev, draft: copy(next.draft), startKey: next.start.key, fingerprint: next.start.fingerprint };
      } else if (pending) {
        st.startKey = pending.startKey; st.fingerprint = pending.fingerprint; st.attempted = true;
      } else if (!sameDraft) {
        st.startKey = null; st.fingerprint = null; st.attempted = false; st.created = null;
      }
    }
    persist(); render();
  }
  async function refreshWorkshop() {
    if (!isVisible() || !st.workshopId || reading || st.mode !== 'chat') return;
    reading = true;
    const epoch = readEpoch;
    try {
      const result = await server.workshop(st.workshopId);
      if (epoch !== readEpoch || !isVisible() || st.mode !== 'chat') return;
      acceptWorkshop(result);
      if (st.error === t('realm.chat.refresh-failed')) { st.error = ''; render(); }
    } catch {
      if (epoch === readEpoch && isVisible() && st.mode === 'chat' && !st.busy) {
        st.error = t('realm.chat.refresh-failed'); render();
      }
    } finally { reading = false; }
  }
  function watch() {
    if (!timer && st.workshopId && !disposed) timer = setInterval(refreshWorkshop, 1500);
  }
  function setActive(value) {
    if (active !== value) readEpoch++;
    active = value;
    if (isVisible()) { watch(); void refreshWorkshop(); }
  }
  function visibility() { readEpoch++; if (isVisible()) void refreshWorkshop(); }
  document.addEventListener('visibilitychange', visibility);
  function dispose() {
    disposed = true; active = false; readEpoch++;
    clearInterval(timer); timer = null;
    document.removeEventListener('visibilitychange', visibility);
  }
  function mode(next) {
    if (st.busy || next === st.mode) return;
    readEpoch++;
    if (st.mode === 'manual') manual = Object.fromEntries(draftFields.map((key) => [key, copy(st[key])]));
    st.mode = next; st.notice = ''; st.error = ''; st.issues = [];
    if (next === 'manual') Object.assign(st, copy(manual));
    else {
      const pending = st.chatAttempt?.id === st.workshopId ? st.chatAttempt : null;
      Object.assign(st, { draft: copy(pending?.draft ?? st.workshop?.draft), step: 'chat', preview: null, previewRev: null, startKey: pending?.startKey ?? st.workshop?.start?.key ?? null,
        fingerprint: pending?.fingerprint ?? st.workshop?.start?.fingerprint ?? null, attempted: Boolean(pending || st.workshop?.start), created: st.workshop?.start?.campaign ?? null });
      void refreshWorkshop();
    }
    persist(); render('realm-step-title');
  }
  async function copyPrompt() {
    await run(async () => {
      if (!st.workshop) {
        st.workshopId ??= crypto.randomUUID(); persist();
        const result = await server.createWorkshop(st.workshopId, language());
        if (disposed) return;
        if (!result?.ok) return feedback(result);
        acceptWorkshop(result); watch();
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(st.prompt);
        if (!disposed) st.notice = t('realm.chat.copied');
      } catch {
        st.promptOpen = true; st.notice = t('realm.chat.copy-fallback');
      }
    }, 'realm-copy-prompt');
  }
  async function workshopPreview() {
    if (!st.workshop?.draft || st.workshop.questions.length || st.workshop.ruleIdeas.length) return;
    const source = binding(), draft = copy(st.draft), epoch = readEpoch;
    await run(async () => {
      const result = await server.realmPreview(draft, source);
      if (disposed || epoch !== readEpoch || st.mode !== 'chat' || st.workshop?.rev !== source.rev) return;
      if (!result?.ok) return feedback(result);
      st.preview = result; st.previewRev = source.rev; st.step = 'preview';
      if (!st.attempted) {
        if (st.fingerprint !== result.fingerprint) st.startKey = crypto.randomUUID();
        st.startKey ??= crypto.randomUUID(); st.fingerprint = result.fingerprint;
      }
    });
  }
  function workshopForm() {
    const w = st.workshop, d = w ? st.draft : null;
    const ready = d && !w.questions.length && !w.ruleIdeas.length;
    const facts = d ? [
      [t('realm.landscape'), t(`realm.landscape.${d.world.landscape}`)],
      [t('realm.way'), t(`realm.way.${d.people.way}`)],
      [t('realm.goal'), t(`realm.goal.${d.goal}`)],
      [t('realm.strength'), t(`tag.${d.people.strength}`)],
      [t('realm.weakness'), t(`tag.${d.people.weakness}`)],
    ] : [];
    return [
      el('p', { class: 'realm-intro', text: t('realm.chat.overview') }),
      el('div', { class: 'realm-chat-entry' }, button('realm-copy-prompt', t(st.busy ? 'realm.chat.loading' : 'realm.chat.copy'), copyPrompt, true)),
      st.notice ? el('p', { id: 'realm-chat-notice', class: 'realm-note', role: 'status', text: st.notice }) : null,
      st.prompt ? el('details', { class: 'realm-details', id: 'realm-chat-prompt', open: st.promptOpen, ontoggle: (e) => { st.promptOpen = e.currentTarget.open; } },
        el('summary', { text: t('realm.chat.prompt') }), el('pre', { id: 'realm-prompt-text', class: 'realm-prompt', tabindex: '0', text: st.prompt })) : null,
      d ? el('section', { id: 'realm-shared-draft', class: 'realm-shared-draft', 'aria-labelledby': 'realm-shared-title' },
        el('div', { class: 'realm-shared-heading' }, el('h4', { id: 'realm-shared-title', text: t('realm.chat.draft') }), el('p', { class: 'realm-note', id: 'realm-workshop-revision', text: t.fmt('realm.chat.revision', { rev: w.rev }) })),
        el('div', { class: 'realm-shared-worlds' },
          el('section', {}, sectionTitle('welt', d.world.name), el('p', { class: 'realm-prose', text: d.world.description })),
          el('section', {}, sectionTitle('volk', d.people.name), el('p', { class: 'realm-prose', text: d.people.description }))),
        el('dl', { class: 'realm-shared-facts' }, ...facts.map(([name, value]) => el('div', {}, el('dt', { text: name }), el('dd', { text: value })))))
        : el('p', { class: 'realm-note', id: 'realm-chat-empty', text: t('realm.chat.empty') }),
      ...[['questions', 'realm.chat.questions'], ['ruleIdeas', 'realm.chat.rule-ideas']].map(([key, label]) => w?.[key]?.length ? el('section', { class: 'realm-open-items', 'data-workshop-items': key },
        el('h4', { text: t(label) }), el('ul', {}, ...w[key].map((item) => el('li', { text: item })))) : null),
      d && !ready ? el('p', { class: 'realm-note', text: t('realm.chat.blocked') }) : null,
      w?.state === 'starting' ? el('p', { class: 'realm-note', text: t('realm.chat.starting') }) : null,
      w?.state === 'started' ? el('p', { class: 'realm-note', text: t('realm.chat.started') }) : null,
      el('div', { class: 'realm-actions' },
        button('realm-open-manual', t('realm.chat.manual'), () => mode('manual')),
        w && st.attempted ? button('realm-workshop-retry', t(w.state === 'started' ? 'realm.chat.resume' : 'realm.chat.retry'), start, true)
          : ready ? button('realm-workshop-preview', t('realm.chat.preview'), workshopPreview, true) : null),
    ].filter(Boolean);
  }
  // Native validation must reveal required controls inside a closed disclosure.
  root.addEventListener('invalid', (event) => {
    const details = event.target.closest('details');
    if (details) {
      details.open = true;
      event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
      event.target.focus({ preventScroll: true });
    }
  }, true);
  // Storage is a convenience. Every cached draft is validated again by the server.
  function persist() {
    try { if (st.completed) { sessionStorage.removeItem(STORAGE); return; } const saved = st.mode === 'manual' ? st : manual; sessionStorage.setItem(STORAGE, JSON.stringify({ generation: cacheGeneration, mode: st.mode, workshopId: st.workshopId, chatAttempt: st.chatAttempt, brief: saved.brief, draft: saved.draft, startKey: saved.startKey, fingerprint: saved.fingerprint, attempted: saved.attempted })); } catch { /* The current form still works without storage. */ }
  }
  function changed() { st.attempted = false; st.preview = null; st.fingerprint = null; st.startKey = null; st.created = null; persist(); refreshFolio(); }
  function edit(group, key, value) { st.draft[group][key] = value; changed(); }
  const invalid = (path) => st.issues.some((issue) => issue.path === path || issue.path === '/draft' + path);
  function field(id, label, value, oninput, { multiline = false, max = 80, required = true, path, placeholder } = {}) {
    const input = el(multiline ? 'textarea' : 'input', {
      id, ...(multiline ? { rows: 4 } : { type: 'text' }), value: multiline ? null : value, maxlength: max, required, placeholder,
      'aria-invalid': path ? String(invalid(path)) : null,
      oninput: (e) => oninput(e.currentTarget.value),
    });
    if (multiline) input.value = value ?? '';
    return el('div', { class: 'realm-field' }, el('label', { for: id, text: label }), input);
  }
  function select(id, label, options, value, onchange, path) {
    return el('div', { class: 'realm-field' }, el('label', { for: id, text: label }),
      el('select', { id, 'aria-invalid': path ? String(invalid(path)) : null, onchange: (e) => onchange(e.currentTarget.value) }, ...options.map(([key, title]) => el('option', { value: key, selected: key === value, text: title }))));
  }
  const button = (id, label, onclick, primary = false) => el('button', { id, class: `btn${primary ? ' btn-primary' : ''}`, type: 'button', onclick, text: label });
  function go(step) { st.step = step; st.error = ''; st.issues = []; persist(); render('realm-step-title'); }
  function feedback(result) {
    st.issues = result?.issues ?? [];
    st.error = st.issues.map((i) => {
      if (i.params?.reason === 'distinct-traits') return t('realm.traits-invalid');
      if (i.path === '/seed' || i.path === '/draft/seed') return t('realm.seed-invalid');
      const fields = { '/world/name': 'realm.world-name', '/people/name': 'realm.people-name', '/world/description': 'realm.world-description', '/people/description': 'realm.people-description', '/neighbour/name': 'realm.neighbour-name', '/neighbour/description': 'realm.neighbour-description' };
      const path = i.path?.replace(/^\/draft(?=\/)/, '');
      const council = /^\/council\/(\d)\/(name|role)$/.exec(path ?? '');
      const label = fields[path] ? t(fields[path]) : council ? (council[2] === 'name' ? t.fmt('realm.council-name', { n: Number(council[1]) + 1 }) : t('realm.council-role')) : null;
      return label ? label + ': ' + t('realm.field-invalid') : issueText(i, t);
    }).join(' ') || t('realm.failed');
  }
  async function run(task, focus) {
    if (st.busy) return;
    st.busy = true; st.error = ''; st.issues = []; render();
    try { await task(); } catch { st.error = t('realm.failed'); }
    finally { st.busy = false; if (!disposed) { persist(); render(st.error ? 'realm-error' : focus ?? 'realm-step-title'); } }
  }
  function sectionTitle(iconName, label) {
    return el('h4', { class: 'realm-section-title' }, icon(iconName, { size: 23 }), label);
  }
  function folio() {
    const d = st.draft;
    const facts = d ? [
      ['welt', t('realm.landscape'), t(`realm.landscape.${d.world.landscape}`)],
      ['volk', t('realm.way'), t(`realm.way.${d.people.way}`)],
      ['bestimmung', t('realm.goal'), t(`realm.goal.${d.goal}`)],
    ] : [];
    return el('aside', { id: 'realm-folio', class: 'realm-folio', 'aria-label': t('realm.folio') },
      el('figure', { class: 'realm-folio-art' }, landscapeArt(d?.world.landscape),
        el('figcaption', { text: t('realm.schematic') })),
      el('div', { class: 'realm-folio-copy' },
        el('h4', { class: 'world', text: d?.world.name || t('realm.folio.empty') }),
        d ? el('p', { class: 'realm-folio-people', text: d.people.name }) : el('p', { class: 'realm-note', text: t('realm.folio.begin') }),
        d ? el('dl', { class: 'realm-folio-facts' }, ...facts.map(([glyph, name, value]) => el('div', {},
          el('dt', {}, icon(glyph, { size: 18 }), name), el('dd', { text: value })))) : null));
  }
  function refreshFolio() {
    const old = root.querySelector('#realm-folio');
    if (old) old.replaceWith(folio());
    for (const kind of ['landscape', 'way']) {
      const target = root.querySelector(`#realm-${kind}-effect`);
      if (target && st.draft) target.textContent = t(`realm.${kind}.${kind === 'landscape' ? st.draft.world.landscape : st.draft.people.way}.effect`);
    }
  }
  function briefForm() {
    return [
      el('p', { class: 'realm-intro', text: t('realm.overview') }),
      el('div', { class: 'realm-workspace' }, el('div', { class: 'realm-editor' },
        el('section', { class: 'realm-author-section' }, sectionTitle('welt', t('realm.section.world')),
          field('realm-world-brief', t('realm.world-brief'), st.brief.world, (v) => { st.brief.world = v; persist(); }, { multiline: true, max: 3000, placeholder: t('realm.world-example') })),
        el('section', { class: 'realm-author-section' }, sectionTitle('volk', t('realm.section.people')),
          field('realm-people-brief', t('realm.people-brief'), st.brief.people, (v) => { st.brief.people = v; persist(); }, { multiline: true, max: 3000, placeholder: t('realm.people-example') })),
        el('p', { class: 'realm-note', text: t('realm.draft-note') })), folio()),
      el('div', { class: 'realm-actions' },
        el('button', { class: 'btn btn-primary', type: 'submit', id: 'realm-draft' }, t(st.busy ? 'realm.working' : 'realm.make-draft'), icon('weiter', { size: 19 }))),
    ];
  }
  function editForm() {
    const d = st.draft;
    const tagOptions = TAGS.map((key) => [key, t(`tag.${key}`, key)]);
    return [
      el('div', { class: 'realm-workspace' }, el('div', { class: 'realm-editor' },
        el('section', { class: 'realm-author-section' }, sectionTitle('welt', t('realm.section.world')),
          field('realm-world-name', t('realm.world-name'), d.world.name, (v) => edit('world', 'name', v), { path: '/world/name' }),
          field('realm-world-description', t('realm.world-description'), d.world.description, (v) => { st.brief.world = v; edit('world', 'description', v); }, { multiline: true, max: 3000, path: '/world/description' })),
        el('section', { class: 'realm-author-section' }, sectionTitle('volk', t('realm.section.people')),
          field('realm-people-name', t('realm.people-name'), d.people.name, (v) => edit('people', 'name', v), { path: '/people/name' }),
          field('realm-people-description', t('realm.people-description'), d.people.description, (v) => { st.brief.people = v; edit('people', 'description', v); }, { multiline: true, max: 3000, path: '/people/description' })),
        el('section', { class: 'realm-author-section realm-foundations' }, sectionTitle('entwicklungen', t('realm.foundation')),
          el('p', { class: 'realm-note', text: t('realm.foundation-note') }),
          el('div', { class: 'realm-fields' },
            el('div', { class: 'realm-choice' }, select('realm-landscape', t('realm.landscape'), ['highlands', 'riverlands', 'drylands'].map((k) => [k, t(`realm.landscape.${k}`)]), d.world.landscape, (v) => edit('world', 'landscape', v)),
              el('p', { class: 'realm-choice-effect', id: 'realm-landscape-effect', text: t(`realm.landscape.${d.world.landscape}.effect`) })),
            el('div', { class: 'realm-choice' }, select('realm-way', t('realm.way'), ['nomadic', 'settled'].map((k) => [k, t(`realm.way.${k}`)]), d.people.way, (v) => edit('people', 'way', v)),
              el('p', { class: 'realm-choice-effect', id: 'realm-way-effect', text: t(`realm.way.${d.people.way}.effect`) })),
            select('realm-strength', t('realm.strength'), tagOptions, d.people.strength, (v) => edit('people', 'strength', v), '/people/strength'),
            select('realm-weakness', t('realm.weakness'), tagOptions, d.people.weakness, (v) => edit('people', 'weakness', v), '/people/weakness'),
            select('realm-goal', t('realm.goal'), ['survival', 'discovery', 'accord'].map((k) => [k, t(`realm.goal.${k}`)]), d.goal, (v) => { d.goal = v; changed(); }),
            select('realm-difficulty', t('shell.new.difficulty'), ['easy', 'normal', 'hard'].map((k) => [k, t(`shell.difficulty.${k}`)]), d.difficulty, (v) => { d.difficulty = v; changed(); }))),
        el('details', { class: 'realm-details', 'data-realm-council': true },
          el('summary', {}, icon('rat', { size: 19 }), t('realm.characters')),
          el('div', { class: 'realm-details-content' },
            ...d.council.map((person, index) => el('div', { class: 'realm-fields' },
              field(`realm-council-${index}-name`, t.fmt('realm.council-name', { n: index + 1 }), person.name, (v) => { person.name = v; changed(); }, { max: 60, path: `/council/${index}/name` }),
              field(`realm-council-${index}-role`, t('realm.council-role'), person.role, (v) => { person.role = v; changed(); }, { max: 60, path: `/council/${index}/role` }))),
            field('realm-neighbour-name', t('realm.neighbour-name'), d.neighbour.name, (v) => edit('neighbour', 'name', v), { path: '/neighbour/name' }),
            field('realm-neighbour-description', t('realm.neighbour-description'), d.neighbour.description, (v) => edit('neighbour', 'description', v), { multiline: true, max: 1000, path: '/neighbour/description' }),
            el('div', { class: 'realm-fields' },
              field('realm-seed', t('shell.new.seed'), String(d.seed), (v) => { d.seed = /^\d{1,10}$/.test(v) ? Number(v) : v; changed(); }, { max: 10, path: '/seed' }),
              select('realm-language', t('shell.new.narrative'), [['de', 'Deutsch'], ['en', 'English']], d.language, (v) => { d.language = v; changed(); }))))), folio()),
      el('div', { class: 'realm-actions' },
        button('realm-back-brief', t('realm.back-brief'), () => go('brief')),
        el('button', { class: 'btn btn-primary', type: 'submit', id: 'realm-preview' }, t(st.busy ? 'realm.working' : 'realm.show-preview'), icon('sicht', { size: 19 }))),
    ];
  }
  function mapPreview(res) {
    const svg = svgNode('svg', { id: 'realm-map-preview', role: 'img', 'aria-label': t('realm.map') });
    const points = (res.tiles ?? []).map((tile) => ({ tile, x: Math.sqrt(3) * (tile.q + tile.r / 2) * 12, y: tile.r * 18 }));
    if (!points.length) return svg;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    svg.setAttribute('viewBox', `${Math.min(...xs) - 21} ${Math.min(...ys) - 21} ${Math.max(...xs) - Math.min(...xs) + 42} ${Math.max(...ys) - Math.min(...ys) + 42}`);
    const home = res.view.map.settlements.find((s) => s.owner === res.view.people || s.people === res.view.people) ?? res.view.map.settlements[0];
    const terrainLayer = svgNode('g'), marks = svgNode('g', { class: 'realm-map-marks' });
    for (const { tile, x, y } of points) {
      const terrain = res.pack.welt.terrains.find((t) => t.id === tile.terrain);
      const hex = svgNode('polygon', {
        points: Array.from({ length: 6 }, (_, i) => { const a = (i * 60 - 30) * Math.PI / 180; return `${x + Math.cos(a) * 11.8},${y + Math.sin(a) * 11.8}`; }).join(' '),
        fill: `var(--${terrain?.colour ?? 'terrain-unknown'})`, class: 'realm-map-hex',
      });
      const title = svgNode('title'); title.textContent = terrain?.name ?? tile.terrain;
      hex.append(title); terrainLayer.append(hex);
      const glyph = ['gebirge', 'gipfel', 'bergwald'].includes(tile.terrain) ? 'M-6 4 0-5 6 4M0-5 0 4'
        : tile.terrain === 'wald' ? 'M-4 3 0-5 4 3ZM0 3V6' : null;
      if (glyph) marks.append(svgNode('path', { d: glyph, transform: `translate(${x} ${y})`, class: 'realm-map-terrain-mark' }));
      if (tile.river) marks.append(svgNode('path', { d: 'M-8 0Q-4-5 0 0T8 0', transform: `translate(${x} ${y + 3})`, class: 'realm-map-river' }));
      if (home?.tile === tile.key) {
        marks.append(svgNode('g', { transform: `translate(${x} ${y})` },
          svgNode('circle', { r: 8, class: 'realm-home-marker' }),
          svgNode('path', { d: 'M-4 3 0-4 4 3ZM0-4V3', class: 'realm-map-home-glyph' })));
      }
    }
    svg.append(terrainLayer, marks);
    return svg;
  }
  function mapLegend(res) {
    const terrains = [...new Set(res.tiles.map((tile) => tile.terrain))].map((id) => res.pack.welt.terrains.find((terrain) => terrain.id === id)).filter(Boolean);
    return el('ul', { class: 'realm-map-legend plain', role: 'list', 'aria-label': t('realm.map.legend') },
      el('li', {}, icon('lager', { size: 17 }), t('realm.map.home')),
      ...terrains.map((terrain) => el('li', {}, el('span', { class: 'realm-map-swatch', 'aria-hidden': 'true', style: { '--legend-colour': `var(--${terrain.colour ?? 'terrain-unknown'})` } }), terrain.name)),
      res.tiles.some((tile) => tile.river) ? el('li', {}, el('span', { class: 'realm-map-river-swatch', 'aria-hidden': 'true' }), t('realm.map.river')) : null);
  }
  function previewForm() {
    const res = st.preview, d = st.draft, view = res.view;
    const people = view.peoples[view.people];
    const labels = res.pack.labels.labels;
    const goal = res.pack.bestimmungen.items.find((item) => `${item.id}@${item.rev}` === people.bestimmung?.ref);
    return [st.mode === 'chat' ? el('p', { class: 'realm-note', id: 'realm-preview-revision', text: t.fmt('realm.chat.revision', { rev: st.previewRev }) }) : null, el('section', { id: 'realm-review', class: 'realm-review' },
      el('div', { class: 'realm-preview-map' },
        el('h4', { class: 'world realm-preview-world', text: d.world.name }),
        el('figure', { class: 'realm-actual-map' }, mapPreview(res), el('figcaption', { class: 'realm-note', text: t('realm.map-note') })),
        mapLegend(res), el('p', { class: 'realm-prose', text: d.world.description })),
      el('div', { class: 'realm-preview-copy' },
        el('h4', { class: 'world', text: people.name }), el('p', { class: 'realm-prose', text: d.people.description }),
        el('section', { class: 'realm-starting-state' }, sectionTitle('lager', t('realm.starting-state')),
          el('ul', { class: 'realm-resources plain', role: 'list' }, ...['nahrung', 'material', 'wissen'].map((key) => el('li', {}, icon(key, { size: 23 }), el('strong', { text: people.resources[key] }), el('span', { text: labels[`resource.${key}`] ?? t(`resource.${key}`) })))),
          el('p', { class: 'realm-population' }, icon('volk', { size: 19 }), t.fmt('realm.population', { n: people.population.core }))),
        el('section', {}, sectionTitle('rat', t('realm.council')),
          el('ul', { class: 'realm-council plain', role: 'list' }, ...people.council.map((member) => el('li', {}, el('span', { class: 'realm-council-mark', 'aria-hidden': 'true', text: member.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('') }), el('div', {}, el('strong', { text: member.name }), el('span', { text: labels[`role.${member.role}`] ?? member.role })))))),
        goal ? el('section', { class: 'realm-preview-goal' }, sectionTitle('bestimmung', goal.name), el('ul', {}, ...goal.milestones.map((m) => el('li', { text: m.text })))) : null)),
      el('div', { class: 'realm-actions' },
        button('realm-back', t(st.mode === 'chat' ? 'realm.chat.back' : 'realm.back-edit'), () => go(st.mode === 'chat' ? 'chat' : 'edit')),
        el('button', { id: 'realm-start', class: 'btn btn-primary', type: 'button', onclick: start }, t(st.busy ? 'realm.starting' : 'realm.start'), icon('weiter', { size: 19 }))),
      st.created ? button('realm-open-created', t('realm.open-created'), start) : null,
    ];
  }
  async function submit(e) {
    e.preventDefault();
    if (st.mode !== 'manual') return;
    if (st.step === 'brief') {
      await run(async () => {
        const result = await server.realmDraft({ ...st.brief, language: language(), seed: newSeed() });
        if (!result?.ok) return feedback(result);
        if (!st.draft) {
          st.draft = result.draft;
          changed();
        } else if (st.draft.world.description !== result.draft.world.description || st.draft.people.description !== result.draft.people.description) {
          st.draft.world.description = result.draft.world.description;
          st.draft.people.description = result.draft.people.description;
          changed();
        }
        st.step = 'edit';
      });
    } else if (st.step === 'edit') {
      await run(async () => {
        const result = await server.realmPreview(st.draft);
        if (!result?.ok) return feedback(result);
        st.draft = result.draft; st.preview = result; st.step = 'preview';
        if (!st.attempted) {
          if (st.fingerprint !== result.fingerprint) st.startKey = crypto.randomUUID();
          st.startKey ??= crypto.randomUUID(); st.fingerprint = result.fingerprint;
        }
      });
    }
  }
  async function start() {
    await run(async () => {
      const source = binding(), draft = copy(st.draft), fingerprint = st.fingerprint, key = st.startKey;
      if (!draft || !fingerprint || !key) return;
      st.attempted = true;
      if (source) st.chatAttempt = { ...source, draft, fingerprint, startKey: key };
      persist();
      const result = await server.realmStart(draft, fingerprint, key, source);
      if (disposed) return;
      if (!result?.ok || !result.id) {
        if (source && st.workshop?.state === 'draft' && st.workshop.rev > source.rev) { st.error = ''; st.notice = t('realm.chat.changed'); return; }
        feedback(result); st.error = t('realm.start-failed') + ' ' + st.error; return;
      }
      st.created = result.id;
      const active = await server.activate(result.id);
      if (!active?.active) { st.error = t('realm.activation-failed'); return; }
      st.completed = true; persist();
      location.search = `?campaign=${encodeURIComponent(result.id)}`;
    }, 'realm-start');
  }
  function render(focus) {
    if (disposed) return;
    const detailsOpen = root.querySelector('details')?.open || st.issues.some((issue) => /\/(council|neighbour|seed)(?:\/|$)/.test(issue.path ?? ''));
    const focusId = focus ?? (root.contains(document.activeElement) ? document.activeElement.id : null);
    root.dataset.step = st.step;
    root.dataset.mode = st.mode;
    root.setAttribute('aria-busy', String(st.busy));
    root.replaceChildren(...[
      st.mode === 'manual' ? el('ol', { id: 'realm-steps', class: 'realm-steps plain', 'aria-label': t('realm.steps'), role: 'list' }, ...['brief', 'edit', 'preview'].map((step, index) => el('li', { 'aria-current': step === st.step ? 'step' : null, 'data-complete': ['brief', 'edit', 'preview'].indexOf(st.step) > index ? 'true' : null }, el('span', { class: 'realm-step-mark', 'aria-hidden': 'true', text: String(index + 1) }), el('span', { text: t(`realm.step.${step}`) })))) : null,
      el('h3', { class: 'world', id: 'realm-step-title', tabindex: '-1', text: t(st.step === 'chat' ? 'realm.chat.title' : `realm.title.${st.step}`) }),
      st.error ? el('p', { id: 'realm-error', role: 'alert', tabindex: '-1', class: 'save-warning', text: st.error }) : null,
      el('form', { onsubmit: submit }, el('fieldset', { class: 'realm-body', disabled: st.busy }, ...(st.step === 'chat' ? workshopForm() : st.step === 'brief' ? briefForm() : st.step === 'edit' ? editForm() : previewForm())))].filter(Boolean));
    if (st.mode === 'manual') root.append(button('realm-return-chat', t('realm.chat.return'), () => mode('chat')));
    if (detailsOpen && st.mode === 'manual' && root.querySelector('details')) root.querySelector('details').open = true;
    if (focusId) root.querySelector(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: focus !== 'realm-error' });
    if (focus === 'realm-step-title') root.closest('.start')?.scrollTo({ top: 0, behavior: 'instant' });
  }
  render();
  return { element: root, render, setActive, dispose };
}
