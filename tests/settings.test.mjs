import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, STORAGE_KEY, LIMITS, merge, load, save, validate, selectedCount, effectiveScenarioIds,
} from '../js/settings.js';

const fakeStorage = (initial) => {
  const data = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const ok = (overrides, count = 5, known) => validate({ ...DEFAULTS, ...overrides }, count, known);

test('defaults follow GAME_DESIGN §7', () => {
  assert.deepEqual({ ...DEFAULTS }, {
    budget: 20, judgeMode: 'auto', shuffleSides: true, rounds: 3, scenarioIds: null,
    player1Name: 'Giocatore 1', player2Name: 'Giocatore 2', sfxOn: true, musicOn: true, volume: 70,
  });
  assert.equal(STORAGE_KEY, 'byb.settings.v1');
});

test('load: empty storage, missing storage and throwing storage give the defaults', () => {
  assert.deepEqual(load(fakeStorage()), { ...DEFAULTS });
  assert.deepEqual(load(null), { ...DEFAULTS });
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(load(throwing), { ...DEFAULTS });
  assert.equal(save({ ...DEFAULTS }, throwing), false);
  assert.equal(save({ ...DEFAULTS }, null), false);
});

test('load: partial saved values are merged with the defaults', () => {
  const s = load(fakeStorage(JSON.stringify({ budget: 50, player1Name: 'Anna', volume: 0 })));
  assert.equal(s.budget, 50);
  assert.equal(s.player1Name, 'Anna');
  assert.equal(s.volume, 0);
  assert.equal(s.rounds, DEFAULTS.rounds);
  assert.equal(s.judgeMode, 'auto');
});

test('load: corrupted JSON gives the defaults', () => {
  assert.deepEqual(load(fakeStorage('{not json')), { ...DEFAULTS });
  assert.deepEqual(load(fakeStorage('42')), { ...DEFAULTS });
  assert.deepEqual(load(fakeStorage('[1,2]')), { ...DEFAULTS });
  assert.deepEqual(load(fakeStorage('null')), { ...DEFAULTS });
});

test('load: invalid single fields fall back to their default, valid ones are kept', () => {
  const s = merge({
    budget: 'lots', judgeMode: 'robot', shuffleSides: 'yes', rounds: 0, scenarioIds: 'all',
    player1Name: '', player2Name: 'x'.repeat(50), sfxOn: 1, musicOn: false, volume: 500,
  });
  assert.equal(s.budget, DEFAULTS.budget);
  assert.equal(s.judgeMode, DEFAULTS.judgeMode);
  assert.equal(s.shuffleSides, DEFAULTS.shuffleSides);
  assert.equal(s.rounds, DEFAULTS.rounds);
  assert.equal(s.scenarioIds, null);
  assert.equal(s.player1Name, DEFAULTS.player1Name);
  assert.equal(s.player2Name, DEFAULTS.player2Name);
  assert.equal(s.sfxOn, true);
  assert.equal(s.musicOn, false);
  assert.equal(s.volume, DEFAULTS.volume);
  assert.equal(merge({ budget: 4.5 }).budget, DEFAULTS.budget);
  assert.equal(merge({ budget: 1000 }).budget, DEFAULTS.budget);
  assert.deepEqual(merge({ scenarioIds: ['a', 3] }).scenarioIds, null);
  assert.deepEqual(merge({ scenarioIds: ['a', 'a', 'b'] }).scenarioIds, ['a', 'b']);
});

test('load drops unknown fields and never returns the shared defaults object', () => {
  const s = merge({ hacker: true });
  assert.equal('hacker' in s, false);
  s.budget = 99;
  assert.equal(DEFAULTS.budget, 20);
});

test('save then load round-trips', () => {
  const store = fakeStorage();
  const settings = { ...DEFAULTS, budget: 35, judgeMode: 'human', shuffleSides: false, rounds: 2,
    scenarioIds: ['a', 'b'], player1Name: 'Luca', player2Name: 'Sara', sfxOn: false, volume: 10 };
  assert.equal(save(settings, store), true);
  assert.deepEqual(load(store), settings);
});

test('validate: defaults are valid', () => {
  const r = validate({ ...DEFAULTS }, 3);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, {});
});

test('validate: budget limits 5-200 and integers', () => {
  assert.equal(ok({ budget: 5 }).ok, true);
  assert.equal(ok({ budget: 200 }).ok, true);
  for (const budget of [4, 201, 0, -1, 10.5, NaN, '20', null]) {
    const r = ok({ budget });
    assert.equal(r.ok, false, `budget ${budget}`);
    assert.ok(r.errors.budget);
  }
  assert.equal(LIMITS.budget.min, 5);
});

test('validate: rounds must be >= 1 and <= number of selected scenarios', () => {
  assert.equal(ok({ rounds: 0 }).errors.rounds !== undefined, true);
  assert.equal(ok({ rounds: 1.5 }).errors.rounds !== undefined, true);
  assert.equal(ok({ rounds: 5 }, 5).ok, true);
  assert.ok(ok({ rounds: 6 }, 5).errors.rounds);
  // scenarioIds narrows the maximum
  assert.equal(ok({ rounds: 2, scenarioIds: ['a', 'b'] }, 5).ok, true);
  const r = ok({ rounds: 3, scenarioIds: ['a', 'b'] }, 5);
  assert.equal(r.ok, false);
  assert.match(r.errors.rounds, /2/);
  // duplicates count once
  assert.ok(ok({ rounds: 2, scenarioIds: ['a', 'a'] }, 5).errors.rounds);
});

test('validate: no scenario selected', () => {
  const r = ok({ scenarioIds: [] }, 5);
  assert.equal(r.ok, false);
  assert.ok(r.errors.scenarioIds);
  assert.ok(validate({ ...DEFAULTS }, 0).errors.scenarioIds);
});

test('validate: empty, blank or too long names', () => {
  assert.ok(ok({ player1Name: '' }).errors.player1Name);
  assert.ok(ok({ player2Name: '   ' }).errors.player2Name);
  assert.ok(ok({ player1Name: 'x'.repeat(21) }).errors.player1Name);
  assert.ok(ok({ player2Name: 42 }).errors.player2Name);
  assert.equal(ok({ player1Name: 'x'.repeat(20) }).ok, true);
  assert.equal(ok({ player1Name: ' ' + 'x'.repeat(20) + ' ' }).ok, true, 'surrounding spaces are trimmed');
  assert.equal(ok({ player1Name: 'A' }).ok, true);
});

test('validate: unknown scenario ids are rejected when the known ids are given', () => {
  const known = ['a', 'b', 'c'];
  assert.equal(ok({ rounds: 2, scenarioIds: ['a', 'b'] }, 3, known).ok, true);
  const r = ok({ rounds: 2, scenarioIds: ['a', 'zzz'] }, 3, known);
  assert.equal(r.ok, false);
  assert.match(r.errors.scenarioIds, /zzz/);
  assert.ok(ok({ scenarioIds: 'a' }, 3, known).errors.scenarioIds);
  assert.ok(ok({ scenarioIds: [1, 2] }, 3, known).errors.scenarioIds);
});

test('validate: other fields', () => {
  assert.ok(ok({ judgeMode: 'robot' }).errors.judgeMode);
  assert.ok(ok({ volume: 101 }).errors.volume);
  assert.ok(ok({ volume: -1 }).errors.volume);
  assert.equal(ok({ volume: 0 }).ok, true);
  assert.equal(ok({ volume: 100 }).ok, true);
  assert.ok(ok({ sfxOn: 'yes' }).errors.sfxOn);
  assert.ok(ok({ musicOn: 0 }).errors.musicOn);
  assert.ok(ok({ shuffleSides: 'no' }).errors.shuffleSides);
  assert.equal(validate(null, 3).ok, false);
});

test('selectedCount and effectiveScenarioIds', () => {
  assert.equal(selectedCount({ scenarioIds: null }, 7), 7);
  assert.equal(selectedCount({ scenarioIds: ['a', 'a', 'b'] }, 7), 2);
  assert.deepEqual(effectiveScenarioIds({ scenarioIds: null }, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(effectiveScenarioIds({ scenarioIds: ['b', 'gone', 'b'] }, ['a', 'b']), ['b']);
});
