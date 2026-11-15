// Scenario loading. Paths are RELATIVE to the page: the site is served under /buy_your_build/ on GitHub Pages,
// so URLs starting with "/" would break. Results are cached for the whole session.

const INDEX_URL = 'scenarios/index.json';
let indexPromise = null;
const scenarioPromises = new Map();

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
  return response.json();
}

/** Loads scenarios/index.json -> [{ id, file, title, emoji }]. Cached; a failure is not cached. */
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson(INDEX_URL)
      .then((data) => (Array.isArray(data?.scenarios) ? data.scenarios : []))
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

/** Loads the full scenario `id` (loads the index on demand). Cached; a failure is not cached. */
export function loadScenario(id) {
  if (!scenarioPromises.has(id)) {
    const promise = loadIndex()
      .then((list) => {
        const entry = list.find((s) => s.id === id);
        if (!entry) throw new Error(`Unknown scenario "${id}"`);
        return fetchJson(`scenarios/${entry.file}`);
      })
      .catch((error) => {
        scenarioPromises.delete(id);
        throw error;
      });
    scenarioPromises.set(id, promise);
  }
  return scenarioPromises.get(id);
}
