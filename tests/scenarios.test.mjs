// Tests for tools/validate-scenarios.mjs (GAME_DESIGN 5.1). No network access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateScenario, validateIndex, validateDirectory, checkImageUrls } from '../tools/validate-scenarios.mjs';

const IMG = 'https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=400';

function makeScenario(overrides = {}) {
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Oggetto ${i + 1}`,
    description: `Descrizione dell'oggetto ${i + 1}.`,
    image: IMG,
    emoji: '📦',
    score: i - 2,
  }));
  return {
    id: 'test-scenario',
    title: 'Scenario di prova',
    shortTitle: 'Prova',
    emoji: '🧪',
    description: 'Uno scenario usato solo nei test.',
    theme: { accent: '#ff8800' },
    items,
    combos: [
      { items: ['item-1', 'item-2'], score: 5, label: 'Coppia', description: 'Il primo oggetto senza il secondo non serve a nulla.' },
      { items: ['item-3', 'item-4', 'item-5'], score: -4, label: 'Tris', description: 'Tre oggetti che si pestano i piedi a vicenda.' },
    ],
    ...overrides,
  };
}

const FILE = { fileName: 'test-scenario.json' };
const errorsOf = (scenario, opts = FILE) => validateScenario(scenario, opts);
const assertError = (errors, fragment) =>
  assert.ok(errors.some((e) => e.includes(fragment)), `expected an error containing "${fragment}", got:\n${errors.join('\n')}`);

test('a valid scenario passes', () => {
  assert.deepEqual(errorsOf(makeScenario()), []);
});

test('theme is optional', () => {
  const s = makeScenario();
  delete s.theme;
  assert.deepEqual(errorsOf(s), []);
});

test('non-object scenario is rejected', () => {
  assert.equal(errorsOf(null).length, 1);
  assert.equal(errorsOf([]).length, 1);
});

// --- id ---
test('id must be kebab-case', () => {
  assertError(errorsOf(makeScenario({ id: 'Test_Scenario' }), {}), 'id:');
});

test('id must equal the file name', () => {
  assertError(errorsOf(makeScenario({ id: 'altro-id' })), 'must equal the file name');
});

test('id is required', () => {
  const s = makeScenario();
  delete s.id;
  assertError(errorsOf(s), 'id:');
});

// --- text fields ---
for (const field of ['title', 'shortTitle', 'description']) {
  test(`${field} is required`, () => {
    assertError(errorsOf(makeScenario({ [field]: '  ' })), `${field}:`);
  });
}

test('scenario emoji is required', () => {
  const s = makeScenario();
  delete s.emoji;
  assertError(errorsOf(s), 'emoji:');
});

// --- theme.accent ---
test('theme.accent must be #rrggbb', () => {
  for (const bad of ['red', '#fff', '#gggggg', 'ff8800', 123]) {
    assertError(errorsOf(makeScenario({ theme: { accent: bad } })), 'theme.accent');
  }
});

// --- items ---
test('exactly 10 items: 9 is an error', () => {
  const s = makeScenario();
  s.items.pop();
  s.combos = [];
  assertError(errorsOf(s), 'exactly 10 items (found 9)');
});

test('exactly 10 items: 11 is an error', () => {
  const s = makeScenario();
  s.items.push({ ...s.items[0], id: 'extra' });
  assertError(errorsOf(s), 'exactly 10 items (found 11)');
});

test('duplicate item ids are rejected', () => {
  const s = makeScenario();
  s.items[1].id = s.items[0].id;
  assertError(errorsOf(s), 'duplicate item id');
});

test('item score 11 and -11 are rejected, 10 and -10 are accepted', () => {
  let s = makeScenario();
  s.items[0].score = 11;
  assertError(errorsOf(s), 'items[0].score');
  s = makeScenario();
  s.items[0].score = -11;
  assertError(errorsOf(s), 'items[0].score');
  s = makeScenario();
  s.items[0].score = 10;
  s.items[1].score = -10;
  assert.deepEqual(errorsOf(s), []);
});

test('item score must be an integer', () => {
  for (const bad of [1.5, '5', null, NaN]) {
    const s = makeScenario();
    s.items[2].score = bad;
    assertError(errorsOf(s), 'items[2].score');
  }
});

test('item score 0 is allowed', () => {
  const s = makeScenario();
  s.items[0].score = 0;
  assert.deepEqual(errorsOf(s), []);
});

test('item image must be an https URL', () => {
  for (const bad of ['http://example.com/a.jpg', 'ftp://x/y.png', 'not a url', '', undefined]) {
    const s = makeScenario();
    s.items[3].image = bad;
    assertError(errorsOf(s), 'items[3].image');
  }
});

test('item emoji is required', () => {
  const s = makeScenario();
  delete s.items[4].emoji;
  assertError(errorsOf(s), 'items[4].emoji');
});

test('item name and description are required', () => {
  const s = makeScenario();
  s.items[5].name = '';
  s.items[6].description = undefined;
  const errors = errorsOf(s);
  assertError(errors, 'items[5].name');
  assertError(errors, 'items[6].description');
});

// --- combos ---
test('combo with 1 item is rejected', () => {
  const s = makeScenario();
  s.combos[0].items = ['item-1'];
  assertError(errorsOf(s), 'combos[0].items: must contain 2 or 3 items (found 1)');
});

test('combo with 4 items is rejected', () => {
  const s = makeScenario();
  s.combos[0].items = ['item-1', 'item-2', 'item-3', 'item-4'];
  assertError(errorsOf(s), 'combos[0].items: must contain 2 or 3 items (found 4)');
});

test('combo with unknown item id is rejected', () => {
  const s = makeScenario();
  s.combos[0].items = ['item-1', 'non-esiste'];
  assertError(errorsOf(s), 'unknown item id "non-esiste"');
});

test('combo with repeated item id is rejected', () => {
  const s = makeScenario();
  s.combos[0].items = ['item-1', 'item-1'];
  assertError(errorsOf(s), 'duplicate ids');
});

test('combo score 0 is rejected', () => {
  const s = makeScenario();
  s.combos[0].score = 0;
  assertError(errorsOf(s), 'combos[0].score');
});

test('combo score out of range or non-integer is rejected', () => {
  for (const bad of [11, -11, 2.5, '3']) {
    const s = makeScenario();
    s.combos[1].score = bad;
    assertError(errorsOf(s), 'combos[1].score');
  }
});

test('two combos with the same set of items are rejected (even in different order)', () => {
  const s = makeScenario();
  s.combos.push({ items: ['item-2', 'item-1'], score: 3, label: 'Di nuovo', description: 'Stessa coppia, ma scritta al contrario.' });
  assertError(errorsOf(s), 'combos[2].items: same set of items as combos[0]');
});

test('combo label is required', () => {
  const s = makeScenario();
  s.combos[0].label = '';
  assertError(errorsOf(s), 'combos[0].label');
});

test('combo description is required', () => {
  const s = makeScenario();
  delete s.combos[0].description;
  assertError(errorsOf(s), 'combos[0].description');
});

test('combo description shorter than 20 characters is rejected', () => {
  const s = makeScenario();
  s.combos[0].description = 'Bella combo';
  assertError(errorsOf(s), 'combos[0].description: must be 20-150 characters (found 11)');
});

test('combo description longer than 150 characters is rejected', () => {
  const s = makeScenario();
  s.combos[0].description = 'x'.repeat(151);
  assertError(errorsOf(s), 'must be 20-150 characters (found 151)');
});

test('combo description length limits are inclusive', () => {
  const s = makeScenario();
  s.combos[0].description = 'a'.repeat(20);
  s.combos[1].description = 'b'.repeat(150);
  assert.deepEqual(errorsOf(s), []);
});

test('generic combo descriptions are rejected', () => {
  const s = makeScenario();
  s.combos[0].description = 'Non stanno bene.';
  assertError(errorsOf(s), 'too generic');
});

test('combos must be an array (empty is fine)', () => {
  assert.deepEqual(errorsOf(makeScenario({ combos: [] })), []);
  const s = makeScenario();
  delete s.combos;
  assertError(errorsOf(s), 'combos:');
});

// --- index ---
const entryFor = (s, file = `${s.id}.json`) => ({ id: s.id, file, title: s.title, emoji: s.emoji });

test('empty index with no files is valid', () => {
  assert.deepEqual(validateIndex({ scenarios: [] }, { files: [] }), []);
});

test('consistent index passes', () => {
  const s = makeScenario();
  const errors = validateIndex({ scenarios: [entryFor(s)] }, { files: ['test-scenario.json'], scenarios: { 'test-scenario.json': s } });
  assert.deepEqual(errors, []);
});

test('index must have a "scenarios" array', () => {
  assert.equal(validateIndex({}, {}).length, 1);
  assert.equal(validateIndex(null, {}).length, 1);
});

test('index entry without file on disk is rejected', () => {
  const s = makeScenario();
  assertError(validateIndex({ scenarios: [entryFor(s)] }, { files: [], scenarios: {} }), 'not found in scenarios/');
});

test('orphan scenario file not listed in index is rejected', () => {
  assertError(validateIndex({ scenarios: [] }, { files: ['orfano.json'], scenarios: {} }), 'orphan file "orfano.json"');
});

test('index.json itself is not an orphan', () => {
  assert.deepEqual(validateIndex({ scenarios: [] }, { files: ['index.json'] }), []);
});

test('index entry id must match the scenario file id, title and emoji', () => {
  const s = makeScenario();
  const files = { files: ['test-scenario.json'], scenarios: { 'test-scenario.json': s } };
  assertError(validateIndex({ scenarios: [{ ...entryFor(s), id: 'altro' }] }, files), 'scenarios[0]');
  assertError(validateIndex({ scenarios: [{ ...entryFor(s), title: 'Altro titolo' }] }, files), 'scenarios[0].title');
  assertError(validateIndex({ scenarios: [{ ...entryFor(s), emoji: '🍕' }] }, files), 'scenarios[0].emoji');
});

test('index entry file must be <id>.json', () => {
  const s = makeScenario();
  const files = { files: ['strano.json'], scenarios: { 'strano.json': s } };
  assertError(validateIndex({ scenarios: [entryFor(s, 'strano.json')] }, files), 'must be "test-scenario.json"');
});

test('duplicate ids in the index are rejected', () => {
  const s = makeScenario();
  const files = { files: ['test-scenario.json'], scenarios: { 'test-scenario.json': s } };
  assertError(validateIndex({ scenarios: [entryFor(s), entryFor(s)] }, files), 'duplicate scenario id');
});

// --- directory (uses temp dirs, no network) ---
async function withDir(fileMap, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'byb-scenarios-'));
  try {
    for (const [name, content] of Object.entries(fileMap)) {
      await writeFile(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
    }
    return await fn(pathToFileURL(dir + '/'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('directory: valid scenario + index passes', async () => {
  const s = makeScenario();
  await withDir({ 'index.json': { scenarios: [entryFor(s)] }, 'test-scenario.json': s }, async (url) => {
    const { errors, count } = await validateDirectory(url);
    assert.equal(count, 1);
    assert.equal(errors.size, 0);
  });
});

test('directory: invalid JSON, orphan file and bad scenario are reported per file', async () => {
  const bad = makeScenario({ id: 'bad' });
  bad.items.pop();
  await withDir(
    { 'index.json': { scenarios: [] }, 'rotto.json': '{ not json', 'bad.json': bad },
    async (url) => {
      const { errors } = await validateDirectory(url);
      assert.ok(errors.get('scenarios/rotto.json')?.[0].includes('invalid JSON'));
      assert.ok(errors.get('scenarios/bad.json')?.some((e) => e.includes('exactly 10 items')));
      assert.ok(errors.get('scenarios/index.json')?.some((e) => e.includes('orphan file "bad.json"')));
    },
  );
});

test('directory: missing index.json is reported', async () => {
  await withDir({}, async (url) => {
    const { errors } = await validateDirectory(url);
    assert.ok(errors.get('scenarios/index.json')?.[0].includes('not found'));
  });
});

test('directory: checkImages uses the injected fetch and reports failing images with file and field', async () => {
  const s = makeScenario();
  s.items[0].image = 'https://example.test/broken.jpg';
  await withDir({ 'index.json': { scenarios: [entryFor(s)] }, 'test-scenario.json': s }, async (url) => {
    const fetchImpl = async (u) => (u.includes('broken') ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const { errors } = await validateDirectory(url, { checkImages: true, fetchImpl });
    const list = errors.get('scenarios/test-scenario.json');
    assert.equal(list.length, 1);
    assert.ok(list[0].startsWith('items[0].image: HTTP 404'));
  });
});

// --- image checker (fake fetch) ---
const imageResponse = (status = 200, type = 'image/png') => new Response(null, { status, headers: { 'content-type': type } });

test('checkImageUrls: 200 image/* passes with HEAD only', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push(init.method), imageResponse());
  const failures = await checkImageUrls(['https://a.test/1.png'], { fetchImpl });
  assert.equal(failures.size, 0);
  assert.deepEqual(calls, ['HEAD']);
});

test('checkImageUrls: falls back to GET when HEAD is refused', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push(init.method), init.method === 'HEAD' ? imageResponse(405) : imageResponse());
  const failures = await checkImageUrls(['https://a.test/1.png'], { fetchImpl });
  assert.equal(failures.size, 0);
  assert.deepEqual(calls, ['HEAD', 'GET']);
});

test('checkImageUrls: reports HTTP errors, non-image content-types and network errors', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/404')) return imageResponse(404);
    if (url.endsWith('/html')) return imageResponse(200, 'text/html; charset=utf-8');
    throw new TypeError('fetch failed');
  };
  const failures = await checkImageUrls(['https://a.test/404', 'https://a.test/html', 'https://a.test/net'], { fetchImpl });
  assert.equal(failures.get('https://a.test/404'), 'HTTP 404');
  assert.match(failures.get('https://a.test/html'), /not image\/\*/);
  assert.match(failures.get('https://a.test/net'), /fetch failed/);
});

test('checkImageUrls: sends a generic User-Agent, follows redirects and dedupes URLs', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => (seen.push(init), imageResponse());
  await checkImageUrls(['https://a.test/1.png', 'https://a.test/1.png'], { fetchImpl });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].redirect, 'follow');
  assert.equal(seen[0].headers['User-Agent'], 'scenario-validator/1.0');
  assert.ok(seen[0].signal);
});

test('checkImageUrls: never more than 4 requests in flight', async () => {
  let inFlight = 0;
  let max = 0;
  const fetchImpl = async () => {
    inFlight++;
    max = Math.max(max, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return imageResponse();
  };
  const urls = Array.from({ length: 20 }, (_, i) => `https://a.test/${i}.png`);
  const failures = await checkImageUrls(urls, { fetchImpl });
  assert.equal(failures.size, 0);
  assert.equal(max, 4);
});

// --- real scenarios ---
test('all real scenarios in scenarios/ are valid and consistent with index.json', async () => {
  const { errors } = await validateDirectory(new URL('../scenarios/', import.meta.url));
  const report = [...errors].map(([file, list]) => `${file}\n  - ${list.join('\n  - ')}`).join('\n');
  assert.equal(errors.size, 0, report);
});
