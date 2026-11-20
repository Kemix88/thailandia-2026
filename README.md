# Thailandia 2026

Web app statica per visualizzare un itinerario di viaggio.

## Fonte dati

L'app legge direttamente il foglio `Itinerario` tramite SheetDB:

https://sheetdb.io/api/v1/jvs32otchwgus?sheet=Itinerario

Il JSON deve essere un array di righe con i campi:

- `Giorno`
- `Ore`
- `Descrizione`
- `Durata (ore)`
- `Note`
- `Link 1`
- `Link 2`

Le righe vengono raggruppate usando la data in `Giorno`; da `Ore` viene ricavato
l'orario. Gli slot senza descrizione, durata, note o link non vengono mostrati.
I valori non vuoti in `Link 1` e `Link 2` vengono mostrati nel pannello espandibile
dell'evento. Se un valore contiene un URL completo, la relativa etichetta diventa
cliccabile. Il precedente campo `Link` continua a essere supportato come `Link 1`.

## Pubblicazione

Il progetto è pensato per GitHub Pages.
