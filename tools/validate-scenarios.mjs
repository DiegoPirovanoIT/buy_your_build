// Stub validator. The real validator (GAME_DESIGN 5.1, --check-images) is implemented by task T3a.
// For now it only checks that scenarios/index.json is readable and lists zero scenarios.
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../scenarios/index.json', import.meta.url);
const index = JSON.parse(await readFile(indexUrl, 'utf8'));
const list = index.scenarios;

if (!Array.isArray(list)) {
  console.error('scenarios/index.json: "scenarios" must be an array');
  process.exit(1);
}
if (list.length > 0) {
  console.error(`Stub validator cannot validate ${list.length} scenario(s): task T3a is not implemented yet.`);
  process.exit(1);
}
console.log('validate: 0 scenarios, nothing to check (stub, see T3a)');
