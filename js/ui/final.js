// Final screen (GAME_DESIGN §8.6, functional version): winner, totals with counter effect, confetti,
// detailed breakdown of ALL rounds, rematch and home.
import { el, createButton, createModal, createRoundBreakdown, playerNames } from './components.js';
import { createGame, gameSummary } from '../engine/game.js';
import { createRng } from '../engine/rng.js';
import { effectiveScenarioIds } from '../settings.js';
import { loadScenario } from '../scenarios.js';
import { countUp } from '../fx/countUp.js';
import { launchConfetti } from '../fx/confetti.js';

export default { mount, unmount };

let alive = false;
let cleanup = [];

export function mount(root, params, ctx) {
  alive = true;
  cleanup = [];
  const { store, router } = ctx;
  const game0 = store.get().game;
  if (!game0 || game0.results.length === 0) { router.showScreen('home'); return; }
  const screen = el('section', { class: 'screen screen--final' }, el('p', { class: 'muted', role: 'status' }, 'Calcolo il risultato…'));
  root.append(screen);
  Promise.all(game0.results.map((r) => loadScenario(r.scenarioId)))
    .then((scenarios) => { if (alive) run(screen, scenarios, ctx); })
    .catch((error) => {
      console.error('final: cannot load the scenarios', error);
      screen.replaceChildren(
        el('p', { class: 'screen__message', role: 'alert' }, 'Non riesco a caricare gli scenari.'),
        createButton('Torna alla home', { block: true, onClick: () => router.showScreen('home') }));
    });
}

/** Headline and reason for the end of the game. */
export function describeOutcome(summary, names, judgeMode) {
  if (!summary.winner) {
    return { title: 'Pareggio!', reason: judgeMode === 'auto' ? 'Stessi round vinti e stesso punteggio totale.' : 'Stessi round vinti.' };
  }
  const other = summary.winner === 'p1' ? 'p2' : 'p1';
  const reason = summary.tieBreak === 'rounds'
    ? `Round vinti: ${summary.roundsWon[summary.winner]} a ${summary.roundsWon[other]}.`
    : `Round pari (${summary.roundsWon.p1} a ${summary.roundsWon.p2}): decide il punteggio totale.`;
  return { title: `${names[summary.winner]} vince la partita!`, reason };
}

function run(screen, scenarios, ctx) {
  const { store, router, events } = ctx;
  const game = store.get().game;
  const names = playerNames(game);
  const summary = gameSummary(game);
  const human = game.settings.judgeMode === 'human';
  const outcome = describeOutcome(summary, names, game.settings.judgeMode);

  const scoreValues = {};
  const card = (id) => {
    const value = el('span', { class: 'final__score-value' }, '0');
    scoreValues[id] = value;
    return el('div', { class: `final__card final__card--${id}${summary.winner === id ? ' is-winner' : ''}` },
      el('span', { class: 'final__name' }, names[id]),
      el('span', { class: 'final__label' }, 'Round vinti'),
      el('span', { class: 'final__rounds' }, summary.roundsWon[id]),
      el('span', { class: 'final__label' }, human ? 'Punteggio (informativo)' : 'Punteggio totale'),
      value);
  };

  const roundsList = el('ul', { class: 'final__list' }, summary.rounds.map((r, i) => {
    const sc = scenarios[i];
    const verdictText = r.winner ? `${names[r.winner]}${human ? ' (scelto dal giudice)' : ''}` : 'Pari';
    return el('li', { class: 'final__round' },
      el('span', { class: 'final__round-title' }, `${i + 1}. ${sc.emoji} ${sc.shortTitle}`),
      el('span', { class: `final__round-winner${r.winner ? ` final__round-winner--${r.winner}` : ''}` }, verdictText),
      el('span', { class: 'final__round-scores muted' }, `${r.scores.p1} – ${r.scores.p2}`));
  }));

  const openDetails = () => {
    const modal = createModal({
      title: 'Come sono stati calcolati i punteggi',
      content: el('div', { class: 'final__details' },
        human ? el('p', { class: 'muted' },
          'Il vincitore di ogni round è stato scelto dal giudice: i punteggi qui sotto sono calcolati automaticamente ma sono solo informativi.') : null,
        summary.rounds.map((r, i) => {
          const sc = scenarios[i];
          return el('section', { class: 'final__detail-round' },
            el('h3', {}, `Round ${i + 1}: ${sc.emoji} ${sc.title}`),
            el('p', { class: 'muted' }, human
              ? (r.winner ? `Il giudice ha scelto: ${names[r.winner]}.` : '')
              : (r.winner ? `Vince ${names[r.winner]}${r.tieBreak === 'money' ? ' (a parità di punteggio, più soldi avanzati)' : ''}.` : 'Round pari.')),
            createRoundBreakdown(sc, r.breakdown, names),
            el('p', { class: 'muted final__money' }, `Soldi avanzati: ${names.p1} ${r.moneyLeft.p1} €, ${names.p2} ${r.moneyLeft.p2} €.`));
        }),
        el('p', { class: 'final__total' }, `Totale: ${names.p1} ${summary.totalScore.p1} – ${names.p2} ${summary.totalScore.p2}`)),
      mount: true,
    });
    cleanup.push(() => modal.close());
  };

  const rematch = () => {
    const { settings, scenarioIndex } = store.get();
    try {
      const fresh = createGame({
        settings: game.settings,
        scenarioIds: effectiveScenarioIds(settings, scenarioIndex.map((s) => s.id)),
        rng: createRng(),
      });
      store.update((s) => ({ ...s, game: fresh }));
      router.showScreen('intro');
    } catch (error) {
      console.error('final: cannot start the rematch', error);
      message.hidden = false;
      message.textContent = 'Non riesco a creare la rivincita. Torna alla home e controlla le impostazioni.';
    }
  };
  const home = () => {
    store.update((s) => ({ ...s, game: null }));
    router.showScreen('home');
  };

  const message = el('p', { class: 'screen__message', role: 'alert', hidden: true });

  screen.replaceChildren(
    el('div', { class: `final__hero${summary.winner ? ` final__hero--${summary.winner}` : ''}` },
      el('p', { class: 'final__trophy', 'aria-hidden': 'true' }, summary.winner ? '🏆' : '🤝'),
      el('h1', { class: 'final__title' }, outcome.title),
      el('p', { class: 'muted final__reason' }, outcome.reason)),
    el('div', { class: 'final__cards' }, card('p1'), card('p2')),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel__title' }, 'Round per round'),
      roundsList),
    message,
    createButton('Come sono stati calcolati i punteggi', { kind: 'secondary', block: true, onClick: openDetails }),
    el('div', { class: 'final__actions' },
      createButton('Rivincita', { onClick: rematch }),
      createButton('Home', { kind: 'secondary', onClick: home })));

  // Counter effect on the totals, then confetti for a winner.
  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending === 0 && summary.winner && alive) cleanup.push(launchConfetti());
  };
  for (const id of ['p1', 'p2']) {
    cleanup.push(countUp(scoreValues[id], 0, summary.totalScore[id], { onDone: done }));
  }
  events.emit('game:end', { winner: summary.winner, summary });
}

export function unmount() {
  alive = false;
  for (const fn of cleanup) fn();
  cleanup = [];
}
