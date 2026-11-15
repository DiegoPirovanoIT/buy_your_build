// Round result (GAME_DESIGN §8.5): winner, automatic scores (or "for curiosity" in human mode), partial score.
import {
  el, createButton, createModal, createGameBar, createRoundBreakdown, applyScenarioTheme, playerNames,
} from './components.js';
import { gameSummary, isGameOver } from '../engine/game.js';
import { loadScenario } from '../scenarios.js';

export default { mount, unmount };

let alive = false;
let openModal = null;

export function mount(root, params, ctx) {
  alive = true;
  const { store, router } = ctx;
  const game0 = store.get().game;
  if (!game0 || !game0.round || !game0.round.verdict) { router.showScreen('home'); return; }
  const screen = el('section', { class: 'screen screen--result' });
  root.append(screen);
  const promise = params?.scenario ? Promise.resolve(params.scenario) : loadScenario(game0.round.scenarioId);
  promise.then((scenario) => { if (alive) run(root, screen, scenario, ctx); })
    .catch((error) => {
      console.error('roundResult: cannot load the scenario', error);
      screen.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare lo scenario.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    });
}

/** Why the round was decided that way (auto mode). */
export function describeTieBreak(verdict, names, money) {
  const { breakdown } = verdict;
  if (verdict.source !== 'auto') return '';
  if (breakdown.tieBreak === 'money') {
    return `Parità di punteggio: decide chi ha più soldi avanzati (${names.p1} ${money.p1} € contro ${names.p2} ${money.p2} €).`;
  }
  if (breakdown.tieBreak === 'draw') return 'Parità di punteggio e di soldi avanzati: round pari.';
  return '';
}

function run(root, screen, scenario, ctx) {
  const { store, router, events } = ctx;
  applyScenarioTheme(root, scenario);
  const game = store.get().game;
  const names = playerNames(game);
  const round = game.round;
  const verdict = round.verdict;
  const winner = verdict.winner;
  const human = verdict.source === 'human';
  const summary = gameSummary(game);
  const roundNo = game.roundIndex; // finishRound already incremented it: this is the 1-based number of the round just played
  const over = isGameOver(game);

  const scoreBox = (id, { highlight }) => el('div', { class: `result__score result__score--${id}${highlight && winner === id ? ' is-winner' : ''}` },
    el('span', { class: 'result__score-name' }, names[id]),
    el('span', { class: 'result__score-value' }, verdict.breakdown[id].total),
    el('span', { class: 'result__score-money muted' }, `${round.money[id]} € avanzati`));

  const openDetails = () => {
    const content = el('div', {},
      human ? el('p', { class: 'muted' }, 'Il punteggio automatico è solo informativo: ha deciso il giudice.') : null,
      el('p', { class: 'muted' }, `${scenario.emoji} ${scenario.title}`),
      createRoundBreakdown(scenario, verdict.breakdown, names));
    openModal = createModal({ title: 'Come sono stati calcolati i punteggi', content, mount: true });
  };
  const detailsBtn = createButton('Come sono stati calcolati i punteggi', { kind: 'secondary', block: true, onClick: openDetails });

  const tieText = describeTieBreak(verdict, names, round.money);
  const scoresPanel = el('section', { class: 'panel result__scores' },
    el('h2', { class: 'panel__title' }, human ? 'Punteggio automatico (per curiosità)' : 'Punteggi'),
    el('div', { class: 'result__score-row' }, scoreBox('p1', { highlight: !human }), scoreBox('p2', { highlight: !human })),
    tieText ? el('p', { class: 'result__tie' }, tieText) : null,
    detailsBtn);

  const headline = winner
    ? el('h1', { class: `result__winner result__winner--${winner}` }, `${names[winner]} vince il round!`)
    : el('h1', { class: 'result__winner' }, 'Round pari!');
  const sub = human
    ? (winner ? 'Lo ha deciso il giudice.' : '')
    : (verdict.breakdown.tieBreak === 'money' ? 'Spareggio: soldi avanzati.' : winner ? 'Ha la build con il punteggio più alto.' : '');

  const curiosity = createButton('Vedi il punteggio automatico (per curiosità)', {
    kind: 'secondary', block: true,
    onClick: () => { scoresPanel.hidden = false; curiosity.hidden = true; },
  });

  const nextBtn = createButton(over ? 'Risultato finale' : 'Prossimo round', {
    block: true,
    onClick: () => router.showScreen(over ? 'final' : 'intro'),
  });

  scoresPanel.hidden = human;
  curiosity.hidden = !human;

  screen.append(
    createGameBar(ctx, { title: `${scenario.shortTitle} ${scenario.emoji}`, meta: `Round ${roundNo} di ${game.roundScenarioIds.length}` }),
    el('div', { class: 'result__hero' },
      el('p', { class: 'result__trophy', 'aria-hidden': 'true' }, winner ? '🏆' : '🤝'),
      headline,
      sub ? el('p', { class: 'muted' }, sub) : null),
    el('div', { class: 'panel result__rounds' },
      el('h2', { class: 'panel__title' }, 'Round vinti'),
      el('div', { class: 'result__score-row' },
        el('div', { class: 'result__score result__score--p1' },
          el('span', { class: 'result__score-name' }, names.p1), el('span', { class: 'result__score-value' }, summary.roundsWon.p1)),
        el('div', { class: 'result__score result__score--p2' },
          el('span', { class: 'result__score-name' }, names.p2), el('span', { class: 'result__score-value' }, summary.roundsWon.p2)))),
    scoresPanel,
    curiosity,
    nextBtn);

  events.emit('round:end', {
    roundIndex: roundNo - 1,
    winner,
    source: verdict.source,
    tieBreak: verdict.breakdown.tieBreak,
    ...(human ? {} : { scores: { p1: verdict.breakdown.p1.total, p2: verdict.breakdown.p2.total } }),
  });
}

export function unmount() {
  alive = false;
  if (openModal) { openModal.close(); openModal = null; }
}
