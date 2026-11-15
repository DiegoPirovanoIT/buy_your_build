// Game orchestration (GAME_DESIGN §3, ARCHITECTURE §4.4). Pure, immutable state.
import { createRng } from './rng.js';
import { createAuction } from './auction.js';
import { compareBuilds } from './scoring.js';

const JUDGE_MODES = ['auto', 'human'];
const other = (p) => (p === 'p1' ? 'p2' : 'p1');

/** Error thrown by every invalid call into this module; `code` is a stable machine-readable string. */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new GameError(code, message); };

/**
 * `scenarioIds` = the enabled scenarios to draw from. The rng is used only here: it picks the round
 * scenarios (no repeats), the first opener, and a seed stored in the state, from which startRound
 * derives (deterministically) the item order of each round. The state therefore stays serializable.
 */
export function createGame({ settings, scenarioIds, rng = createRng() } = {}) {
  const rounds = settings?.rounds;
  const budget = settings?.budget;
  if (!Number.isInteger(rounds) || rounds < 1) fail('INVALID_SETTINGS', 'settings.rounds must be an integer >= 1');
  if (!Number.isInteger(budget) || budget < 0) fail('INVALID_SETTINGS', 'settings.budget must be an integer >= 0');
  if (!JUDGE_MODES.includes(settings.judgeMode)) {
    fail('INVALID_SETTINGS', `settings.judgeMode must be "auto" or "human" (got ${JSON.stringify(settings.judgeMode)})`);
  }
  if (!Array.isArray(scenarioIds)) fail('INVALID_ARGS', 'scenarioIds must be an array');
  const pool = [...new Set(scenarioIds)];
  if (pool.length < rounds) {
    fail('NOT_ENOUGH_SCENARIOS', `Not enough scenarios: ${pool.length} available, ${rounds} rounds`);
  }
  return {
    settings: { ...settings },
    seed: rng.int(0, 0xffffffff),
    roundScenarioIds: rng.shuffle(pool).slice(0, rounds),
    roundIndex: 0,
    currentOpener: rng.pick(['p1', 'p2']),
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
  if (isGameOver(state)) fail('GAME_OVER', 'The game is over');
  if (state.round && !state.round.verdict) fail('ROUND_NOT_FINISHED', 'Current round not finished');
  const expected = state.roundScenarioIds[state.roundIndex];
  if (scenario?.id !== expected) {
    fail('WRONG_SCENARIO', `Expected scenario "${expected}" for round ${state.roundIndex}, got "${scenario?.id}"`);
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
  round.auction = openAuction(round, state.currentOpener);
  return { ...state, round };
}

export function currentAuction(state) {
  return state.round?.auction ?? null;
}

/**
 * Registers a finished auction: pays, assigns the item, flips the opener, opens the next auction.
 * The auction must be the one given by `currentAuction`, then played with offer/accept: the engine checks
 * that item, opener and money are the ones it expects.
 */
export function applyAuction(state, auction) {
  const round = state.round;
  const expected = currentAuction(state);
  if (!round || !expected) fail('NO_AUCTION', 'No auction in progress');
  if (!auction || auction.status !== 'done' || !auction.result) fail('AUCTION_NOT_DONE', 'Auction not finished');
  if (auction.itemId !== expected.itemId) fail('AUCTION_MISMATCH', 'Auction is for a different item');
  if (auction.opener !== expected.opener) fail('AUCTION_MISMATCH', 'Auction has a different opener than expected');
  if (auction.money?.p1 !== expected.money.p1 || auction.money?.p2 !== expected.money.p2) {
    fail('AUCTION_MISMATCH', 'Auction money differs from the money the players have');
  }
  const { owner, payer, paid } = auction.result;
  const money = { ...round.money, [payer]: round.money[payer] - paid };
  if (!(money[payer] >= 0)) fail('NEGATIVE_MONEY', "Payment exceeds the payer's money");
  const next = {
    ...round,
    money,
    owned: { ...round.owned, [owner]: [...round.owned[owner], auction.itemId] },
    log: [...round.log, { itemId: auction.itemId, owner, payer, paid, history: auction.history }],
    itemIndex: round.itemIndex + 1,
    auction: null,
  };
  const currentOpener = other(state.currentOpener); // alternation continues across items and rounds
  if (next.itemIndex < next.itemOrder.length) next.auction = openAuction(next, currentOpener);
  return { ...state, round: next, currentOpener };
}

export function isRoundOver(state) {
  const r = state.round;
  return !!r && r.itemIndex >= r.itemOrder.length;
}

export function isGameOver(state) {
  return state.results.length >= state.roundScenarioIds.length;
}

/**
 * Automatic breakdown of the current round (always computable, also in human-judge mode, "for curiosity").
 * Same shape as compareBuilds: { p1, p2, winner, tieBreak }.
 */
export function roundBreakdown(state, scenario) {
  const r = state.round;
  if (!r) fail('NO_ROUND', 'No round in progress');
  return compareBuilds(scenario, r.owned, r.money);
}

/**
 * Closes the round. The engine always computes the breakdown itself; the source follows `settings.judgeMode`.
 * - "auto": do NOT pass a verdict; the winner comes from the breakdown (null = draw round).
 * - "human": `verdict = { winner: "p1"|"p2" }` is required (no draws).
 * `scenario` must be the one of the current round.
 */
export function finishRound(state, scenario, verdict) {
  if (!isRoundOver(state)) fail('ROUND_NOT_OVER', 'Round not over');
  const r = state.round;
  if (r.verdict) fail('ROUND_ALREADY_FINISHED', 'Round already finished');
  if (scenario?.id !== r.scenarioId) {
    fail('WRONG_SCENARIO', `Expected scenario "${r.scenarioId}", got "${scenario?.id}"`);
  }
  const breakdown = roundBreakdown(state, scenario);
  let v;
  if (state.settings.judgeMode === 'auto') {
    if (verdict !== undefined) fail('UNEXPECTED_VERDICT', 'In auto mode the engine computes the verdict: do not pass one');
    v = { winner: breakdown.winner, source: 'auto', breakdown };
  } else {
    if (verdict === undefined || verdict === null) {
      fail('INVALID_VERDICT', 'Human mode requires a verdict { winner: "p1"|"p2" }');
    }
    if (verdict.winner !== 'p1' && verdict.winner !== 'p2') {
      fail('INVALID_VERDICT', `A human verdict needs winner "p1" or "p2" (got ${JSON.stringify(verdict.winner)}); draws are not allowed`);
    }
    v = { winner: verdict.winner, source: 'human', breakdown };
  }
  return {
    ...state,
    roundIndex: state.roundIndex + 1,
    round: { ...r, verdict: v },
    results: [
      ...state.results,
      { scenarioId: r.scenarioId, owned: r.owned, moneyLeft: r.money, verdict: v, breakdown },
    ],
  };
}

/**
 * Winner = most rounds won. If tied: in auto mode the total score decides, otherwise (or if still tied) draw.
 * tieBreak: "rounds" | "score" | "draw".
 * In human mode `totalScore` and `rounds[i].scores` are informational only (they never decide anything) and
 * `rounds[i].tieBreak` is null: the judge decided; the automatic tie-break stays in `rounds[i].breakdown.tieBreak`.
 */
export function gameSummary(state) {
  const roundsWon = { p1: 0, p2: 0 };
  const totalScore = { p1: 0, p2: 0 };
  const rounds = state.results.map((res) => {
    if (res.verdict.winner) roundsWon[res.verdict.winner]++;
    const scores = { p1: res.breakdown.p1.total, p2: res.breakdown.p2.total };
    totalScore.p1 += scores.p1;
    totalScore.p2 += scores.p2;
    return {
      scenarioId: res.scenarioId,
      winner: res.verdict.winner,
      source: res.verdict.source,
      tieBreak: res.verdict.source === 'human' ? null : res.breakdown.tieBreak,
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
