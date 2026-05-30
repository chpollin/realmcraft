// RealmCraft, Befehlsleiste.
// Zeigt die Slash-Befehle, die der Spieler dem Spielleiter (Chat oder Terminal)
// gibt. Immer sichtbar ueber allen Sichten. Klick auf einen Befehl kopiert ihn
// in die Zwischenablage, damit man ihn in den Chat einfuegt. Eigene Befehle
// lassen sich anlegen und werden in localStorage gehalten.

export const DEFAULT_COMMANDS = [
  { name: 'speichern', desc: 'Speicherstand ausgeben (Prosa + json-Block)' },
  { name: 'würfeln', desc: '1d10-Ergebnis fuer die offene Probe uebergeben' },
  { name: 'rat', desc: 'Stimmen der Berater zur aktuellen Frage' },
  { name: 'status', desc: 'Statuskonsole der aktuellen Lage zeigen' },
  { name: 'ressourcen', desc: 'Grundgroessen und Lagewerte im Detail' },
  { name: 'karte', desc: 'Die Lage geografisch beschreiben' },
  { name: 'info', desc: 'Auskunft aus der Spielwelt (info <Thema>)' },
];

const STORE_KEY = 'rc.commands';

export function loadCustomCommands() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    return Array.isArray(raw) ? raw.filter((c) => c && c.name) : [];
  } catch {
    return [];
  }
}

export function saveCustomCommands(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {}
}

// Normalisiert eine Eingabe zu einem Befehlsnamen ohne fuehrenden Slash.
export function normalizeName(raw) {
  return String(raw || '').trim().replace(/^\/+/, '').trim();
}

export function addCustomCommand(name, desc) {
  const clean = normalizeName(name);
  if (!clean) return loadCustomCommands();
  const list = loadCustomCommands().filter((c) => c.name !== clean);
  list.push({ name: clean, desc: String(desc || '').trim(), custom: true });
  saveCustomCommands(list);
  return list;
}

export function removeCustomCommand(name) {
  const clean = normalizeName(name);
  const list = loadCustomCommands().filter((c) => c.name !== clean);
  saveCustomCommands(list);
  return list;
}

function el(tag, cls, attrs = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

// Baut die Befehlsleiste in host. onCopy(text) wird beim Klick auf einen Befehl
// gerufen (z. B. Toast). Liefert eine rerender-Funktion.
export function renderCommandBar(host, { onCopy } = {}) {
  if (!host) return () => {};

  function copy(text) {
    let done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        done = true;
      }
    } catch { /* faellt unten zurueck */ }
    if (!done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {}
    }
    if (onCopy) onCopy(text);
  }

  function draw() {
    host.innerHTML = '';
    host.className = 'cmdbar';
    host.setAttribute('data-testid', 'command-bar');
    host.setAttribute('aria-label', 'Befehle');

    const head = el('div', 'cmdbar-head');
    head.appendChild(el('span', 'cmdbar-title', { text: 'Befehle' }));
    const hint = el('span', 'cmdbar-hint', { text: 'Klick kopiert den Befehl fuer den Spielleiter' });
    head.appendChild(hint);
    const addBtn = el('button', 'cmd-add', { type: 'button', 'data-testid': 'command-add', text: '+ eigener Befehl' });
    head.appendChild(addBtn);
    host.appendChild(head);

    const list = el('div', 'cmd-list', { 'data-testid': 'command-list' });
    const custom = loadCustomCommands();
    const all = [...DEFAULT_COMMANDS, ...custom];
    for (const cmd of all) {
      const slug = `/${cmd.name}`;
      const chip = el('button', 'cmd' + (cmd.custom ? ' cmd-custom' : ''), {
        type: 'button',
        'data-testid': 'command',
        'data-cmd': slug,
        title: cmd.desc || slug,
      });
      chip.appendChild(el('span', 'cmd-name', { text: slug }));
      if (cmd.desc) chip.appendChild(el('span', 'cmd-desc', { text: cmd.desc }));
      chip.addEventListener('click', () => copy(slug));
      if (cmd.custom) {
        const rm = el('span', 'cmd-remove', { 'data-testid': 'command-remove', title: 'Befehl entfernen', text: '×' });
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          removeCustomCommand(cmd.name);
          draw();
        });
        chip.appendChild(rm);
      }
      list.appendChild(chip);
    }
    host.appendChild(list);

    // Eingabeform fuer eigene Befehle, zunaechst verborgen
    const form = el('form', 'cmd-form', { 'data-testid': 'command-form', hidden: '' });
    const nameInput = el('input', 'cmd-input', { type: 'text', 'data-testid': 'command-name-input', placeholder: 'Name, z. B. kreatur', spellcheck: 'false', autocomplete: 'off' });
    const descInput = el('input', 'cmd-input cmd-input-desc', { type: 'text', 'data-testid': 'command-desc-input', placeholder: 'Kurzbeschreibung (optional)', spellcheck: 'false', autocomplete: 'off' });
    const saveBtn = el('button', 'cmd-save', { type: 'submit', 'data-testid': 'command-save', text: 'Hinzufuegen' });
    form.appendChild(nameInput);
    form.appendChild(descInput);
    form.appendChild(saveBtn);
    host.appendChild(form);

    addBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) nameInput.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = normalizeName(nameInput.value);
      if (!name) { nameInput.focus(); return; }
      addCustomCommand(name, descInput.value);
      nameInput.value = '';
      descInput.value = '';
      form.hidden = true;
      draw();
    });
  }

  draw();
  return draw;
}
