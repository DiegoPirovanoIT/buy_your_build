// Static UI components (task T4). Every function returns a DOM element.
// Data is always inserted with textContent / setAttribute, never innerHTML.
// Colors and durations come from css/tokens.css. No import of events.js yet:
// buttons take an optional callback; T6 wires `ui:click` on top of it.

/** Tiny DOM helper: el('div', { class: 'x', 'aria-label': 'y' }, child, 'text', ...). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const euro = (n) => `${n} €`;

/**
 * Button. kind: 'primary' | 'secondary' | 'p1' | 'p2' (used later for ui:click payloads).
 * @returns {HTMLButtonElement}
 */
export function createButton(label, { onClick, kind = 'primary', block = false, disabled = false, icon = false, ariaLabel } = {}) {
  const cls = ['btn'];
  if (kind !== 'primary') cls.push(`btn--${kind}`);
  if (block) cls.push('btn--block');
  if (icon) cls.push('btn--icon');
  const btn = el('button', { type: 'button', class: cls.join(' '), 'aria-label': ariaLabel, 'data-kind': kind }, label);
  btn.disabled = disabled;
  if (onClick) btn.addEventListener('click', (event) => onClick(event));
  return btn;
}

/**
 * Item image with emoji fallback. item = { image?, emoji, name }.
 * Returns a wrapper-less element: an <img> that swaps itself for <span class="item-emoji"> on error.
 * @returns {HTMLElement}
 */
export function createItemImage(item) {
  const fallback = () => el('span', { class: 'item-emoji', role: 'img', 'aria-label': item.name || '' }, item.emoji || '❓');
  if (!item.image) return fallback();
  const img = el('img', {
    class: 'item-img', src: item.image, alt: item.name || '',
    loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async',
  });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

/** Big card for the item on auction. item = { name, description, image?, emoji }. */
export function createItemCard(item) {
  return el('article', { class: 'item-card' },
    el('div', { class: 'item-card__media' }, createItemImage(item)),
    el('div', { class: 'item-card__body' },
      el('h2', { class: 'item-card__name' }, item.name),
      item.description ? el('p', { class: 'item-card__desc' }, item.description) : null));
}

/** Small thumbnail of a bought item; the name shows on hover, focus or tap. */
export function createThumb(item) {
  const btn = el('button', { type: 'button', class: 'thumb', 'aria-label': item.name, title: item.name },
    createItemImage(item),
    el('span', { class: 'thumb__name' }, item.name));
  btn.addEventListener('click', () => btn.classList.toggle('is-open'));
  btn.addEventListener('blur', () => btn.classList.remove('is-open'));
  return btn;
}

/**
 * Player panel. player = { id: 'p1'|'p2', name, money, items: [item] }.
 * The returned element has update(patch) to change name/money/items/isTurn in place.
 */
export function createPlayerPanel({ id, name, money, items = [], isTurn = false }) {
  const nameEl = el('span', { class: 'player-panel__name' });
  const moneyEl = el('span', { class: 'player-panel__money' });
  const turnEl = el('div', { class: 'player-panel__turn' }, 'Di turno');
  const grid = el('div', { class: 'player-panel__grid' });
  const root = el('section', { class: `player-panel player-panel--${id}`, 'data-player': id },
    el('div', { class: 'player-panel__head' }, nameEl, moneyEl), turnEl, grid);
  const state = { name, money, items, isTurn };
  const render = () => {
    nameEl.textContent = state.name;
    moneyEl.textContent = euro(state.money);
    root.classList.toggle('is-turn', !!state.isTurn);
    root.setAttribute('aria-label', `${state.name}, ${euro(state.money)}${state.isTurn ? ', di turno' : ''}`);
    grid.replaceChildren(...state.items.map(createThumb));
  };
  root.update = (patch) => { Object.assign(state, patch); render(); };
  render();
  return root;
}

/**
 * Describes an offer value in plain Italian. value > 0: player takes it paying value;
 * value < 0: player gives it to the other paying |value|; 0: keeps it for free.
 */
export function describeOffer(value, playerName, otherName) {
  if (value > 0) return `${playerName} paga ${euro(value)} e lo prende`;
  if (value < 0) return `${playerName} paga ${euro(-value)} e lo dà a ${otherName}`;
  return `${playerName} lo tiene gratis`;
}

/**
 * Offer slider, from -give.max ("Lo do all'altro") to +take.max ("Lo prendo"); 0 = keep for free.
 * limits come from the engine's legalOffers: take / give = { min, max } | null.
 * Illegal positions snap to the nearest legal value. No legal value at all disables the slider.
 *
 * options: {
 *   player: { id, name }, other: { id, name },
 *   take, give, value?,
 *   canAccept?: boolean, onAccept?(), onOffer?({ to, amount }), onChange?(value, offer|null)
 * }
 * Element API: getValue() -> number | null, getOffer() -> { to, amount } | null,
 *   setLimits({ take, give }), setValue(v).
 * `to` is the id of the player who receives the item.
 */
export function createOfferSlider(options) {
  const { player, other, onChange, onOffer, onAccept } = options;
  let take = options.take || null;
  let give = options.give || null;
  let value = options.value ?? 0;
  let canAccept = !!options.canAccept;

  const isLegal = (v) => {
    if (v > 0) return !!take && v >= take.min && v <= take.max;
    if (v < 0) return !!give && -v >= give.min && -v <= give.max;
    return !!take && take.min === 0;
  };
  const bounds = () => [give ? -give.max : 0, take ? take.max : 0];
  // Clamp to the allowed interval first, so that an out-of-range value snaps to the closest legal one.
  const nearestLegal = (v) => {
    const [lo, hi] = bounds();
    const start = Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.round(v) : 0));
    for (let d = 0; d <= hi - lo; d++) {
      if (isLegal(start + d)) return start + d;
      if (isLegal(start - d)) return start - d;
    }
    return null;
  };

  const summary = el('p', { class: 'offer__summary', 'aria-live': 'polite' });
  const range = el('input', { class: 'offer__range', type: 'range', step: 1, 'aria-label': 'Offerta' });
  const minus = createButton('−', { icon: true, kind: 'secondary', ariaLabel: 'Meno' });
  const plus = createButton('+', { icon: true, kind: 'secondary', ariaLabel: 'Più' });
  const offerBtn = createButton('Offri', { kind: player.id, onClick: () => { const o = root.getOffer(); if (o && onOffer) onOffer(o); } });
  const acceptBtn = createButton('Accetta', { kind: 'secondary', onClick: () => onAccept && onAccept() });
  const endLeft = el('span');
  const endRight = el('span');
  const zeroLabel = el('span', { class: 'offer__zero' });
  const root = el('section', { class: `offer offer--${player.id}`, 'data-player': player.id },
    el('p', { class: 'offer__title' }, `Tocca a ${player.name}`),
    summary,
    el('div', { class: 'offer__row' }, minus, range, plus),
    el('div', { class: 'offer__ends' }, endLeft, zeroLabel, endRight),
    el('div', { class: 'offer__actions' }, offerBtn, acceptBtn));

  const step = (dir) => {
    const [lo, hi] = bounds();
    for (let v = value + dir; v >= lo && v <= hi; v += dir) {
      if (isLegal(v)) { setValue(v); return; }
    }
  };
  minus.addEventListener('click', () => step(-1));
  plus.addEventListener('click', () => step(1));
  range.addEventListener('input', () => setValue(Number(range.value)));

  function render() {
    const [lo, hi] = bounds();
    const snapped = nearestLegal(value);
    const blocked = snapped === null;
    if (!blocked) value = snapped;
    range.min = lo;
    range.max = Math.max(hi, lo + 1); // keep a valid range even when only 0 exists
    range.value = blocked ? 0 : value;
    range.disabled = blocked || lo === hi;
    root.classList.toggle('offer--blocked', blocked);
    summary.textContent = blocked ? 'Nessuna offerta possibile' : describeOffer(value, player.name, other.name);
    zeroLabel.textContent = isLegal(0) ? 'Gratis' : ''; // "free" only when 0 is a legal value
    endLeft.textContent = give ? `Lo do a ${other.name}` : '';
    endRight.textContent = take ? 'Lo prendo' : '';
    minus.disabled = blocked || nearestLegalFrom(-1) === null;
    plus.disabled = blocked || nearestLegalFrom(1) === null;
    offerBtn.disabled = blocked;
    acceptBtn.hidden = !canAccept;
  }
  function nearestLegalFrom(dir) {
    const [lo, hi] = bounds();
    for (let v = value + dir; v >= lo && v <= hi; v += dir) if (isLegal(v)) return v;
    return null;
  }
  function setValue(v) {
    value = v;
    render();
    if (onChange) onChange(root.getValue(), root.getOffer());
  }

  root.getValue = () => (nearestLegal(value) === null ? null : value);
  root.getOffer = () => {
    const v = root.getValue();
    if (v === null) return null;
    return { to: v >= 0 ? player.id : other.id, amount: Math.abs(v) };
  };
  root.setValue = setValue;
  root.setLimits = (limits) => {
    if ('take' in limits) take = limits.take || null;
    if ('give' in limits) give = limits.give || null;
    if ('canAccept' in limits) canAccept = !!limits.canAccept;
    render();
  };
  render();
  return root;
}

/**
 * Modal dialog. content: Node | string. Returns the overlay element with close().
 * Closes on the X button, Escape or a click on the backdrop. Append it to document.body yourself
 * or pass { mount: true }.
 */
export function createModal({ title, content, onClose, mount = false } = {}) {
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = createButton('✕', { kind: 'secondary', icon: true, ariaLabel: 'Chiudi' });
  const box = el('div', { class: 'modal__box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('div', { class: 'modal__head' }, el('h2', { id: titleId }, title || ''), closeBtn),
    el('div', { class: 'modal__body' }, content));
  const root = el('div', { class: 'modal' }, box);
  const onKey = (event) => { if (event.key === 'Escape') root.close(); };
  root.close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
    if (onClose) onClose();
  };
  closeBtn.addEventListener('click', () => root.close());
  root.addEventListener('click', (event) => { if (event.target === root) root.close(); });
  document.addEventListener('keydown', onKey);
  if (mount) { document.body.append(root); closeBtn.focus(); }
  return root;
}

/** Score badge: "+5" green, "−3" red, "0" neutral. */
export function createScoreBadge(score) {
  const kind = score > 0 ? 'pos' : score < 0 ? 'neg' : 'zero';
  const text = score > 0 ? `+${score}` : score < 0 ? `−${-score}` : '0';
  return el('span', { class: `score-badge score-badge--${kind}` }, text);
}

/**
 * Row of the score breakdown. Item: { name, score }. Combo: { label, score, description, items? }.
 * Pass { combo: true } for a combo (shows the description).
 */
export function createScoreRow(entry, { combo = false } = {}) {
  const label = combo ? entry.label : entry.name;
  return el('div', { class: `score-row${combo ? ' score-row--combo' : ''}` },
    el('span', { class: 'score-row__label' }, label),
    createScoreBadge(entry.score),
    combo && entry.description ? el('span', { class: 'score-row__desc' }, entry.description) : null);
}

/**
 * Auction screen layout: top = item area, bottom = two player panels side by side.
 * Returns the root with the slots { top, bottom } for T6 to fill.
 */
export function createAuctionLayout({ top = [], panels = [] } = {}) {
  const topEl = el('div', { class: 'auction__top' }, top);
  const bottomEl = el('div', { class: 'auction__bottom' }, panels);
  const root = el('div', { class: 'auction' }, topEl, bottomEl);
  root.top = topEl;
  root.bottom = bottomEl;
  return root;
}
