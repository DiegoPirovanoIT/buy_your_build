# Avanzamento

> Aggiornare a fine di ogni sessione o task. Stati possibili: ⬜ da fare · 🟡 in corso · ✅ fatto · ⛔ bloccato.

## Stato dei task

| Task | Descrizione | Stato | Branch | Note |
|---|---|---|---|---|
| — | Design del gioco e documentazione | ✅ | main | GAME_DESIGN, ARCHITECTURE, ROADMAP, CLAUDE.md |
| T0 | Scaffold, CI, Pages | ✅ | task/T0-scaffold | Struttura creata; repo GitHub e Pages ancora da attivare (vedi note) |
| T1 | Motore d'asta | ✅  | task/T1-T2-engine | unito a main |
| T2 | Punteggio + orchestrazione partita | ✅  | task/T1-T2-engine | unito a main |
| T3a | Validatore degli scenari | ✅  | task/T3a-validator | unito a main |
| T3b | 3 scenari (Bunker, Pizza, Vacanza) | ✅ | task/T3b-scenarios | dipende da T3a |
| T4 | Design system + componenti | ✅  | task/T4-design-system | unito a main |
| T5 | Router, Home, Impostazioni | ⬜ | | dipende da T1–T4 |
| T6 | Flusso del round (intro, asta, giudice, risultato) | ⬜ | | dipende da T1–T4 |
| T7 | Schermata finale funzionale | ⬜ | | dipende da T6 |
| T8 | Grafica e animazioni | ⬜ | | dipende da T7 |
| T9 | Audio | ⬜ | | dipende da T7 |
| T10 | QA e rilascio | ⬜ | | dipende da T8, T9 |
| T11+ | Pacchetti di scenari fino a 50 | ⬜ | | dopo T3 |

Scenari pubblicati: **3 / 50**

## Diario delle sessioni

### 2026-11-15 — Design
- Definite con l'utente le regole di gioco, il formato degli scenari, le schermate, la grafica e l'audio.
- Scritti CLAUDE.md, GAME_DESIGN.md, ARCHITECTURE.md, ROADMAP.md, DECISIONS.md, SCENARIO_IDEAS.md.
- Creati 10 agenti in `.claude/agents/` con modello ed effort espliciti.
- Prossimo passo: T0 con l'agente `scaffolder`.

### 2026-11-15 — T0 Scaffold
- Creata la struttura di ARCHITECTURE §2: tutti i moduli di engine/ui/fx/audio/css sono segnaposto (`export {};` o commento) con indicato il task che li implementerà.
- `tools/serve.mjs` (server statico senza dipendenze, porta 8080), `tools/validate-scenarios.mjs` (STUB: passa solo con `scenarios/index.json` = `{ "scenarios": [] }`; il validatore vero è T3a, che deve anche definire/confermare la forma di index.json), `tests/smoke.test.mjs` (segnaposto, può essere rimosso quando ci sono test veri).
- `package.json`: `"type": "module"`, wrangler rimosso, lockfile rigenerato (nessuna dipendenza). Lo script `test` è `node --test` e NON `node --test tests/`: con Node 22 il percorso di directory fallisce (lo tratta come modulo), mentre `node --test` senza argomenti scopre `tests/*.mjs` e `*.test.*` su Node 20 e 22.
- `ci.yml` (validate + test, Node 20) e `pages.yml` (deploy della root da main). Non ancora eseguiti: manca il remote.
- Per chiudere "Pages attivo" servono i comandi `gh` (repo, push, `gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow`), da eseguire solo su richiesta dell'utente.

### 2026-11-15 — Fasi 0 e 1
- T0 unito a main; repo pubblico su GitHub, CI attiva, sito su https://diegopirovanoit.github.io/buy_your_build/
- T1+T2 (motore, 56 test), T3a (validatore, 53 test), T4 (design system e componenti) uniti a main.
- Revisione della Fase 1 (code-reviewer): motore d'asta corretto (fuzz su 50.000 aste); trovate trappole nel contratto di `finishRound` e problemi minori → correzioni in corso sul branch `task/phase1-review-fixes`.
- T3b (3 scenari) in corso.
- **Limite dell'ambiente**: nessun browser disponibile per gli agenti. L'aspetto visivo di `dev/components.html` e delle schermate NON è mai stato verificato a occhio.

## Problemi aperti / domande per l'utente
- Con 10 oggetti per round e l'alternanza continua, il primo oggetto di ogni round lo apre sempre lo stesso giocatore. Segnalato all'utente; in attesa di un suo eventuale parere.
- Serve un controllo visivo umano dell'interfaccia (vedi sopra).
