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
- `Link`

Le righe vengono raggruppate usando la data in `Giorno`; da `Ore` viene ricavato
l'orario. Gli slot senza descrizione, durata, note o link non vengono mostrati.
Qualsiasi valore non vuoto in `Link` viene mostrato con l'etichetta `Link` accanto
alla durata. Se il valore contiene un URL completo, l'etichetta diventa cliccabile.

## Pubblicazione

Il progetto è pensato per GitHub Pages.
