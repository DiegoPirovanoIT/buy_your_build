import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/engine/rng.js';
import { createAuction, offer, accept } from '../js/engine/auction.js';
import {
  createGame, startRound, currentAuction, applyAuction, finishRound,
  isRoundOver, isGameOver, gameSummary, roundBreakdown, GameError,
} from '../js/engine/game.js';

const mkScenario = (id) => ({
  id,
  items: Array.from({ length: 10 }, (_, i) => ({ id: `${id}-${i}`, name: `Item ${i}`, score: i - 3 })),
  combos: [{ items: [`${id}-8`, `${id}-9`], score: 4, label: 'Top', description: 'i due migliori insieme' }],
});
const flatScenario = {
  id: 'flat',
  items: Array.from({ length: 10 }, (_, i) => ({ id: `flat-${i}`, name: `Flat ${i}`, score: 0 })),
  combos: [],
};
const scenarios = Object.fromEntries(['s1', 's2', 's3', 's4'].map((id) => [id, mkScenario(id)]));
const settings = (o = {}) => ({ budget: 20, rounds: 3, judgeMode: 'auto', ...o });
const newGame = (o = {}, seed = 1) =>
  createGame({ settings: settings(o), scenarioIds: Object.keys(scenarios), rng: createRng(seed) });

const throwsGame = (fn, code) =>
  assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected GameError ${code}`);
const scenarioOf = (s) => scenarios[s.round.scenarioId];

/** Plays the whole round: the opener keeps every item for free. */
function playRound(state, { bid } = {}) {
  state = startRound(state, scenarios[state.roundScenarioIds[state.roundIndex]]);
  while (!isRoundOver(state)) {
    let a = currentAuction(state);
    a = offer(a, { to: a.opener, amount: bid ?? 0 });
    if (a.status !== 'done') a = accept(a);
    state = applyAuction(state, a);
  }
  return state;
}

test('rng: same seed gives same sequence, values in [0,1), int inclusive', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 20; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.ok(x >= 0 && x < 1);
  }
  const r = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('rng: shuffle returns a permutation copy, pick picks an element, no-seed works', () => {
  const src = [1, 2, 3, 4, 5, 6];
  const out = createRng(3).shuffle(src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), src);
  assert.ok(src.includes(createRng(3).pick(src)));
  const x = createRng().next();
  assert.ok(x >= 0 && x < 1);
});

test('createGame: round scenarios without repetitions, from the enabled ones', () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = newGame({ rounds: 3 }, seed);
    assert.equal(g.roundScenarioIds.length, 3);
    assert.equal(new Set(g.roundScenarioIds).size, 3);
    assert.ok(g.roundScenarioIds.every((id) => id in scenarios));
  }
});

test('createGame: rounds = number of scenarios uses all of them; too few scenarios throws', () => {
  assert.equal(new Set(newGame({ rounds: 4 }).roundScenarioIds).size, 4);
  throwsGame(() => newGame({ rounds: 5 }), 'NOT_ENOUGH_SCENARIOS');
  throwsGame(() => newGame({ rounds: 0 }), 'INVALID_SETTINGS');
});

test('createGame: validates arguments with GameError', () => {
  throwsGame(() => newGame({ judgeMode: 'robot' }), 'INVALID_SETTINGS');
  throwsGame(() => newGame({ judgeMode: undefined }), 'INVALID_SETTINGS');
  throwsGame(() => newGame({ budget: -1 }), 'INVALID_SETTINGS');
  throwsGame(() => newGame({ budget: 2.5 }), 'INVALID_SETTINGS');
  throwsGame(() => createGame({ scenarioIds: ['s1'], rng: createRng(1) }), 'INVALID_SETTINGS');
  throwsGame(() => createGame({ settings: settings(), scenarioIds: null }), 'INVALID_ARGS');
  assert.ok(newGame({ judgeMode: 'human' }));
});

test('createGame: first opener is random (both players occur) and deterministic per seed', () => {
  const openers = new Set();
  for (let seed = 0; seed < 40; seed++) openers.add(newGame({}, seed).currentOpener);
  assert.deepEqual([...openers].sort(), ['p1', 'p2']);
  assert.deepEqual(newGame({}, 5), newGame({}, 5));
});

test('startRound: items shuffled (permutation), budget set, first auction opened by nextOpener', () => {
  const g = newGame({ budget: 12 }, 9);
  const s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  assert.deepEqual([...s.round.itemOrder].sort(), scenarios[g.roundScenarioIds[0]].items.map((i) => i.id).sort());
  assert.deepEqual(s.round.money, { p1: 12, p2: 12 });
  const a = currentAuction(s);
  assert.equal(a.opener, g.currentOpener);
  assert.equal(a.itemId, s.round.itemOrder[0]);
  assert.equal(a.status, 'awaiting-open');
});

test('startRound: item order varies between seeds', () => {
  const orders = new Set();
  for (let seed = 0; seed < 10; seed++) {
    const g = newGame({}, seed);
    const id = g.roundScenarioIds[0];
    orders.add(startRound(g, scenarios[id]).round.itemOrder.map((x) => x.slice(id.length + 1)).join());
  }
  assert.ok(orders.size > 1);
});

test('startRound: wrong scenario or unfinished round throws', () => {
  const g = newGame();
  const wrong = g.roundScenarioIds[0] === 's1' ? 's2' : 's1';
  throwsGame(() => startRound(g, scenarios[wrong]), 'WRONG_SCENARIO');
  const s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  throwsGame(() => startRound(s, scenarios[g.roundScenarioIds[0]]), 'ROUND_NOT_FINISHED');
});

test('applyAuction: payer pays only the last bid, owner gets the item, opener alternates', () => {
  const g = newGame({}, 2);
  let s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  const first = s.currentOpener;
  const second = first === 'p1' ? 'p2' : 'p1';
  let a = currentAuction(s);
  const item = a.itemId;
  a = offer(a, { to: first, amount: 0 });
  a = offer(a, { to: second, amount: 3 });
  a = accept(a); // second pays 3 and gets it
  s = applyAuction(s, a);
  assert.equal(s.round.money[second], 17);
  assert.equal(s.round.money[first], 20);
  assert.deepEqual(s.round.owned[second], [item]);
  assert.equal(s.round.log[0].paid, 3);
  assert.equal(s.round.itemIndex, 1);
  assert.equal(currentAuction(s).opener, second);
});

test('applyAuction: rejects an unfinished auction, or one with no round in progress', () => {
  const g = newGame();
  const s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  throwsGame(() => applyAuction(s, currentAuction(s)), 'AUCTION_NOT_DONE');
  throwsGame(() => applyAuction(g, currentAuction(s)), 'NO_AUCTION'); // no round started
});

/** A finished auction built by hand with chosen parameters (defaults = what the engine expects). */
function handmade(s, { itemId, opener, money } = {}) {
  const a = currentAuction(s);
  const fresh = createAuction({
    itemId: itemId ?? a.itemId, opener: opener ?? a.opener, money: money ?? a.money,
  });
  return accept(offer(fresh, { to: fresh.opener, amount: 0 }));
}

test('applyAuction: rejects an auction for a different item, opener or money', () => {
  const g = newGame({}, 3);
  const s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  const a = currentAuction(s);
  const wrongOpener = a.opener === 'p1' ? 'p2' : 'p1';
  assert.ok(applyAuction(s, handmade(s)), 'control: the expected auction is accepted');
  throwsGame(() => applyAuction(s, handmade(s, { itemId: s.round.itemOrder[1] })), 'AUCTION_MISMATCH');
  throwsGame(() => applyAuction(s, handmade(s, { opener: wrongOpener })), 'AUCTION_MISMATCH');
  throwsGame(() => applyAuction(s, handmade(s, { money: { p1: 99, p2: 20 } })), 'AUCTION_MISMATCH');
  throwsGame(() => applyAuction(s, handmade(s, { money: { p1: 20, p2: 99 } })), 'AUCTION_MISMATCH');
});

test('applyAuction: the next auction starts with the money left; a stale one is refused', () => {
  const g = newGame({}, 3);
  let s = startRound(g, scenarios[g.roundScenarioIds[0]]);
  let a = currentAuction(s);
  a = accept(offer(a, { to: a.opener, amount: 4 }));
  s = applyAuction(s, a);
  assert.equal(currentAuction(s).money[a.opener], 16);
  throwsGame(() => applyAuction(s, handmade(s, { money: { p1: 20, p2: 20 } })), 'AUCTION_MISMATCH');
});

test('opener alternates item after item and continues across rounds without restarting', () => {
  let s = newGame({ rounds: 3 }, 11);
  const first = s.currentOpener;
  const openers = [];
  for (let r = 0; r < 3; r++) {
    s = startRound(s, scenarios[s.roundScenarioIds[s.roundIndex]]);
    while (!isRoundOver(s)) {
      let a = currentAuction(s);
      openers.push(a.opener);
      a = accept(offer(a, { to: a.opener, amount: 0 }));
      s = applyAuction(s, a);
    }
    s = finishRound(s, scenarioOf(s));
  }
  assert.equal(openers.length, 30);
  openers.forEach((o, i) => {
    const expected = i % 2 === 0 ? first : first === 'p1' ? 'p2' : 'p1';
    assert.equal(o, expected, `item ${i}`);
  });
  assert.ok(isGameOver(s));
});

test('budget is reset at every round', () => {
  let s = newGame({ budget: 15 }, 4);
  s = playRound(s, { bid: 1 }); // each opener pays 1 per item they keep
  assert.ok(s.round.money.p1 < 15 || s.round.money.p2 < 15);
  s = finishRound(s, scenarioOf(s));
  s = startRound(s, scenarios[s.roundScenarioIds[s.roundIndex]]);
  assert.deepEqual(s.round.money, { p1: 15, p2: 15 });
  assert.deepEqual(s.round.owned, { p1: [], p2: [] });
});

test('round is over only after all 10 items; auction becomes null', () => {
  const g = newGame();
  assert.ok(!isRoundOver(startRound(g, scenarios[g.roundScenarioIds[0]])));
  const s = playRound(g);
  assert.ok(isRoundOver(s));
  assert.equal(currentAuction(s), null);
  assert.equal(s.round.log.length, 10);
  assert.equal(s.round.owned.p1.length + s.round.owned.p2.length, 10);
});

test('finishRound: needs a finished round, records result, cannot be repeated', () => {
  const g = newGame();
  const sc = scenarios[g.roundScenarioIds[0]];
  throwsGame(() => finishRound(startRound(g, sc), sc), 'ROUND_NOT_OVER');
  let s = playRound(g);
  s = finishRound(s, sc);
  assert.equal(s.results.length, 1);
  assert.equal(s.roundIndex, 1);
  throwsGame(() => finishRound(s, sc), 'ROUND_ALREADY_FINISHED');
});

test('finishRound: the scenario must be the one of the round', () => {
  const g = newGame();
  const s = playRound(g);
  const wrong = scenarios[g.roundScenarioIds[0] === 's1' ? 's2' : 's1']; // same shape, different id
  throwsGame(() => finishRound(s, wrong), 'WRONG_SCENARIO');
  throwsGame(() => finishRound(s, undefined), 'WRONG_SCENARIO');
});

test('finishRound (auto): computes winner and breakdown itself; passing a verdict is an error', () => {
  const g = newGame();
  const sc = scenarios[g.roundScenarioIds[0]];
  const played = playRound(g);
  throwsGame(() => finishRound(played, sc, { winner: 'p1' }), 'UNEXPECTED_VERDICT');
  const s = finishRound(played, sc);
  const bd = roundBreakdown(played, sc);
  const v = s.results[0].verdict;
  assert.equal(v.source, 'auto');
  assert.equal(v.winner, bd.winner);
  assert.deepEqual(v.breakdown, bd);
  assert.deepEqual(s.results[0].breakdown, bd);
  assert.deepEqual(s.round.verdict, v);
});

test('finishRound (human): verdict required, no draw, only p1/p2', () => {
  const g = newGame({ judgeMode: 'human' });
  const sc = scenarios[g.roundScenarioIds[0]];
  const s = playRound(g);
  throwsGame(() => finishRound(s, sc), 'INVALID_VERDICT');
  throwsGame(() => finishRound(s, sc, null), 'INVALID_VERDICT');
  throwsGame(() => finishRound(s, sc, {}), 'INVALID_VERDICT');
  throwsGame(() => finishRound(s, sc, { winner: null }), 'INVALID_VERDICT');
  throwsGame(() => finishRound(s, sc, { winner: 'p3' }), 'INVALID_VERDICT');
  assert.equal(finishRound(s, sc, { winner: 'p2' }).results.length, 1);
});

test('human judge: the verdict is not overridden, the breakdown is always stored, totals are right', () => {
  const g = newGame({ judgeMode: 'human' }, 6);
  const sc = scenarios[g.roundScenarioIds[0]];
  let s = playRound(g);
  const breakdown = roundBreakdown(s, sc);
  // judge picks the loser of the automatic scoring (or p1 if draw): verdict is NOT overridden
  const humanWinner = breakdown.winner === 'p1' ? 'p2' : 'p1';
  s = finishRound(s, sc, { winner: humanWinner });
  const res = s.results[0];
  assert.equal(res.verdict.winner, humanWinner);
  assert.equal(res.verdict.source, 'human');
  assert.deepEqual(res.breakdown, breakdown);
  assert.deepEqual(res.verdict.breakdown, breakdown);
  const sum = gameSummary(s);
  assert.equal(sum.roundsWon[humanWinner], 1);
  assert.deepEqual(sum.totalScore, { p1: breakdown.p1.total, p2: breakdown.p2.total });
  assert.deepEqual(sum.rounds[0].scores, sum.totalScore);
  assert.notEqual(sum.totalScore.p1 + sum.totalScore.p2, 0, 'totals are not silently zero');
});

test('human rounds: summary tieBreak is null, breakdown keeps the automatic tie-break; auto rounds keep theirs', () => {
  let s = newGame({ judgeMode: 'human', rounds: 2 }, 8);
  for (let r = 0; r < 2; r++) {
    s = playRound(s);
    s = finishRound(s, scenarioOf(s), { winner: 'p1' });
  }
  gameSummary(s).rounds.forEach((r) => {
    assert.equal(r.tieBreak, null);
    assert.ok(['score', 'money', 'draw'].includes(r.breakdown.tieBreak));
  });
  let a = newGame({ judgeMode: 'auto', rounds: 1 }, 8);
  a = playRound(a);
  a = finishRound(a, scenarioOf(a));
  assert.ok(['score', 'money', 'draw'].includes(gameSummary(a).rounds[0].tieBreak));
});

/** Plays one round of the flat scenario (all scores 0). `bidFirst` = what the first opener pays to keep item 1. */
function playFlat({ bidFirst = 0 } = {}) {
  let s = createGame({ settings: settings({ rounds: 1 }), scenarioIds: ['flat'], rng: createRng(5) });
  const first = s.currentOpener;
  s = startRound(s, flatScenario);
  while (!isRoundOver(s)) {
    let a = currentAuction(s);
    const amount = s.round.itemIndex === 0 ? bidFirst : 0;
    a = offer(a, { to: a.opener, amount });
    if (a.status !== 'done') a = accept(a);
    s = applyAuction(s, a);
  }
  return { s, first };
}

test('automatic tie-break: equal score -> more leftover money wins (tieBreak "money")', () => {
  const { s, first } = playFlat({ bidFirst: 3 });
  assert.deepEqual(s.round.money, first === 'p1' ? { p1: 17, p2: 20 } : { p1: 20, p2: 17 });
  const bd = roundBreakdown(s, flatScenario);
  assert.equal(bd.p1.total, 0);
  assert.equal(bd.p2.total, 0);
  assert.equal(bd.tieBreak, 'money');
  const rival = first === 'p1' ? 'p2' : 'p1';
  assert.equal(bd.winner, rival);
  const done = finishRound(s, flatScenario);
  assert.equal(done.results[0].verdict.winner, rival);
  assert.equal(gameSummary(done).rounds[0].tieBreak, 'money');
});

test('automatic tie-break: equal score and equal money -> the round is a draw', () => {
  const { s } = playFlat({ bidFirst: 0 });
  assert.deepEqual(s.round.money, { p1: 20, p2: 20 });
  const done = finishRound(s, flatScenario);
  assert.equal(done.results[0].verdict.winner, null);
  const sum = gameSummary(done);
  assert.equal(sum.rounds[0].tieBreak, 'draw');
  assert.deepEqual(sum.roundsWon, { p1: 0, p2: 0 });
  assert.equal(sum.winner, null);
});

test('roundBreakdown: total = items + active combos; no round -> GameError', () => {
  const g = newGame({}, 12);
  const s = playRound(g);
  const sc = scenarioOf(s);
  const bd = roundBreakdown(s, sc);
  const byId = new Map(sc.items.map((i) => [i.id, i.score]));
  for (const p of ['p1', 'p2']) {
    const items = s.round.owned[p].reduce((t, id) => t + byId.get(id), 0);
    const combo = s.round.owned[p].includes(`${sc.id}-8`) && s.round.owned[p].includes(`${sc.id}-9`) ? 4 : 0;
    assert.equal(bd[p].total, items + combo);
  }
  throwsGame(() => roundBreakdown(g, sc), 'NO_ROUND');
});

function fakeFinished(results, judgeMode = 'auto') {
  return {
    settings: settings({ judgeMode }),
    roundScenarioIds: results.map((_, i) => `r${i}`),
    results: results.map((r, i) => ({
      scenarioId: `r${i}`,
      owned: { p1: [], p2: [] },
      moneyLeft: { p1: 0, p2: 0 },
      verdict: { winner: r.winner, source: judgeMode === 'auto' ? 'auto' : 'human' },
      breakdown: { p1: { total: r.p1 }, p2: { total: r.p2 }, winner: r.winner, tieBreak: 'score' },
    })),
  };
}

test('gameSummary: most rounds won wins, even with lower total score', () => {
  const s = gameSummary(fakeFinished([
    { winner: 'p1', p1: 1, p2: 0 }, { winner: 'p1', p1: 1, p2: 0 }, { winner: 'p2', p1: 0, p2: 50 },
  ]));
  assert.deepEqual(s.roundsWon, { p1: 2, p2: 1 });
  assert.deepEqual(s.totalScore, { p1: 2, p2: 50 });
  assert.equal(s.winner, 'p1');
  assert.equal(s.tieBreak, 'rounds');
});

test('gameSummary: rounds tied -> total score decides in auto mode', () => {
  const s = gameSummary(fakeFinished([
    { winner: 'p1', p1: 10, p2: 9 }, { winner: 'p2', p1: 0, p2: 8 },
  ]));
  assert.equal(s.winner, 'p2');
  assert.equal(s.tieBreak, 'score');
});

test('gameSummary: rounds tied in human mode -> declared draw; draw rounds count for nobody', () => {
  const s = gameSummary(fakeFinished([
    { winner: 'p1', p1: 10, p2: 9 }, { winner: 'p2', p1: 0, p2: 8 }, { winner: null, p1: 1, p2: 1 },
  ], 'human'));
  assert.deepEqual(s.roundsWon, { p1: 1, p2: 1 });
  assert.equal(s.winner, null);
  assert.equal(s.tieBreak, 'draw');
});

test('gameSummary: full tie in auto mode is a draw', () => {
  const s = gameSummary(fakeFinished([{ winner: 'p1', p1: 5, p2: 4 }, { winner: 'p2', p1: 4, p2: 5 }]));
  assert.equal(s.winner, null);
  assert.equal(s.rounds.length, 2);
});

test('full game flow end to end', () => {
  let s = newGame({ rounds: 2 }, 21);
  for (let r = 0; r < 2; r++) {
    assert.ok(!isGameOver(s));
    s = playRound(s);
    s = finishRound(s, scenarioOf(s));
  }
  assert.ok(isGameOver(s));
  throwsGame(() => startRound(s, scenarios.s1), 'GAME_OVER');
  const sum = gameSummary(s);
  assert.equal(sum.rounds.length, 2);
  assert.equal(sum.roundsWon.p1 + sum.roundsWon.p2 <= 2, true);
});

test('state is immutable: previous states are not modified', () => {
  const g = newGame();
  const snapshot = JSON.stringify(g);
  startRound(g, scenarios[g.roundScenarioIds[0]]);
  assert.equal(JSON.stringify(g), snapshot);
});
