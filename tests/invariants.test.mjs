// Light fuzz with fixed seeds: random but legal play, checking engine invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/engine/rng.js';
import { createAuction, offer, accept, legalOffers } from '../js/engine/auction.js';
import {
  createGame, startRound, currentAuction, applyAuction, finishRound, isRoundOver, isGameOver, gameSummary,
} from '../js/engine/game.js';

const other = (p) => (p === 'p1' ? 'p2' : 'p1');
const MAX_STEPS = 500; // each counter raises the amount by >= 1 and amounts are bounded by money

/** One random legal move for the player on turn. */
function randomMove(a, rng) {
  const l = legalOffers(a);
  const options = [];
  if (l.canAccept) options.push('accept');
  if (l.take) options.push('take');
  if (l.give) options.push('give');
  assert.ok(options.length > 0, 'a live auction always offers at least one move');
  // favour accepting a bit, so that auctions are not always endless duels
  const pick = rng.next() < 0.3 && l.canAccept ? 'accept' : rng.pick(options);
  if (pick === 'accept') return accept(a);
  const side = pick === 'take' ? l.take : l.give;
  const amount = rng.next() < 0.2 ? side.max : rng.int(side.min, Math.min(side.max, side.min + 3));
  return offer(a, { to: pick === 'take' ? a.turn : other(a.turn), amount });
}

function playAuction(a, rng) {
  let steps = 0;
  while (a.status !== 'done') {
    assert.ok(++steps <= MAX_STEPS, 'auction did not terminate');
    const before = a;
    a = randomMove(a, rng);
    assert.deepEqual(before.money, a.money, 'money never changes during the auction');
    assert.equal(before.opener, a.opener);
  }
  return a;
}

function checkAuction(a) {
  const { owner, payer, paid } = a.result;
  assert.ok(Number.isInteger(paid) && paid >= 0);
  assert.ok(paid <= a.money[payer], 'the payer can afford what they pay');
  assert.equal(a.history[0].by, a.opener);
  a.history.forEach((h, i) => {
    assert.ok(h.amount <= a.money[h.by], 'offers never exceed the bidder money');
    assert.ok(h.amount >= 0);
    if (i > 0) {
      assert.equal(h.by, other(a.history[i - 1].by), 'bidders alternate');
      assert.notEqual(h.to, a.history[i - 1].to, 'a counter flips the result');
      assert.ok(h.amount >= a.history[i - 1].amount + 1, 'a counter raises the amount');
    }
  });
  const last = a.history.at(-1);
  assert.deepEqual({ owner, payer, paid }, { owner: last.to, payer: last.by, paid: last.amount });
}

test('fuzz: a few hundred random auctions always end legally', () => {
  const rng = createRng(2024);
  for (let n = 0; n < 400; n++) {
    const money = { p1: rng.int(0, 25), p2: rng.int(0, 25) };
    const a = playAuction(createAuction({ itemId: 'x', opener: rng.pick(['p1', 'p2']), money }), rng);
    assert.equal(a.status, 'done');
    checkAuction(a);
  }
});

const mkScenario = (id) => ({
  id,
  items: Array.from({ length: 10 }, (_, i) => ({ id: `${id}-${i}`, name: `Item ${i}`, score: (i % 7) - 3 })),
  combos: [{ items: [`${id}-1`, `${id}-2`], score: 3, label: 'c', description: 'two items together' }],
});

test('fuzz: complete games keep the money, ownership and opener invariants', () => {
  const scenarios = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, mkScenario(id)]));
  for (let seed = 1; seed <= 30; seed++) {
    const rng = createRng(seed);
    const budget = rng.int(0, 30);
    const judgeMode = seed % 2 ? 'auto' : 'human';
    let s = createGame({ settings: { budget, rounds: 3, judgeMode }, scenarioIds: Object.keys(scenarios), rng });
    let expectedOpener = s.currentOpener;
    while (!isGameOver(s)) {
      const sc = scenarios[s.roundScenarioIds[s.roundIndex]];
      s = startRound(s, sc);
      const paidBy = { p1: 0, p2: 0 };
      while (!isRoundOver(s)) {
        const fresh = currentAuction(s);
        assert.equal(fresh.opener, expectedOpener, 'opener alternates item after item and across rounds');
        expectedOpener = other(expectedOpener);
        const done = playAuction(fresh, rng);
        checkAuction(done);
        paidBy[done.result.payer] += done.result.paid;
        s = applyAuction(s, done);
        assert.ok(s.round.money.p1 >= 0 && s.round.money.p2 >= 0, 'money never negative');
      }
      // every item assigned exactly once
      const all = [...s.round.owned.p1, ...s.round.owned.p2];
      assert.equal(all.length, 10);
      assert.deepEqual([...all].sort(), sc.items.map((i) => i.id).sort());
      assert.equal(new Set(all).size, 10);
      // final money = budget - paid
      assert.equal(s.round.money.p1, budget - paidBy.p1);
      assert.equal(s.round.money.p2, budget - paidBy.p2);
      s = finishRound(s, sc, judgeMode === 'human' ? { winner: rng.pick(['p1', 'p2']) } : undefined);
    }
    const sum = gameSummary(s);
    assert.equal(sum.rounds.length, 3);
    assert.ok(sum.roundsWon.p1 + sum.roundsWon.p2 <= 3);
  }
});
