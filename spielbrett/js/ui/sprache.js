// Language switch of the top bar: one radio per board language, each named in
// its own language. Lane F1 moves it into the settings later.

import { el } from '../dom.js';
import { LANGUAGES } from '../data/labels.js';
import { t, language, setLanguage } from '../i18n/index.js';

export function renderSprache() {
  const box = document.getElementById('sprache');
  if (!box) return;
  const current = language();
  const choose = (lang) => {
    setLanguage(lang);
    box.querySelector(`[data-lang="${lang}"]`)?.focus();
  };
  box.replaceChildren(...LANGUAGES.map((lang) => el('button', {
    class: 'sprache-wahl',
    type: 'button',
    role: 'radio',
    lang,
    'aria-checked': String(lang === current),
    'aria-label': t(`board.lang.${lang}`),
    title: t(`board.lang.${lang}`),
    tabindex: lang === current ? '0' : '-1',
    'data-lang': lang,
    onclick: () => choose(lang),
  }, lang.toUpperCase())));
  box.onkeydown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = LANGUAGES.indexOf(language());
    choose(LANGUAGES[(i + step + LANGUAGES.length) % LANGUAGES.length]);
  };
}
