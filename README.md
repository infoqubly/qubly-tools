# QUBLY Tools

Tre strumenti per lavorare con immagini nel browser. Le immagini selezionate dal computer restano locali: non vengono caricate sul sito. Le valutazioni e le categorie sono salvate nel browser, sullo stesso indirizzo web; per spostarle su un altro browser o conservarne una copia usa i file JSON esportabili.

## Valutazione render

Apri **Valutazione render** dal menu Tools. Il repository non contiene più la vecchia raccolta fissa di originali e varianti.

1. Trascina nella pagina file o cartelle (anche con sottocartelle), oppure usa **Apri cartella** o **Apri immagini**. I trascinamenti successivi aggiungono file alla raccolta; i pulsanti aprono una nuova raccolta. Dopo un riavvio o su un altro PC, apri di nuovo la stessa raccolta per ricollegare le immagini alle categorie e ai voti.
2. In **Organizza**, crea i nomi dei soggetti e dei modelli di prompt. Seleziona una o più righe e clicca un nome per assegnarlo in blocco. Lo stesso modello si applica alle immagini di più soggetti. L'icona della matita rinomina un soggetto o modello senza perdere le assegnazioni.
3. Per ciascun soggetto, assegna un'immagine come **Originale**. Alle varianti assegna un modello di prompt. Il filtro “Da organizzare” mostra ciò che manca.
4. In **Valuta**, scegli il soggetto, confronta originale e variante e assegna a ogni variante un voto intero da 1 a 100, con una nota facoltativa. Sono disponibili più valutatori. I dati vengono salvati automaticamente.
5. In **Classifica modelli**, confronta la media di ogni modello. Ogni soggetto valutato conta una volta nella media del modello, anche quando contiene più varianti. Puoi esportare la classifica CSV.

**Scarica progetto** esporta soggetti, modelli, assegnazioni, valutatori e voti in JSON; **Importa progetto** li ripristina. Le immagini non sono incluse nel backup. Questa versione usa salvataggio locale e scambio manuale del progetto JSON; la precedente sincronizzazione Google Sheets non è collegata alla nuova raccolta dinamica.

## Valutazione veloce

Apri **Valutazione veloce**, trascina file o cartelle nella pagina oppure scegli una cartella e scorri le immagini con le frecce. Trascinamenti successivi aggiungono file alla raccolta corrente. Ogni file può essere **Confermato**, **Da modificare** o **Da scartare**, con voto da 1 a 100 e commento facoltativo. Nome file ed estensione identificano la valutazione: caricando di nuovo un file con lo stesso nome nello stesso browser, il voto viene ritrovato. File con nomi identici condividono quindi il voto, anche se provengono da cartelle diverse.

La nuova schermata **Riepilogo** mostra tutte le immagini valutate, incluse quelle di raccolte precedenti. Ordina dal voto più alto e filtra per esito o per voto maggiore di una soglia. Le anteprime compaiono per i file attualmente aperti; cliccando una riga torni alla valutazione. Il riepilogo visibile si esporta in CSV.

**Esporta riepilogo CSV** nella vista Valuta include anche i file ancora da valutare della raccolta corrente. **Scarica backup dei voti (JSON)** e **Importa voti** trasferiscono i voti tra browser e PC. Il CSV usa punto e virgola e UTF-8 con BOM per Excel.

## Confronto immagini

Trascina nella pagina due immagini, una cartella (si usano le prime due immagini in ordine di nome) oppure una singola immagine su uno dei due riquadri. Puoi anche scegliere i file dai pulsanti, confrontarli con il cursore o alternarli e usare lo schermo intero. Nessun file viene salvato sul sito.

Il sito è marcato `noindex` e `nofollow`, ma chi conosce l'URL può aprirlo.
