# language: fr
@bloc:gestion @module:articles @module:devis
Fonctionnalité: Catalogue d'articles réutilisable

  Parcours gestion : l'artisan réutilise un article de son catalogue
  comme ligne de devis, avec prix et TVA pré-remplis.

  @nominal
  Scénario: L'artisan insère un article du catalogue dans un devis
    Étant donné que l'artisan a créé l'article "Chaudière gaz condensation" à 1 800 € HT avec une TVA de 20%
    Quand il insère cet article comme ligne d'un nouveau devis
    Alors la ligne reprend le prix et la TVA définis dans le catalogue
