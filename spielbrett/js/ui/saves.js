// Named snapshots share the server/CLI save contract. Draft barriers belong to
// the game data layer so neither this dialog nor navigation can race a write.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t, locale, onLanguage } from '../i18n/index.js';
import { server } from '../data/server.js';
import { issueText } from '../data/adapter.js';
import { dialogHead } from './dialoge.js';

let current;

export function saveFailure(issues) {
  return [...new Set((issues ?? []).filter((i) => i.severity !== 'warning').map((i) => {
    const reason = i.params?.reason;
    if (i.code === 'cli.locked') return t('shell.saves.busy');
    if (reason === 'run-active' || i.code === 'cli.turn_running') return t('shell.saves.running');
    if (reason === 'save-needs-planning') return t('shell.saves.save-blocked');
    if (reason === 'load-needs-planning') return t('shell.saves.load-blocked');
    return issueText(i, t);
  }))].join(' ') || t('issue.server');
}

/** Open a campaign's snapshots from the board or the start screen. */
export function openSaves({ cid, name, mode = 'load', game = null, campaign = null, onLoaded }) {
  const dlg = document.getElementById('dlg-spielstaende');
  if (dlg.open) return dlg;
  const session = {};
  current = session;
  const st = { saves: [], loading: true, busy: false, label: '', selected: null, error: '', notice: '', uncertain: false };
  const active = () => current === session && dlg.open;
  const phase = () => game?.view ?? campaign;
  const blocked = (save = false) => {
    const view = phase();
    if (save && view?.status === 'ended') return t('shell.saves.ended');
    if (view?.status !== 'ended' && view?.phase && view.phase !== 'planning') {
      return t(save ? 'shell.saves.save-blocked' : 'shell.saves.load-blocked');
    }
    return '';
  };
  const labelOf = (save) => save.label || t('shell.saves.autosave');
  const timeOf = (save) => t.fmt('board.time', { season: t(`season.${save.season}`, save.season), year: save.year });
  const dateOf = (save) => {
    const date = new Date(save.created);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  function meta(save) {
    return el('span', { class: 'save-meta' },
      el('span', { text: timeOf(save) }),
      dateOf(save) ? el('time', { datetime: save.created, text: dateOf(save) }) : null);
  }

  function render(focusId) {
    if (current !== session) return;
    const focused = focusId ?? (dlg.contains(document.activeElement) ? document.activeElement.id : null);
    const scroll = dlg.querySelector('.overlay-body')?.scrollTop ?? 0;
    const header = dialogHead(dlg, t(st.selected ? 'shell.saves.confirm-title' : 'shell.saves.title'), 'speichern', name);
    header.querySelector('button').disabled = st.busy || st.uncertain;
    dlg.setAttribute('aria-busy', String(st.busy));
    dlg.dataset.closeBlocked = String(st.uncertain);
    const reason = blocked(mode === 'save');
    const content = st.uncertain ? [
      el('p', { role: 'alert', class: 'save-warning', text: t('shell.saves.uncertain') }),
      el('button', { class: 'btn btn-primary', type: 'button', id: 'save-reconcile', onclick: onLoaded }, icon('laden', { size: 18 }), t('shell.saves.reconcile')),
    ] : st.selected ? [
      el('p', { class: 'save-name', text: labelOf(st.selected) }), meta(st.selected),
      el('p', { text: t('shell.saves.backup-note') }),
      el('div', { class: 'save-actions' },
        el('button', { class: 'btn', type: 'button', id: 'save-load-cancel', disabled: st.busy, onclick: () => { const id = `load-${st.selected.slot}`; st.selected = null; st.error = ''; render(id); } }, t('shell.saves.cancel')),
        el('button', { class: 'btn btn-primary', type: 'button', id: 'save-load-confirm', disabled: st.busy || Boolean(blocked()), onclick: load },
          icon(st.busy ? 'dauer' : 'laden', { size: 18 }), t(st.busy ? 'shell.saves.restoring' : 'shell.saves.load'))),
    ] : [
      mode === 'save' ? el('form', { class: 'save-form', onsubmit: save },
        el('label', { for: 'save-label', text: t('shell.saves.name') }),
        el('div', { class: 'save-actions' },
          el('input', { id: 'save-label', type: 'text', required: true, maxlength: 80, autocomplete: 'off', value: st.label, disabled: st.busy, oninput: (e) => { st.label = e.currentTarget.value; e.currentTarget.setCustomValidity(''); } }),
          el('button', { class: 'btn btn-primary', type: 'submit', id: 'save-create', disabled: st.busy || Boolean(blocked(true)) }, icon(st.busy ? 'dauer' : 'speichern', { size: 18 }), t(st.busy ? 'shell.saves.saving' : 'shell.saves.save')))) : null,
      st.loading ? el('p', { role: 'status', text: t('shell.saves.fetching') }) : null,
      !st.loading && !st.saves.length && !st.error ? el('p', { text: t('shell.saves.empty') }) : null,
      el('ul', { class: 'save-list plain' }, ...st.saves.map((entry) => el('li', { 'data-save-slot': entry.slot },
        el('div', { class: 'save-description' }, el('span', { class: 'save-name', text: labelOf(entry) }), meta(entry)),
        el('button', { class: 'btn', type: 'button', id: `load-${entry.slot}`, 'data-load-slot': entry.slot, disabled: st.busy || Boolean(blocked()),
          'aria-label': t.fmt('shell.saves.load-named', { name: labelOf(entry) }), onclick: () => { st.selected = entry; st.error = ''; st.notice = ''; render('save-load-cancel'); } },
          icon(entry.auto ? 'praxis' : 'laden', { size: 18 }), t('shell.saves.load'))))),
    ];
    dlg.replaceChildren(header, el('div', { class: 'overlay-body saves', 'aria-busy': String(st.busy) },
      reason ? el('p', { class: 'save-warning', text: reason }) : null,
      ...content,
      st.notice ? el('p', { role: 'status', class: 'save-notice', text: st.notice }) : null,
      st.error ? el('div', { class: 'save-warning', role: 'alert' }, el('p', { text: st.error }),
        st.loading ? null : el('button', { class: 'btn', type: 'button', id: 'save-retry', disabled: st.busy, onclick: () => fetchList() }, t('shell.saves.refresh'))) : null));
    dlg.querySelector('.overlay-body').scrollTop = scroll;
    if (dlg.open && focused) (document.getElementById(focused) ?? dlg.querySelector('h2'))?.focus({ preventScroll: true });
  }

  async function fetchList(focusId) {
    st.loading = true;
    st.error = '';
    render();
    try {
      const res = await server.saves(cid);
      if (!active()) return;
      st.saves = res.saves ?? [];
    } catch {
      if (!active()) return;
      st.error = t('shell.saves.fetch-failed');
    }
    if (!active()) return;
    st.loading = false;
    render(focusId);
  }

  async function operation(fn, keepLocked = false) {
    st.busy = true;
    st.error = '';
    st.notice = '';
    render();
    try {
      const res = game ? await game.withDraftBarrier(fn, { keepLocked }) : await fn();
      if (!res.ok) st.error = saveFailure(res.issues);
      return res;
    } catch {
      st.error = t('issue.server');
      return { ok: false };
    } finally {
      st.busy = false;
    }
  }

  async function save(e) {
    e.preventDefault();
    if (st.busy || blocked(true)) return;
    const label = st.label.trim();
    if (!label) {
      const input = document.getElementById('save-label');
      input.setCustomValidity(t('shell.saves.name-required'));
      input.reportValidity();
      return;
    }
    const res = await operation(() => server.saveGame(cid, label));
    if (!active()) return;
    if (res.ok) {
      await fetchList();
      st.notice = t.fmt('shell.saves.saved', { name: label });
    }
    render('save-create');
  }

  async function load() {
    if (st.busy || blocked() || !st.selected) return;
    const slot = st.selected.slot;
    const res = await operation(async () => {
      const result = await server.loadGame(cid, slot);
      // A lost or broken response may follow a committed restore. Keep the
      // old page locked until the player reloads the server's actual state.
      if (result?.status === 0 || result?.status >= 500 || typeof result?.ok !== 'boolean') return { ...result, ok: true, uncertain: true };
      return result;
    }, true);
    if (!active()) return;
    if (res.uncertain) {
      st.uncertain = true;
      render('save-reconcile');
      return;
    }
    if (res.ok) {
      // No same-season local draft survives restoration. The game barrier stays
      // locked until this canonical reload or navigation has completed.
      st.busy = true;
      render();
      onLoaded();
      return;
    }
    render('save-load-confirm');
  }

  const cancel = (e) => { if (st.busy || st.uncertain) e.preventDefault(); };
  dlg.addEventListener('cancel', cancel);
  const unlanguage = onLanguage(() => { if (active()) render(); });
  const ungame = game?.onUpdate((kind) => { if (active() && !st.busy && ['view', 'status'].includes(kind)) render(); });
  dlg.addEventListener('close', () => {
    if (current === session) current = null;
    dlg.removeEventListener('cancel', cancel);
    unlanguage();
    ungame?.();
  }, { once: true });
  render();
  dlg.showModal();
  (mode === 'save' ? dlg.querySelector('#save-label') : dlg.querySelector('h2'))?.focus();
  fetchList();
  return dlg;
}
