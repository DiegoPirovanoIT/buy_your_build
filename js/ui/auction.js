// Auction screen (GAME_DESIGN §4 and §8.3). The UI never decides what is legal: limits come from engine `legalOffers`.
// Item scores and combos are never shown here.
import {
  el, createButton, createItemCard, createPlayerPanel, createOfferSlider, createAuctionLayout,
  createGameBar, applyScenarioTheme, playerNames,
} from './components.js';
import { offer, accept, legalOffers, AuctionError } from '../engine/auction.js';
import { currentAuction, applyAuction, isRoundOver, finishRound, GameError } from '../engine/game.js';
import { loadScenario } from '../scenarios.js';

export default { mount, unmount };

let alive = false;
const TAP_LOCK_MS = 300;

const other = (p) => (p === 'p1' ? 'p2' : 'p1');

/** "Marco lo prende per 5 €" / "Marco paga 2 € per darlo a Giulia" / "Marco lo tiene gratis". */
export function describeCurrent(current, names) {
  const { by, to, amount } = current;
  if (by === to) return amount === 0 ? `${names[by]} lo tiene gratis` : `${names[by]} lo prende per ${amount} €`;
  return `${names[by]} paga ${amount} € per darlo a ${names[to]}`;
}

/** Plain-language outcome of a finished auction. */
export function describeOutcome(result, itemName, names) {
  const { owner, payer, paid } = result;
  if (owner === payer) {
    return paid === 0 ? `${names[owner]} si prende ${itemName} gratis.` : `${names[owner]} prende ${itemName} e paga ${paid} €.`;
  }
  return `${names[payer]} paga ${paid} € per dare ${itemName} a ${names[owner]}.`;
}

export function mount(root, params, ctx) {
  alive = true;
  const { store, router } = ctx;
  const game0 = store.get().game;
  if (!game0 || !game0.round) { router.showScreen('home'); return; }
  const screen = el('section', { class: 'screen screen--auction' });
  root.append(screen);
  const scenarioPromise = params?.scenario ? Promise.resolve(params.scenario) : loadScenario(game0.round.scenarioId);
  scenarioPromise.then((scenario) => { if (alive) run(root, screen, scenario, ctx); })
    .catch((error) => {
      console.error('auction: cannot load the scenario', error);
      screen.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare lo scenario.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    });
}

function run(root, screen, scenario, ctx) {
  const { store, router, events } = ctx;
  applyScenarioTheme(root, scenario);
  const items = new Map(scenario.items.map((i) => [i.id, i]));
  const total = scenario.items.length;
  const game = () => store.get().game;
  const names = playerNames(game());

  let a = null;        // local copy of the engine AuctionState
  let item = null;
  let phase = 'bidding'; // 'bidding' | 'done'
  let lastIndex = 0;
  // Anti double-tap: right after the controls change (new turn, outcome), taps are ignored for a moment, so that a
  // double tap cannot also act on the controls that replaced the ones just tapped.
  let lockUntil = 0;
  const lock = () => { lockUntil = performance.now() + TAP_LOCK_MS; };
  const locked = () => performance.now() < lockUntil;

  const bar = createGameBar(ctx, { title: `${scenario.shortTitle} ${scenario.emoji}`, meta: '' });
  const itemSlot = el('div', { class: 'auction__item' });
  const status = el('p', { class: 'auction__current', 'aria-live': 'polite' });
  const actionSlot = el('div', { class: 'auction__action' });
  const panels = {
    p1: createPlayerPanel({ id: 'p1', name: names.p1, money: 0, items: [] }),
    p2: createPlayerPanel({ id: 'p2', name: names.p2, money: 0, items: [] }),
  };
  const layout = createAuctionLayout({ top: [itemSlot, status, actionSlot], panels: [panels.p1, panels.p2] });
  screen.replaceChildren(bar, layout);

  function refreshPanels(turn) {
    const round = game().round;
    for (const id of ['p1', 'p2']) {
      panels[id].update({
        name: names[id],
        money: round.money[id],
        items: round.owned[id].map((itemId) => items.get(itemId)),
        isTurn: turn === id,
      });
    }
  }

  function showItem() {
    const g = game();
    a = currentAuction(g);
    if (!a) { leaveAuctions(); return; }
    phase = 'bidding';
    item = items.get(a.itemId);
    lastIndex = g.round.itemIndex;
    bar.setMeta(`Oggetto ${lastIndex + 1}/${total}`);
    itemSlot.replaceChildren(createItemCard(item));
    events.emit('item:reveal', { item, index: lastIndex, opener: a.opener });
    renderTurn();
  }

  function renderTurn() {
    phase = 'bidding';
    lock();
    refreshPanels(a.turn);
    status.textContent = a.current
      ? `Offerta attuale: ${describeCurrent(a.current, names)}`
      : `${names[a.turn]} apre l'asta: fai la prima offerta (anche 0 €).`;
    status.className = `auction__current${a.current ? ` auction__current--${a.current.to === a.current.by ? 'take' : 'give'}` : ''}`;
    const legal = legalOffers(a); // the only source of truth for what is allowed
    const slider = createOfferSlider({
      player: { id: a.turn, name: names[a.turn] },
      other: { id: other(a.turn), name: names[other(a.turn)] },
      take: legal.take,
      give: legal.give,
      canAccept: legal.canAccept,
      onOffer: onOffer,
      onAccept: onAccept,
    });
    actionSlot.replaceChildren(slider);
  }

  function recover(error) {
    if (error instanceof AuctionError || error instanceof GameError) {
      console.warn('auction: action ignored', error.code);
    } else {
      console.error('auction: unexpected error', error);
    }
    if (phase === 'done') renderDone(); else if (a && a.status !== 'done') renderTurn();
  }

  function onOffer({ to, amount }) {
    if (phase !== 'bidding' || locked()) return;
    try {
      const before = a;
      a = offer(a, { to, amount });
      events.emit('offer:made', { by: before.turn, to, amount, isCounter: before.status === 'bidding' });
      if (a.status === 'done') {
        events.emit('offer:accepted', { by: a.turn, current: a.current, auto: true });
        conclude();
      } else {
        renderTurn();
      }
    } catch (error) { recover(error); }
  }

  function onAccept() {
    if (phase !== 'bidding' || locked()) return;
    try {
      const before = a;
      a = accept(a);
      events.emit('offer:accepted', { by: before.turn, current: before.current, auto: false });
      conclude();
    } catch (error) { recover(error); }
  }

  /** The auction is finished: pay, assign (engine), then show the outcome and wait for "Prossimo oggetto". */
  function conclude() {
    phase = 'done'; // set first: a second tap must not conclude twice
    try {
      const { owner, payer, paid, auto } = a.result;
      const moneyBefore = game().round.money[payer];
      store.update((s) => ({ ...s, game: applyAuction(s.game, a) }));
      events.emit('item:assigned', { item, owner, payer, paid, auto, index: lastIndex });
      if (paid > 0) events.emit('money:change', { player: payer, from: moneyBefore, to: moneyBefore - paid });
      renderDone();
    } catch (error) {
      console.error('auction: cannot apply the auction', error);
      actionSlot.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Qualcosa è andato storto con questo oggetto.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    }
  }

  function renderDone() {
    lock();
    const { owner, auto } = a.result;
    refreshPanels(null);
    const over = isRoundOver(game());
    const nextLabel = !over ? 'Prossimo oggetto' : game().settings.judgeMode === 'human' ? 'Vai al giudizio' : 'Vedi il risultato';
    status.textContent = '';
    status.className = 'auction__current';
    actionSlot.replaceChildren(el('section', { class: `auction__result auction__result--${owner}`, 'aria-live': 'polite' },
      el('p', { class: 'auction__result-title' }, 'Aggiudicato!'),
      el('p', { class: 'auction__result-text' }, describeOutcome(a.result, item.name, names)),
      el('p', { class: 'auction__result-note muted' }, auto
        ? `${names[a.turn]} non aveva abbastanza soldi per controbattere: offerta accettata in automatico.`
        : `${names[a.turn]} ha accettato l'offerta.`),
      createButton(nextLabel, { block: true, onClick: onNext })));
  }

  function onNext() {
    if (phase !== 'done' || locked()) return;
    if (isRoundOver(game())) leaveAuctions(); else showItem();
  }

  function leaveAuctions() {
    phase = 'left';
    const g = game();
    if (g.settings.judgeMode === 'human') { router.showScreen('judge', { scenario }); return; }
    try {
      store.update((s) => ({ ...s, game: finishRound(s.game, scenario) }));
      router.showScreen('roundResult', { scenario });
    } catch (error) {
      console.error('auction: cannot finish the round', error);
      actionSlot.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a chiudere il round.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    }
  }

  showItem();
}

export function unmount() {
  alive = false;
}
