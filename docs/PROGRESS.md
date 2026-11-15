# Avanzamento

> Aggiornare a fine di ogni sessione o task. Stati possibili: ⬜ da fare · 🟡 in corso · ✅ fatto · ⛔ bloccato.

## Stato dei task

| Task | Descrizione | Stato | Branch | Note |
|---|---|---|---|---|
| — | Design del gioco e documentazione | ✅ | main | GAME_DESIGN, ARCHITECTURE, ROADMAP, CLAUDE.md |
| T0 | Scaffold, CI, Pages | ✅ | task/T0-scaffold | Struttura creata; repo GitHub e Pages ancora da attivare (vedi note) |
| T1 | Motore d'asta | ⬜ | | dipende da T0 |
| T2 | Punteggio + orchestrazione partita | ⬜ | | dipende da T0 |
| T3a | Validatore degli scenari | ⬜ | | dipende da T0 |
| T3b | 3 scenari (Bunker, Pizza, Vacanza) | ⬜ | | dipende da T3a |
| T4 | Design system + componenti | ⬜ | | dipende da T0 |
| T5 | Router, Home, Impostazioni | ⬜ | | dipende da T1–T4 |
| T6 | Flusso del round (intro, asta, giudice, risultato) | ⬜ | | dipende da T1–T4 |
| T7 | Schermata finale funzionale | ⬜ | | dipende da T6 |
| T8 | Grafica e animazioni | ⬜ | | dipende da T7 |
| T9 | Audio | ⬜ | | dipende da T7 |
| T10 | QA e rilascio | ⬜ | | dipende da T8, T9 |
| T11+ | Pacchetti di scenari fino a 50 | ⬜ | | dopo T3 |

Scenari pubblicati: **0 / 50**

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

## Problemi aperti / domande per l'utente
- (nessuno)
