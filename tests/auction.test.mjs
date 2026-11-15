import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, offer, accept, legalOffers, AuctionError } from '../js/engine/auction.js';

const start = (opener = 'p1', money = { p1: 20, p2: 20 }) => createAuction({ itemId: 'x', opener, money });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof AuctionError && e.code === code, `expected ${code}`);

test('createAuction: initial state', () => {
  const a = start('p2');
  assert.equal(a.status, 'awaiting-open');
  assert.equal(a.turn, 'p2');
  assert.equal(a.current, null);
  assert.equal(a.result, null);
  assert.deepEqual(a.history, []);
});

test('opening at 0 EUR: opener keeps the item for free', () => {
  let a = offer(start('p2'), { to: 'p2', amount: 0 });
  assert.equal(a.status, 'bidding');
  assert.equal(a.turn, 'p1');
  a = accept(a);
  assert.deepEqual(a.result, { owner: 'p2', payer: 'p2', paid: 0, auto: false });
});

test('opener cannot accept before offering', () => {
  throwsCode(() => accept(start()), 'NOT_ALLOWED');
  assert.equal(legalOffers(start()).canAccept, false);
});

test('opening legal ranges: take 0..money, give 1..money', () => {
  const l = legalOffers(start('p1', { p1: 7, p2: 3 }));
  assert.deepEqual(l.take, { min: 0, max: 7 });
  assert.deepEqual(l.give, { min: 1, max: 7 });
});

test('"give to the other" needs at least 1 EUR', () => {
  throwsCode(() => offer(start(), { to: 'p2', amount: 0 }), 'ILLEGAL_AMOUNT');
  const a = offer(start(), { to: 'p2', amount: 1 });
  assert.equal(a.current.to, 'p2');
});

test('offer above own money is rejected, all-in is allowed', () => {
  throwsCode(() => offer(start('p1', { p1: 5, p2: 20 }), { to: 'p1', amount: 6 }), 'ILLEGAL_AMOUNT');
  throwsCode(() => offer(start('p1', { p1: 5, p2: 20 }), { to: 'p2', amount: 6 }), 'ILLEGAL_AMOUNT');
  const a = offer(start('p1', { p1: 5, p2: 20 }), { to: 'p1', amount: 5 });
  assert.equal(a.current.amount, 5);
});

test('negative and non-integer amounts are rejected', () => {
  throwsCode(() => offer(start(), { to: 'p1', amount: -1 }), 'ILLEGAL_AMOUNT');
  throwsCode(() => offer(start(), { to: 'p1', amount: 1.5 }), 'ILLEGAL_AMOUNT');
  throwsCode(() => offer(start(), { to: 'p1', amount: NaN }), 'ILLEGAL_AMOUNT');
});

test('example 4.5 #1: G1 gives 1, G2 counters 2 giving back, G1 accepts -> G2 pays 2, item to G1', () => {
  let a = offer(start('p1'), { to: 'p2', amount: 1 });
  assert.deepEqual(legalOffers(a), { canAccept: true, take: null, give: { min: 2, max: 20 } });
  a = offer(a, { to: 'p1', amount: 2 });
  a = accept(a);
  assert.deepEqual(a.result, { owner: 'p1', payer: 'p2', paid: 2, auto: false });
});

test('example 4.5 #2: G2 takes at 3, G1 counters 4, G2 accepts -> G1 pays 4 and gets it', () => {
  let a = offer(start('p2'), { to: 'p2', amount: 3 });
  assert.deepEqual(legalOffers(a), { canAccept: true, take: { min: 4, max: 20 }, give: null });
  a = offer(a, { to: 'p1', amount: 4 });
  a = accept(a);
  assert.deepEqual(a.result, { owner: 'p1', payer: 'p1', paid: 4, auto: false });
});

test('example 4.5 #3: opening at 0, counters 1 then 2, last bidder pays', () => {
  let a = offer(start('p1'), { to: 'p1', amount: 0 });
  a = offer(a, { to: 'p2', amount: 1 });
  a = offer(a, { to: 'p1', amount: 2 });
  a = accept(a);
  assert.equal(a.history.length, 3);
  assert.deepEqual(a.result, { owner: 'p1', payer: 'p1', paid: 2, auto: false });
});

test('example 4.5 #4: G2 opens at 0, G1 accepts -> G2 gets it free', () => {
  const a = accept(offer(start('p2'), { to: 'p2', amount: 0 }));
  assert.deepEqual(a.result, { owner: 'p2', payer: 'p2', paid: 0, auto: false });
});

test('after opener keeps it at 0, the other cannot "give to the other"', () => {
  const a = offer(start('p1'), { to: 'p1', amount: 0 });
  const l = legalOffers(a);
  assert.equal(l.give, null);
  assert.deepEqual(l.take, { min: 1, max: 20 });
  throwsCode(() => offer(a, { to: 'p1', amount: 5 }), 'NOT_ALLOWED');
});

test('counter must flip the result: same direction is refused', () => {
  const a = offer(start('p1'), { to: 'p2', amount: 1 }); // item would go to p2
  // p2 on turn: "take" would keep the result unchanged
  throwsCode(() => offer(a, { to: 'p2', amount: 5 }), 'NOT_ALLOWED');
});

test('counter amount below current + 1 -> ILLEGAL_AMOUNT (right direction); same amount refused', () => {
  const a = offer(start('p1'), { to: 'p2', amount: 4 }); // goes to p2; p2 may only "give back"
  throwsCode(() => offer(a, { to: 'p1', amount: 4 }), 'ILLEGAL_AMOUNT');
  const b = offer(a, { to: 'p1', amount: 5 });
  assert.equal(b.current.amount, 5);
});

test('counter above own money rejected', () => {
  const a = offer(start('p1', { p1: 20, p2: 6 }), { to: 'p1', amount: 3 });
  throwsCode(() => offer(a, { to: 'p2', amount: 7 }), 'ILLEGAL_AMOUNT');
  assert.equal(offer(a, { to: 'p2', amount: 6 }).status, 'bidding'); // all-in allowed; p1 can still outbid
});

test('automatic acceptance when the player on turn cannot counter', () => {
  // p1 offers 5 to take it; p2 has only 5 -> cannot pay 6 -> auto accept
  const a = offer(start('p1', { p1: 20, p2: 5 }), { to: 'p1', amount: 5 });
  assert.equal(a.status, 'done');
  assert.deepEqual(a.result, { owner: 'p1', payer: 'p1', paid: 5, auto: true });
});

test('auto accept after a counter-offer too (all-in)', () => {
  let a = offer(start('p1', { p1: 6, p2: 20 }), { to: 'p1', amount: 2 });
  a = offer(a, { to: 'p2', amount: 6 }); // p1 has 6, needs 7 -> auto accept
  assert.equal(a.status, 'done');
  assert.deepEqual(a.result, { owner: 'p2', payer: 'p2', paid: 6, auto: true });
});

test('player with 0 EUR: can only open at 0 (keeps it) or accept', () => {
  const a = start('p1', { p1: 0, p2: 10 });
  const l = legalOffers(a);
  assert.deepEqual(l.take, { min: 0, max: 0 });
  assert.equal(l.give, null);
  throwsCode(() => offer(a, { to: 'p2', amount: 1 }), 'NOT_ALLOWED');
  const b = offer(a, { to: 'p1', amount: 0 });
  assert.equal(b.status, 'bidding'); // p2 can still counter
});

test('opponent at 0 EUR cannot counter: an opening "give for 1 EUR" is accepted automatically', () => {
  const a = offer(start('p1', { p1: 10, p2: 0 }), { to: 'p2', amount: 1 });
  assert.equal(a.status, 'done');
  assert.deepEqual(a.result, { owner: 'p2', payer: 'p1', paid: 1, auto: true });
});

test('opening at exactly 0 EUR with a penniless opponent: accepted automatically, item free', () => {
  const a = offer(start('p1', { p1: 10, p2: 0 }), { to: 'p1', amount: 0 });
  assert.equal(a.status, 'done');
  assert.deepEqual(a.result, { owner: 'p1', payer: 'p1', paid: 0, auto: true });
});

test('automatic acceptance threshold: opponent money = current + 1 can still counter, = current cannot', () => {
  // p1 offers 5; p2 has exactly 6 -> may counter with 6 (all-in): no automatic acceptance
  const open = offer(start('p1', { p1: 20, p2: 6 }), { to: 'p1', amount: 5 });
  assert.equal(open.status, 'bidding');
  assert.deepEqual(legalOffers(open), { canAccept: true, take: { min: 6, max: 6 }, give: null });
  // p2 has 5 -> cannot reach 6 -> automatic
  const auto = offer(start('p1', { p1: 20, p2: 5 }), { to: 'p1', amount: 5 });
  assert.equal(auto.status, 'done');
  assert.equal(auto.result.auto, true);
  // same threshold on a counter: p1 has 8, p2 counters 7 -> p1 can answer with 8; p2 counters 8 -> automatic
  let a = offer(start('p2', { p1: 8, p2: 20 }), { to: 'p2', amount: 3 });
  a = offer(a, { to: 'p1', amount: 7 });
  assert.equal(a.status, 'bidding');
  a = offer(a, { to: 'p2', amount: 8 });
  assert.equal(a.status, 'done');
  assert.equal(a.result.auto, true);
});

test('result.auto is false when the auction is closed with accept()', () => {
  const a = accept(offer(start(), { to: 'p1', amount: 2 }));
  assert.equal(a.result.auto, false);
});

test('only the last bidder pays; money in state is not changed', () => {
  let a = offer(start('p1'), { to: 'p1', amount: 3 });
  a = offer(a, { to: 'p2', amount: 4 });
  a = accept(a);
  assert.equal(a.result.payer, 'p2');
  assert.equal(a.result.paid, 4);
  assert.deepEqual(a.money, { p1: 20, p2: 20 });
});

test('actions on a finished auction throw', () => {
  const a = accept(offer(start(), { to: 'p1', amount: 0 }));
  throwsCode(() => accept(a), 'AUCTION_DONE');
  throwsCode(() => offer(a, { to: 'p1', amount: 5 }), 'AUCTION_DONE');
  assert.deepEqual(legalOffers(a), { canAccept: false, take: null, give: null });
});

test('states are immutable', () => {
  const a = start();
  const b = offer(a, { to: 'p1', amount: 2 });
  assert.equal(a.status, 'awaiting-open');
  assert.equal(a.history.length, 0);
  assert.equal(b.history.length, 1);
});

test('turn alternates and history records every offer', () => {
  let a = offer(start('p1'), { to: 'p1', amount: 0 });
  assert.equal(a.turn, 'p2');
  a = offer(a, { to: 'p2', amount: 1 });
  assert.equal(a.turn, 'p1');
  assert.deepEqual(a.history, [
    { by: 'p1', to: 'p1', amount: 0 },
    { by: 'p2', to: 'p2', amount: 1 },
  ]);
});

test('invalid createAuction arguments', () => {
  throwsCode(() => createAuction({ itemId: 'x', opener: 'p3', money: { p1: 1, p2: 1 } }), 'INVALID_ARGS');
  throwsCode(() => createAuction({ itemId: 'x', opener: 'p1', money: { p1: -1, p2: 1 } }), 'INVALID_ARGS');
});
