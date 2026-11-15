// Game orchestration (GAME_DESIGN §3, ARCHITECTURE §4.4). Pure, immutable state.
import { createRng } from './rng.js';
import { createAuction } from './auction.js';
import { compareBuilds } from './scoring.js';

const other = (p) => (p === 'p1' ? 'p2' : 'p1');

/**
 * `scenarioIds` = the enabled scenarios to draw from. The rng is used only here: it picks the round
 * scenarios (no repeats), the first opener, and a seed stored in the state, from which startRound
 * derives (deterministically) the item order of each round. The state therefore stays serializable.
 */
export function createGame({ settings, scenarioIds, rng = createRng() }) {
  const rounds = settings?.rounds;
  const budget = settings?.budget;
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('settings.rounds must be an integer >= 1');
  if (!Number.isInteger(budget) || budget < 0) throw new Error('settings.budget must be an integer >= 0');
  const pool = [...new Set(scenarioIds)];
  if (pool.length < rounds) {
    throw new Error(`Not enough scenarios: ${pool.length} available, ${rounds} rounds`);
  }
  return {
    settings: { ...settings },
    seed: rng.int(0, 0xffffffff),
    roundScenarioIds: rng.shuffle(pool).slice(0, rounds),
    roundIndex: 0,
    nextOpener: rng.pick(['p1', 'p2']),
    round: null,
    results: [],
  };
}

function roundRng(state) {
  return createRng((state.seed + Math.imul(state.roundIndex + 1, 0x9e3779b1)) >>> 0);
}

function openAuction(round, opener) {
  return createAuction({ itemId: round.itemOrder[round.itemIndex], opener, money: round.money });
}

/** Starts the round `state.roundIndex`: shuffles the items, resets the budget, opens the first auction. */
export function startRound(state, scenario) {
  if (isGameOver(state)) throw new Error('The game is over');
  if (state.round && !state.round.verdict) throw new Error('Current round not finished');
  const expected = state.roundScenarioIds[state.roundIndex];
  if (scenario.id !== expected) {
    throw new Error(`Expected scenario "${expected}" for round ${state.roundIndex}, got "${scenario.id}"`);
  }
  const budget = state.settings.budget;
  const itemOrder = roundRng(state).shuffle(scenario.items.map((i) => i.id));
  const round = {
    scenarioId: scenario.id,
    itemOrder,
    itemIndex: 0,
    money: { p1: budget, p2: budget },
    owned: { p1: [], p2: [] },
    log: [],
    auction: null,
    verdict: null,
  };
  round.auction = openAuction(round, state.nextOpener);
  return { ...state, round };
}

export function currentAuction(state) {
  return state.round?.auction ?? null;
}

/** Registers a finished auction: pays, assigns the item, flips the opener, opens the next auction. */
export function applyAuction(state, auction) {
  const round = state.round;
  const expected = currentAuction(state);
  if (!round || !expected) throw new Error('No auction in progress');
  if (auction.status !== 'done') throw new Error('Auction not finished');
  if (auction.itemId !== expected.itemId) throw new Error('Auction is for a different item');
  const { owner, payer, paid } = auction.result;
  const money = { ...round.money, [payer]: round.money[payer] - paid };
  if (money[payer] < 0) throw new Error('Negative money');
  const next = {
    ...round,
    money,
    owned: { ...round.owned, [owner]: [...round.owned[owner], auction.itemId] },
    log: [...round.log, { itemId: auction.itemId, owner, payer, paid, history: auction.history }],
    itemIndex: round.itemIndex + 1,
    auction: null,
  };
  const nextOpener = other(state.nextOpener); // alternation continues across items and rounds
  if (next.itemIndex < next.itemOrder.length) next.auction = openAuction(next, nextOpener);
  return { ...state, round: next, nextOpener };
}

export function isRoundOver(state) {
  const r = state.round;
  return !!r && r.itemIndex >= r.itemOrder.length;
}

export function isGameOver(state) {
  return state.results.length >= state.roundScenarioIds.length;
}

/** Automatic breakdown (always computable, also in human-judge mode, "for curiosity"). */
export function roundBreakdown(state, scenario) {
  const r = state.round;
  return compareBuilds(scenario, r.owned, r.money);
}

/** Verdict produced by the automatic scoring. */
export function autoVerdict(state, scenario) {
  const breakdown = roundBreakdown(state, scenario);
  return { winner: breakdown.winner, source: 'auto', breakdown };
}

/**
 * Closes the round. verdict = { winner: "p1"|"p2"|null, source: "auto"|"human", breakdown? }.
 * A human verdict cannot be a draw. Pass `breakdown` (roundBreakdown) to keep the scores for the summary.
 */
export function finishRound(state, verdict) {
  if (!isRoundOver(state)) throw new Error('Round not over');
  if (state.round.verdict) throw new Error('Round already finished');
  if (verdict.winner !== 'p1' && verdict.winner !== 'p2' && verdict.winner !== null) {
    throw new Error('Invalid winner');
  }
  if (verdict.source !== 'auto' && verdict.source !== 'human') throw new Error('Invalid verdict source');
  if (verdict.source === 'human' && verdict.winner === null) throw new Error('A human verdict cannot be a draw');
  const v = { winner: verdict.winner, source: verdict.source, breakdown: verdict.breakdown ?? null };
  const r = state.round;
  return {
    ...state,
    roundIndex: state.roundIndex + 1,
    round: { ...r, verdict: v },
    results: [
      ...state.results,
      {
        scenarioId: r.scenarioId,
        owned: r.owned,
        moneyLeft: r.money,
        verdict: v,
        breakdown: v.breakdown,
      },
    ],
  };
}

/**
 * Winner = most rounds won. If tied: in auto mode the total score decides, otherwise (or if still tied) draw.
 * tieBreak: "rounds" | "score" | "draw".
 */
export function gameSummary(state) {
  const roundsWon = { p1: 0, p2: 0 };
  const totalScore = { p1: 0, p2: 0 };
  const rounds = state.results.map((res) => {
    if (res.verdict.winner) roundsWon[res.verdict.winner]++;
    const scores = res.breakdown
      ? { p1: res.breakdown.p1.total, p2: res.breakdown.p2.total }
      : { p1: 0, p2: 0 };
    totalScore.p1 += scores.p1;
    totalScore.p2 += scores.p2;
    return {
      scenarioId: res.scenarioId,
      winner: res.verdict.winner,
      source: res.verdict.source,
      tieBreak: res.breakdown?.tieBreak ?? null,
      scores,
      moneyLeft: res.moneyLeft,
      owned: res.owned,
      breakdown: res.breakdown,
    };
  });
  let winner = null;
  let tieBreak = 'draw';
  if (roundsWon.p1 !== roundsWon.p2) {
    winner = roundsWon.p1 > roundsWon.p2 ? 'p1' : 'p2';
    tieBreak = 'rounds';
  } else if (state.settings.judgeMode === 'auto' && totalScore.p1 !== totalScore.p2) {
    winner = totalScore.p1 > totalScore.p2 ? 'p1' : 'p2';
    tieBreak = 'score';
  }
  return { roundsWon, totalScore, winner, tieBreak, rounds };
}
