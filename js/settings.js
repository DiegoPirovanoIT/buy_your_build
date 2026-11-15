// Settings (GAME_DESIGN §7, ARCHITECTURE §7). Pure logic, testable in Node:
// localStorage access is isolated in storage() and always wrapped in try/catch.

export const STORAGE_KEY = 'byb.settings.v1';

export const LIMITS = Object.freeze({
  budget: { min: 5, max: 200 },
  name: { min: 1, max: 20 },
  volume: { min: 0, max: 100 },
});

export const DEFAULTS = Object.freeze({
  budget: 20,
  judgeMode: 'auto',        // 'auto' | 'human'
  shuffleSides: true,       // only meaningful with judgeMode === 'human'
  rounds: 3,
  scenarioIds: null,        // null = all scenarios
  player1Name: 'Giocatore 1',
  player2Name: 'Giocatore 2',
  sfxOn: true,
  musicOn: true,
  volume: 70,
});

const isInt = (v) => Number.isInteger(v);
const inRange = (v, { min, max }) => isInt(v) && v >= min && v <= max;

/** Per-field sanitizers: return the value if acceptable, otherwise undefined (-> default). */
const SANITIZERS = {
  budget: (v) => (inRange(v, LIMITS.budget) ? v : undefined),
  judgeMode: (v) => (v === 'auto' || v === 'human' ? v : undefined),
  shuffleSides: (v) => (typeof v === 'boolean' ? v : undefined),
  rounds: (v) => (isInt(v) && v >= 1 ? v : undefined),
  scenarioIds: (v) => {
    if (v === null) return null;
    if (Array.isArray(v) && v.every((id) => typeof id === 'string')) return [...new Set(v)];
    return undefined;
  },
  player1Name: (v) => (typeof v === 'string' && v.trim().length >= LIMITS.name.min && v.trim().length <= LIMITS.name.max ? v.trim() : undefined),
  player2Name: (v) => (typeof v === 'string' && v.trim().length >= LIMITS.name.min && v.trim().length <= LIMITS.name.max ? v.trim() : undefined),
  sfxOn: (v) => (typeof v === 'boolean' ? v : undefined),
  musicOn: (v) => (typeof v === 'boolean' ? v : undefined),
  volume: (v) => (inRange(v, LIMITS.volume) ? v : undefined),
};

/**
 * Merges `saved` (anything, possibly corrupted) over DEFAULTS, field by field:
 * a missing or invalid field falls back to its default. Unknown fields are dropped.
 * Always returns a fresh object.
 */
export function merge(saved) {
  const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    const value = SANITIZERS[key](source[key]);
    result[key] = value === undefined ? (Array.isArray(DEFAULTS[key]) ? [...DEFAULTS[key]] : DEFAULTS[key]) : value;
  }
  return result;
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access can throw (blocked cookies, private mode)
  }
}

/** Reads the saved settings (merged with the defaults). Never throws. `store` is injectable for tests. */
export function load(store = storage()) {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return merge(raw ? JSON.parse(raw) : null);
  } catch {
    return merge(null);
  }
}

/** Saves the settings. Returns true on success, false if storage is unavailable. Never throws. */
export function save(settings, store = storage()) {
  try {
    if (!store) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(merge(settings)));
    return true;
  } catch {
    return false;
  }
}

/** Number of scenarios the player has selected (null scenarioIds = all `scenarioCount`). */
export function selectedCount(settings, scenarioCount) {
  return Array.isArray(settings.scenarioIds) ? new Set(settings.scenarioIds).size : scenarioCount;
}

/**
 * Ids to hand to the engine's createGame: the enabled scenarios that actually exist.
 * `knownIds` = ids of the scenario index.
 */
export function effectiveScenarioIds(settings, knownIds) {
  if (!Array.isArray(settings.scenarioIds)) return [...knownIds];
  const known = new Set(knownIds);
  return [...new Set(settings.scenarioIds)].filter((id) => known.has(id));
}

/**
 * Validates settings. `scenarioCount` = scenarios available in the index; `knownIds` (optional) = their ids,
 * used to reject unknown ids in `scenarioIds`.
 * Returns { ok, errors } where errors = { [field]: "message in Italian" } (only invalid fields).
 */
export function validate(settings, scenarioCount, knownIds) {
  const s = settings ?? {};
  const errors = {};

  if (!inRange(s.budget, LIMITS.budget)) {
    errors.budget = `Il budget deve essere un numero intero tra ${LIMITS.budget.min} e ${LIMITS.budget.max} €.`;
  }
  if (s.judgeMode !== 'auto' && s.judgeMode !== 'human') {
    errors.judgeMode = 'Scegli il giudice: automatico o umano.';
  }
  if (typeof s.shuffleSides !== 'boolean') errors.shuffleSides = 'Valore non valido.';
  if (typeof s.sfxOn !== 'boolean') errors.sfxOn = 'Valore non valido.';
  if (typeof s.musicOn !== 'boolean') errors.musicOn = 'Valore non valido.';
  if (!inRange(s.volume, LIMITS.volume)) errors.volume = 'Il volume deve essere tra 0 e 100.';

  for (const [field, label] of [['player1Name', 'giocatore 1'], ['player2Name', 'giocatore 2']]) {
    const name = typeof s[field] === 'string' ? s[field].trim() : '';
    if (name.length < LIMITS.name.min) errors[field] = `Scrivi il nome del ${label}.`;
    else if (name.length > LIMITS.name.max) errors[field] = `Il nome del ${label} può avere al massimo ${LIMITS.name.max} caratteri.`;
  }

  // Scenarios: shape and existence, then count.
  let selected = null;
  if (s.scenarioIds === null || s.scenarioIds === undefined) {
    selected = scenarioCount;
  } else if (!Array.isArray(s.scenarioIds) || !s.scenarioIds.every((id) => typeof id === 'string')) {
    errors.scenarioIds = 'La selezione degli scenari non è valida.';
  } else {
    const unique = [...new Set(s.scenarioIds)];
    const unknown = knownIds ? unique.filter((id) => !new Set(knownIds).has(id)) : [];
    if (unknown.length > 0) {
      errors.scenarioIds = `Scenari inesistenti: ${unknown.join(', ')}.`;
    } else {
      selected = unique.length;
    }
  }

  if (!isInt(s.rounds) || s.rounds < 1) {
    errors.rounds = 'Il numero di round deve essere un intero di almeno 1.';
  } else if (selected !== null && selected > 0 && s.rounds > selected) {
    errors.rounds = `Con ${selected} ${selected === 1 ? 'scenario selezionato' : 'scenari selezionati'} puoi giocare al massimo ${selected} round: seleziona altri scenari o riduci i round.`;
  }
  if (selected === 0 && !errors.scenarioIds) errors.scenarioIds = 'Seleziona almeno uno scenario.';

  return { ok: Object.keys(errors).length === 0, errors };
}
