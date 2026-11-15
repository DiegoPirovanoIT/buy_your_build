// Auction engine for a single item (GAME_DESIGN §4, ARCHITECTURE §4.2).
// Pure functions, immutable state: every action returns a new AuctionState.

export class AuctionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuctionError';
    this.code = code;
  }
}

const other = (p) => (p === 'p1' ? 'p2' : 'p1');
const isPlayer = (p) => p === 'p1' || p === 'p2';
const isMoney = (n) => Number.isInteger(n) && n >= 0;

/** Starts an auction: status "awaiting-open", the opener must make the first offer. */
export function createAuction({ itemId, opener, money }) {
  if (!isPlayer(opener)) throw new AuctionError('INVALID_ARGS', `Invalid opener: ${opener}`);
  if (!money || !isMoney(money.p1) || !isMoney(money.p2)) {
    throw new AuctionError('INVALID_ARGS', 'money must be { p1, p2 } with non-negative integers');
  }
  return {
    itemId,
    opener,
    money: { p1: money.p1, p2: money.p2 },
    turn: opener,
    status: 'awaiting-open',
    current: null,
    history: [],
    result: null,
  };
}

/**
 * What the player on turn may do.
 * take = "lo prendo", give = "lo do all'altro"; null = not available.
 */
export function legalOffers(state) {
  if (state.status === 'done') return { canAccept: false, take: null, give: null };
  const me = state.turn;
  const cash = state.money[me];

  if (state.status === 'awaiting-open') {
    return {
      canAccept: false,
      take: { min: 0, max: cash },
      give: cash >= 1 ? { min: 1, max: cash } : null,
    };
  }

  // bidding: a counter must flip who gets the item and cost at least current + 1.
  const min = state.current.amount + 1;
  const range = min <= cash ? { min, max: cash } : null;
  // Item currently goes to me -> I can only counter by giving it to the opponent; otherwise by taking it.
  const goesToMe = state.current.to === me;
  return {
    canAccept: true,
    take: goesToMe ? null : range,
    give: goesToMe ? range : null,
  };
}

/** `auto` is true when the auction closed by automatic acceptance (opponent could not counter), false for accept(). */
function finish(state, current, history, auto) {
  return {
    ...state,
    current,
    history,
    status: 'done',
    result: { owner: current.to, payer: current.by, paid: current.amount, auto },
  };
}

/** The player on turn makes an offer (opening or counter). `to` = who receives the item. */
export function offer(state, { to, amount } = {}) {
  if (state.status === 'done') throw new AuctionError('AUCTION_DONE', 'Auction already finished');
  if (!isPlayer(to)) throw new AuctionError('INVALID_ARGS', `Invalid recipient: ${to}`);
  if (!Number.isInteger(amount)) throw new AuctionError('ILLEGAL_AMOUNT', 'Amount must be an integer');

  const by = state.turn;
  const legal = legalOffers(state);
  const side = to === by ? legal.take : legal.give;
  if (!side) {
    throw new AuctionError('NOT_ALLOWED', 'This direction is not allowed now (a counter must flip the result)');
  }
  if (amount < side.min || amount > side.max) {
    throw new AuctionError('ILLEGAL_AMOUNT', `Amount must be between ${side.min} and ${side.max}`);
  }

  const current = { by, to, amount };
  const history = [...state.history, current];
  const advanced = { ...state, turn: other(by), status: 'bidding', current, history };

  // Automatic acceptance: the opponent cannot afford a counter-offer.
  const l = legalOffers(advanced);
  if (!l.take && !l.give) return finish(advanced, current, history, true);
  return advanced;
}

/** The player on turn accepts the last offer: the auction ends, only the last bidder pays. */
export function accept(state) {
  if (state.status === 'done') throw new AuctionError('AUCTION_DONE', 'Auction already finished');
  if (state.status === 'awaiting-open') {
    throw new AuctionError('NOT_ALLOWED', 'The opener must make an offer first');
  }
  return finish(state, state.current, state.history, false);
}
