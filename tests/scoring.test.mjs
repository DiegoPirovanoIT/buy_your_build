import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBuild, compareBuilds } from '../js/engine/scoring.js';

const scenario = {
  id: 's',
  items: [
    { id: 'a', name: 'A', score: 5 },
    { id: 'b', name: 'B', score: 3 },
    { id: 'c', name: 'C', score: -4 },
    { id: 'd', name: 'D', score: 0 },
  ],
  combos: [
    { items: ['a', 'b'], score: 6, label: 'AB', description: 'a e b insieme funzionano' },
    { items: ['a', 'b', 'c'], score: -10, label: 'ABC', description: 'tris sfortunato' },
  ],
};

test('scoreBuild: sum of items, no combos', () => {
  const r = scoreBuild(scenario, ['a', 'c']);
  assert.equal(r.total, 1);
  assert.deepEqual(r.items, [
    { id: 'a', name: 'A', score: 5 },
    { id: 'c', name: 'C', score: -4 },
  ]);
  assert.deepEqual(r.combos, []);
});

test('scoreBuild: combo active when all its items are owned', () => {
  const r = scoreBuild(scenario, ['b', 'a']);
  assert.equal(r.total, 5 + 3 + 6);
  assert.equal(r.combos.length, 1);
  assert.deepEqual(r.combos[0], {
    label: 'AB',
    items: ['a', 'b'],
    score: 6,
    description: 'a e b insieme funzionano',
  });
});

test('scoreBuild: 3-item combo and overlapping combos both count; total can be negative', () => {
  const r = scoreBuild(scenario, ['a', 'b', 'c']);
  assert.equal(r.total, 5 + 3 - 4 + 6 - 10);
  assert.equal(r.combos.length, 2);
  assert.equal(scoreBuild(scenario, ['c']).total, -4);
});

test('scoreBuild: combo not active with a missing item', () => {
  assert.deepEqual(scoreBuild(scenario, ['a', 'c', 'd']).combos, []);
});

test('scoreBuild: empty build and unknown item', () => {
  assert.deepEqual(scoreBuild(scenario, []), { total: 0, items: [], combos: [] });
  assert.throws(() => scoreBuild(scenario, ['zzz']));
});

test('compareBuilds: combo requires all items from the SAME player', () => {
  const r = compareBuilds(scenario, { p1: ['a', 'd'], p2: ['b', 'c'] }, { p1: 0, p2: 0 });
  assert.deepEqual(r.p1.combos, []);
  assert.deepEqual(r.p2.combos, []);
  assert.equal(r.p1.total, 5);
  assert.equal(r.p2.total, -1);
  assert.equal(r.winner, 'p1');
  assert.equal(r.tieBreak, 'score');
});

test('compareBuilds: higher score wins even with less money', () => {
  const r = compareBuilds(scenario, { p1: ['a'], p2: ['b'] }, { p1: 0, p2: 20 });
  assert.equal(r.winner, 'p1');
  assert.equal(r.tieBreak, 'score');
});

test('compareBuilds: equal score -> more leftover money wins', () => {
  const r = compareBuilds(scenario, { p1: ['d'], p2: [] }, { p1: 3, p2: 9 });
  assert.equal(r.winner, 'p2');
  assert.equal(r.tieBreak, 'money');
});

test('compareBuilds: equal score and money -> draw', () => {
  const r = compareBuilds(scenario, { p1: ['d'], p2: [] }, { p1: 5, p2: 5 });
  assert.equal(r.winner, null);
  assert.equal(r.tieBreak, 'draw');
});
