// Scenario validator (GAME_DESIGN 5.1). Usage: node tools/validate-scenarios.mjs [--check-images]
// Pure functions are exported for tests; the CLI part runs only when this file is executed directly.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ITEMS_PER_SCENARIO = 10;
const MIN_SCORE = -10;
const MAX_SCORE = 10;
const COMBO_DESC_MIN = 20;
const COMBO_DESC_MAX = 150;
const GENERIC_COMBO_DESCRIPTIONS = new Set(['bella combo', 'non stanno bene', 'buona combo', 'brutta combo']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isScore = (v) => Number.isInteger(v) && v >= MIN_SCORE && v <= MAX_SCORE;

function isHttpsUrl(v) {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Validate one scenario object. Returns a list of readable errors (empty = valid).
 * @param {unknown} scenario
 * @param {{ fileName?: string }} [opts] file name (e.g. "bunker-nucleare.json"); enables the id/file-name check
 * @returns {string[]}
 */
export function validateScenario(scenario, { fileName } = {}) {
  const errors = [];
  const err = (field, msg) => errors.push(`${field}: ${msg}`);
  if (!isObject(scenario)) return ['scenario: must be a JSON object'];

  // id
  if (!isText(scenario.id)) err('id', 'required non-empty string');
  else {
    if (!KEBAB.test(scenario.id)) err('id', `"${scenario.id}" is not kebab-case (lowercase letters, digits, hyphens)`);
    if (fileName !== undefined) {
      const expected = fileName.replace(/\.json$/, '');
      if (scenario.id !== expected) err('id', `"${scenario.id}" must equal the file name ("${expected}")`);
    }
  }

  for (const f of ['title', 'shortTitle', 'description']) {
    if (!isText(scenario[f])) err(f, 'required non-empty string');
  }
  if (!isText(scenario.emoji)) err('emoji', 'required non-empty string');

  if (scenario.theme !== undefined) {
    if (!isObject(scenario.theme)) err('theme', 'must be an object');
    else if (scenario.theme.accent !== undefined && !(typeof scenario.theme.accent === 'string' && HEX_COLOR.test(scenario.theme.accent))) {
      err('theme.accent', `${JSON.stringify(scenario.theme.accent)} must be a #rrggbb hex color`);
    }
  }

  // items
  const itemIds = new Set();
  if (!Array.isArray(scenario.items)) err('items', 'required array');
  else {
    if (scenario.items.length !== ITEMS_PER_SCENARIO) {
      err('items', `must contain exactly ${ITEMS_PER_SCENARIO} items (found ${scenario.items.length})`);
    }
    scenario.items.forEach((item, i) => {
      const at = `items[${i}]`;
      if (!isObject(item)) return err(at, 'must be an object');
      if (!isText(item.id)) err(`${at}.id`, 'required non-empty string');
      else if (itemIds.has(item.id)) err(`${at}.id`, `duplicate item id "${item.id}"`);
      else itemIds.add(item.id);
      for (const f of ['name', 'description']) {
        if (!isText(item[f])) err(`${at}.${f}`, 'required non-empty string');
      }
      if (!isText(item.emoji)) err(`${at}.emoji`, 'required non-empty string (fallback when the image fails)');
      if (!isHttpsUrl(item.image)) err(`${at}.image`, `must be an https URL (got ${JSON.stringify(item.image)})`);
      if (!isScore(item.score)) err(`${at}.score`, `must be an integer between ${MIN_SCORE} and ${MAX_SCORE} (got ${JSON.stringify(item.score)})`);
    });
  }

  // combos
  if (!Array.isArray(scenario.combos)) err('combos', 'required array');
  else {
    const seenSets = new Map();
    scenario.combos.forEach((combo, i) => {
      const at = `combos[${i}]`;
      if (!isObject(combo)) return err(at, 'must be an object');
      let comboOk = false;
      if (!Array.isArray(combo.items)) err(`${at}.items`, 'required array');
      else {
        comboOk = true;
        if (combo.items.length < 2 || combo.items.length > 3) {
          err(`${at}.items`, `must contain 2 or 3 items (found ${combo.items.length})`);
          comboOk = false;
        }
        if (new Set(combo.items).size !== combo.items.length) {
          err(`${at}.items`, 'contains duplicate ids');
          comboOk = false;
        }
        for (const id of combo.items) {
          if (!itemIds.has(id)) {
            err(`${at}.items`, `unknown item id ${JSON.stringify(id)} (not in this scenario's items)`);
            comboOk = false;
          }
        }
      }
      if (!isScore(combo.score) || combo.score === 0) {
        err(`${at}.score`, `must be a non-zero integer between ${MIN_SCORE} and ${MAX_SCORE} (got ${JSON.stringify(combo.score)})`);
      }
      if (!isText(combo.label)) err(`${at}.label`, 'required non-empty string');
      if (!isText(combo.description)) err(`${at}.description`, 'required: explain concretely why this bonus/malus exists');
      else {
        const len = combo.description.trim().length;
        if (len < COMBO_DESC_MIN || len > COMBO_DESC_MAX) {
          err(`${at}.description`, `must be ${COMBO_DESC_MIN}-${COMBO_DESC_MAX} characters (found ${len})`);
        }
        const norm = combo.description.trim().toLowerCase().replace(/[.!\s]+$/, '');
        if (GENERIC_COMBO_DESCRIPTIONS.has(norm)) err(`${at}.description`, `too generic ("${combo.description}"): explain why`);
      }
      if (comboOk) {
        const key = [...combo.items].sort().join('|');
        if (seenSets.has(key)) err(`${at}.items`, `same set of items as combos[${seenSets.get(key)}]`);
        else seenSets.set(key, i);
      }
    });
  }
  return errors;
}

/**
 * Validate scenarios/index.json against the files found on disk.
 * @param {unknown} index parsed index.json
 * @param {{ files?: string[], scenarios?: Record<string, unknown> }} ctx
 *   files: names of the *.json files in scenarios/ (index.json is ignored);
 *   scenarios: parsed content by file name (used to check id/title/emoji consistency)
 * @returns {string[]}
 */
export function validateIndex(index, { files = [], scenarios = {} } = {}) {
  const errors = [];
  const err = (field, msg) => errors.push(`${field}: ${msg}`);
  if (!isObject(index) || !Array.isArray(index.scenarios)) return ['scenarios: index must be an object with a "scenarios" array'];

  const listed = new Set();
  const ids = new Set();
  index.scenarios.forEach((entry, i) => {
    const at = `scenarios[${i}]`;
    if (!isObject(entry)) return err(at, 'must be an object');
    if (!isText(entry.id)) err(`${at}.id`, 'required non-empty string');
    else if (ids.has(entry.id)) err(`${at}.id`, `duplicate scenario id "${entry.id}"`);
    else ids.add(entry.id);
    if (!isText(entry.title)) err(`${at}.title`, 'required non-empty string');
    if (!isText(entry.emoji)) err(`${at}.emoji`, 'required non-empty string');
    if (!isText(entry.file)) return err(`${at}.file`, 'required non-empty string');
    if (isText(entry.id) && entry.file !== `${entry.id}.json`) {
      err(`${at}.file`, `"${entry.file}" must be "${entry.id}.json"`);
    }
    listed.add(entry.file);
    if (!files.includes(entry.file)) return err(`${at}.file`, `file "${entry.file}" not found in scenarios/`);
    const sc = scenarios[entry.file];
    if (isObject(sc)) {
      if (sc.id !== entry.id) err(`${at}.id`, `"${entry.id}" differs from id in ${entry.file} ("${sc.id}")`);
      if (sc.title !== entry.title) err(`${at}.title`, `"${entry.title}" differs from title in ${entry.file} ("${sc.title}")`);
      if (sc.emoji !== entry.emoji) err(`${at}.emoji`, `"${entry.emoji}" differs from emoji in ${entry.file} ("${sc.emoji}")`);
    }
  });
  for (const f of files) {
    if (f !== 'index.json' && !listed.has(f)) err('scenarios', `orphan file "${f}" is not listed in index.json`);
  }
  return errors;
}

/**
 * Check that every URL answers 200 with an image/* content-type.
 * HEAD first, GET as fallback. Follows redirects, has a timeout, at most `concurrency` requests in flight.
 * @returns {Promise<Map<string,string>>} url -> error message (only failures)
 */
export async function checkImageUrls(urls, { fetchImpl = fetch, concurrency = 4, timeoutMs = 15000, userAgent = 'scenario-validator/1.0' } = {}) {
  const unique = [...new Set(urls)];
  const failures = new Map();
  const attempt = async (url, method) => {
    const res = await fetchImpl(url, {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (method === 'GET') await res.body?.cancel?.().catch(() => {});
    if (res.status !== 200) return `HTTP ${res.status}`;
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\//i.test(type)) return `content-type "${type}" is not image/*`;
    return null;
  };
  const tryOnce = async (url, method) => {
    try {
      return await attempt(url, method);
    } catch (e) {
      return `${e.name}: ${e.message}`;
    }
  };
  const check = async (url) => {
    let problem = await tryOnce(url, 'HEAD');
    if (problem) problem = await tryOnce(url, 'GET');
    if (problem) failures.set(url, problem);
  };
  let next = 0;
  const worker = async () => {
    while (next < unique.length) await check(unique[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return failures;
}

/**
 * Validates a whole scenarios directory (URL ending with "/").
 * @returns {Promise<{ errors: Map<string, string[]>, count: number }>} errors keyed by file label
 */
export async function validateDirectory(dirUrl, { checkImages = false, fetchImpl } = {}) {
  const errors = new Map();
  const add = (label, list) => {
    if (list.length) errors.set(label, [...(errors.get(label) ?? []), ...list]);
  };
  const parsed = {};
  const names = (await readdir(dirUrl)).filter((n) => n.endsWith('.json')).sort();
  const files = names.filter((n) => n !== 'index.json');

  let index = null;
  if (!names.includes('index.json')) add('scenarios/index.json', ['file not found']);
  else {
    try {
      index = JSON.parse(await readFile(new URL('index.json', dirUrl), 'utf8'));
    } catch (e) {
      add('scenarios/index.json', [`invalid JSON: ${e.message}`]);
    }
  }
  for (const name of files) {
    try {
      parsed[name] = JSON.parse(await readFile(new URL(name, dirUrl), 'utf8'));
    } catch (e) {
      add(`scenarios/${name}`, [`invalid JSON: ${e.message}`]);
      continue;
    }
    add(`scenarios/${name}`, validateScenario(parsed[name], { fileName: name }));
  }
  if (index) add('scenarios/index.json', validateIndex(index, { files, scenarios: parsed }));

  if (checkImages) {
    const refs = [];
    for (const [name, sc] of Object.entries(parsed)) {
      (Array.isArray(sc?.items) ? sc.items : []).forEach((item, i) => {
        if (isHttpsUrl(item?.image)) refs.push({ name, field: `items[${i}].image`, url: item.image });
      });
    }
    const failures = await checkImageUrls(refs.map((r) => r.url), { fetchImpl });
    for (const r of refs) {
      if (failures.has(r.url)) add(`scenarios/${r.name}`, [`${r.field}: ${failures.get(r.url)} (${r.url})`]);
    }
  }
  return { errors, count: files.length };
}

async function main() {
  const checkImages = process.argv.includes('--check-images');
  const dir = process.env.SCENARIOS_DIR
    ? pathToFileURL(process.env.SCENARIOS_DIR.replace(/\/?$/, '/'))
    : new URL('../scenarios/', import.meta.url);
  const { errors, count } = await validateDirectory(dir, { checkImages });
  if (errors.size === 0) {
    console.log(`validate: ${count} scenario(s) OK${checkImages ? ' (images checked)' : ''}`);
    return;
  }
  let total = 0;
  for (const [label, list] of errors) {
    console.error(label);
    for (const e of list) {
      console.error(`  - ${e}`);
      total++;
    }
  }
  console.error(`validate: ${total} error(s) in ${errors.size} file(s)`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
