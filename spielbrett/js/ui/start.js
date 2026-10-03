// Start screen of the board page without a campaign: new game, continue,
// settings and rules. A new game goes to the server, which validates it
// against the world package and has the kernel CLI create the campaign; the
// board then opens it. The server's refusals come back as kernel-shaped
// issues and are labelled like every other refusal.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t, language, locale, onLanguage, setWorldLabels } from '../i18n/index.js';
import { server } from '../data/server.js';
import { worldLabelFiles } from '../data/game.js';
import { issueText } from '../data/adapter.js';
import { getAudio } from '../audio/index.js';
import { openEinstellungen } from './einstellungen.js';
import { openRegeln } from './regeln.js';

const SEED_MAX = 0xffffffff;
const DIFFICULTIES = ['easy', 'normal', 'hard'];

export const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

/** True for a seed the kernel keeps as is: an unsigned 32-bit integer. */
export const validSeed = (s) => /^\d{1,10}$/.test(String(s).trim()) && Number(s) <= SEED_MAX;

/**
 * Request body of POST /api/campaigns from the form state, or null while the
 * form cannot be sent. Rivals keep the package's template order.
 */
export function newGameBody(form, world) {
  if (!world || !validSeed(form.seed)) return null;
  const ids = world.templates.map((x) => x.id);
  if (!ids.includes(form.people)) return null;
  const rivals = ids.filter((id) => id !== form.people && form.rivals.includes(id));
  if (!rivals.length) return null;
  return {
    world: world.id,
    seed: Number(String(form.seed).trim()),
    people: form.people,
    rivals,
    difficulty: DIFFICULTIES.includes(form.difficulty) ? form.difficulty : 'normal',
    language: world.languages.includes(form.language) ? form.language : world.languages[0],
  };
}

/** Form defaults for a world: first template, all others as rivals, the UI language when the world narrates in it. */
export function defaultForm(world, uiLanguage, seed) {
  const people = world?.templates[0]?.id ?? null;
  return {
    seed: String(seed),
    people,
    rivals: (world?.templates ?? []).map((x) => x.id).filter((id) => id !== people),
    difficulty: world?.defaultDifficulty ?? 'normal',
    language: world?.languages.includes(uiLanguage) ? uiLanguage : world?.languages[0] ?? uiLanguage,
  };
}

export async function startScreen() {
  const root = document.getElementById('start');
  document.documentElement.dataset.shell = 'start';
  root.hidden = false;
  const [worlds, campaigns] = await Promise.all([
    server.worlds().catch(() => []),
    server.campaigns().catch(() => []),
  ]);
  const st = {
    worlds,
    campaigns,
    pane: campaigns.length ? 'continue' : 'new',
    world: worlds[0] ?? null,
    regeln: null,
    form: defaultForm(worlds[0], language(), randomSeed()),
    busy: false,
    issues: [],
  };

  async function loadWorld(world) {
    st.world = world;
    st.regeln = null;
    if (!world) return;
    const [regeln, files] = await Promise.all([
      server.pack(world.id, 'regeln.json').catch(() => null),
      worldLabelFiles(world.id).catch(() => []),
    ]);
    if (st.world !== world) return;
    st.regeln = regeln;
    if (files.length) setWorldLabels(files);
    getAudio()?.ambience(world.id);
  }

  const templateOf = (id) => st.regeln?.peopleTemplates?.find((x) => x.id === id) ?? null;
  const peopleLabel = (tpl) => t(`people.${tpl.id}`, tpl.name);

  function setPane(p) {
    st.pane = p;
    st.issues = [];
    render(`start-${p}`);
  }

  function nav() {
    const item = (id, iconName, label, onclick, extra = {}) => el('li', {}, el('button', {
      class: 'start-punkt', type: 'button', id: `start-${id}`, onclick, ...extra,
    }, icon(iconName, { size: 22 }), el('span', { text: label })));
    return el('nav', { class: 'start-menu', 'aria-label': t('shell.start.menu') },
      el('ul', { class: 'plain' },
        item('new', 'plus', t('shell.start.new'), () => setPane('new'), { 'aria-current': String(st.pane === 'new'), 'aria-controls': 'start-pane' }),
        item('continue', 'weiter', t('shell.start.continue'), () => { if (st.campaigns.length) setPane('continue'); }, {
          'aria-current': String(st.pane === 'continue'), 'aria-controls': 'start-pane', 'aria-disabled': st.campaigns.length ? null : 'true',
        }),
        item('settings', 'zahnrad', t('shell.start.settings'), () => openEinstellungen(), { 'aria-haspopup': 'dialog' }),
        item('rules', 'buch', t('shell.start.rules'), () => { if (st.regeln) openRegeln(st.regeln); }, { 'aria-haspopup': 'dialog', 'aria-disabled': st.regeln ? null : 'true' })));
  }

  // One group of native radios, so arrow keys and focus work as the platform does.
  function radios(name, legend, options, current, onPick, cls = 'start-wahl') {
    return el('fieldset', { class: `start-feld ${cls}` },
      el('legend', { text: legend }),
      el('div', { class: 'start-optionen' }, ...options.map((o) => el('label', { class: 'start-option', 'data-wert': o.id, lang: o.lang ?? null },
        el('input', { type: 'radio', name, value: o.id, id: `ng-${name}-${o.id}`, checked: o.id === current, onchange: () => onPick(o.id) }),
        ...(o.content ?? [el('span', { text: o.label })])))));
  }

  function newPane() {
    const w = st.world;
    if (!w) return [el('p', { class: 'start-leer', text: t('shell.start.no-worlds') })];
    const f = st.form;
    const seedOk = validSeed(f.seed);
    const body = newGameBody(f, w);
    const templates = w.templates.map((tpl) => {
      const full = templateOf(tpl.id);
      const plus = full?.identity?.wesensart?.plus?.tag;
      const minus = full?.identity?.wesensart?.minus?.tag;
      return {
        id: tpl.id,
        content: [
          el('span', { class: 'start-volk-name world', text: peopleLabel(tpl) }),
          el('span', { class: 'start-volk-art' },
            plus ? el('span', { class: 'up' }, icon('trendAuf', { size: 14, label: t('shell.new.strength') }), t(`tag.${plus}`, plus)) : null,
            minus ? el('span', { class: 'down' }, icon('trendAb', { size: 14, label: t('shell.new.weakness') }), t(`tag.${minus}`, minus)) : null),
        ],
      };
    });
    const others = w.templates.filter((x) => x.id !== f.people);
    return [
      st.worlds.length > 1 ? radios('welt', t('shell.new.world'), st.worlds.map((x) => ({ id: x.id, label: x.name })), w.id, async (id) => {
        const next = st.worlds.find((x) => x.id === id);
        st.form = defaultForm(next, language(), f.seed);
        await loadWorld(next);
        render(`ng-welt-${id}`);
      }) : null,
      radios('volk', t('shell.new.people'), templates, f.people, (id) => {
        f.people = id;
        f.rivals = w.templates.map((x) => x.id).filter((x) => x !== id);
        render(`ng-volk-${id}`);
      }, 'start-voelker'),
      el('fieldset', { class: 'start-feld' },
        el('legend', { text: t('shell.new.rivals') }),
        el('div', { class: 'start-optionen' }, ...others.map((tpl) => el('label', { class: 'start-option start-rivale', 'data-wert': tpl.id },
          el('input', {
            type: 'checkbox', id: `ng-rivale-${tpl.id}`, value: tpl.id, checked: f.rivals.includes(tpl.id),
            onchange: (e) => {
              const on = e.currentTarget.checked;
              const next = on ? [...f.rivals, tpl.id] : f.rivals.filter((x) => x !== tpl.id);
              // A campaign needs at least one rival, so the last one stays.
              if (!next.some((x) => x !== f.people)) { e.currentTarget.checked = true; return; }
              f.rivals = next;
              render(e.currentTarget.id);
            },
          }),
          icon('rivalen', { size: 16 }),
          el('span', { class: 'world', text: peopleLabel(tpl) }))))),
      radios('schwierigkeit', t('shell.new.difficulty'), (w.difficulties ?? DIFFICULTIES).map((d) => ({ id: d, label: t(`shell.difficulty.${d}`, d) })), f.difficulty, (d) => { f.difficulty = d; }),
      w.languages.length > 1 ? radios('erzaehlung', t('shell.new.narrative'), w.languages.map((l) => ({ id: l, lang: l, label: t(`board.lang.${l}`, l.toUpperCase()) })), f.language, (l) => { f.language = l; }) : null,
      el('div', { class: 'start-feld start-seed' },
        el('label', { for: 'ng-seed', text: t('shell.new.seed') }),
        el('div', { class: 'start-seed-zeile' },
          el('input', {
            id: 'ng-seed', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', value: f.seed,
            'aria-invalid': String(!seedOk), 'aria-describedby': seedOk ? null : 'ng-seed-fehler',
            oninput: (e) => {
              f.seed = e.currentTarget.value;
              const ok = validSeed(f.seed);
              e.currentTarget.setAttribute('aria-invalid', String(!ok));
              document.getElementById('ng-seed-fehler').hidden = ok;
              document.getElementById('ng-start').setAttribute('aria-disabled', String(!newGameBody(f, w) || st.busy));
            },
          }),
          el('button', {
            class: 'icon-btn', type: 'button', id: 'ng-seed-zufall', 'aria-label': t('shell.new.seed-random'), title: t('shell.new.seed-random'), 'data-wuerfeln': '',
            onclick: () => { f.seed = String(randomSeed()); render('ng-seed-zufall'); },
          }, icon('wuerfel', { size: 20 }))),
        el('p', { class: 'start-fehler-kurz', id: 'ng-seed-fehler', hidden: seedOk, text: t.fmt('shell.new.seed-invalid', { max: SEED_MAX }) })),
      el('div', { class: 'start-aktion' },
        el('button', {
          class: 'btn btn-primary btn-gross', type: 'submit', id: 'ng-start', 'aria-disabled': String(!body || st.busy), 'aria-busy': String(st.busy),
        }, icon(st.busy ? 'dauer' : 'weiter', { size: 20 }), t(st.busy ? 'shell.new.creating' : 'shell.new.start')),
        st.issues.length ? el('ul', { class: 'start-fehler plain', role: 'alert' }, ...st.issues.map((i) => el('li', {}, icon('warnung', { size: 16 }), issueText(i, t)))) : null),
    ];
  }

  async function create(e) {
    e.preventDefault();
    const body = newGameBody(st.form, st.world);
    if (!body || st.busy) return;
    st.busy = true;
    st.issues = [];
    render('ng-start');
    const res = await server.create(body);
    if (res?.id) {
      await server.activate(res.id).catch(() => null);
      location.search = `?campaign=${encodeURIComponent(res.id)}`;
      return;
    }
    st.busy = false;
    st.issues = res?.issues ?? [{ code: 'server', severity: 'error', path: '', message: '' }];
    getAudio()?.play('warning');
    render('ng-start');
  }

  function continuePane() {
    const date = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });
    const worldName = (id) => st.worlds.find((x) => x.id === id)?.name ?? id;
    return [el('ul', { class: 'kampagnen plain' }, ...st.campaigns.map((c) => {
      const ended = c.status === 'ended';
      const won = ended && c.outcome?.won === true;
      const when = c.updatedAt ? new Date(c.updatedAt) : null;
      return el('li', {}, el('button', {
        class: 'kampagne', type: 'button', id: `k-${c.id}`, 'data-campaign': c.id,
        onclick: async () => {
          await server.activate(c.id).catch(() => null);
          location.search = `?campaign=${encodeURIComponent(c.id)}`;
        },
      },
      el('span', { class: 'k-stand', 'data-stand': ended ? (won ? 'sieg' : 'niederlage') : 'laeuft' },
        icon(ended ? (won ? 'bestimmung' : 'nein') : 'weiter', { size: 20, label: ended ? t(won ? 'shell.end.victory' : 'shell.end.defeat') : t('shell.start.playing') })),
      el('span', { class: 'k-name world', text: c.people?.name ?? c.player }),
      el('span', { class: 'k-zeit', text: c.season ? t.fmt('board.time', { season: t(`season.${c.season}`, c.season), year: c.year }) : '' }),
      el('span', { class: 'k-meta' },
        el('span', { class: 'k-id', text: c.id }),
        el('span', { text: worldName(c.world) }),
        el('span', { text: t(`shell.difficulty.${c.difficulty}`, c.difficulty ?? '') }),
        c.language ? el('span', { class: 'k-sprache', lang: c.language, title: t(`board.lang.${c.language}`, c.language), text: c.language.toUpperCase() }) : null),
      when && !Number.isNaN(when.getTime()) ? el('time', { class: 'k-datum', datetime: c.updatedAt, text: date.format(when) }) : null));
    }))];
  }

  function render(focusId) {
    const pane = st.pane === 'new'
      ? el('form', { class: 'start-pane', id: 'start-pane', 'aria-labelledby': 'start-pane-titel', novalidate: true, onsubmit: create },
        el('h2', { id: 'start-pane-titel', text: t('shell.start.new') }), ...newPane())
      : el('section', { class: 'start-pane', id: 'start-pane', 'aria-labelledby': 'start-pane-titel' },
        el('h2', { id: 'start-pane-titel', text: t('shell.start.continue') }), ...continuePane());
    root.replaceChildren(el('div', { class: 'start-buehne' },
      el('header', { class: 'start-kopf' }, el('h1', { class: 'world', text: 'RealmCraft' })),
      nav(),
      pane));
    if (focusId) document.getElementById(focusId)?.focus();
  }

  await loadWorld(st.world);
  render();
  onLanguage(() => {
    const id = document.activeElement?.id || null;
    render(id);
  });
  document.documentElement.dataset.ready = 'true';
}
