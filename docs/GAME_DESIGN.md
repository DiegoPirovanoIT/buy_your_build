# Buy Your Build — Game Design Document

> Documento di riferimento per chiunque (persona o agente) lavori al gioco.
> Se una regola qui è in conflitto con il codice, **vince questo documento**: aggiorna il codice o proponi una modifica al documento.

## 1. Concept

Due giocatori si sfidano a costruire la "build" migliore per uno scenario (es. *Costruisci il tuo bunker nucleare*).
Il sito propone 10 oggetti, uno alla volta, messi all'asta. Ogni giocatore ha un budget (default 20 €).
A fine asta si decide chi ha costruito meglio: un giudice umano oppure un punteggio precalcolato.

- Piattaforma: sito statico su **GitHub Pages**, gioco in locale ("hot-seat": un solo dispositivo condiviso).
- Lingua UI: **italiano**.
- Costo: €0, nessun servizio a pagamento.

## 2. Glossario

| Termine | Significato |
|---|---|
| Scenario / Collezione | Un tema (Pizza, Bunker…) con 10 oggetti e una lista di combo |
| Round | Una partita completa su uno scenario: asta dei 10 oggetti + giudizio |
| Partita | Sequenza di N round (impostazione), ognuno su uno scenario diverso |
| Apritore | Il giocatore che apre l'asta di un oggetto |
| Offerta | Direzione ("Lo prendo" / "Lo do all'altro") + importo ≥ 0 € |

## 3. Flusso di gioco

```
Home ─► Impostazioni (opzionale)
  └─► Inizio partita
        └─► per ogni round:
              Intro scenario ─► Asta (10 oggetti) ─► Giudizio ─► Risultato round
        └─► Schermata finale (vincitore della partita, animazioni, dettaglio punteggi)
```

### 3.1 Partita e round
- La partita ha `rounds` round (default 3). Ogni round usa uno scenario **diverso**, estratto a caso dagli scenari abilitati, senza ripetizioni.
- Il budget **si resetta** a ogni round. I soldi avanzati **non valgono punti** (usati solo come spareggio, v. §6.3).
- Il vincitore della partita è chi vince più round. Pareggio nei round → spareggio con il punteggio totale (in modalità automatica) oppure pareggio dichiarato.

### 3.2 Ordine degli oggetti
- I 10 oggetti dello scenario vengono presentati in **ordine casuale**.
- I punteggi degli oggetti e delle combo sono **nascosti** durante l'asta (sennò il gioco è banale). Vengono mostrati solo nel riepilogo finale.

## 4. Regole dell'asta (cuore del gioco)

### 4.1 Chi apre
- Il **primo** oggetto della partita lo apre un giocatore estratto a caso. Poi si alterna: oggetto 2 → l'altro, oggetto 3 → di nuovo il primo, e così via. L'alternanza continua anche nei round successivi, senza ricominciare.

### 4.2 L'offerta
Ogni offerta ha una **direzione** e un **importo**:
- **"Lo prendo"** (+X): pago X € e l'oggetto va a me.
- **"Lo do all'altro"** (−X): pago X € e l'oggetto va all'avversario (si usa quando si pensa che l'oggetto peggiori la build).
- "Lo prendo" va da **0** a tutti i soldi di chi offre. **Un'offerta da 0 € significa sempre "lo tengo io gratis".**
- "Lo do all'altro" va da **1** a tutti i soldi di chi offre: per regalare l'oggetto all'avversario bisogna pagare almeno 1 €.

Nella UI c'è un solo cursore o campo, da −soldi a +soldi, con le etichette "Lo do all'altro ◄ 0 ► Lo prendo". Lo 0 è il punto di partenza e vuol dire "lo tengo gratis".

### 4.3 Svolgimento
1. L'apritore fa la prima offerta, anche da 0 €. Non può passare.
2. L'altro giocatore può:
   - **Accettare**: l'asta finisce e vale l'ultima offerta.
   - **Controbattere**: un'offerta che **ribalta il risultato** (cambia chi prende l'oggetto) con importo ≥ importo corrente + 1 €. In pratica:
     - se l'oggetto andrebbe all'avversario, può offrire "Lo prendo io" oppure "Lo ridò a te";
     - controbattere nella direzione che lascia il risultato uguale non ha senso (pagherebbe per ottenere ciò che succede già), quindi la UI non lo permette.
     - esempio: se l'apritore offre 0 € (lo tiene), l'altro **non può** offrire "Lo do all'altro". Può solo lasciarglielo gratis (Accetta) oppure offrire "Lo prendo io" da 1 € in su.
3. Si continua ad alternarsi finché qualcuno accetta.
4. **Paga solo chi ha fatto l'ultima offerta**, l'importo di quell'offerta. L'oggetto va a chi indica l'offerta.
- Se il giocatore di turno non ha abbastanza soldi per controbattere (soldi < importo corrente + 1), accetta automaticamente.

### 4.4 Giocatore senza soldi
Non serve una regola speciale. Un giocatore con 0 € può solo aprire a 0 € (lo tiene) o accettare, e non può controbattere. Quindi, se l'avversario è a 0 €, chi ha i soldi decide lui cosa fare di ogni oggetto: lo tiene gratis, oppure lo regala pagando 1 €.

### 4.5 Esempi
- G1 apre "Lo do all'altro, 1 €" (l'ananas andrebbe a G2). G2 controbatte "Lo ridò a te, 2 €". G1 accetta → G2 paga 2 €, l'ananas va a G1.
- G2 apre "Lo prendo, 3 €" (generatore). G1 controbatte "Lo prendo io, 4 €". G2 accetta → G1 paga 4 € e prende il generatore.
- G1 apre a 0 € (lo tiene gratis). G2 controbatte "Lo prendo io, 1 €". G1 controbatte "Lo prendo io, 2 €". G2 accetta → G1 paga 2 € e prende l'oggetto.
- G2 apre a 0 €. G1 accetta → G2 prende l'oggetto gratis.

## 5. Formato degli scenari

Uno scenario è un file JSON in `scenarios/<id>.json`, elencato in `scenarios/index.json`.

```json
{
  "id": "bunker-nucleare",
  "title": "Costruisci il tuo bunker nucleare",
  "shortTitle": "Bunker",
  "emoji": "☢️",
  "description": "La fine del mondo è vicina. Cosa porti sotto terra?",
  "items": [
    {
      "id": "filtro-aria",
      "name": "Filtro dell'aria NBC",
      "description": "Filtra particelle radioattive, biologiche e chimiche.",
      "image": "https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=400",
      "emoji": "🌬️",
      "score": 9
    }
  ],
  "combos": [
    {
      "items": ["generatore", "carburante"],
      "score": 6,
      "label": "Corrente garantita",
      "description": "Il generatore senza carburante è un soprammobile."
    },
    {
      "items": ["scatolette", "razioni-militari"],
      "score": -3,
      "label": "Doppione",
      "description": "Servono alla stessa cosa: il secondo vale meno."
    }
  ]
}
```

`scenarios/index.json`:
```json
{ "scenarios": [ { "id": "bunker-nucleare", "file": "bunker-nucleare.json", "title": "Costruisci il tuo bunker nucleare", "emoji": "☢️" } ] }
```

### 5.1 Regole di validazione (controllate da `npm run validate`)
- `id` in kebab-case, unico tra tutti gli scenari, uguale al nome del file.
- Esattamente **10** oggetti con `id` univoci.
- `score` degli oggetti: intero tra **-10 e +10**.
- Combo: **2 o 3** `items`, tutti id esistenti nello scenario, senza duplicati; `score` intero tra **-10 e +10**, diverso da 0; non ci possono essere due combo con lo stesso insieme di oggetti.
- Campo opzionale `theme.accent`: colore esadecimale (`#rrggbb`) per l'accento grafico dello scenario.
- `image` è un URL https; `emoji` è obbligatoria (serve se l'immagine non si carica).
- Campi testuali obbligatori: `title`, `shortTitle`, `description`, `name`, `label` e la `description` di ogni combo.
- Ogni combo **deve** avere una `description` che spiega in modo concreto **perché** c'è quel bonus o malus. Lunghezza 20–150 caratteri. Non sono ammesse frasi generiche tipo "Bella combo" o "Non stanno bene".

### 5.2 Linee guida per chi scrive gli scenari
- I punteggi riflettono **quanto l'oggetto è utile/azzeccato** per lo scenario, secondo il buon senso.
- Ogni scenario deve avere: almeno **2 oggetti negativi** (trappole, così "Lo do all'altro" serve davvero), almeno **2 oggetti molto forti** (≥7), il resto vario.
- Da **4 a 8 combo**, sia positive sia negative. Tipi utili:
  - **Sinergia** (+): oggetti che insieme funzionano meglio (generatore + carburante).
  - **Doppione** (−): due oggetti che servono alla stessa cosa (rende "il secondo non vale pieno").
  - **Scontro** (−): oggetti che insieme stanno malissimo (ananas + acciughe).
  - **Tris** (±): combo da 3 oggetti, più rara e di solito con valore più alto.
- Immagini: usare **Wikimedia Commons** con URL `https://commons.wikimedia.org/wiki/Special:FilePath/<NomeFile>?width=400` (stabili, licenza libera, nessun blocco agli hotlink). Prima di salvare, verificare che l'URL risponda 200 con un content-type immagine (`npm run validate -- --check-images`).
- Tono: leggero e divertente. La `description` di una combo spiega il motivo ("Il generatore senza carburante è un soprammobile"), non ripete il nome della combo.

### 5.3 Primi 3 scenari
1. **Bunker nucleare** ☢️
2. **Pizza perfetta** 🍕
3. **Vacanza dei sogni** 🏝️

Obiettivo di lungo periodo: **almeno 50 scenari**.

## 6. Giudizio

Si sceglie nelle impostazioni: `human` oppure `auto`.

### 6.1 Giudice umano
- Una schermata mostra le due build affiancate (immagine + nome di ogni oggetto, niente soldi spesi).
- Con l'opzione **"Mescola i lati"** attiva: le due build vengono messe a sinistra o a destra a caso e chiamate **"Build A" / "Build B"**, senza nomi dei giocatori, per evitare favoritismi. Dopo il voto si svela a chi appartiene ciascuna.
- Il giudice tocca la build che preferisce (con conferma). Pareggio non ammesso.
- Dopo il verdetto si può comunque aprire il **punteggio automatico** "per curiosità".

### 6.2 Punteggio automatico
```
punteggio(giocatore) = Σ score degli oggetti posseduti
                     + Σ score delle combo i cui oggetti sono TUTTI posseduti da quel giocatore
```
- Una combo conta solo se tutti i suoi oggetti appartengono allo **stesso** giocatore.
- Il risultato può essere negativo.

### 6.3 Spareggio di un round (modalità auto)
A parità di punteggio vince chi ha **più soldi avanzati**. Se c'è ancora parità, il round è pari.

## 7. Impostazioni

Salvate in `localStorage` (chiave `byb.settings.v1`), con i default qui sotto.

| Impostazione | Tipo | Default | Vincoli |
|---|---|---|---|
| `budget` | intero € | 20 | 5–200 |
| `judgeMode` | `"auto"` \| `"human"` | `"auto"` | |
| `shuffleSides` | bool | true | solo se judgeMode = human |
| `rounds` | intero | 3 | 1 – n. scenari abilitati |
| `scenarioIds` | array \| `null` | `null` (= tutti) | almeno `rounds` scenari |
| `player1Name` | stringa | "Giocatore 1" | 1–20 caratteri |
| `player2Name` | stringa | "Giocatore 2" | 1–20 caratteri |
| `sfxOn` | bool | true | effetti sonori |
| `musicOn` | bool | true | musica di sottofondo |
| `volume` | 0–100 | 70 | volume generale |

Pagina impostazioni: elenco degli scenari con checkbox (più "seleziona tutti / nessuno") e ricerca per nome (servirà quando gli scenari saranno 50).

## 8. Schermate e layout

Mobile-first (lo smartphone passa di mano in mano), ma deve funzionare anche su desktop o tablet.

### 8.1 Home
Titolo, "Nuova partita", "Impostazioni", riassunto delle impostazioni attive.

### 8.2 Intro del round
"Round 2 di 3", emoji e titolo dello scenario, descrizione, budget. Pulsante "Inizia asta".

### 8.3 Asta (schermata principale)
```
┌──────────────────────────────────────┐
│  Bunker ☢️ · Oggetto 4/10            │
│  ┌──────────┐                        │
│  │ IMMAGINE │  Filtro dell'aria NBC  │   PARTE SUPERIORE:
│  └──────────┘  descrizione           │   oggetto all'asta
│  Offerta: MARCO lo prende per 5 €    │
│  Tocca a: GIULIA [◄ ━━━●━━ ►] [Offri] [Accetta]
├──────────────────┬───────────────────┤
│ MARCO     12 €   │ GIULIA     7 €    │   PARTE INFERIORE:
│ [img][img][img]  │ [img][img]        │   recap giocatori
│                  │                   │
└──────────────────┴───────────────────┘
```
- Ogni giocatore ha il suo colore. Il riquadro del giocatore di turno è evidenziato e i pulsanti prendono il suo colore.
- Le miniature degli oggetti comprati mostrano il nome toccandole o passandoci sopra.
- Quando un oggetto viene assegnato, una breve animazione lo fa "volare" nella colonna di chi lo prende.
- Immagine non caricabile → si mostra l'emoji dell'oggetto su sfondo colorato (`onerror`).

### 8.4 Giudizio umano (§6.1)

### 8.5 Risultato del round
Vincitore del round, punteggi (in modalità auto), parziale dei round vinti. "Prossimo round".

### 8.6 Schermata finale
- Animazione d'ingresso: rullo di tamburi o suspense, poi il nome del vincitore con **coriandoli** (canvas) e i punteggi che salgono con un effetto contatore.
- Punteggio finale e round vinti da ciascuno.
- Pulsante **"Come sono stati calcolati i punteggi"** che apre un pannello con, per ogni round e per ogni giocatore:
  - ogni oggetto con il suo punteggio (verde se positivo, rosso se negativo);
  - le combo attivate: label, oggetti coinvolti, valore (+ verde / − rosso) e la `description` che spiega il motivo;
  - il totale.
- Pulsanti "Rivincita" (stesse impostazioni) e "Home".
- Si rispetta `prefers-reduced-motion`.

### 8.7 Grafica e animazioni (direzione artistica)
- **Stile**: game show televisivo e casa d'aste. Sfondo scuro con luci da palco, colori accesi per i due giocatori (es. G1 corallo, G2 turchese), accento oro per soldi e vittorie. Tipografia grande e "da quiz", leggibile da due persone sedute davanti allo stesso schermo.
- **Ogni scenario** ha il suo colore o la sua sfumatura d'accento: un campo opzionale `theme.accent` nel JSON, altrimenti un colore derivato dall'id.
- **Animazioni** (solo CSS/Web Animations API, niente librerie):
  - transizioni tra schermate (slide o fade);
  - entrata dell'oggetto all'asta, come un "sipario" o la carta girata;
  - contatore dei soldi animato quando cambia, numeri che "rimbalzano" a ogni offerta;
  - cursore dell'offerta che cambia colore tra "Lo prendo" e "Lo do all'altro";
  - "martelletto" all'aggiudicazione, poi l'oggetto vola nella colonna di chi lo riceve;
  - giudizio: le due build si rivelano un oggetto alla volta;
  - finale: suspense, coriandoli (canvas), punteggi che salgono, vincitore sotto i riflettori;
  - pannello del dettaglio punteggi: le righe compaiono in sequenza, le combo con un badge +/−.
- Durata tipica 150–400 ms, finale fino a ~4 s, saltabile con un tap.
- `prefers-reduced-motion`: animazioni ridotte a semplici fade, niente coriandoli.

### 8.8 Audio
- **Tutti gli effetti sonori sono sintetizzati con la Web Audio API** (nessun file, nessun problema di licenza, peso zero). La musica di sottofondo può essere generata proceduralmente oppure un file **CC0** (es. da OpenGameArt o Pixabay, citato in `CREDITS.md`) in `assets/audio/`, sotto 1 MB.
- Effetti previsti: tap/click, offerta, controfferta (tensione crescente con l'importo), accettazione, martelletto di aggiudicazione, "cassa" quando si pagano soldi, oggetto ricevuto, oggetto trappola regalato (suono comico), inizio round, rullo di tamburi prima del verdetto, fanfara di vittoria, suono di pareggio.
- L'audio parte solo **dopo la prima interazione** dell'utente (regola autoplay dei browser).
- Pulsante muto sempre visibile in alto. Rispetta `sfxOn`, `musicOn`, `volume`.
- L'audio **non** è mai l'unico modo di capire cosa succede (accessibilità).

## 9. Architettura tecnica

Sito statico in vanilla JS (ES modules), senza build e senza dipendenze. Il motore di gioco è puro e testabile in Node.
Tutti i dettagli (struttura delle cartelle, contratti delle API, eventi, proprietà dei file per task) stanno in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## 10. Fuori scope (per ora)
- Multiplayer online su dispositivi diversi: forse in futuro, con Cloudflare Workers + Durable Objects (gratis). Per ora si gioca solo sullo stesso dispositivo. Il motore di gioco puro (vedi ARCHITECTURE.md) facilita il porting.
- Account, classifiche, editor di scenari nell'interfaccia.
