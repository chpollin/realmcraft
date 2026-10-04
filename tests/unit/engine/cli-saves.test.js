// Named saves of the CLI: save, saves, load with its autosave, the refusals
// (phase, ids, label, running turn, held lock, edited save) and the recovery
// of a load that crashed at each step of the swap.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateHash } from '../../../engine/core/turn.js';
import { CAMPAIGN, CLI, REPO, cli, makeRoot, proposalFor, removeRoot } from '../../fixtures/engine/k1/harness.js';

const dirOf = (root) => join(root, 'campaigns', CAMPAIGN);
const read = (root, rel) => JSON.parse(readFileSync(join(dirOf(root), rel), 'utf8'));
const raw = (root, rel) => readFileSync(join(dirOf(root), rel), 'utf8');
const has = (root, rel) => existsSync(join(dirOf(root), rel));
const run = (root, cmd, ...args) => cli(root, [cmd, ...args, '--campaign', CAMPAIGN]);
const reasonOf = (r, code) => r.json?.issues?.find((i) => i.code === code)?.params?.reason;

/** A campaign in planning of turn 0. */
function planning(root) {
  const r = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(run(root, 'open').code, 0);
}

/** One season with the stored (or empty) draft: every player probe rolled 6. */
function playSeason(root) {
  for (const p of run(root, 'preview').json.probes.filter((x) => x.roller === 'player')) {
    const r = run(root, 'roll', p.id, '6');
    assert.ok([0, 2].includes(r.code), r.stdout);
  }
  let r = run(root, 'seal');
  assert.equal(r.code, 0, r.stdout);
  r = run(root, 'apply', '--expect-rev', String(read(root, 'state.json').rev));
  assert.equal(r.code, 0, r.stdout);
  if (read(root, 'state.json').phase === 'agents') assert.equal(run(root, 'open').code, 0);
}

/** A chronicle text through ingest: one transition in planning without rolls. */
function ingestText(root, text) {
  const task = run(root, 'tasks', '--agent', 'chronicler').json.tasks[0];
  const p = proposalFor(task, [{ type: 'narrative', refs: [], text }]);
  writeFileSync(join(dirOf(root), 'agents', 'proposals', `${p.proposalId}.json`), JSON.stringify(p));
  const r = run(root, 'ingest');
  assert.equal(r.code, 0, r.stdout);
}

const save = (root, name) => run(root, 'save', '--name', name);

describe('cli save and saves', () => {
  let root;
  before(() => {
    root = makeRoot();
    const r = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]);
    assert.equal(r.code, 0, r.stdout);
  });
  after(() => removeRoot(root));

  it('refuses a save outside planning', () => {
    const r = save(root, 'Vorher');
    assert.equal(r.code, 4);
    assert.equal(reasonOf(r, 'phase'), 'save-needs-planning');
    assert.ok(!has(root, 'saves'));
    assert.equal(run(root, 'open').code, 0);
  });

  it('refuses a missing, empty, long or control-character label', () => {
    assert.equal(run(root, 'save').code, 3);
    for (const name of ['   ', 'x'.repeat(81), 'a\u0007b', 'rechts\u202eslinks', 'zwei\nZeilen']) {
      const r = save(root, name);
      assert.equal(r.code, 2, JSON.stringify(name));
      assert.equal(reasonOf(r, 'format'), 'label');
    }
    assert.ok(!has(root, 'saves'));
  });

  it('writes the whole campaign and a manifest under saves/<slot>/', () => {
    const state = read(root, 'state.json');
    const r = save(root, '  Vor dem Winter  ');
    assert.equal(r.code, 0, r.stdout);
    const m = r.json.save;
    assert.equal(m.slot, `save-${state.rev}`);
    assert.deepEqual(
      [m.format, m.label, m.auto, m.campaign, m.turn, m.phase, m.status, m.rev],
      ['realmcraft-save', 'Vor dem Winter', null, CAMPAIGN, state.turn, 'planning', 'playing', state.rev],
    );
    assert.ok(m.season && Number.isInteger(m.year) && !Number.isNaN(Date.parse(m.created)));
    assert.equal(m.stateHash, stateHash(state));
    assert.equal(m.journalHead, read(root, 'log/journal.json').at(-1).hash);
    assert.deepEqual(m.world.hash, read(root, 'world.lock.json').hash);
    assert.deepEqual(read(root, `saves/${m.slot}/manifest.json`), m);
    const copy = `saves/${m.slot}/campaign`;
    for (const f of ['state.json', 'library.json', 'world.lock.json', 'status.json', 'log/journal.json', 'view/bergnomaden.json']) {
      assert.equal(raw(root, `${copy}/${f}`), raw(root, f), f);
    }
    assert.ok(has(root, `${copy}/agents/tasks`));
    assert.ok(!has(root, `${copy}/saves`) && !has(root, `${copy}/.campaign.lock`));
    assert.equal(stateHash(read(root, 'state.json')), m.stateHash, 'a save changes nothing in the campaign');
  });

  it('never overwrites a slot and lists the saves newest first', () => {
    const second = save(root, 'Nochmal');
    assert.equal(second.code, 0);
    const rev = read(root, 'state.json').rev;
    assert.equal(second.json.save.slot, `save-${rev}-2`);
    const r = run(root, 'saves');
    assert.equal(r.code, 0);
    assert.deepEqual(r.json.saves.map((m) => m.slot), [`save-${rev}-2`, `save-${rev}`]);
  });

  it('refuses bad slot ids, a missing slot and a load as another campaign', () => {
    for (const slot of ['Bad', '../x', 'a', 'x/y', `${'s'.repeat(42)}`]) {
      const r = run(root, 'load', '--slot', slot);
      assert.equal(r.code, 2, slot);
      assert.equal(reasonOf(r, 'format'), 'slot-id');
    }
    assert.equal(run(root, 'load').code, 3);
    const missing = run(root, 'load', '--slot', 'nirgends');
    assert.equal(missing.code, 3);
    assert.ok(missing.codes.includes('cli.no_save'));
    assert.equal(reasonOf(run(root, 'load', '--slot', `save-${read(root, 'state.json').rev}`, '--as', 'anders-1'), 'format'), 'fork-unsupported');
  });

  it('refuses save and load while a turn runs and while the lock is held', () => {
    const slot = `save-${read(root, 'state.json').rev}`;
    writeFileSync(join(dirOf(root), 'run.json'), JSON.stringify({ format: 'realmcraft-run', version: 1, campaign: CAMPAIGN, turn: 0, active: true }));
    for (const r of [save(root, 'Während'), run(root, 'load', '--slot', slot)]) {
      assert.equal(r.code, 4, r.stdout);
      assert.ok(r.codes.includes('cli.turn_running'));
    }
    rmSync(join(dirOf(root), 'run.json'));
    // A live process holds the lock: this test process itself.
    writeFileSync(join(dirOf(root), '.campaign.lock'), JSON.stringify({ pid: process.pid, at: Date.now(), token: 'held' }));
    try {
      const r = save(root, 'Gesperrt');
      assert.equal(r.code, 4);
      assert.ok(r.codes.includes('cli.locked'));
    } finally {
      rmSync(join(dirOf(root), '.campaign.lock'));
    }
    assert.equal(run(root, 'saves').json.saves.length, 2);
  });
});

describe('cli load', () => {
  let root;
  let saved;
  before(() => {
    root = makeRoot();
    planning(root);
    playSeason(root);
    saved = save(root, 'Erste Saison').json.save;
  });
  after(() => removeRoot(root));

  it('restores the save in place after an autosave of the current files', () => {
    const snap = (rel) => raw(root, `saves/${saved.slot}/campaign/${rel}`);
    playSeason(root);
    const current = read(root, 'state.json');
    assert.ok(current.turn > saved.turn);
    const r = run(root, 'load', '--slot', saved.slot);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.autosave, `autosave-${current.rev}`);
    assert.deepEqual([r.json.turn, r.json.rev, r.json.phase, r.json.stateHash], [saved.turn, saved.rev, 'planning', saved.stateHash]);
    for (const f of ['state.json', 'library.json', 'log/journal.json', 'world.lock.json']) assert.equal(raw(root, f), snap(f), f);
    assert.ok(!has(root, '.restore'));
    assert.equal(read(root, 'view/bergnomaden.json').turn, saved.turn);
    assert.equal(JSON.parse(readFileSync(join(root, 'campaigns', 'index.json'), 'utf8')).campaigns[0].turn, saved.turn);
    assert.equal(run(root, 'replay').code, 0);

    const auto = run(root, 'saves').json.saves.find((m) => m.slot === r.json.autosave);
    assert.deepEqual([auto.label, auto.auto, auto.stateHash, auto.turn], [null, { reason: 'load', slot: saved.slot }, stateHash(current), current.turn]);
  });

  it('plays on after a load and loads the autosave back', () => {
    playSeason(root);
    assert.equal(run(root, 'replay').code, 0);
    const auto = run(root, 'saves').json.saves.find((m) => m.auto);
    const back = run(root, 'load', '--slot', auto.slot);
    assert.equal(back.code, 0, back.stdout);
    assert.equal(stateHash(read(root, 'state.json')), auto.stateHash);
    assert.equal(run(root, 'replay').code, 0);
    assert.equal(run(root, 'saves').json.saves.filter((m) => m.auto).length, 2);
  });

  it('refuses a load while the season resolves', () => {
    for (const p of run(root, 'preview').json.probes.filter((x) => x.roller === 'player')) run(root, 'roll', p.id, '6');
    assert.equal(run(root, 'seal').code, 0);
    const before = raw(root, 'state.json');
    const r = run(root, 'load', '--slot', saved.slot);
    assert.equal(r.code, 4);
    assert.equal(reasonOf(r, 'phase'), 'load-needs-planning');
    assert.equal(raw(root, 'state.json'), before);
    assert.equal(run(root, 'apply', '--expect-rev', String(read(root, 'state.json').rev)).code, 0);
    assert.equal(run(root, 'open').code, 0);
  });

  it('refuses an edited save and leaves the campaign untouched', () => {
    const file = join(dirOf(root), 'saves', saved.slot, 'campaign', 'state.json');
    const original = readFileSync(file, 'utf8');
    const edited = JSON.parse(original);
    edited.peoples.bergnomaden.resources.nahrung += 5;
    writeFileSync(file, JSON.stringify(edited));
    const before = raw(root, 'state.json');
    const slots = run(root, 'saves').json.saves.length;
    try {
      const r = run(root, 'load', '--slot', saved.slot);
      assert.equal(r.code, 4, r.stdout);
      assert.ok(r.codes.includes('tamper'));
      assert.equal(raw(root, 'state.json'), before);
      assert.ok(!has(root, '.restore'));
      assert.equal(run(root, 'saves').json.saves.length, slots, 'no autosave for a refused load');
    } finally {
      writeFileSync(file, original);
    }
  });
});

describe('cli load of a save made under another world package', () => {
  let root;
  after(() => removeRoot(root));

  it('restores the save, and transitions wait for repin as after any world change', () => {
    root = makeRoot();
    planning(root);
    // The campaign reads its package from a copy in the root, which the test can change.
    const pack = join(root, 'welten', 'hochland');
    cpSync(join(REPO, 'welten', 'hochland'), pack, { recursive: true });
    writeFileSync(join(dirOf(root), 'world.lock.json'), JSON.stringify({ ...read(root, 'world.lock.json'), worldDir: 'welten/hochland' }));
    const saved = save(root, 'Alte Welt').json.save;

    const welt = JSON.parse(readFileSync(join(pack, 'welt.json'), 'utf8'));
    writeFileSync(join(pack, 'welt.json'), JSON.stringify({ ...welt, name: `${welt.name} (neu)` }));
    assert.equal(run(root, 'repin').code, 0);
    const pinned = read(root, 'world.lock.json').hash;
    assert.notEqual(pinned, saved.world.hash);

    const r = run(root, 'load', '--slot', saved.slot);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.drift, true);
    assert.equal(reasonOf(r, 'cli.world_drift'), 'save-world');
    assert.equal(read(root, 'world.lock.json').hash, saved.world.hash);
    const sealed = run(root, 'seal');
    assert.equal(sealed.code, 4);
    assert.ok(sealed.codes.includes('cli.world_drift'));

    const again = run(root, 'repin');
    assert.equal(again.code, 0, again.stdout);
    assert.equal(again.json.to, pinned);
    assert.equal(run(root, 'replay').code, 0);
    assert.equal(save(root, 'Neue Welt').code, 0);
  });
});

describe('cli load interrupted by a crash', () => {
  const crash = (root, point, slot) => spawnSync(process.execPath, [CLI, 'load', '--slot', slot, '--campaign', CAMPAIGN, '--json'], {
    cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root, REALMCRAFT_CRASH_AT: point }, encoding: 'utf8', timeout: 120000,
  });
  const cases = [
    ['load:staged', 'load-dropped', false],
    ['load:old', 'load-completed', true],
    ['load:new', 'load-completed', true],
  ];
  for (const [point, reason, restored] of cases) {
    it(`${point}: the next command ${restored ? 'completes' : 'drops'} the load`, () => {
      const root = makeRoot();
      try {
        planning(root);
        const saved = save(root, 'Anfang').json.save;
        ingestText(root, 'Der erste Schnee fällt.');
        const current = stateHash(read(root, 'state.json'));
        assert.notEqual(current, saved.stateHash);

        const r = crash(root, point, saved.slot);
        assert.equal(r.status, 70, r.stdout + r.stderr);
        assert.ok(has(root, '.restore'));
        assert.ok(has(root, '.campaign.lock'), 'the crash left its lock behind');

        const next = run(root, 'status');
        assert.equal(next.code, 0, next.stdout);
        assert.equal(reasonOf(next, 'cli.recovered'), reason);
        assert.ok(!has(root, '.restore'));
        assert.equal(stateHash(read(root, 'state.json')), restored ? saved.stateHash : current);
        assert.equal(run(root, 'replay').code, 0);
        assert.equal(read(root, 'view/bergnomaden.json').rev, read(root, 'state.json').rev);
        // Transitions run again: the guard passes and a save takes the lock.
        assert.equal(save(root, 'Danach').code, 0);
        const autos = readdirSync(join(dirOf(root), 'saves')).filter((n) => n.startsWith('autosave-'));
        assert.equal(autos.length, 1, 'the autosave was written before the swap began');
      } finally {
        removeRoot(root);
      }
    });
  }
});
