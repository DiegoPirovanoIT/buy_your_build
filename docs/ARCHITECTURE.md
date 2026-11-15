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
    components.js          # (T6/T7: scenarioAccent(), applyScenarioTheme(), playerNames(), createConfirm(), createLeaveButton(), createGameBar(), createRoundBreakdown())
                           # el(), createButton(), createItemImage(), createItemCard(), createThumb(), createPlayerPanel(),
                           # describeOffer(), createOfferSlider(), createModal(), createScoreBadge(), createScoreRow(), createAuctionLayout(),
                           # form: createField(), createTextField(), createStepper(), createToggle(), createSegmented(), createRangeField()
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
  auction.test.mjs  scoring.test.mjs  game.test.mjs  invariants.test.mjs  scenarios.test.mjs  settings.test.mjs
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
Senza seed usa un seed casuale (`crypto.getRandomValues`, mai `Math.random`). I test passano sempre un seed. `int(min, max)` include entrambi gli estremi. Algoritmo: mulberry32.

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
  result: { owner, payer, paid, auto } | null   // solo quando done; auto = true se l'asta si è chiusa per
                                                // accettazione automatica (l'avversario non poteva controbattere),
                                                // false se per `accept()`. Serve alla UI per mostrare "accettata in automatico".
}
```
Invarianti da testare:
- Apertura: `to === by` con `amount ≥ 0`, oppure `to !== by` con `amount ≥ 1`; `amount ≤ money[by]`.
- Controfferta: `to !== current.to` (ribalta il risultato), `amount ≥ current.amount + 1`, `amount ≤ money[by]`.
- `accept` è vietato in `awaiting-open`.
- Se il giocatore di turno non può controbattere, `offer()` restituisce lo stato già `done` (accettazione automatica).
- Un'azione illegale lancia `AuctionError` (esportata da `auction.js`) con un `code`: `"ILLEGAL_AMOUNT"` (importo non intero o fuori da min/max), `"NOT_ALLOWED"` (direzione non permessa, `accept` in `awaiting-open`), `"AUCTION_DONE"` (azione su asta finita), `"INVALID_ARGS"`.
- `legalOffers`: dopo un'offerta aperta, al massimo uno tra `take` e `give` è non-null (la controfferta deve ribaltare il risultato): se l'oggetto va a chi è di turno resta solo `give`, altrimenti solo `take`. In `awaiting-open` `give` è `null` se chi apre ha 0 €. Su asta `done` tutto è `null`/`false`.
- A fine asta (`done`) `turn` resta quello dell'ultimo giocatore a cui toccava decidere; `money` non cambia mai (il pagamento lo applica `game.js`).

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
// scenarioIds = scenari abilitati. Sceglie `settings.rounds` scenari senza ripetizioni (lancia se sono meno),
// il primo apritore a caso e un `seed` salvato nello stato. Valida gli argomenti: rounds intero ≥ 1, budget intero ≥ 0,
// judgeMode "auto" | "human", scenarioIds array.
startRound(state, scenario) → GameState                 // scenario.id deve essere roundScenarioIds[roundIndex]
                                                        // mescola gli oggetti (rng derivato da seed + roundIndex,
                                                        // così lo stato resta serializzabile e la firma senza rng),
                                                        // resetta il budget, apre la prima asta con currentOpener
currentAuction(state) → AuctionState | null             // asta fresca ("awaiting-open") dell'oggetto corrente
applyAuction(state, auctionState) → GameState           // auction "done" e *quella attesa*: stesso oggetto, stesso apritore e
                                                        // stessi soldi dell'asta restituita da currentAuction (altrimenti
                                                        // AUCTION_MISMATCH). Paga l'ultimo offerente, assegna l'oggetto,
                                                        // alterna currentOpener, apre l'asta successiva (null dopo il 10°)
isRoundOver(state), isGameOver(state)                   // round: tutti gli oggetti assegnati; game: results.length === rounds
roundBreakdown(state, scenario) → compareBuilds(...)    // breakdown automatico del round corrente; la UI lo usa anche col
                                                        // giudice umano per il punteggio "per curiosità" dopo il verdetto
finishRound(state, scenario, verdict?) → GameState
// Il motore calcola SEMPRE il breakdown (come roundBreakdown). La sorgente del verdetto segue `settings.judgeMode`:
//  - "auto":  `verdict` NON va passato (se passato: UNEXPECTED_VERDICT). Vince chi ha il punteggio più alto, poi più soldi
//             avanzati, poi round pari (`winner: null`).
//  - "human": `verdict = { winner: "p1" | "p2" }` obbligatorio (altrimenti INVALID_VERDICT); niente pareggio.
// `scenario.id` deve essere quello del round (WRONG_SCENARIO). Il verdetto salvato è { winner, source, breakdown }.
gameSummary(state) → {
  roundsWon: { p1, p2 }, totalScore: { p1, p2 },
  winner: "p1"|"p2"|null, tieBreak: "rounds"|"score"|"draw",
  rounds: [{ scenarioId, winner, source, tieBreak, scores: {p1,p2}, moneyLeft, owned, breakdown }]
}
// winner = più round vinti; a pari round: punteggio totale se judgeMode === "auto", altrimenti pareggio (null).
// I round pari non contano per nessuno.
// Modalità umana: `totalScore` e `rounds[i].scores` sono SOLO informativi (non decidono nulla) e `rounds[i].tieBreak`
// è `null` (ha deciso il giudice); lo spareggio automatico resta in `rounds[i].breakdown.tieBreak`.
// Modalità auto: `rounds[i].tieBreak` = "score" | "money" | "draw".

GameError extends Error { code }                        // tutti gli errori del modulo; codici: INVALID_SETTINGS, INVALID_ARGS,
                                                        // NOT_ENOUGH_SCENARIOS, GAME_OVER, ROUND_NOT_FINISHED, WRONG_SCENARIO,
                                                        // NO_AUCTION, AUCTION_NOT_DONE, AUCTION_MISMATCH, NEGATIVE_MONEY,
                                                        // NO_ROUND, ROUND_NOT_OVER, ROUND_ALREADY_FINISHED,
                                                        // UNEXPECTED_VERDICT, INVALID_VERDICT

GameState = {
  settings,
  seed,                              // per derivare l'ordine degli oggetti di ogni round
  roundScenarioIds: [id],
  roundIndex,                        // round corrente; incrementato da finishRound
  currentOpener: "p1" | "p2",        // apritore dell'asta corrente; se non ce n'è una in corso (tra un round e l'altro,
                                     // o a round finito) è quello della prossima asta. L'alternanza continua tra i round
  round: {
    scenarioId, itemOrder: [id], itemIndex,
    money: { p1, p2 },
    owned: { p1: [id], p2: [id] },
    log: [{ itemId, owner, payer, paid, history }],
    auction: AuctionState | null,
    verdict: null | { winner, source: "auto"|"human", breakdown }   // il round resta in stato dopo finishRound, per la UI del risultato
  } | null,
  results: [{ scenarioId, owned, moneyLeft, verdict, breakdown }]
}
```
Flusso UI: `startRound` → (`currentAuction` → `offer`/`accept` sulla copia locale → `applyAuction`) × 10 → `finishRound(state, scenario)` (auto) oppure `finishRound(state, scenario, { winner })` (giudice umano; poi `roundBreakdown` per il punteggio "per curiosità") → `startRound` successivo o `gameSummary`.

## 5. Stato dell'app, router e schermate

- `store.js` contiene `{ settings, scenarioIndex, scenarioIndexError, game, ui: { screen, params } }`. Espone `get()`, `update(fn)` (`fn(state)` restituisce il NUOVO stato, es. `(s) => ({ ...s, game })`; se restituisce lo stesso oggetto o niente, non notifica), `set(patch)` (merge superficiale) e `subscribe(fn)` → unsubscribe (`fn(nuovo, vecchio)`).
- `router.configure(container, screenMap)` (chiamato da `main.js`) e `router.showScreen(name, params = {})`: smonta la schermata attuale, svuota `#app`, monta la nuova ed emette `screen:change`. Aggiorna anche `store.ui`. Una schermata senza `mount` (segnaposto) o che lancia durante il mount mostra un messaggio con "Torna alla home". `router.currentScreen()` restituisce il nome corrente.
- Ogni schermata in `ui/` esporta `{ mount(root, params, ctx), unmount() }` (named export), dove `ctx = { store, router, events }`. `ctx.router` ha `showScreen` e `currentScreen`.
- `main.js` carica impostazioni e indice scenari, poi mostra `home`. Se `index.json` non si carica, `store.scenarioIndex = []` e `scenarioIndexError` contiene il messaggio.
- `scenarios.js`: `loadIndex()` → `[{ id, file, title, emoji }]`, `loadScenario(id)` → scenario completo; entrambe con cache e percorsi relativi.
- Nomi delle schermate: `home`, `settings`, `intro`, `auction`, `judge`, `roundResult`, `final`.
- Nessun routing via URL per la partita (un reload riporta alla home). Opzionale: salvare `game` in `sessionStorage`.

## 6. Eventi (`js/events.js`)

```js
on(name, handler) → unsubscribe;  emit(name, payload)
```
| Evento | Payload | Chi lo emette |
|---|---|---|
| `screen:change` | `{ from, to }` | router |
| `round:start` | `{ roundIndex, scenario }` | ui/intro (quando l'intro è mostrata, dopo `startRound`) |
| `item:reveal` | `{ item, index, opener }` | ui/auction (`index` 0-based) |
| `offer:made` | `{ by, to, amount, isCounter }` | ui/auction |
| `offer:accepted` | `{ by, current, auto }` | ui/auction (`by` = chi accetta, o chi non poteva controbattere se `auto`; `current` = ultima offerta `{ by, to, amount }`) |
| `item:assigned` | `{ item, owner, payer, paid, auto, index }` | ui/auction (dopo `applyAuction`) |
| `money:change` | `{ player, from, to }` | ui/auction (solo se `paid > 0`; `player` = chi paga) |
| `judge:reveal` | `{ side, itemId, owner }` | ui/judge: dopo la conferma del verdetto, uno per ogni oggetto delle due build (`side` = `left`/`right`, `owner` = `p1`/`p2`, svelato solo ora) |
| `judge:verdict` | `{ winner, side, shuffled }` | ui/judge (nuovo): subito prima dei `judge:reveal` |
| `round:end` | `{ roundIndex, winner, source, tieBreak, scores? }` | ui/roundResult (quando il risultato è mostrato; `scores` `{ p1, p2 }` solo in modalità auto; `roundIndex` 0-based) |
| `game:end` | `{ winner, summary }` | ui/final (`summary` = `gameSummary`) |
| `ui:click` | `{ kind }` | ui/components: `createButton` lo emette a ogni click (`kind` = `primary`/`secondary`/`p1`/`p2`), prima di `onClick` |

Gli handler di fx/audio non devono mai lanciare errori verso la UI: avvolgerli in try/catch dentro `events.js`.

## 7. Impostazioni

`settings.js`: `DEFAULTS`, `LIMITS`, `merge(saved)`, `load(store?)` (merge campo per campo con i default, valori non validi → default), `save(settings, store?) → boolean`, `validate(settings, scenarioCount, knownIds?) → { ok, errors }` (`errors = { campo: "messaggio in italiano" }`; `scenarioCount` = scenari nell'indice, `knownIds` opzionale per rifiutare id inesistenti), `selectedCount(settings, scenarioCount)`, `effectiveScenarioIds(settings, knownIds)` (id da passare a `createGame`). Chiave `localStorage`: `byb.settings.v1`. Elenco dei campi: GAME_DESIGN §7. Accesso a `localStorage` sempre in try/catch.

## 8. CSS

- Tutti i colori, i font e le durate stanno in `tokens.css` come custom properties (`--p1`, `--p2`, `--gold`, `--pos`, `--neg`, `--accent`, `--dur-fast`, …).
- Il colore dello scenario si applica con `style="--accent: …"` sul contenitore della schermata.
- Classi in stile BEM leggero: `.item-card`, `.item-card__img`, `.item-card--small`.
- `@media (prefers-reduced-motion: reduce)` in `tokens.css` azzera le durate.
- Mobile-first, a partire da una larghezza di 360 px.

## 9. Immagini

- `createItemImage` restituisce un wrapper `.item-media` con l'emoji (`.item-emoji`) sempre sotto e l'`<img loading="lazy" referrerpolicy="no-referrer">` sopra, invisibile finché non è caricata; su `error` l'`<img>` viene rimossa. Così l'emoji si vede anche mentre la richiesta è in corso o resta appesa (nessun evento `error`).
- Si precaricano le immagini del round all'inizio dell'intro.

## 10. Test e qualità

- `npm test` → `node --test`. Coprire ogni regola di GAME_DESIGN §4 e §6 con almeno un test.
- `npm run validate` → controlla tutti gli scenari; stampa anche AVVISI non bloccanti (`lintScenario`, linee guida di GAME_DESIGN §5.2) senza cambiare l'exit code. `-- --check-images` fa anche richieste di rete (non in CI per default).
- `npm run serve` → http://localhost:8080.
- CI (`ci.yml`): validate + test su ogni push e PR. Deploy (`pages.yml`): pubblica la root del repo su Pages da `main`.

## 11. Proprietà dei file per task (per evitare conflitti tra agenti paralleli)

| Task | File posseduti |
|---|---|
| T1 | `js/engine/auction.js`, `tests/auction.test.mjs` |
| T2 | `js/engine/scoring.js`, `game.js`, `rng.js`, relativi test |
| T3 | `tools/validate-scenarios.mjs`, `scenarios/*`, `tests/scenarios.test.mjs` |
| T4 | `index.html`, `css/tokens.css`, `base.css`, `components.css`, `js/ui/components.js`, `dev/` |
| T5 | `js/main.js`, `router.js`, `store.js`, `settings.js`, `scenarios.js`, `events.js` (spostato da T6), `ui/home.js`, `ui/settings.js`, `tests/settings.test.mjs`, in `css/screens.css` le sezioni home/impostazioni/generiche, in `ui/components.js` e `css/components.css` i controlli del form |
| T6 | `ui/intro.js`, `ui/auction.js`, `ui/judge.js`, `ui/roundResult.js`, `css/screens.css` (aggiunge le sue sezioni sotto quelle di T5) |
| T7 | `ui/final.js` |
| T8 | `js/fx/*`, ritocchi a tutti i CSS e a `ui/*` (solo presentazione) |
| T9 | `js/audio/*`, `assets/audio/*`, `css/audio.css`, `CREDITS.md`, campi audio in `ui/settings.js` |

Per modificare un file posseduto da un altro task in corso, coordinarsi: annotarlo in [PROGRESS.md](PROGRESS.md).
