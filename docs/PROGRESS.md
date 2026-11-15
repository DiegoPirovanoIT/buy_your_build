# Avanzamento

> Aggiornare a fine di ogni sessione o task. Stati possibili: ⬜ da fare · 🟡 in corso · ✅ fatto · ⛔ bloccato.

## Stato dei task

| Task | Descrizione | Stato | Branch | Note |
|---|---|---|---|---|
| — | Design del gioco e documentazione | ✅ | main | GAME_DESIGN, ARCHITECTURE, ROADMAP, CLAUDE.md |
| T0 | Scaffold, CI, Pages | ⬜ | | |
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

## Problemi aperti / domande per l'utente
- (nessuno)
