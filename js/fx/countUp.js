// Counter effect: animates the text of an element from one number to another.
// Respects prefers-reduced-motion (the final value is set at once).

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const defaultFormat = (n) => (n < 0 ? `−${-n}` : String(n));

/**
 * countUp(element, from, to, { duration = 1200, format, onDone }) -> finish()
 * `finish()` stops the animation and jumps to the final value.
 */
export function countUp(element, from, to, { duration = 1200, format = defaultFormat, onDone } = {}) {
  let frame = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    element.textContent = format(to);
    if (onDone) onDone();
  };
  if (prefersReducedMotion() || from === to || duration <= 0) {
    finish();
    return finish;
  }
  const start = performance.now();
  element.textContent = format(from);
  const tick = (now) => {
    if (done) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    element.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) frame = requestAnimationFrame(tick); else finish();
  };
  frame = requestAnimationFrame(tick);
  return finish;
}
