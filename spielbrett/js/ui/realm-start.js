// Authored fiction stays editable; the server compiles only supported rules.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t, language } from '../i18n/index.js';
import { server } from '../data/server.js';
import { issueText } from '../data/adapter.js';
import { normalizeCreation } from '../../../engine/creation/realm.js';

const STORAGE = 'realmcraft.creation.v1';
const TAGS = ['erkundung', 'bau', 'verhandlung', 'angriff'];
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export function createRealmStart() {
  const root = el('div', { id: 'realm-flow', class: 'realm-flow' });
  let cached;
  try { cached = JSON.parse(sessionStorage.getItem(STORAGE)); } catch { /* Optional per-tab recovery. */ }
  const recovered = normalizeCreation(cached?.draft);
  const draft = recovered.issues.length ? null : recovered.draft;
  const st = {
    brief: { world: typeof cached?.brief?.world === 'string' ? cached.brief.world : '', people: typeof cached?.brief?.people === 'string' ? cached.brief.people : '' },
    draft, step: draft ? 'edit' : 'brief', preview: null, busy: false, error: '', issues: [],
    startKey: typeof cached?.startKey === 'string' ? cached.startKey : null,
    attempted: cached?.attempted === true, completed: false, fingerprint: typeof cached?.fingerprint === 'string' ? cached.fingerprint : null, created: null,
  };
  // Storage is a convenience. Every cached draft is validated again by the server.
  function persist() {
    try { if (st.completed) { sessionStorage.removeItem(STORAGE); return; } sessionStorage.setItem(STORAGE, JSON.stringify({ brief: st.brief, draft: st.draft, startKey: st.startKey, fingerprint: st.fingerprint, attempted: st.attempted })); } catch { /* The current form still works without storage. */ }
  }
  function changed() { st.attempted = false; st.preview = null; st.fingerprint = null; st.startKey = null; st.created = null; persist(); }
  function edit(group, key, value) { st.draft[group][key] = value; changed(); }
  const invalid = (path) => st.issues.some((issue) => issue.path === path || issue.path === '/draft' + path);
  function field(id, label, value, oninput, { multiline = false, max = 80, required = true, path } = {}) {
    const input = el(multiline ? 'textarea' : 'input', {
      id, ...(multiline ? { rows: 4 } : { type: 'text' }), value: multiline ? null : value, maxlength: max, required,
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
    finally { st.busy = false; persist(); render(focus ?? 'realm-step-title'); }
  }
  function briefForm() {
    return [
      el('p', { class: 'realm-intro', text: t('realm.overview') }),
      field('realm-world-brief', t('realm.world-brief'), st.brief.world, (v) => { st.brief.world = v; persist(); }, { multiline: true, max: 3000 }),
      field('realm-people-brief', t('realm.people-brief'), st.brief.people, (v) => { st.brief.people = v; persist(); }, { multiline: true, max: 3000 }),
      el('p', { class: 'realm-note', text: t('realm.draft-note') }),
      el('button', { class: 'btn btn-primary', type: 'submit', id: 'realm-draft' }, icon('chronist', { size: 18 }), t(st.busy ? 'realm.working' : 'realm.make-draft')),
    ];
  }
  function editForm() {
    const d = st.draft;
    const tagOptions = TAGS.map((key) => [key, t(`tag.${key}`, key)]);
    return [
      el('div', { class: 'realm-fields' },
        field('realm-world-name', t('realm.world-name'), d.world.name, (v) => edit('world', 'name', v), { path: '/world/name' }),
        field('realm-people-name', t('realm.people-name'), d.people.name, (v) => edit('people', 'name', v), { path: '/people/name' })),
      field('realm-world-description', t('realm.world-description'), d.world.description, (v) => { st.brief.world = v; edit('world', 'description', v); }, { multiline: true, max: 3000, path: '/world/description' }),
      field('realm-people-description', t('realm.people-description'), d.people.description, (v) => { st.brief.people = v; edit('people', 'description', v); }, { multiline: true, max: 3000, path: '/people/description' }),
      el('h4', { text: t('realm.foundation') }),
      el('p', { class: 'realm-note', text: t('realm.foundation-note') }),
      el('div', { class: 'realm-fields' },
        select('realm-landscape', t('realm.landscape'), ['highlands', 'riverlands', 'drylands'].map((k) => [k, t(`realm.landscape.${k}`)]), d.world.landscape, (v) => edit('world', 'landscape', v)),
        select('realm-way', t('realm.way'), ['nomadic', 'settled'].map((k) => [k, t(`realm.way.${k}`)]), d.people.way, (v) => edit('people', 'way', v)),
        select('realm-strength', t('realm.strength'), tagOptions, d.people.strength, (v) => edit('people', 'strength', v), '/people/strength'),
        select('realm-weakness', t('realm.weakness'), tagOptions, d.people.weakness, (v) => edit('people', 'weakness', v), '/people/weakness'),
        select('realm-goal', t('realm.goal'), ['survival', 'discovery', 'accord'].map((k) => [k, t(`realm.goal.${k}`)]), d.goal, (v) => { d.goal = v; changed(); }),
        select('realm-difficulty', t('shell.new.difficulty'), ['easy', 'normal', 'hard'].map((k) => [k, t(`shell.difficulty.${k}`)]), d.difficulty, (v) => { d.difficulty = v; changed(); })),
      el('details', { class: 'realm-details', 'data-realm-council': true },
        el('summary', { text: t('realm.characters') }),
        ...d.council.map((person, index) => el('div', { class: 'realm-fields' },
          field(`realm-council-${index}-name`, t.fmt('realm.council-name', { n: index + 1 }), person.name, (v) => { person.name = v; changed(); }, { max: 60, path: `/council/${index}/name` }),
          field(`realm-council-${index}-role`, t('realm.council-role'), person.role, (v) => { person.role = v; changed(); }, { max: 60 }))),
        field('realm-neighbour-name', t('realm.neighbour-name'), d.neighbour.name, (v) => edit('neighbour', 'name', v), { path: '/neighbour/name' }),
        field('realm-neighbour-description', t('realm.neighbour-description'), d.neighbour.description, (v) => edit('neighbour', 'description', v), { multiline: true, max: 1000, path: '/neighbour/description' }),
        field('realm-seed', t('shell.new.seed'), String(d.seed), (v) => { d.seed = /^\d{1,10}$/.test(v) ? Number(v) : v; changed(); }, { max: 10, path: '/seed' }),
        select('realm-language', t('shell.new.narrative'), [['de', 'Deutsch'], ['en', 'English']], d.language, (v) => { d.language = v; changed(); })),
      el('div', { class: 'realm-actions' },
        button('realm-back-brief', t('realm.back-brief'), () => go('brief')),
        el('button', { class: 'btn btn-primary', type: 'submit', id: 'realm-preview' }, icon('sicht', { size: 18 }), t(st.busy ? 'realm.working' : 'realm.show-preview'))),
    ];
  }
  function mapPreview(res) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = 'realm-map-preview'; svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('realm.map'));
    const points = (res.tiles ?? []).map((tile) => ({ tile, x: Math.sqrt(3) * (tile.q + tile.r / 2) * 12, y: tile.r * 18 }));
    if (!points.length) return svg;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    svg.setAttribute('viewBox', `${Math.min(...xs) - 16} ${Math.min(...ys) - 16} ${Math.max(...xs) - Math.min(...xs) + 32} ${Math.max(...ys) - Math.min(...ys) + 32}`);
    const home = res.view.map.settlements.find((s) => s.owner === res.view.people || s.people === res.view.people) ?? res.view.map.settlements[0];
    for (const { tile, x, y } of points) {
      const terrain = res.pack.welt.terrains.find((t) => t.id === tile.terrain);
      const hex = document.createElementNS(ns, 'polygon');
      hex.setAttribute('points', Array.from({ length: 6 }, (_, i) => { const a = (i * 60 - 30) * Math.PI / 180; return `${x + Math.cos(a) * 11.5},${y + Math.sin(a) * 11.5}`; }).join(' '));
      hex.setAttribute('fill', `var(--${terrain?.colour ?? 'terrain-unknown'})`);
      const title = document.createElementNS(ns, 'title'); title.textContent = terrain?.name ?? tile.terrain; hex.append(title); svg.append(hex);
      if (home?.tile === tile.key) {
        const marker = document.createElementNS(ns, 'circle'); marker.setAttribute('cx', x); marker.setAttribute('cy', y); marker.setAttribute('r', '5'); marker.setAttribute('class', 'realm-home-marker'); svg.append(marker);
      }
    }
    return svg;
  }
  function previewForm() {
    const res = st.preview, d = st.draft, view = res.view;
    const people = view.peoples[view.people];
    const labels = res.pack.labels.labels;
    const goal = res.pack.bestimmungen.items.find((item) => `${item.id}@${item.rev}` === people.bestimmung?.ref);
    return [el('section', { id: 'realm-review', class: 'realm-review' },
      el('div', { class: 'realm-preview-map' }, mapPreview(res), el('p', { class: 'realm-note', text: t('realm.map-note') })),
      el('div', { class: 'realm-preview-copy' },
        el('h4', { class: 'world', text: d.world.name }), el('p', { class: 'realm-prose', text: d.world.description }),
        el('h4', { class: 'world', text: people.name }), el('p', { class: 'realm-prose', text: d.people.description }),
        el('ul', { class: 'realm-resources plain' }, ...['nahrung', 'material', 'wissen'].map((key) => el('li', {}, icon(key, { size: 19 }), el('span', { text: labels[`resource.${key}`] ?? t(`resource.${key}`) }), el('strong', { text: people.resources[key] })))),
        el('p', { text: t.fmt('realm.population', { n: people.population.core }) }),
        el('ul', { class: 'realm-council plain' }, ...people.council.map((member) => el('li', {}, el('strong', { text: member.name }), el('span', { text: labels[`role.${member.role}`] ?? member.role })))),
        goal ? el('div', { class: 'realm-preview-goal' }, el('h4', { text: goal.name }), el('ul', {}, ...goal.milestones.map((m) => el('li', { text: m.text })))) : null)),
      el('div', { class: 'realm-actions' },
        button('realm-back', t('realm.back-edit'), () => go('edit')),
        button('realm-start', t(st.busy ? 'realm.starting' : 'realm.start'), start, true)),
      st.created ? button('realm-open-created', t('realm.open-created'), start) : null,
    ];
  }
  async function submit(e) {
    e.preventDefault();
    if (st.step === 'brief') {
      await run(async () => {
        const result = await server.realmDraft({ ...st.brief, language: language(), seed: newSeed() });
        if (!result?.ok) return feedback(result);
        if (st.draft) {
          st.draft.world.description = result.draft.world.description;
          st.draft.people.description = result.draft.people.description;
        } else st.draft = result.draft;
        changed(); st.step = 'edit';
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
      st.attempted = true; persist();
      const result = await server.realmStart(st.draft, st.fingerprint, st.startKey);
      if (!result?.ok || !result.id) { feedback(result); st.error = t('realm.start-failed') + ' ' + st.error; return; }
      st.created = result.id;
      const active = await server.activate(result.id);
      if (!active?.active) { st.error = t('realm.activation-failed'); return; }
      st.completed = true; persist();
      location.search = `?campaign=${encodeURIComponent(result.id)}`;
    }, 'realm-start');
  }
  function render(focus) {
    const detailsOpen = root.querySelector('details')?.open;
    const focusId = focus ?? (root.contains(document.activeElement) ? document.activeElement.id : null);
    root.dataset.step = st.step;
    root.setAttribute('aria-busy', String(st.busy));
    root.replaceChildren(...[
      el('ol', { id: 'realm-steps', class: 'realm-steps plain', 'aria-label': t('realm.steps') }, ...['brief', 'edit', 'preview'].map((step) => el('li', { 'aria-current': step === st.step ? 'step' : null, text: t(`realm.step.${step}`) }))),
      el('h3', { class: 'world', id: 'realm-step-title', tabindex: '-1', text: t(`realm.title.${st.step}`) }),
      el('form', { onsubmit: submit }, el('fieldset', { class: 'realm-body', disabled: st.busy }, ...(st.step === 'brief' ? briefForm() : st.step === 'edit' ? editForm() : previewForm()))),
      st.error ? el('p', { role: 'alert', class: 'save-warning', text: st.error }) : null].filter(Boolean));
    if (detailsOpen && root.querySelector('details')) root.querySelector('details').open = true;
    if (focusId) root.querySelector(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: focus !== 'realm-step-title' });
  }
  render();
  return { element: root, render };
}
