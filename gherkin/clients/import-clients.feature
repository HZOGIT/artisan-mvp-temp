# language: fr
@bloc:clients @module:clients
Fonctionnalité: Import de clients

  Parcours client : l'artisan importe une liste de clients ; l'import est
  tolérant ligne par ligne — les lignes valides sont créées, les lignes
  invalides sont ignorées sans faire échouer l'ensemble.

  @nominal
  Scénario: L'artisan importe une liste contenant une ligne invalide
    Étant donné que l'artisan a une liste de 10 clients dont une ligne sans nom
    Quand il importe cette liste
    Alors les 9 clients valides sont ajoutés à son carnet
    Et la ligne sans nom est ignorée sans bloquer l'import
