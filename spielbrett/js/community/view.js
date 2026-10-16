import { el, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';
import { renderOrders } from '../ui/leiste.js';
import { calendarOf } from '../data/kernel.js';
import { RULES } from '../../../engine/core/rules.js';
import { COMMUNITY_SIZE, COMMUNITY_ANCHORS, drawCommunity } from './scene.js';

const SPOTS = { food: 'nahrung', material: 'material', research: 'wissen', home: 'lager' };
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_KEYS = { spring: 'fruehling', summer: 'sommer', autumn: 'herbst', winter: 'winter' };

/** A local community illustration. The existing context remains the only editor. */
export class CommunityView {
  constructor(api) {
    this.api = api;
    this.root = document.getElementById('gemeinschaft');
    this.canvas = document.getElementById('gemeinschaft-bild');
    this.ctx = this.canvas.getContext('2d');
    this.mode = 'welt';
    this.season = '';
    this.selected = 'home';
    this.frame = null;
    this.lastFrame = 0;
    this.buttons = new Map();
    this.nav = document.getElementById('ansichten');
    this.supported = !api.game.pack.welt.creation;
    for (const mode of ['gemeinschaft', 'welt']) {
      if (mode === 'gemeinschaft' && !this.supported) continue;
      const btn = el('button', {
        type: 'button', class: 'ansicht-wahl', 'data-ansicht': mode,
        'aria-pressed': 'false', onclick: () => this.setMode(mode),
      }, icon(mode === 'welt' ? 'gelaende' : 'lager', { size: 18 }), el('span'));
      this.nav.append(btn);
    }
    for (const spot of COMMUNITY_ANCHORS) {
      const btn = el('button', {
        type: 'button', class: 'gemeinschaft-ort', 'data-community-spot': spot.id,
        'aria-controls': 'kontext', onclick: () => this.openSpot(spot.id),
      }, icon(SPOTS[spot.id], { size: 20 }),
      el('span', { class: 'gemeinschaft-ort-name' }),
      spot.id !== 'home' ? el('span', { class: 'gemeinschaft-arbeit' },
        el('span', { class: 'gemeinschaft-einheit' }),
        el('span', { class: 'gemeinschaft-zahl num', 'data-community-count': true })) : null);
      this.buttons.set(spot.id, btn);
      document.getElementById('gemeinschaft-orte').append(btn);
    }
    this.seasonSelect = document.getElementById('gemeinschaft-saison');
    this.seasonSelect.addEventListener('change', () => {
      if (!this.debug) return;
      this.season = this.seasonSelect.value;
      this.refresh();
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(document.getElementById('brett'));
    this.observer.observe(document.getElementById('kontext'));
    this.observer.observe(document.getElementById('ratsleiste'));
    this.motionObserver = new MutationObserver(() => this.refresh());
    this.motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    document.addEventListener('visibilitychange', () => this.changed());
    window.addEventListener('popstate', () => this.readMode());
    this.readMode();
  }

  readMode() {
    const params = new URLSearchParams(location.search);
    this.debug = params.get('debug') === '1';
    if (!this.debug) this.season = '';
    this.setMode(params.get('ansicht') === 'gemeinschaft' ? 'gemeinschaft' : 'welt', false);
  }

  setMode(mode, navigate = true) {
    if (!this.api.model.home || !this.supported) mode = 'welt';
    this.mode = mode;
    this.api.model.surface = mode;
    if (navigate) {
      const url = new URL(location.href);
      if (mode === 'gemeinschaft') url.searchParams.set('ansicht', mode);
      else url.searchParams.delete('ansicht');
      if (url.href !== location.href) history.pushState(null, '', url);
      this.api.setPanel(null);
    }
    document.getElementById('brett').dataset.ansicht = mode;
    this.root.hidden = mode !== 'gemeinschaft';
    document.getElementById('karte').hidden = mode === 'gemeinschaft';
    document.querySelector('.skip').href = mode === 'gemeinschaft' ? '#gemeinschaft-orte' : '#ortsliste';
    for (const btn of this.nav.querySelectorAll('button')) btn.setAttribute('aria-pressed', String(btn.dataset.ansicht === mode));
    this.refresh();
    renderOrders(this.api);
    if (mode === 'welt') this.api.view.changed();
  }

  openSpot(id) {
    this.selected = id;
    this.api.openHome();
    requestAnimationFrame(() => {
      const key = { food: RULES.food, material: RULES.material, research: 'research' }[id];
      const row = key && document.querySelector('[data-arbeit="' + key + '"]');
      if (row) {
        row.scrollIntoView({ block: 'nearest' });
        row.querySelector('button')?.focus({ preventScroll: true });
      }
      this.refresh();
    });
  }

  focus() {
    this.buttons.get(this.selected)?.focus({ preventScroll: true });
  }

  refresh() {
    const { game, model } = this.api;
    const people = game.view.peoples[game.pid];
    const assign = game.draft.assign ?? people.population.assigned ?? {};
    const calendar = calendarOf(game.env.regeln, game.view.turn);
    const actual = Object.keys(SEASON_KEYS).find((id) => SEASON_KEYS[id] === calendar.season) ?? (calendar.winter ? 'winter' : 'spring');
    const season = this.debug && this.season ? this.season : actual;
    this.seasonSelect.parentElement.hidden = !this.debug;
    this.state = {
      season: SEASONS.includes(season) ? season : 'spring',
      settled: model.home?.kind !== 'lager', clans: people.population.core,
      labour: { food: assign[RULES.food] ?? 0, material: assign[RULES.material] ?? 0, research: assign.research ?? 0 },
      seed: String(game.view.map.seed), reducedMotion: prefersReducedMotion(),
      herds: people.resources.herden ?? 0,
    };
    this.root.dataset.season = this.state.season;
    this.root.dataset.settled = String(this.state.settled);
    for (const [id, btn] of this.buttons) {
      btn.querySelector('.gemeinschaft-ort-name').textContent = id === 'home' ? t('settlement.' + model.home?.kind, t('board.community.manage-short')) : id === 'research' ? t('ui.forschung') : this.api.resourceName(id === 'food' ? RULES.food : RULES.material);
      const name = btn.querySelector('.gemeinschaft-ort-name').textContent;
      btn.setAttribute('aria-label', id === 'home'
        ? name + ', ' + t('board.community.home')
        : t('board.community.' + id) + ', ' + t('population.core') + ' ' + this.state.labour[id]);
      btn.setAttribute('aria-pressed', String(model.panel === 'kontext' && model.selection?.id === model.home?.id && this.selected === id));
      const count = btn.querySelector('[data-community-count]');
      if (count) {
        count.textContent = String(this.state.labour[id]);
        btn.querySelector('.gemeinschaft-einheit').textContent = t('population.core');
      }
    }
    for (const btn of this.nav.querySelectorAll('button')) btn.querySelector('span').textContent = t('board.community.view.' + btn.dataset.ansicht);
    document.getElementById('gemeinschaft-saison-label').textContent = t('board.community.season');
    // Relabel options without replacing the focused select.
    if (!this.seasonSelect.options.length) {
      for (const id of ['', ...SEASONS]) this.seasonSelect.append(el('option', { value: id }));
    }
    for (const opt of this.seasonSelect.options) opt.textContent = opt.value ? t('season.' + SEASON_KEYS[opt.value], opt.value) : t('board.community.season-current');
    this.seasonSelect.value = this.season;
    const note = document.getElementById('gemeinschaft-vorschau');
    note.hidden = !this.season;
    note.textContent = t('board.community.visual-only');
    this.nav.hidden = !model.home;
    this.resize();
  }

  resize() {
    if (this.mode !== 'gemeinschaft' || !this.state) return;
    const rect = this.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    const narrow = rect.width <= 760;
    let left = 0, right = 0, bottom = 0;
    const council = document.getElementById('ratsleiste').getBoundingClientRect();
    if (!narrow && council.width) left = Math.max(0, council.right - rect.left + 8);
    const panel = document.querySelector('.seitenpanel:not([hidden])');
    if (panel) {
      const box = panel.getBoundingClientRect();
      if (narrow) bottom = Math.max(0, rect.bottom - box.top);
      else right = Math.max(0, rect.right - box.left + 8);
    }
    const freeW = Math.max(1, rect.width - left - right);
    const freeH = Math.max(1, rect.height - bottom);
    // Narrow layouts keep their HTML controls in a fixed dock; the scene can crop.
    const scale = narrow ? Math.max(freeW / COMMUNITY_SIZE.width, freeH / COMMUNITY_SIZE.height) : Math.min(freeW / 1080, freeH / 690);
    this.transform = { scale, x: left + (freeW - COMMUNITY_SIZE.width * scale) / 2, y: (freeH - COMMUNITY_SIZE.height * scale) / 2 + 15 };
    if (!narrow) {
      for (const spot of COMMUNITY_ANCHORS) {
        const btn = this.buttons.get(spot.id);
        btn.style.setProperty('--spot-x', (this.transform.x + spot.x * scale) + 'px');
        btn.style.setProperty('--spot-y', (this.transform.y + spot.y * scale) + 'px');
      }
    }
    this.changed();
  }

  changed() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.mode !== 'gemeinschaft' || !this.state || document.hidden) return;
    this.frame = requestAnimationFrame((time) => this.draw(time));
  }

  draw(time) {
    this.frame = null;
    if (this.mode !== 'gemeinschaft' || document.hidden) return;
    if (time - this.lastFrame >= 1000 / 24 || this.state.reducedMotion) {
      this.lastFrame = time;
      const { ctx, canvas, dpr, transform: tr } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * tr.scale, 0, 0, dpr * tr.scale, dpr * tr.x, dpr * tr.y);
      drawCommunity(ctx, this.state, this.state.reducedMotion ? 0 : time / 1000);
    }
    if (!prefersReducedMotion()) this.frame = requestAnimationFrame((t) => this.draw(t));
  }
}
