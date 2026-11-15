// Router (ARCHITECTURE §5). Screens are injected by main.js (configure), so this module imports no UI.
// A screen is { mount(root, params, ctx), unmount() }; ctx = { store, router, events }.
import * as store from './store.js';
import * as events from './events.js';
import { el } from './ui/components.js';

let root = null;
let screens = {};
let current = null; // { name, module }
const ctx = { store, router: null, events };

/** Called once by main.js: `container` = #app, `screenMap` = { name: module }. */
export function configure(container, screenMap) {
  root = container;
  screens = screenMap;
}

/** Name of the screen currently shown (or null). */
export function currentScreen() {
  return current ? current.name : null;
}

/**
 * Unmounts the current screen, mounts `name` in the container and emits `screen:change` { from, to }.
 * A screen without mount() (placeholder, not implemented yet) shows a clear message instead of breaking.
 * A screen that throws while mounting shows an error message with a way back home.
 */
export function showScreen(name, params = {}) {
  if (!root) throw new Error('router: configure() must be called before showScreen()');
  const from = current ? current.name : null;
  if (current && typeof current.module?.unmount === 'function') {
    try { current.module.unmount(); } catch (error) { console.error(`router: unmount of "${from}" failed`, error); }
  }
  root.replaceChildren();
  root.removeAttribute('style'); // a screen may set --accent on #app; do not leak it to the next one
  root.scrollTop = 0;
  window.scrollTo(0, 0);

  const module = screens[name];
  current = { name, module };
  store.update((s) => ({ ...s, ui: { screen: name, params } }));

  if (!module) {
    renderProblem(`La schermata "${name}" non esiste.`);
  } else if (typeof module.mount !== 'function') {
    renderProblem(`La schermata "${name}" non è ancora disponibile.`);
  } else {
    try {
      module.mount(root, params, ctx);
    } catch (error) {
      console.error(`router: mount of "${name}" failed`, error);
      root.replaceChildren();
      renderProblem(`La schermata "${name}" ha avuto un problema e non si può aprire.`);
    }
  }
  events.emit('screen:change', { from, to: name });
}

function renderProblem(message) {
  const back = el('button', { type: 'button', class: 'btn btn--secondary btn--block' }, 'Torna alla home');
  back.addEventListener('click', () => showScreen('home'));
  root.append(el('section', { class: 'screen screen--problem', role: 'alert' },
    el('h1', {}, 'Ops'),
    el('p', { class: 'muted' }, message),
    back));
}

ctx.router = { showScreen, currentScreen };
