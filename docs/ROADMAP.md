# Roadmap & piano di lavoro per gli agenti

Ogni task è pensato per essere eseguito da **un agente**. Prima di iniziare, l'agente legge [CLAUDE.md](../CLAUDE.md), [GAME_DESIGN.md](GAME_DESIGN.md), [ARCHITECTURE.md](ARCHITECTURE.md) e [PROGRESS.md](PROGRESS.md).
Le dipendenze indicano cosa deve essere finito prima. I task della stessa fase senza dipendenze tra loro possono girare **in parallelo** (in worktree separati).

Regole valide per tutti gli agenti:
- Non cambiare le regole di gioco: se una regola è ambigua, segnalalo nel report finale invece di inventarla.
- Niente dipendenze npm a runtime. In sviluppo solo strumenti di Node (`node:test`).
- Testi della UI in italiano. Codice e nomi di variabile in inglese.
- Prima di dichiarare finito: `npm test` e `npm run validate` devono passare.
- A fine lavoro: aggiorna [PROGRESS.md](PROGRESS.md) (stato del task e note per chi viene dopo).

## Agenti

Gli agenti sono definiti in `.claude/agents/` (modello ed effort sono fissati lì).

| Task | Agente |
|---|---|
| T0 | `scaffolder` |
| T1, T2, T3a (validatore) | `engine-developer` |
| T3b (3 scenari), T11+ | `scenario-writer` |
| T4, T5, T6, T7 | `ui-developer` |
| T8 | `visual-designer` |
| T9 | `audio-developer` |
| T10 | `qa-tester` |
| Fine di ogni fase, bug difficili | `code-reviewer` |
| Fine sessione | `docs-keeper` |
| Controllo periodico dei link | `image-checker` |

**Revisione**: alla fine delle Fasi 1, 2, 3 e 4+5 si lancia `code-reviewer` sul lavoro della fase. I problemi bloccanti si correggono prima di passare alla fase successiva.

---

## Fase 0 — Scaffold (1 agente, sequenziale)
**T0. Struttura del progetto**
- Crea la struttura di cartelle di ARCHITECTURE §2 (file vuoti o stub dove serve), con `.gitignore` (`node_modules/`).
- `package.json`: script `test` (`node --test tests/`), `validate` (`node tools/validate-scenarios.mjs`), `serve` (server statico locale, es. `npx serve` oppure un piccolo script Node).
- Rimuovi `wrangler` dalle devDependencies: l'online è fuori scope per ora.
- Workflow `ci.yml` (validate + test) e `pages.yml` (deploy di `main` su Pages).
- `index.html` minimale che carica `js/main.js` e mostra "Buy Your Build".
- Fatto quando: la pagina si apre in locale, la CI è verde, Pages è attivo.

## Fase 1 — Fondamenta (4 agenti in parallelo, dipendono da T0)
**T1. Motore d'asta** — `js/engine/auction.js` + `tests/auction.test.mjs`
- Implementa GAME_DESIGN §4 e il contratto in ARCHITECTURE §4.2. Test che coprono: offerte "lo prendo" e "lo do all'altro", apertura a 0 € = lo tiene, "lo do all'altro" minimo 1 €, controfferta che deve ribaltare il risultato con importo ≥ corrente+1, offerta oltre i soldi rifiutata, accettazione automatica se non si può controbattere, giocatori a 0 €, apritore che non può accettare prima di offrire, pagamento solo dell'ultimo offerente.

**T2. Punteggio + orchestrazione partita** — `js/engine/scoring.js`, `game.js`, `rng.js` + test
- Implementa GAME_DESIGN §6.2, §6.3, §3.1 e §3.2 con i contratti di ARCHITECTURE §4.1, §4.3, §4.4: estrazione degli scenari senza ripetizioni, ordine casuale degli oggetti, alternanza dell'apritore tra oggetti e tra round, conteggio dei round vinti, spareggi.
- `game.js` usa `auction.js` solo tramite il suo contratto (può usare uno stub finché T1 non è pronto).

**T3. Validatore + i primi 3 scenari** — `tools/validate-scenarios.mjs`, `scenarios/*.json`, `tests/scenarios.test.mjs`
- Diviso in due: **T3a** validatore e test (`engine-developer`), poi **T3b** i 3 scenari (`scenario-writer`, dipende da T3a).
- Validatore con tutte le regole di GAME_DESIGN §5.1; flag `--check-images` che fa una richiesta HEAD/GET di ogni immagine.
- Scrivi i 3 scenari di GAME_DESIGN §5.3 seguendo le linee guida del §5.2, con immagini Wikimedia verificate.

**T4. Design system + componenti statici** — `css/tokens.css`, `base.css`, `components.css`, `js/ui/components.js`
- Palette (colore G1, colore G2, positivo, negativo), tipografia, pulsanti, card oggetto, miniatura con fallback emoji, modale, layout split dell'asta (GAME_DESIGN §8.3), secondo ARCHITECTURE §8. Mobile-first.
- Una pagina demo (`dev/components.html`) con i componenti e dati finti.

## Fase 2 — Schermate (1–2 agenti, dipende da T1–T4)
**T5. Router + Home + Impostazioni** — `main.js`, `settings.js`, `ui/home.js`, `ui/settings.js`
- GAME_DESIGN §7 completo: validazione, persistenza, selezione e ricerca degli scenari, vincoli (rounds ≤ scenari scelti).

**T6. Flusso del round** — `ui/intro.js`, `ui/auction.js`, `ui/judge.js`, `ui/roundResult.js`
- Collega UI e motore. Asta completa, giudice umano con "mescola i lati", risultato del round. Animazioni minime: la rifinitura è in Fase 4.
- Crea `js/events.js` ed emette **tutti** gli eventi di ARCHITECTURE §6 nei punti giusti (servono alle Fasi 4 e 5).
- T6 può partire insieme a T5 se il router viene definito per primo (interfaccia definita in ARCHITECTURE §5).

## Fase 3 — Finale funzionale (1 agente, dipende da T6)
**T7. Schermata finale** — `ui/final.js`
- GAME_DESIGN §8.6 nella versione funzionale: vincitore, punteggi, pannello di dettaglio dei punteggi con combo e descrizioni, rivincita, home. Animazioni di base (coriandoli semplici), la rifinitura è in Fase 4.

## Fase 4 — Grafica e animazioni (1 agente, dipende da T7; in parallelo con la Fase 5)
**T8. Direzione artistica e animazioni** — `css/`, `js/fx/`, ritocchi in `js/ui/`
- Implementa GAME_DESIGN §8.7: stile game show, temi per scenario, transizioni tra schermate, tutte le animazioni elencate, finale spettacolare, `prefers-reduced-motion`.
- Si aggancia agli eventi di ARCHITECTURE §6. Non tocca il motore (`js/engine/`) né le regole.
- Fatto quando: una partita completa è fluida su un telefono di fascia media (niente scatti), e il Lighthouse Performance mobile è ≥ 90.

## Fase 5 — Audio (1 agente, dipende da T7; in parallelo con la Fase 4)
**T9. Effetti sonori e musica** — `js/audio/`, `assets/audio/`, `CREDITS.md`
- Implementa GAME_DESIGN §8.8: tutti gli effetti con la Web Audio API, musica, pulsante muto, impostazioni `sfxOn`/`musicOn`/`volume` (aggiungerle alla pagina impostazioni), sblocco al primo tap.
- Si aggancia **solo** agli eventi di ARCHITECTURE §6: zero modifiche alle schermate oltre al pulsante muto e alle impostazioni.
- Per evitare conflitti con T8: T9 non modifica i file CSS esistenti; il pulsante muto usa un suo file `css/audio.css`.

## Fase 6 — QA e rilascio (1 agente, dipende da T8 e T9)
**T10. Test end-to-end manuale e rifinitura**
- Gioca partite complete in tutte le combinazioni di impostazioni (auto/human, shuffle on/off, budget 5/20/200, rounds 1/3, audio on/off). Prova su mobile (viewport da 375 px) e su desktop.
- Correggi i bug, aggiorna il README con le regole in breve e il link al gioco, deploy.

## Fase 7 — Contenuti (agenti in parallelo, può partire già dopo T3)
**T11…Tn. Pacchetti di scenari**: ogni agente (tipo `scenario-writer`, vedi `.claude/agents/`) scrive circa **8–10 scenari** su temi assegnati (per evitare doppioni) fino ad arrivare ad almeno 50.
- Ogni pacchetto passa `npm run validate -- --check-images`.
- I temi si prendono da [SCENARIO_IDEAS.md](SCENARIO_IDEAS.md), segnandoli come assegnati.

## Futuro (non pianificato)
- Multiplayer online (Cloudflare Workers + Durable Objects, gratis).
- Editor di scenari in-app, condivisione di scenari tramite link.
