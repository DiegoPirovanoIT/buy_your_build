# Buy Your Build

Gioco web per 2 giocatori sullo stesso dispositivo. Si sceglie uno scenario (es. "Costruisci il tuo bunker nucleare"), 10 oggetti vanno all'asta con un budget limitato, e alla fine un giudice umano oppure un punteggio precalcolato (oggetti + combo) decreta la build migliore.
Sito statico pubblicato su **GitHub Pages**, costo €0.

## Documenti (leggili prima di lavorare)

| File | Contenuto |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | **Regole di gioco**, formato degli scenari, schermate, grafica, audio. È la fonte di verità. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Struttura del codice, contratti delle API, eventi, proprietà dei file per task |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fasi e task in ordine, con le dipendenze |
| [docs/PROGRESS.md](docs/PROGRESS.md) | **Stato attuale**: cosa è fatto, cosa è in corso, note di passaggio |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Registro delle decisioni prese con l'utente, e perché |
| [docs/SCENARIO_IDEAS.md](docs/SCENARIO_IDEAS.md) | Elenco dei temi degli scenari e a chi sono assegnati |

## Come riprendere il lavoro in una nuova sessione

1. Leggi [docs/PROGRESS.md](docs/PROGRESS.md) per sapere a che punto siamo.
2. Scegli il prossimo task libero in [docs/ROADMAP.md](docs/ROADMAP.md), con le dipendenze soddisfatte.
3. A fine lavoro aggiorna PROGRESS.md: stato, cosa è stato fatto, problemi aperti, note per il task successivo.
4. Se l'utente prende una nuova decisione di design, aggiungila a DECISIONS.md e aggiorna GAME_DESIGN.md.

## Comandi

```bash
npm test                              # test del motore (node:test)
npm run validate                      # valida tutti gli scenari
npm run validate -- --check-images    # verifica anche che le immagini rispondano
npm run serve                         # http://localhost:8080
```

## Regole non negoziabili

- **€0**: nessun servizio a pagamento, nessuna carta di credito, nessuna chiave API.
- **Vanilla JS + ES modules, niente build, niente dipendenze a runtime** (né npm né CDN nel browser).
- **`js/engine/` è puro**: niente DOM, niente `Math.random` diretto (usa `rng`), niente import da `ui/`, `fx/` o `audio/`.
- **Non inventare regole di gioco.** Se qualcosa è ambiguo, chiedi all'utente oppure segnalalo in PROGRESS.md.
- Se cambi un contratto (API, eventi, formato degli scenari), aggiorna ARCHITECTURE.md o GAME_DESIGN.md **nello stesso commit**.
- Testi della UI in **italiano**; codice, nomi e commenti in **inglese**.
- Prima di dichiarare finito un task: `npm test` e `npm run validate` devono passare.

## Git

- Un branch per task: `task/T<n>-<slug>` (es. `task/T1-auction-engine`). Merge su `main` quando il task è finito e verde.
- Commit piccoli con messaggi in inglese all'imperativo.
- Commit e push solo quando l'utente lo chiede o quando il task lo prevede esplicitamente.
- Per GitHub usa la CLI `gh` (il connettore MCP di GitHub non funziona in questo ambiente).

## Agenti

Definiti in `.claude/agents/`, ognuno con `model` ed `effort` espliciti (mai vuoti o `inherit`). Quale agente fa quale task: tabella in [docs/ROADMAP.md](docs/ROADMAP.md).

| Agente | Modello / effort | Uso |
|---|---|---|
| `scaffolder` | sonnet / medium | Struttura, CI, deploy (T0) |
| `engine-developer` | sonnet / medium | Motore, punteggio, validatore, test (T1, T2, T3a) |
| `scenario-writer` | sonnet / medium | Scenari (T3b, T11+) |
| `ui-developer` | sonnet / medium | Schermate e componenti (T4–T7) |
| `visual-designer` | sonnet / medium | Grafica e animazioni (T8) |
| `audio-developer` | sonnet / medium | Audio (T9) |
| `qa-tester` | sonnet / medium | Prove complete e rilascio (T10) |
| `code-reviewer` | opus / high | Revisione a fine fase, bug difficili |
| `docs-keeper` | haiku / low | Aggiornamento della documentazione |
| `image-checker` | haiku / low | Controllo dei link delle immagini |

Regola per i nuovi agenti: opus/high per ragionamento profondo (architettura, revisione, sicurezza, debug difficile); sonnet/medium per la programmazione quotidiana; haiku/low per compiti semplici e ripetitivi; fable solo per compiti eccezionali, spiegando il motivo all'utente.

## Scenari

- Un file JSON per scenario in `scenarios/`, registrato in `scenarios/index.json`. Formato e regole: GAME_DESIGN §5.
- Per scriverne di nuovi usa l'agente `scenario-writer` (`.claude/agents/scenario-writer.md`).
- Immagini solo da Wikimedia Commons (`Special:FilePath`), sempre verificate.
