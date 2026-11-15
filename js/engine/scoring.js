// Automatic scoring (GAME_DESIGN §6.2, §6.3).

/** Breakdown of one build: items owned + combos whose items are ALL owned. */
export function scoreBuild(scenario, ownedItemIds) {
  const byId = new Map(scenario.items.map((it) => [it.id, it]));
  const owned = new Set();
  const items = [];
  for (const id of ownedItemIds) {
    const it = byId.get(id);
    if (!it) throw new Error(`Unknown item "${id}" in scenario "${scenario.id}"`);
    if (owned.has(id)) continue;
    owned.add(id);
    items.push({ id, name: it.name, score: it.score });
  }
  const combos = (scenario.combos ?? [])
    .filter((c) => c.items.every((id) => owned.has(id)))
    .map((c) => ({ label: c.label, items: [...c.items], score: c.score, description: c.description }));
  const total = items.reduce((s, i) => s + i.score, 0) + combos.reduce((s, c) => s + c.score, 0);
  return { total, items, combos };
}

/** Compares the two builds; ties are broken by leftover money, then declared a draw. */
export function compareBuilds(scenario, owned, money) {
  const p1 = scoreBuild(scenario, owned.p1);
  const p2 = scoreBuild(scenario, owned.p2);
  let winner = null;
  let tieBreak = 'draw';
  if (p1.total !== p2.total) {
    winner = p1.total > p2.total ? 'p1' : 'p2';
    tieBreak = 'score';
  } else if (money.p1 !== money.p2) {
    winner = money.p1 > money.p2 ? 'p1' : 'p2';
    tieBreak = 'money';
  }
  return { p1, p2, winner, tieBreak };
}
