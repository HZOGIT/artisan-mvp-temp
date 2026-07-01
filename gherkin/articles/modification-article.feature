# language: fr
@bloc:gestion @module:articles
Fonctionnalité: Mise à jour d'un article du catalogue

  Parcours gestion : l'artisan ajuste le prix d'un article de son catalogue ;
  les nouveaux devis reprendront le prix mis à jour.

  @nominal
  Scénario: L'artisan met à jour le prix d'un article
    Étant donné que l'artisan a un article "Robinet mitigeur" à 45 € HT dans son catalogue
    Quand il modifie son prix unitaire à 49 € HT
    Alors le nouveau prix est enregistré sur l'article

  @erreur
  Scénario: Un prix négatif est refusé
    Étant donné que l'artisan modifie un article de son catalogue
    Quand il saisit un prix unitaire négatif
    Alors la modification est refusée car le prix est invalide
