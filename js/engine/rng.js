// Seedable PRNG (mulberry32). The engine never calls Math.random.

function randomSeed() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint32Array(1))[0];
  }
  return (Date.now() ^ 0x9e3779b9) >>> 0;
}

export function createRng(seed) {
  let s = (seed === undefined ? randomSeed() : seed) >>> 0;

  /** Float in [0, 1). */
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both included. */
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }

  /** Fisher-Yates on a copy. */
  function shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(array) {
    if (array.length === 0) throw new Error('pick() on empty array');
    return array[int(0, array.length - 1)];
  }

  return { next, int, shuffle, pick };
}
