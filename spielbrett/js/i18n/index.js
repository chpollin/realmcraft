// The board's current language. Every module reads labels through t, which
// stays the same function when the language changes, so modules may keep it.
// The choice is a per-viewer setting in localStorage under realmcraft.settings
// (field language), shared with the other settings of the board; without
// storage the board renders in the default language and the choice lasts for
// the page.

import { makeLabels, LANGUAGES, DEFAULT_LANGUAGE } from '../data/labels.js';

const SETTINGS_KEY = 'realmcraft.settings';

function readSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function storeLanguage(lang) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), language: lang }));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

const stored = readSettings().language;
let current = LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
let worldFiles = [];
let active = makeLabels(worldFiles, current);
const listeners = new Set();

export const t = (key, fallback) => active(key, fallback);
t.has = (key) => active.has(key);
t.fmt = (key, params, fallback) => active.fmt(key, params, fallback);
t.plural = (key, n, params) => active.plural(key, n, params);

export const language = () => current;

/** Locale for Intl and localeCompare. */
export const locale = () => (current === 'de' ? 'de-DE' : 'en-GB');

/** The world package's label files, labels.json first, then any labels.<lang>.json. */
export function setWorldLabels(files) {
  worldFiles = files;
  active = makeLabels(worldFiles, current);
}

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return;
  current = lang;
  active = makeLabels(worldFiles, current);
  storeLanguage(lang);
  applyStatic();
  for (const fn of listeners) fn(lang);
}

/** Runs fn(lang) after every change of language; returns the unsubscribe. */
export function onLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const ATTRS = ['aria-label', 'title', 'aria-roledescription'];

/**
 * Labels of the static page: data-t sets the text, data-t-<attr> one of
 * ATTRS. Also sets the document language and title.
 */
export function applyStatic(root = document) {
  document.documentElement.lang = current;
  document.title = t('board.page.title');
  for (const node of root.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
  for (const attr of ATTRS) {
    for (const node of root.querySelectorAll(`[data-t-${attr}]`)) node.setAttribute(attr, t(node.getAttribute(`data-t-${attr}`)));
  }
}
