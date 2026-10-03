// Validator corpus (tests/fixtures/engine/corpus/manifest.json): hand-judged
// Entwicklungen, Bestimmungen and proposals, good and bad, each with its
// expected verdict, issue codes and budget. The expectations were written
// from the rules, not from validator output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateBestimmung, validateCampaign, validateDraft, validateEntwicklung, validateProposal, validateTask } from '../../../engine/content/validate.js';
import { libraryFrom } from '../../../engine/content/library.js';

const corpus = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/engine/corpus/manifest.json', import.meta.url)), 'utf8'));
const c = corpus.context;
const library = libraryFrom(c.library);
const world = { regeln: c.regeln, welt: c.welt, library };
const candidate = { ...world, people: c.people, state: c.state };
// extraLibrary adds Entwicklungen to the library of one case only.
const ctxFor = (as, extra) => {
  const base = as === 'candidate' ? candidate : world;
  return extra ? { ...base, library: libraryFrom([...c.library, ...extra]) } : base;
};
const codesOf = (issues) => [...new Set(issues.map((i) => i.code))].sort();

test('corpus size and coverage', () => {
  assert.ok(corpus.entwicklungen.length >= 30, `${corpus.entwicklungen.length} Entwicklungen`);
  assert.ok(corpus.bestimmungen.length >= 8, `${corpus.bestimmungen.length} Bestimmungen`);
  const verdicts = (list) => new Set(list.map((x) => x.expect.verdict));
  assert.deepEqual(verdicts(corpus.entwicklungen), new Set(['accepted', 'rejected']));
  assert.deepEqual(verdicts(corpus.bestimmungen), new Set(['accepted', 'rejected']));
  const ids = [...corpus.entwicklungen, ...corpus.bestimmungen, ...corpus.proposals].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'case ids are unique');
});

for (const k of corpus.entwicklungen) {
  test(`entwicklung ${k.id}: ${k.expect.verdict}`, () => {
    const r = validateEntwicklung(k.data, ctxFor(k.as, k.extraLibrary));
    assert.deepEqual(codesOf(r.issues), k.expect.codes, k.note);
    assert.equal(r.ok ? 'accepted' : 'rejected', k.expect.verdict);
    assert.deepEqual(r.budget && { effect: r.budget.effect, price: r.budget.price, net: r.budget.net }, k.expect.budget);
  });
}

for (const k of corpus.bestimmungen) {
  test(`bestimmung ${k.id}: ${k.expect.verdict}`, () => {
    const r = validateBestimmung(k.data, { ...ctxFor(k.as), destinyBand: c.destinyBand });
    assert.deepEqual(codesOf(r.issues), k.expect.codes, k.note);
    assert.equal(r.ok ? 'accepted' : 'rejected', k.expect.verdict);
    assert.equal(r.budget ? r.budget.difficulty : null, k.expect.difficulty);
  });
}

for (const k of corpus.proposals) {
  test(`proposal ${k.id}`, () => {
    const state = { ...c.state, peoples: { [c.people.id]: c.people }, ...(k.chronicle ? { chronicle: k.chronicle } : {}) };
    const r = validateProposal(k.data, { ...world, state, destinyBand: c.destinyBand, ...(k.useTask ? { task: c.task } : {}), ...(k.requireTask ? { requireTask: true } : {}) });
    assert.deepEqual(codesOf(r.issues), k.expect.issues, k.note);
    assert.equal(r.duplicate, k.expect.duplicate);
    assert.deepEqual(r.items.map((i) => ({ verdict: i.verdict, codes: codesOf(i.issues) })), k.expect.items);
  });
}

// set and move on JSON pointers, enough to derive a state or task case from its base.
function patched(base, ops) {
  const doc = structuredClone(base);
  const parent = (path) => {
    const segs = path.split('/').slice(1);
    const last = segs.pop();
    return [segs.reduce((o, k) => o[k], doc), last];
  };
  for (const op of ops) {
    const [to, key] = parent(op.path);
    if (op.op === 'move') {
      const [from, fromKey] = parent(op.from);
      to[key] = from[fromKey];
      delete from[fromKey];
    } else {
      to[key] = op.value;
    }
  }
  return doc;
}

const verdictOf = (r) => ({ verdict: r.ok ? 'accepted' : 'rejected', codes: codesOf(r.issues) });

for (const k of corpus.drafts) {
  test(`draft ${k.id}: ${k.expect.verdict}`, () => {
    const state = { ...c.state, peoples: { [c.people.id]: c.people } };
    assert.deepEqual(verdictOf(validateDraft(k.data, { state })), k.expect, k.note);
  });
}

for (const k of corpus.states) {
  test(`state ${k.id}: ${k.expect.verdict}`, () => {
    const base = JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/engine/${k.base}`, import.meta.url)), 'utf8'));
    assert.deepEqual(verdictOf(validateCampaign(patched(base, k.ops))), k.expect, k.note);
  });
}

for (const k of corpus.tasks) {
  test(`task ${k.id}: ${k.expect.verdict}`, () => {
    assert.deepEqual(verdictOf(validateTask(patched(c.task, k.ops))), k.expect, k.note);
  });
}

test('Pulverwall and Bannfeuer both pass with equal net and different price kinds', () => {
  const find = (id) => corpus.entwicklungen.find((k) => k.id === id);
  const [p, b] = ['pulverwall', 'bannfeuer'].map((id) => validateEntwicklung(find(id).data, ctxFor(find(id).as)));
  assert.ok(p.ok && b.ok);
  assert.equal(p.budget.net, b.budget.net);
  const priceOps = (r) => r.budget.lines.filter((l) => l.side === 'price').map((l) => l.op).sort().join();
  assert.notEqual(priceOps(p), priceOps(b));
});
