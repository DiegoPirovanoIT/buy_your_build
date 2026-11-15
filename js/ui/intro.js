// Round intro (GAME_DESIGN §8.2): loads the scenario, starts the round in the engine, shows the round presentation.
import { el, createButton, createGameBar, applyScenarioTheme, playerNames } from './components.js';
import { startRound, isGameOver } from '../engine/game.js';
import { loadScenario } from '../scenarios.js';

export default { mount, unmount };

let alive = false;

function preloadImages(scenario) {
  for (const item of scenario.items) {
    if (!item.image) continue;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = item.image;
  }
}

export function mount(root, params, ctx) {
  const { store, router, events } = ctx;
  alive = true;
  const game = store.get().game;
  if (!game) { router.showScreen('home'); return; }
  if (isGameOver(game)) { router.showScreen('final'); return; }

  const screen = el('section', { class: 'screen screen--intro' },
    createGameBar(ctx, { title: 'Buy Your Build', meta: `Round ${game.roundIndex + 1} di ${game.roundScenarioIds.length}` }),
    el('p', { class: 'muted intro__loading', role: 'status' }, 'Carico lo scenario…'));
  root.append(screen);

  const showError = (error) => {
    console.error('intro: cannot load the scenario', error);
    screen.replaceChildren(
      el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare lo scenario. Controlla la connessione e riprova.'),
      createButton('Riprova', { block: true, onClick: () => router.showScreen('intro') }),
      createButton('Torna alla home', { kind: 'secondary', block: true, onClick: () => router.showScreen('home') }));
  };

  loadScenario(game.roundScenarioIds[game.roundIndex]).then((scenario) => {
    if (!alive) return;
    let current = store.get().game;
    try {
      // Resume safely if the round was already started (same scenario, no verdict yet).
      const started = current.round && !current.round.verdict && current.round.scenarioId === scenario.id;
      if (!started) {
        current = startRound(current, scenario);
        store.update((s) => ({ ...s, game: current }));
      }
    } catch (error) {
      showError(error);
      return;
    }
    preloadImages(scenario);
    applyScenarioTheme(root, scenario);
    const names = playerNames(current);
    const opener = current.round.auction.opener;
    const total = current.roundScenarioIds.length;

    screen.replaceChildren(
      createGameBar(ctx, { title: 'Buy Your Build', meta: `Round ${current.roundIndex + 1} di ${total}` }),
      el('div', { class: 'intro__body' },
        el('p', { class: 'intro__round' }, `Round ${current.roundIndex + 1} di ${total}`),
        el('p', { class: 'intro__emoji', 'aria-hidden': 'true' }, scenario.emoji),
        el('h1', { class: 'intro__title' }, scenario.title),
        el('p', { class: 'intro__desc' }, scenario.description),
        el('dl', { class: 'summary intro__facts' },
          el('dt', {}, 'Budget'), el('dd', {}, `${current.settings.budget} € a testa`),
          el('dt', {}, 'Oggetti'), el('dd', {}, `${scenario.items.length} all'asta`),
          el('dt', {}, 'Apre per primo'), el('dd', { class: `intro__opener intro__opener--${opener}` }, names[opener]))),
      createButton('Inizia asta', {
        block: true,
        onClick: () => router.showScreen('auction', { scenario }),
      }));
    events.emit('round:start', { roundIndex: current.roundIndex, scenario });
  }).catch((error) => { if (alive) showError(error); });
}

export function unmount() {
  alive = false;
}
