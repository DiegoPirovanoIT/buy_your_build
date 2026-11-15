// App state (ARCHITECTURE §5): { settings, scenarioIndex, scenarioIndexError, game, ui: { screen, params } }.
// Treat the state as immutable: update() replaces it with what the callback returns.

let state = {
  settings: null,           // set by main.js after settings.load()
  scenarioIndex: [],        // [{ id, file, title, emoji }]
  scenarioIndexError: null, // string | null: set when index.json could not be loaded
  game: null,               // engine GameState | null
  ui: { screen: null, params: {} },
};
const subscribers = new Set();

/** Current state (do not mutate it). */
export function get() {
  return state;
}

/**
 * update(fn): fn(state) returns the NEW state (e.g. `(s) => ({ ...s, game })`).
 * If it returns undefined/null/the same object the state is left as is.
 * Subscribers are called with (newState, oldState); their errors are caught.
 */
export function update(fn) {
  const old = state;
  const next = fn(old);
  if (next && next !== old) {
    state = next;
    for (const sub of [...subscribers]) {
      try { sub(state, old); } catch (error) { console.error('store: subscriber failed', error); }
    }
  }
  return state;
}

/** Shallow merge shortcut: set({ game }). */
export function set(patch) {
  return update((s) => ({ ...s, ...patch }));
}

/** Subscribes to changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
