// Settings of one viewer: board language, sound and motion. The language is
// kept by the i18n layer (realmcraft.settings), sound and the motion choice
// by the audio layer (realmcraft.audio); both persist per viewer and fall back
// to their defaults where the browser refuses storage.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t, language, setLanguage, onLanguage } from '../i18n/index.js';
import { LANGUAGES } from '../data/labels.js';
import { getAudio } from '../audio/index.js';
import { dialogHead } from './dialoge.js';

const VOLUMES = ['master', 'ambience', 'ui', 'stingers'];
const VOLUME_ICON = { master: 'ton', ambience: 'welt', ui: 'ziel', stingers: 'meilenstein' };

/** html data-motion of a motion choice: true reduced, false full, null follows the system. */
export const motionAttr = (reduced) => (reduced === true ? 'reduced' : reduced === false ? 'full' : null);

export function applyMotion(reduced) {
  const v = motionAttr(reduced);
  if (v) document.documentElement.dataset.motion = v;
  else delete document.documentElement.dataset.motion;
}

const systemReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sw(id, checked, label, iconName, onToggle) {
  return el('button', {
    class: 'schalter', type: 'button', role: 'switch', id, 'aria-checked': String(checked), 'aria-label': label, title: label,
    onclick: (e) => onToggle(e.currentTarget.getAttribute('aria-checked') !== 'true'),
  }, icon(iconName, { size: 18 }), el('span', { class: 'schalter-spur', 'aria-hidden': 'true' }, el('span', { class: 'schalter-knopf' })));
}

function languageGroup() {
  const current = language();
  const choose = (lang) => setLanguage(lang);
  const group = el('div', { class: 'sprachwahl', role: 'radiogroup', 'aria-labelledby': 'einst-sprache' }, ...LANGUAGES.map((lang) => el('button', {
    class: 'sprache-wahl',
    type: 'button',
    role: 'radio',
    lang,
    'aria-checked': String(lang === current),
    tabindex: lang === current ? '0' : '-1',
    'data-lang': lang,
    onclick: () => choose(lang),
  }, t(`board.lang.${lang}`))));
  group.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = LANGUAGES.indexOf(language());
    choose(LANGUAGES[(i + step + LANGUAGES.length) % LANGUAGES.length]);
  });
  return group;
}

function soundRows(audio) {
  const s = audio.settings;
  const rows = VOLUMES.map((ch) => {
    const id = `einst-vol-${ch}`;
    const pct = Math.round(s[ch] * 100);
    const out = el('output', { class: 'num', for: id, text: `${pct}` });
    const input = el('input', {
      type: 'range', id, min: '0', max: '100', step: '5', value: String(pct), 'data-volume': ch,
      'aria-valuetext': `${pct} %`,
      oninput: (e) => {
        const v = Number(e.currentTarget.value);
        audio.setVolume(ch, v / 100);
        out.textContent = String(v);
        e.currentTarget.setAttribute('aria-valuetext', `${v} %`);
      },
    });
    return el('div', { class: 'einst-zeile' },
      el('label', { for: id, class: 'einst-name' }, icon(VOLUME_ICON[ch], { size: 18 }), t(`shell.settings.volume.${ch}`)),
      input, out);
  });
  const mute = sw('einst-stumm', s.muted, t('shell.settings.mute'), s.muted ? 'stumm' : 'ton', (on) => {
    audio.setMuted(on);
    rerender();
    document.getElementById('einst-stumm')?.focus();
  });
  return [el('div', { class: 'einst-zeile' }, el('span', { class: 'einst-name' }, t('shell.settings.mute')), mute), ...rows];
}

let dlgRef = null;

function rerender() {
  if (dlgRef?.open) render(dlgRef);
}

function render(dlg) {
  const audio = getAudio();
  const reduced = audio?.settings.reduced ?? null;
  const motionOn = reduced ?? systemReduced();
  const motion = sw('einst-bewegung', motionOn, t('shell.settings.reduced-motion'), 'bewegung', (on) => {
    audio?.setReducedMotion(on);
    applyMotion(on);
    rerender();
    document.getElementById('einst-bewegung')?.focus();
  });
  dlg.replaceChildren(
    dialogHead(dlg, t('shell.settings.title'), 'zahnrad'),
    el('div', { class: 'overlay-body einstellungen' },
      el('section', { class: 'einst-gruppe', 'aria-labelledby': 'einst-sprache' },
        el('h3', { id: 'einst-sprache' }, icon('sprache', { size: 18 }), t('board.lang.group')),
        languageGroup()),
      audio ? el('section', { class: 'einst-gruppe', 'aria-labelledby': 'einst-ton' },
        el('h3', { id: 'einst-ton' }, icon('ton', { size: 18 }), t('shell.settings.sound')),
        ...soundRows(audio)) : null,
      el('section', { class: 'einst-gruppe', 'aria-labelledby': 'einst-anzeige' },
        el('h3', { id: 'einst-anzeige' }, icon('bewegung', { size: 18 }), t('shell.settings.display')),
        el('div', { class: 'einst-zeile' }, el('span', { class: 'einst-name' }, t('shell.settings.reduced-motion')), motion))));
}

/** Opens the settings dialog; it re-renders in place when the language changes. */
export function openEinstellungen() {
  const dlg = document.getElementById('dlg-einstellungen');
  if (!dlgRef) {
    dlgRef = dlg;
    onLanguage(() => {
      if (!dlg.open) return;
      render(dlg);
      dlg.querySelector(`[data-lang="${language()}"]`)?.focus();
    });
  }
  render(dlg);
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('h2')?.focus();
  return dlg;
}
