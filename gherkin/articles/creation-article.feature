# language: fr
@bloc:gestion @module:articles
Fonctionnalité: Création d'un article au catalogue

  Parcours gestion : l'artisan ajoute un article à son catalogue avec sa
  référence, son prix unitaire HT et son taux de TVA.

  @nominal
  Scénario: L'artisan crée un article avec un taux de TVA
    Étant donné que l'artisan ouvre le module "Articles"
    Quand il crée l'article de référence "PLB-001" désigné "Robinet mitigeur" à 45 € HT avec une TVA de 20%
    Alors l'article apparaît dans son catalogue avec son prix HT et sa TVA

  @erreur
  Scénario: La création d'un article sans référence est refusée
    Étant donné que l'artisan remplit un article sans renseigner de référence
    Quand il tente d'enregistrer cet article
    Alors la création est refusée car la référence est requise
