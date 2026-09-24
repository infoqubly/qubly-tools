# QUBLY Valutazione Render

Tool interno per valutare render da piu' PC.

- Le immagini sono mantenute in qualita' originale.
- I voti si sincronizzano tramite Google Sheets e Google Apps Script.
- L'interfaccia include zoom fullscreen con rotellina mouse, trascinamento e doppio click per reset.
- Il sito e' marcato `noindex` e `nofollow`; resta comunque raggiungibile da chi conosce l'URL.

## Uso

Apri il link GitHub Pages del repository, seleziona il votante corretto e vota normalmente.

## Sync

La configurazione della Web App Apps Script e' in `sync-config.js`.

## Valutazione veloce di immagini locali

Dal menu Strumenti apri **Valutazione veloce**, oppure `valutazione-veloce.html`.

- **Apri cartella** include le immagini nelle sottocartelle; **Apri immagini** permette una selezione multipla. Le immagini vengono lette solo localmente e non vengono inviate al server. Viene caricata un'anteprima alla volta, anche per raccolte con oltre 100 file.
- Usa le frecce sullo schermo o sulla tastiera per navigare. Il menu **Vai all'immagine** e **Prossima da valutare** permettono di riprendere una revisione incompleta.
- Scegli **Confermata**, **Da modificare** o **Da scartare**, assegna un voto intero da **1 a 100** e aggiungi un commento facoltativo. Tutte le modifiche si salvano automaticamente; **Salva e successiva** richiede sia un esito sia un voto.
- Il nome file completo (inclusa l'estensione, con distinzione tra maiuscole e minuscole) identifica la valutazione. Riaprendo una cartella nello stesso browser e sullo stesso indirizzo, i voti vengono ritrovati. Nomi identici, anche in cartelle diverse, condividono il voto: l'interfaccia segnala i duplicati.
- **Esporta riepilogo CSV** esporta tutte le immagini della raccolta corrente, incluse quelle ancora da valutare, con percorso, esito, voto, commento e data. Il CSV usa il separatore punto e virgola e UTF-8 con BOM per Excel.
- **Scarica backup dei voti (JSON)** conserva tutte le valutazioni memorizzate, anche di raccolte precedenti. **Importa voti** le ripristina su un altro browser/computer; in caso di conflitto viene mantenuta la valutazione più recente. Nessuna immagine è inclusa nei file esportati.
- La memoria locale del browser può essere cancellata o non essere disponibile: conserva un backup JSON. Un avviso segnala gli errori di salvataggio senza interrompere la revisione.
- La visualizzazione include adattamento alla finestra, dimensione reale, zoom con rotellina, trascinamento e schermo intero. Le scorciatoie **C**, **M**, **X** scelgono l'esito senza interferire con la scrittura dei commenti.

La valutazione veloce è indipendente dalla sincronizzazione Google Sheets dello strumento Valutazione render.
