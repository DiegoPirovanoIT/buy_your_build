# Architettura tecnica

> Riferimento tecnico del progetto. Le **regole di gioco** stanno in [GAME_DESIGN.md](GAME_DESIGN.md); qui c'è **come** sono implementate.
> Se cambi un contratto (API, eventi, struttura dello stato), aggiorna questo file nello stesso commit.

## 1. Principi

1. **Sito statico, zero build.** HTML, CSS e JS (ES modules) serviti così come sono da GitHub Pages. Niente bundler, transpiler o framework.
2. **Zero dipendenze a runtime.** Niente CDN e niente npm nel browser. In sviluppo si usa solo Node ≥ 20 (`node:test`, `fetch`).
3. **Motore puro, UI sottile.** Tutte le regole stanno in `js/engine/`: funzioni pure, stato immutabile, nessun accesso al DOM, al tempo o a `Math.random` (la casualità arriva da un `rng` iniettato). La UI legge lo stato e chiama le azioni del motore.
4. **Eventi per gli effetti.** Animazioni e audio non vengono chiamati direttamente dalle schermate: si iscrivono agli eventi di `js/events.js`.
5. **Dati separati dal codice.** Gli scenari sono JSON in `scenarios/`, validati da `tools/validate-scenarios.mjs`.
6. **€0.** Nessun servizio a pagamento, nessuna chiave API.

## 2. Struttura delle cartelle

```
index.html                 # unico entry point, carica js/main.js come module
css/
  tokens.css               # variabili: colori, spaziature, font, durate
  base.css                 # reset, tipografia, layout generale
  components.css           # pulsanti, card, miniature, modale, cursore offerta
  screens.css              # stili specifici delle schermate
  audio.css                # pulsante muto (posseduto da T9)
js/
  main.js                  # bootstrap: carica impostazioni e indice scenari, avvia il router
  router.js                # showScreen(name, params), transizioni
  store.js                 # stato dell'app (impostazioni + partita corrente), notifica la UI
  settings.js              # DEFAULTS, load(), save(), validate()
  scenarios.js             # loadIndex(), loadScenario(id), con cache
  events.js                # event bus: on(), off(), emit()
  engine/                  # ⚠️ PURO: niente DOM, niente import da ui/fx/audio
    auction.js
    scoring.js
    game.js
    rng.js
  ui/
    components.js          # itemCard(), thumb(), modal(), offerSlider(), playerPanel()
    home.js  settings.js  intro.js  auction.js  judge.js  roundResult.js  final.js
  fx/
    transitions.js  confetti.js  countUp.js  animations.js
  audio/
    audio.js  sfx.js  music.js
assets/
  audio/                   # musica CC0 opzionale
  img/                     # icone, favicon
scenarios/
  index.json
  <id>.json
tools/
  validate-scenarios.mjs
  serve.mjs                # server statico locale (porta 8080)
tests/
  auction.test.mjs  scoring.test.mjs  game.test.mjs  scenarios.test.mjs  settings.test.mjs
dev/
  components.html          # vetrina dei componenti con dati finti
.github/workflows/
  ci.yml  pages.yml
```

## 3. Regole sulle dipendenze tra moduli

```
engine/*   → può importare solo altri engine/*
settings, scenarios, events → nessun import dalla UI
ui/*       → engine, store, router, events, settings, scenarios, ui/components
fx/*       → events, (DOM)            ✗ niente engine
audio/*    → events, settings          ✗ niente engine, niente ui
main.js    → tutto (è il punto di composizione)
```
I test in `tests/` importano solo `engine/`, `settings.js` (logica pura) e i JSON degli scenari.

## 4. Contratti del motore

### 4.1 `engine/rng.js`
```js
createRng(seed?: number) → { next(): number /* [0,1) */, int(min, max), shuffle(array) /* copia */ , pick(array) }
```
Senza seed usa un seed casuale. I test passano sempre un seed.

### 4.2 `engine/auction.js` (regole: GAME_DESIGN §4)
```js
// Players: "p1" | "p2".  Offerta: { by, to, amount }  — `to` = chi riceverà l'oggetto.
createAuction({ itemId, opener, money: { p1, p2 } }) → AuctionState
offer(state, { to, amount }) → AuctionState      // by = state.turn
accept(state) → AuctionState
legalOffers(state) → { canAccept, take: { min, max } | null, give: { min, max } | null }
                                                 // take = "lo prendo", give = "lo do all'altro"; null = non disponibile

AuctionState = {
  itemId, opener,
  money: { p1, p2 },          // soldi PRIMA del pagamento (non cambiano durante l'asta)
  turn: "p1" | "p2",
  status: "awaiting-open" | "bidding" | "done",
  current: { by, to, amount } | null,
  history: [{ by, to, amount }],
  result: { owner, payer, paid } | null   // solo quando done
}
```
Invarianti da testare:
- Apertura: `to === by` con `amount ≥ 0`, oppure `to !== by` con `amount ≥ 1`; `amount ≤ money[by]`.
- Controfferta: `to !== current.to` (ribalta il risultato), `amount ≥ current.amount + 1`, `amount ≤ money[by]`.
- `accept` è vietato in `awaiting-open`.
- Se il giocatore di turno non può controbattere, `offer()` restituisce lo stato già `done` (accettazione automatica).
- Un'azione illegale lancia `AuctionError` con un `code` (`"ILLEGAL_AMOUNT"`, `"NOT_ALLOWED"`, …).

### 4.3 `engine/scoring.js` (regole: GAME_DESIGN §6.2, §6.3)
```js
scoreBuild(scenario, ownedItemIds) → {
  total,
  items:  [{ id, name, score }],
  combos: [{ label, items: [id], score, description }]   // solo le combo attivate
}
compareBuilds(scenario, { p1: ids, p2: ids }, money: { p1, p2 }) → {
  p1: Breakdown, p2: Breakdown,
  winner: "p1" | "p2" | null,      // null = pareggio
  tieBreak: "score" | "money" | "draw"
}
```

### 4.4 `engine/game.js` (regole: GAME_DESIGN §3)
```js
createGame({ settings, scenarioIds, rng }) → GameState
// sceglie gli scenari dei round (senza ripetizioni) e il primo apritore a caso
startRound(state, scenario) → GameState                 // mescola gli oggetti, resetta il budget
currentAuction(state) → AuctionState | null
applyAuction(state, auctionState) → GameState           // registra il risultato, passa all'oggetto successivo
finishRound(state, verdict) → GameState                 // verdict: { winner, source: "auto"|"human", breakdown? }
isRoundOver(state), isGameOver(state)
gameSummary(state) → { roundsWon: { p1, p2 }, totalScore: { p1, p2 }, winner, rounds: [...] }

GameState = {
  settings,
  roundScenarioIds: [id],
  roundIndex,
  nextOpener: "p1" | "p2",           // l'alternanza continua tra i round
  round: {
    scenarioId, itemOrder: [id], itemIndex,
    money: { p1, p2 },
    owned: { p1: [id], p2: [id] },
    log: [{ itemId, owner, payer, paid, history }],
    auction: AuctionState | null,
    verdict: null | {...}
  } | null,
  results: [{ scenarioId, owned, moneyLeft, verdict, breakdown }]
}
```

## 5. Stato dell'app, router e schermate

- `store.js` contiene `{ settings, scenarioIndex, game, ui: { screen, params } }`. Espone `get()`, `update(fn)` e `subscribe(fn)`.
- `router.showScreen(name, params)` smonta la schermata attuale, monta la nuova in `#app` ed emette `screen:change`.
- Ogni schermata in `ui/` esporta `{ mount(root, params, ctx), unmount() }`, dove `ctx = { store, router, events }`.
- Nomi delle schermate: `home`, `settings`, `intro`, `auction`, `judge`, `roundResult`, `final`.
- Nessun routing via URL per la partita (un reload riporta alla home). Opzionale: salvare `game` in `sessionStorage`.

## 6. Eventi (`js/events.js`)

```js
on(name, handler) → unsubscribe;  emit(name, payload)
```
| Evento | Payload | Chi lo emette |
|---|---|---|
| `screen:change` | `{ from, to }` | router |
| `round:start` | `{ roundIndex, scenario }` | ui/intro |
| `item:reveal` | `{ item, index, opener }` | ui/auction |
| `offer:made` | `{ by, to, amount, isCounter }` | ui/auction |
| `offer:accepted` | `{ by, current }` | ui/auction |
| `item:assigned` | `{ item, owner, payer, paid }` | ui/auction |
| `money:change` | `{ player, from, to }` | ui/auction |
| `judge:reveal` | `{ side, itemId }` | ui/judge |
| `round:end` | `{ roundIndex, winner, scores? }` | ui/roundResult |
| `game:end` | `{ winner, summary }` | ui/final |
| `ui:click` | `{ kind }` | ui/components (pulsanti) |

Gli handler di fx/audio non devono mai lanciare errori verso la UI: avvolgerli in try/catch dentro `events.js`.

## 7. Impostazioni

`settings.js`: `DEFAULTS`, `load()` (merge con i default, valori non validi → default), `save(settings)`, `validate(settings, scenarioCount) → { ok, errors }`. Chiave `localStorage`: `byb.settings.v1`. Elenco dei campi: GAME_DESIGN §7. Accesso a `localStorage` sempre in try/catch.

## 8. CSS

- Tutti i colori, i font e le durate stanno in `tokens.css` come custom properties (`--p1`, `--p2`, `--gold`, `--pos`, `--neg`, `--accent`, `--dur-fast`, …).
- Il colore dello scenario si applica con `style="--accent: …"` sul contenitore della schermata.
- Classi in stile BEM leggero: `.item-card`, `.item-card__img`, `.item-card--small`.
- `@media (prefers-reduced-motion: reduce)` in `tokens.css` azzera le durate.
- Mobile-first, a partire da una larghezza di 360 px.

## 9. Immagini

- `<img loading="lazy" referrerpolicy="no-referrer">` con l'URL di Wikimedia; su `onerror` si sostituisce con un `<span class="item-emoji">`.
- Si precaricano le immagini del round all'inizio dell'intro.

## 10. Test e qualità

- `npm test` → `node --test`. Coprire ogni regola di GAME_DESIGN §4 e §6 con almeno un test.
- `npm run validate` → controlla tutti gli scenari. `-- --check-images` fa anche richieste di rete (non in CI per default).
- `npm run serve` → http://localhost:8080.
- CI (`ci.yml`): validate + test su ogni push e PR. Deploy (`pages.yml`): pubblica la root del repo su Pages da `main`.

## 11. Proprietà dei file per task (per evitare conflitti tra agenti paralleli)

| Task | File posseduti |
|---|---|
| T1 | `js/engine/auction.js`, `tests/auction.test.mjs` |
| T2 | `js/engine/scoring.js`, `game.js`, `rng.js`, relativi test |
| T3 | `tools/validate-scenarios.mjs`, `scenarios/*`, `tests/scenarios.test.mjs` |
| T4 | `css/tokens.css`, `base.css`, `components.css`, `js/ui/components.js`, `dev/` |
| T5 | `js/main.js`, `router.js`, `store.js`, `settings.js`, `scenarios.js`, `ui/home.js`, `ui/settings.js`, `tests/settings.test.mjs` |
| T6 | `js/events.js`, `ui/intro.js`, `ui/auction.js`, `ui/judge.js`, `ui/roundResult.js`, `css/screens.css` |
| T7 | `ui/final.js` |
| T8 | `js/fx/*`, ritocchi a tutti i CSS e a `ui/*` (solo presentazione) |
| T9 | `js/audio/*`, `assets/audio/*`, `css/audio.css`, `CREDITS.md`, campi audio in `ui/settings.js` |

Per modificare un file posseduto da un altro task in corso, coordinarsi: annotarlo in [PROGRESS.md](PROGRESS.md).
