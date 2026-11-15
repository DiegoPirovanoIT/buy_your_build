# Registro delle decisioni

> Decisioni di design prese con l'utente. Le più recenti in fondo. Le regole complete stanno in GAME_DESIGN.md.

| # | Data | Decisione | Motivo / note |
|---|---|---|---|
| D1 | 2026-11-15 | Si gioca sullo **stesso dispositivo** (hot-seat). Online forse in futuro. | Più semplice; l'online richiederebbe un backend (Cloudflare Workers, gratis) |
| D2 | 2026-11-15 | Costo **€0**: GitHub Pages, nessun servizio a pagamento | Vincolo dell'utente |
| D3 | 2026-11-15 | Il primo oggetto della partita lo apre un giocatore **a caso**, poi si alterna (anche tra un round e l'altro) | Richiesta dell'utente |
| D4 | 2026-11-15 | Offerta = direzione ("Lo prendo" / "Lo do all'altro") + importo da 0 a tutti i soldi | Si può pagare per rifilare all'avversario un oggetto che peggiora la build |
| D5 | 2026-11-15 | **0 € = "lo tengo gratis"**. "Lo do all'altro" costa almeno 1 € | Chiarito dall'utente |
| D6 | 2026-11-15 | Una controfferta deve **ribaltare chi riceve l'oggetto** e costare almeno corrente + 1 €. Se l'apritore offre 0 €, l'altro può solo lasciarglielo o prenderlo da 1 € in su | Chiarito dall'utente |
| D7 | 2026-11-15 | Paga solo chi ha fatto l'ultima offerta | Conseguenza di D4–D6 |
| D8 | 2026-11-15 | Nessuna regola speciale per chi resta a 0 €: può solo aprire a 0 € o accettare | Emerge da D5/D6; sostituisce la regola iniziale "l'altro decide gratis" |
| D9 | 2026-11-15 | Più round: **scenario diverso per round**, budget che si resetta, vince chi vince più round; i soldi avanzati servono solo come spareggio | Confermato dall'utente |
| D10 | 2026-11-15 | Punteggi di oggetti e combo **nascosti durante l'asta** | Altrimenti l'asta sarebbe banale |
| D11 | 2026-11-15 | Combo da 2 o 3 oggetti, da −10 a +10; i "doppioni" sono combo negative; ogni combo ha una **descrizione obbligatoria** del perché | Richiesta dell'utente |
| D12 | 2026-11-15 | Giudice umano: opzione "mescola i lati" (Build A/B anonime); dopo il verdetto si può vedere anche il punteggio automatico | Confermato dall'utente |
| D13 | 2026-11-15 | Primi 3 scenari: **Bunker nucleare, Pizza perfetta, Vacanza dei sogni**; obiettivo ≥ 50 | Scelta dell'utente |
| D14 | 2026-11-15 | Immagini da **Wikimedia Commons**, con un'emoji come fallback | Link stabili, licenza libera, nessun blocco agli hotlink |
| D15 | 2026-11-15 | Fasi dedicate a **grafica/animazioni** e **audio** (effetti con la Web Audio API) | Richiesta dell'utente |
