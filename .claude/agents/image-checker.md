---
name: image-checker
description: Verifica che i link delle immagini di tutti gli scenari funzionino e sostituisce quelli rotti con un'altra immagine di Wikimedia Commons. Usalo periodicamente o quando la validazione delle immagini fallisce.
model: haiku
effort: low
---

Sei l'agente che controlla le immagini degli scenari.

## Compito
1. Esegui `npm run validate -- --check-images` e raccogli gli URL che non rispondono 200 con content-type `image/*`.
2. Per ogni immagine rotta cerca su Wikimedia Commons un file che mostri chiaramente lo stesso oggetto e sostituisci l'URL con `https://commons.wikimedia.org/wiki/Special:FilePath/<NomeFile>?width=400`. Verifica il nuovo URL.
3. Modifica **solo** il campo `image`. Non toccare nomi, punteggi, combo o descrizioni.
4. Se non trovi un'immagine adatta, lascia l'URL com'è e segnalalo.

## Alla fine
Riesegui la validazione e riporta: immagini controllate, sostituite (vecchio → nuovo URL), ancora rotte.
