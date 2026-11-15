// Settings screen (GAME_DESIGN §7): every field, live validation with Italian messages next to the field,
// scenario list with checkboxes + all/none + search, save and back to home.
import {
  el, createButton, createTextField, createStepper, createToggle, createSegmented, createRangeField,
} from './components.js';
import { DEFAULTS, LIMITS, validate, save, merge } from '../settings.js';

export default { mount, unmount };

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function mount(root, params, ctx) {
  const { store, router } = ctx;
  const index = store.get().scenarioIndex;
  const knownIds = index.map((s) => s.id);
  const known = new Set(knownIds);

  // Working copy. `selected` = Set of enabled scenario ids (null scenarioIds = all of them).
  const initial = store.get().settings;
  const draft = { ...initial };
  let selected = new Set(initial.scenarioIds === null ? knownIds : initial.scenarioIds.filter((id) => known.has(id)));

  const fields = {};
  const summaryMessage = el('p', { class: 'screen__message', role: 'alert', hidden: true });
  let attempted = false;

  const toSettings = () => ({
    ...draft,
    scenarioIds: selected.size === knownIds.length ? null : [...selected],
  });

  const refresh = () => {
    const settings = toSettings();
    const { ok, errors } = validate(settings, knownIds.length, knownIds);
    for (const [name, field] of Object.entries(fields)) field.setError(errors[name] || null);
    fields.shuffleSides.hidden = draft.judgeMode !== 'human';
    fields.rounds.setMax(Math.max(1, selected.size));
    scenarioCount.textContent = `${selected.size} di ${knownIds.length} selezionati`;
    if (ok) summaryMessage.hidden = true;
    else if (attempted) {
      summaryMessage.hidden = false;
      summaryMessage.textContent = 'Ci sono dei valori da correggere: guarda i messaggi in rosso.';
    }
    return { ok, errors };
  };

  // --- Players
  fields.player1Name = createTextField({ label: 'Nome del giocatore 1', value: draft.player1Name, onInput: (v) => { draft.player1Name = v; refresh(); } });
  fields.player2Name = createTextField({ label: 'Nome del giocatore 2', value: draft.player2Name, onInput: (v) => { draft.player2Name = v; refresh(); } });

  // --- Game
  fields.budget = createStepper({
    label: 'Budget per round', unit: '€', value: draft.budget, min: LIMITS.budget.min, max: LIMITS.budget.max,
    hint: `Da ${LIMITS.budget.min} a ${LIMITS.budget.max} €. Si resetta a ogni round.`,
    onChange: (v) => { draft.budget = v; refresh(); },
  });
  fields.rounds = createStepper({
    label: 'Numero di round', value: draft.rounds, min: 1, max: Math.max(1, selected.size),
    hint: 'Ogni round usa uno scenario diverso: al massimo quanti ne hai selezionati.',
    onChange: (v) => { draft.rounds = v; refresh(); },
  });
  fields.judgeMode = createSegmented({
    label: 'Chi decide il vincitore del round', value: draft.judgeMode,
    options: [
      { value: 'auto', label: 'Automatico', hint: 'Punteggio di oggetti e combo' },
      { value: 'human', label: 'Giudice umano', hint: 'Lo decidete voi' },
    ],
    onChange: (v) => { draft.judgeMode = v; refresh(); },
  });
  fields.shuffleSides = createToggle({
    label: 'Mescola i lati', hint: 'Con il giudice umano, le due build vengono mostrate in ordine casuale.',
    checked: draft.shuffleSides, onChange: (v) => { draft.shuffleSides = v; refresh(); },
  });

  // --- Audio (saved only for now: the real audio comes later)
  fields.sfxOn = createToggle({ label: 'Effetti sonori', checked: draft.sfxOn, onChange: (v) => { draft.sfxOn = v; refresh(); } });
  fields.musicOn = createToggle({ label: 'Musica di sottofondo', checked: draft.musicOn, onChange: (v) => { draft.musicOn = v; refresh(); } });
  fields.volume = createRangeField({
    label: 'Volume', min: LIMITS.volume.min, max: LIMITS.volume.max, value: draft.volume, format: (v) => `${v}%`,
    onInput: (v) => { draft.volume = v; refresh(); },
  });

  // --- Scenarios
  const scenarioCount = el('span', { class: 'scenarios__count' });
  const listEl = el('ul', { class: 'scenario-list' });
  const emptyEl = el('p', { class: 'muted', hidden: true }, 'Nessuno scenario corrisponde alla ricerca.');
  const rows = index.map((s) => {
    const input = el('input', { class: 'scenario__check', type: 'checkbox', 'data-id': s.id });
    input.checked = selected.has(s.id);
    input.addEventListener('change', () => {
      if (input.checked) selected.add(s.id); else selected.delete(s.id);
      refresh();
    });
    const li = el('li', { class: 'scenario' },
      el('label', { class: 'scenario__label' }, input,
        el('span', { class: 'scenario__emoji', 'aria-hidden': 'true' }, s.emoji || '🎲'),
        el('span', { class: 'scenario__title' }, s.title)));
    return { s, input, li, text: normalize(s.title) };
  });
  listEl.append(...rows.map((r) => r.li));

  let query = '';
  const visibleRows = () => rows.filter((r) => r.text.includes(normalize(query.trim())));
  const applyFilter = () => {
    const visible = new Set(visibleRows());
    rows.forEach((r) => { r.li.hidden = !visible.has(r); });
    emptyEl.hidden = visible.size > 0 || rows.length === 0;
  };
  const setVisible = (value) => {
    for (const r of visibleRows()) {
      r.input.checked = value;
      if (value) selected.add(r.s.id); else selected.delete(r.s.id);
    }
    refresh();
  };
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Cerca uno scenario', 'aria-label': 'Cerca uno scenario', autocomplete: 'off' });
  search.addEventListener('input', () => { query = search.value; applyFilter(); });

  const scenariosField = createScenariosField();
  function createScenariosField() {
    const wrapper = el('div', { class: 'field' },
      el('span', { class: 'field__label' }, 'Scenari abilitati'),
      el('p', { class: 'field__hint' }, 'Le partite pescano solo da questi. "Tutti" e "Nessuno" valgono per gli scenari che vedi (quindi anche per la ricerca).'),
      search,
      el('div', { class: 'scenarios__bar' }, scenarioCount,
        createButton('Tutti', { kind: 'secondary', onClick: () => setVisible(true) }),
        createButton('Nessuno', { kind: 'secondary', onClick: () => setVisible(false) })),
      listEl, emptyEl);
    const errorEl = el('p', { class: 'field__error', hidden: true });
    wrapper.append(errorEl);
    wrapper.setError = (m) => { errorEl.hidden = !m; errorEl.textContent = m || ''; wrapper.classList.toggle('field--invalid', !!m); };
    wrapper.focus = () => search.focus();
    return wrapper;
  }
  fields.scenarioIds = scenariosField;

  // --- Actions
  const saveBtn = createButton('Salva', {
    block: true,
    onClick: () => {
      attempted = true;
      const { ok, errors } = refresh();
      if (!ok) {
        const firstName = ORDER.find((name) => errors[name]);
        if (firstName) { fields[firstName].scrollIntoView({ block: 'center' }); fields[firstName].focus(); }
        return;
      }
      const settings = merge(toSettings());
      save(settings); // false if the browser blocks storage: the settings still apply for this session
      store.update((s) => ({ ...s, settings }));
      router.showScreen('home');
    },
  });
  const cancelBtn = createButton('Annulla', { kind: 'secondary', block: true, onClick: () => router.showScreen('home') });
  const resetBtn = createButton('Ripristina i valori predefiniti', {
    kind: 'secondary', block: true,
    onClick: () => {
      Object.assign(draft, DEFAULTS);
      selected = new Set(knownIds);
      fields.player1Name.setValue(draft.player1Name);
      fields.player2Name.setValue(draft.player2Name);
      fields.budget.setValue(draft.budget);
      fields.rounds.setValue(draft.rounds);
      fields.judgeMode.setValue(draft.judgeMode);
      fields.shuffleSides.setValue(draft.shuffleSides);
      fields.sfxOn.setValue(draft.sfxOn);
      fields.musicOn.setValue(draft.musicOn);
      fields.volume.setValue(draft.volume);
      rows.forEach((r) => { r.input.checked = true; });
      refresh();
    },
  });

  const ORDER = ['player1Name', 'player2Name', 'budget', 'rounds', 'judgeMode', 'shuffleSides', 'scenarioIds', 'sfxOn', 'musicOn', 'volume'];

  const panel = (title, ...children) => el('section', { class: 'panel' }, el('h2', { class: 'panel__title' }, title), el('div', { class: 'panel__body' }, children));

  root.append(el('section', { class: 'screen screen--settings' },
    el('header', { class: 'screen__header' }, el('h1', {}, 'Impostazioni')),
    panel('Giocatori', fields.player1Name, fields.player2Name),
    panel('Partita', fields.budget, fields.rounds, fields.judgeMode, fields.shuffleSides),
    panel('Scenari', scenariosField),
    panel('Audio', fields.sfxOn, fields.musicOn, fields.volume),
    resetBtn,
    el('div', { class: 'settings__footer' },
      summaryMessage,
      el('div', { class: 'settings__buttons' }, saveBtn, cancelBtn))));

  if (index.length === 0) {
    scenariosField.append(el('p', { class: 'screen__message', role: 'alert' }, 'Gli scenari non sono stati caricati.'));
  }
  applyFilter();
  refresh();
}

export function unmount() {}
