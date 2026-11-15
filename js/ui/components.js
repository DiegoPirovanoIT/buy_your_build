// Static UI components (task T4). Every function returns a DOM element.
// Data is always inserted with textContent / setAttribute, never innerHTML.
// Colors and durations come from css/tokens.css. Buttons emit `ui:click` { kind } on the event bus
// (ARCHITECTURE §6) before calling their own onClick.
import { emit } from '../events.js';

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
 * Button. kind: 'primary' | 'secondary' | 'p1' | 'p2' (sent as the payload of `ui:click`).
 * @returns {HTMLButtonElement}
 */
export function createButton(label, { onClick, kind = 'primary', block = false, disabled = false, icon = false, ariaLabel } = {}) {
  const cls = ['btn'];
  if (kind !== 'primary') cls.push(`btn--${kind}`);
  if (block) cls.push('btn--block');
  if (icon) cls.push('btn--icon');
  const btn = el('button', { type: 'button', class: cls.join(' '), 'aria-label': ariaLabel, 'data-kind': kind }, label);
  btn.disabled = disabled;
  btn.addEventListener('click', (event) => {
    emit('ui:click', { kind });
    if (onClick) onClick(event);
  });
  return btn;
}

/**
 * Item image with emoji fallback. item = { image?, emoji, name }.
 * Returns a wrapper (.item-media) that always contains the emoji (.item-emoji) as the bottom layer; the <img> is
 * stacked above it and fades in only once it has loaded. So the emoji is what you see while the image is loading,
 * never loads, or fails (a pending or blocked request fires no `error` event, which used to leave an empty box).
 * On error the <img> is removed.
 * @returns {HTMLElement}
 */
export function createItemImage(item) {
  const emoji = el('span', { class: 'item-emoji', role: 'img', 'aria-label': item.name || '' }, item.emoji || '❓');
  const wrapper = el('span', { class: 'item-media' }, emoji);
  if (!item.image) return wrapper;
  const img = el('img', {
    class: 'item-img', src: item.image, alt: '', 'aria-hidden': 'true',
    loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async',
  });
  const onLoad = () => (img.naturalWidth > 0 ? wrapper.classList.add('is-loaded') : img.remove());
  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
  wrapper.append(img);
  if (img.complete) onLoad(); // already settled (cache) before the listeners existed
  return wrapper;
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

// ---------------------------------------------------------------------------------------------
// Form controls (used by the settings screen). Every control is wrapped in a `.field` element with
// setError(message | null) to show a validation message next to the field.
// ---------------------------------------------------------------------------------------------

let fieldCounter = 0;
const nextId = (prefix) => `${prefix}-${++fieldCounter}`;

/**
 * Generic field wrapper: label, optional hint, the control(s) and an error line.
 * `focusTarget` is the element that receives aria-describedby / aria-invalid and focus().
 * Returns the root with setError(message|null) and focus().
 */
export function createField({ label, hint, control, focusTarget, labelFor, asGroup = false }) {
  const errorId = nextId('field-error');
  const hintId = nextId('field-hint');
  const errorEl = el('p', { class: 'field__error', id: errorId, hidden: true });
  const labelEl = el(asGroup ? 'span' : 'label', { class: 'field__label', for: asGroup ? null : labelFor }, label);
  const root = el('div', { class: 'field', role: asGroup ? 'group' : null },
    labelEl,
    hint ? el('p', { class: 'field__hint', id: hintId }, hint) : null,
    control,
    errorEl);
  const describe = () => {
    if (!focusTarget) return;
    const ids = [hint ? hintId : null, errorEl.hidden ? null : errorId].filter(Boolean).join(' ');
    if (ids) focusTarget.setAttribute('aria-describedby', ids); else focusTarget.removeAttribute('aria-describedby');
    if (errorEl.hidden) focusTarget.removeAttribute('aria-invalid'); else focusTarget.setAttribute('aria-invalid', 'true');
  };
  root.setError = (message) => {
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
    root.classList.toggle('field--invalid', !!message);
    describe();
  };
  root.focus = () => focusTarget?.focus();
  if (asGroup) {
    const groupLabelId = nextId('field-label');
    labelEl.id = groupLabelId;
    root.setAttribute('aria-labelledby', groupLabelId);
  }
  describe();
  return root;
}

/** Single-line text field. Returns a field with getValue(), setValue(v). onInput(value) on every keystroke. */
export function createTextField({ label, value = '', placeholder, hint, onInput } = {}) {
  const id = nextId('text');
  const input = el('input', { class: 'input', type: 'text', id, placeholder, autocomplete: 'off', spellcheck: 'false' });
  input.value = value; // no hard maxlength: an over-long value shows a validation message instead
  input.addEventListener('input', () => onInput && onInput(input.value));
  const root = createField({ label, hint, control: input, focusTarget: input, labelFor: id });
  root.getValue = () => input.value;
  root.setValue = (v) => { input.value = v; };
  return root;
}

/**
 * Numeric stepper: [-] [number] [+]. The number is editable, so an invalid value can be typed and the
 * validation message shown: onChange(value) gets a number, or NaN if the box is empty. min/max only limit the buttons.
 * Returns a field with getValue(), setValue(v), setMax(n).
 */
export function createStepper({ label, value, min = 0, max = 100, unit, hint, onChange } = {}) {
  const id = nextId('step');
  let hi = max;
  const input = el('input', { class: 'input stepper__input', type: 'number', inputmode: 'numeric', id, step: 1 });
  input.value = String(value);
  const read = () => (input.value.trim() === '' ? NaN : Number(input.value));
  const minus = createButton('−', { icon: true, kind: 'secondary', ariaLabel: `${label}: meno` });
  const plus = createButton('+', { icon: true, kind: 'secondary', ariaLabel: `${label}: più` });
  const sync = () => {
    const v = read();
    minus.disabled = Number.isFinite(v) && v <= min;
    plus.disabled = Number.isFinite(v) && v >= hi;
  };
  const change = (v) => { input.value = String(v); sync(); if (onChange) onChange(v); };
  minus.addEventListener('click', () => { const v = read(); change(Number.isFinite(v) ? Math.max(min, Math.min(hi, Math.round(v) - 1)) : min); });
  plus.addEventListener('click', () => { const v = read(); change(Number.isFinite(v) ? Math.min(hi, Math.max(min, Math.round(v) + 1)) : min); });
  input.addEventListener('input', () => { sync(); if (onChange) onChange(read()); });
  const control = el('div', { class: 'stepper' }, minus, input, unit ? el('span', { class: 'stepper__unit' }, unit) : null, plus);
  const root = createField({ label, hint, control, focusTarget: input, labelFor: id });
  root.getValue = read;
  root.setValue = (v) => { input.value = String(v); sync(); };
  root.setMax = (n) => { hi = n; sync(); };
  sync();
  return root;
}

/** On/off switch. Returns a field-like root with getValue(), setValue(bool), setError(msg). onChange(bool). */
export function createToggle({ label, hint, checked = false, onChange } = {}) {
  const id = nextId('toggle');
  const input = el('input', { class: 'switch__input', type: 'checkbox', role: 'switch', id });
  input.checked = checked;
  input.addEventListener('change', () => onChange && onChange(input.checked));
  const control = el('label', { class: 'switch', for: id },
    el('span', { class: 'switch__text' },
      el('span', { class: 'switch__label' }, label),
      hint ? el('span', { class: 'switch__hint' }, hint) : null),
    input,
    el('span', { class: 'switch__track', 'aria-hidden': 'true' }, el('span', { class: 'switch__thumb' })));
  const errorEl = el('p', { class: 'field__error', hidden: true });
  const root = el('div', { class: 'field field--toggle' }, control, errorEl);
  root.setError = (message) => { errorEl.hidden = !message; errorEl.textContent = message || ''; root.classList.toggle('field--invalid', !!message); };
  root.focus = () => input.focus();
  root.getValue = () => input.checked;
  root.setValue = (v) => { input.checked = !!v; };
  return root;
}

/**
 * Choice between a few options (radio group). options = [{ value, label, hint? }].
 * Returns a field with getValue(), setValue(v). onChange(value).
 */
export function createSegmented({ label, options, value, hint, onChange } = {}) {
  const name = nextId('seg');
  const inputs = options.map((opt) => {
    const input = el('input', { class: 'segmented__input', type: 'radio', name, value: opt.value });
    input.checked = opt.value === value;
    input.addEventListener('change', () => { if (input.checked && onChange) onChange(opt.value); });
    return { opt, input };
  });
  const control = el('div', { class: 'segmented' }, inputs.map(({ opt, input }) =>
    el('label', { class: 'segmented__option' }, input,
      el('span', { class: 'segmented__body' },
        el('span', { class: 'segmented__label' }, opt.label),
        opt.hint ? el('span', { class: 'segmented__hint' }, opt.hint) : null))));
  const root = createField({ label, hint, control, focusTarget: inputs[0]?.input, asGroup: true });
  root.getValue = () => inputs.find(({ input }) => input.checked)?.opt.value ?? null;
  root.setValue = (v) => inputs.forEach(({ opt, input }) => { input.checked = opt.value === v; });
  return root;
}

/** Slider field. Returns a field with getValue(), setValue(v). onInput(number); format(v) gives the shown text. */
export function createRangeField({ label, min = 0, max = 100, value = 0, hint, format = String, onInput } = {}) {
  const id = nextId('range');
  const input = el('input', { class: 'range', type: 'range', id, min, max, step: 1 });
  input.value = String(value);
  const out = el('output', { class: 'range__value', for: id }, format(value));
  input.addEventListener('input', () => { out.textContent = format(Number(input.value)); if (onInput) onInput(Number(input.value)); });
  const root = createField({ label, hint, control: el('div', { class: 'range-row' }, input, out), focusTarget: input, labelFor: id });
  root.getValue = () => Number(input.value);
  root.setValue = (v) => { input.value = String(v); out.textContent = format(v); };
  return root;
}

// ---------------------------------------------------------------------------------------------
// Game-flow helpers (T6/T7): shared by intro, auction, judge, round result and final screens.
// ---------------------------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function luminance(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Accent of a scenario: `theme.accent` if valid, otherwise a color derived from the id. */
export function scenarioAccent(scenario) {
  const accent = scenario?.theme?.accent;
  if (typeof accent === 'string' && HEX_COLOR.test(accent)) return accent;
  let h = 0;
  for (const ch of String(scenario?.id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hslToHex(h % 360, 0.75, 0.68);
}

/** Sets --accent / --on-accent (readable text color) on a container (usually #app). */
export function applyScenarioTheme(container, scenario) {
  const accent = scenarioAccent(scenario);
  container.style.setProperty('--accent', accent);
  container.style.setProperty('--on-accent', luminance(accent) > 0.35 ? '#12081f' : '#ffffff');
}

/** Player names of a game: { p1, p2 }. */
export function playerNames(game) {
  return { p1: game.settings.player1Name, p2: game.settings.player2Name };
}

/** Confirmation dialog (mounted on <body>). onConfirm runs after the dialog is closed. */
export function createConfirm({ title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger = false, onConfirm }) {
  let modal;
  const cancel = createButton(cancelLabel, { kind: 'secondary', onClick: () => modal.close() });
  const ok = createButton(confirmLabel, { kind: danger ? 'p1' : 'primary', onClick: () => { modal.close(); if (onConfirm) onConfirm(); } });
  modal = createModal({
    title,
    content: el('div', { class: 'confirm' }, el('p', {}, message), el('div', { class: 'confirm__actions' }, cancel, ok)),
    mount: true,
  });
  cancel.focus();
  return modal;
}

/**
 * Small button that asks for confirmation, then abandons the game and goes home.
 * ctx = { store, router }.
 */
export function createLeaveButton(ctx, { label = 'Esci' } = {}) {
  const btn = createButton(`✕ ${label}`, {
    kind: 'secondary',
    ariaLabel: 'Abbandona la partita',
    onClick: () => createConfirm({
      title: 'Abbandonare la partita?',
      message: 'La partita in corso andrà persa e tornerai alla home.',
      confirmLabel: 'Abbandona',
      cancelLabel: 'Continua a giocare',
      danger: true,
      onConfirm: () => {
        ctx.store.update((s) => ({ ...s, game: null }));
        ctx.router.showScreen('home');
      },
    }),
  });
  btn.classList.add('btn--small');
  return btn;
}

/** Top bar of the game screens: leave button, scenario name, small status text (setMeta(text)). */
export function createGameBar(ctx, { title, meta }) {
  const metaEl = el('span', { class: 'game-bar__meta' }, meta || '');
  const root = el('header', { class: 'game-bar' },
    createLeaveButton(ctx),
    el('span', { class: 'game-bar__title' }, title),
    metaEl);
  root.setMeta = (text) => { metaEl.textContent = text; };
  return root;
}

/**
 * Detailed breakdown of one round, both players. breakdown = result of compareBuilds (scoreBuild per player).
 * scenario is used to show the names of the items involved in each combo.
 */
export function createRoundBreakdown(scenario, breakdown, names) {
  const nameOf = (id) => scenario.items.find((i) => i.id === id)?.name ?? id;
  const column = (id) => {
    const b = breakdown[id];
    const rows = b.items.map((it) => createScoreRow(it));
    const combos = b.combos.map((c) => {
      const row = createScoreRow(c, { combo: true });
      const involved = el('span', { class: 'score-row__items' }, c.items.map(nameOf).join(' + '));
      const desc = row.querySelector('.score-row__desc');
      if (desc) row.insertBefore(involved, desc); else row.append(involved);
      return row;
    });
    return el('section', { class: `breakdown__player breakdown__player--${id}` },
      el('h4', { class: 'breakdown__name' }, names[id]),
      el('p', { class: 'breakdown__sub' }, 'Oggetti'),
      rows.length ? rows : el('p', { class: 'muted' }, 'Nessun oggetto'),
      el('p', { class: 'breakdown__sub' }, 'Combo attivate'),
      combos.length ? combos : el('p', { class: 'muted' }, 'Nessuna combo'),
      el('div', { class: 'breakdown__total' }, el('span', {}, 'Totale'), createScoreBadge(b.total)));
  };
  return el('div', { class: 'breakdown' }, column('p1'), column('p2'));
}
