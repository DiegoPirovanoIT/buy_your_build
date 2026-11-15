// Home screen (GAME_DESIGN §8.1): title, "Nuova partita", "Impostazioni", summary of the active settings.
import { el, createButton } from './components.js';
import { createGame } from '../engine/game.js';
import { createRng } from '../engine/rng.js';
import { effectiveScenarioIds, selectedCount, validate } from '../settings.js';

/** Rows of the settings summary: [label, value]. */
export function summaryRows(settings, scenarioCount) {
  const selected = selectedCount(settings, scenarioCount);
  return [
    ['Giocatori', `${settings.player1Name} e ${settings.player2Name}`],
    ['Budget', `${settings.budget} € a round`],
    ['Round', String(settings.rounds)],
    ['Giudice', settings.judgeMode === 'human' ? 'Umano' : 'Automatico (punteggio)'],
    ['Scenari', `${selected} ${selected === 1 ? 'abilitato' : 'abilitati'} su ${scenarioCount}`],
  ];
}

export default { mount, unmount };

let cleanup = [];

export function mount(root, params, ctx) {
  const { store, router } = ctx;
  const { settings, scenarioIndex, scenarioIndexError } = store.get();
  const knownIds = scenarioIndex.map((s) => s.id);

  const message = el('p', { class: 'screen__message', role: 'alert', hidden: true });
  const showMessage = (text) => { message.textContent = text; message.hidden = !text; };

  const startGame = () => {
    const { settings: current, scenarioIndex: index } = store.get();
    const ids = index.map((s) => s.id);
    const result = validate(current, ids.length, ids);
    if (!result.ok) {
      showMessage('Le impostazioni non sono valide: aprile e correggile prima di iniziare.');
      return;
    }
    try {
      const game = createGame({ settings: current, scenarioIds: effectiveScenarioIds(current, ids), rng: createRng() });
      store.update((s) => ({ ...s, game }));
      router.showScreen('intro');
    } catch (error) {
      console.error('home: cannot create the game', error);
      showMessage('Non riesco a creare la partita. Controlla le impostazioni.');
    }
  };

  const newGame = createButton('Nuova partita', { block: true, onClick: startGame });
  const blocked = knownIds.length === 0;
  newGame.disabled = blocked;

  const settingsBtn = createButton('Impostazioni', { kind: 'secondary', block: true, onClick: () => router.showScreen('settings') });

  const summary = el('dl', { class: 'summary' },
    summaryRows(settings, knownIds.length).flatMap(([label, value]) => [
      el('dt', {}, label), el('dd', {}, value)]));

  root.append(el('section', { class: 'screen screen--home' },
    el('header', { class: 'home__hero' },
      el('p', { class: 'home__emoji', 'aria-hidden': 'true' }, '🔨'),
      el('h1', { class: 'home__title' }, 'Buy Your Build'),
      el('p', { class: 'home__tagline' }, 'Asta a due: compra gli oggetti giusti e costruisci la build migliore.')),
    scenarioIndexError
      ? el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare gli scenari. Controlla la connessione e ricarica la pagina.')
      : null,
    message,
    el('div', { class: 'home__actions' }, newGame, settingsBtn),
    el('section', { class: 'panel', 'aria-labelledby': 'home-summary-title' },
      el('h2', { class: 'panel__title', id: 'home-summary-title' }, 'Impostazioni attive'),
      summary)));
  cleanup = [];
}

export function unmount() {
  for (const fn of cleanup) fn();
  cleanup = [];
}
