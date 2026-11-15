// Event bus (ARCHITECTURE §6). Handlers are isolated: an error in one never reaches the emitter
// nor the other handlers (fx and audio must not be able to break the UI).

const handlers = new Map(); // name -> Set<handler>

/** Subscribes to an event. Returns an unsubscribe function. */
export function on(name, handler) {
  if (typeof handler !== 'function') throw new TypeError('events.on: handler must be a function');
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(handler);
  return () => off(name, handler);
}

/** Removes a handler added with on(). */
export function off(name, handler) {
  const set = handlers.get(name);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) handlers.delete(name);
}

/** Calls every handler of `name` with `payload`, in subscription order. Never throws. */
export function emit(name, payload) {
  const set = handlers.get(name);
  if (!set) return;
  for (const handler of [...set]) { // copy: a handler may unsubscribe while we iterate
    try {
      handler(payload);
    } catch (error) {
      console.error(`events: handler of "${name}" failed`, error);
    }
  }
}
