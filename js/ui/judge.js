// Human judge screen (GAME_DESIGN §6.1, §8.4): two builds side by side, no money shown.
import { el, createButton, createItemImage, createGameBar, applyScenarioTheme, playerNames } from './components.js';
import { finishRound } from '../engine/game.js';
import { createRng } from '../engine/rng.js';
import { loadScenario } from '../scenarios.js';

export default { mount, unmount };

let alive = false;

export function mount(root, params, ctx) {
  alive = true;
  const { store, router } = ctx;
  const game0 = store.get().game;
  if (!game0 || !game0.round) { router.showScreen('home'); return; }
  const screen = el('section', { class: 'screen screen--judge' });
  root.append(screen);
  const promise = params?.scenario ? Promise.resolve(params.scenario) : loadScenario(game0.round.scenarioId);
  promise.then((scenario) => { if (alive) run(root, screen, scenario, ctx); })
    .catch((error) => {
      console.error('judge: cannot load the scenario', error);
      screen.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare lo scenario.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    });
}

function run(root, screen, scenario, ctx) {
  const { store, router, events } = ctx;
  applyScenarioTheme(root, scenario);
  const game = store.get().game;
  const names = playerNames(game);
  const shuffle = !!game.settings.shuffleSides;
  const items = new Map(scenario.items.map((i) => [i.id, i]));

  // sides[left|right] = player id. With "shuffle sides" the assignment is random and the builds are anonymous.
  const flip = shuffle ? createRng().pick([false, true]) : false;
  const sides = flip ? { left: 'p2', right: 'p1' } : { left: 'p1', right: 'p2' };
  const sideLabel = { left: shuffle ? 'Build A' : names[sides.left], right: shuffle ? 'Build B' : names[sides.right] };

  let selected = null; // 'left' | 'right'
  let confirmed = false;
  let busy = false;

  const cards = {};
  const headings = {};
  for (const side of ['left', 'right']) {
    const owned = game.round.owned[sides[side]].map((id) => items.get(id));
    const heading = el('h2', { class: 'build__title' }, sideLabel[side]);
    headings[side] = heading;
    const list = el('ul', { class: 'build__items' }, owned.length
      ? owned.map((it) => el('li', { class: 'build__item' },
        el('span', { class: 'build__img' }, createItemImage(it)),
        el('span', { class: 'build__name' }, it.name)))
      : el('li', { class: 'build__empty muted' }, 'Nessun oggetto'));
    const card = el('div', {
      role: 'button', tabindex: '0', class: `build build--${shuffle ? 'anon' : sides[side]}`, 'aria-pressed': 'false',
      'aria-label': `Scegli ${sideLabel[side]}`,
    }, heading, list);
    card.addEventListener('click', () => select(side));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(side); }
    });
    cards[side] = card;
  }

  const hint = el('p', { class: 'judge__hint muted' }, 'Tocca la build che preferisci.');
  const confirmBtn = createButton('Conferma', { block: true, disabled: true, onClick: confirm });
  const continueBtn = createButton('Vedi il risultato', { block: true, onClick: next });
  continueBtn.hidden = true;
  const verdict = el('p', { class: 'judge__verdict', 'aria-live': 'polite', hidden: true });

  function select(side) {
    if (confirmed) return;
    selected = side;
    for (const s of ['left', 'right']) {
      cards[s].classList.toggle('is-selected', s === side);
      cards[s].setAttribute('aria-pressed', String(s === side));
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = `Conferma: ${sideLabel[side]}`;
    hint.textContent = 'Puoi cambiare idea finché non confermi.';
  }

  function confirm() {
    if (confirmed || busy || !selected) return;
    busy = true;
    const winner = sides[selected];
    try {
      store.update((s) => ({ ...s, game: finishRound(s.game, scenario, { winner }) }));
    } catch (error) {
      console.error('judge: cannot register the verdict', error);
      busy = false;
      return;
    }
    confirmed = true;
    events.emit('judge:verdict', { winner, side: selected, shuffled: shuffle });
    for (const side of ['left', 'right']) {
      cards[side].setAttribute('aria-disabled', 'true');
      cards[side].tabIndex = -1;
      cards[side].classList.add('is-revealed');
      cards[side].classList.toggle('is-winner', side === selected);
      if (shuffle) {
        headings[side].replaceChildren(`${sideLabel[side]} · `, el('span', { class: `build__owner build__owner--${sides[side]}` }, names[sides[side]]));
      }
      for (const id of game.round.owned[sides[side]]) events.emit('judge:reveal', { side, itemId: id, owner: sides[side] });
    }
    verdict.hidden = false;
    verdict.textContent = `Il giudice ha scelto: ${names[winner]}${shuffle ? ` (${sideLabel[selected]})` : ''}`;
    hint.hidden = true;
    confirmBtn.hidden = true;
    continueBtn.hidden = false;
    busy = false;
  }

  function next() {
    router.showScreen('roundResult', { scenario });
  }

  screen.append(
    createGameBar(ctx, { title: `${scenario.shortTitle} ${scenario.emoji}`, meta: 'Giudizio' }),
    el('h1', { class: 'judge__title' }, 'Quale build è migliore?'),
    el('p', { class: 'muted judge__sub' }, shuffle
      ? 'Le build sono anonime: scegli senza sapere di chi sono.'
      : 'Giudice, guarda le due build e scegli.'),
    el('div', { class: 'judge__builds' }, cards.left, cards.right),
    hint, verdict, confirmBtn, continueBtn);

}

export function unmount() {
  alive = false;
}
