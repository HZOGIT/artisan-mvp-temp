# language: fr
@bloc:onboarding @module:auth @module:artisan @module:feature-modules @module:devis @critique
Fonctionnalité: Inscription et prise en main

  Parcours de découverte : un artisan s'inscrit, active ses modules
  et arrive prêt à créer son premier devis.

  @nominal
  Scénario: L'artisan active ses modules après inscription
    Étant donné que l'artisan a créé son compte et vérifié son email
    Et qu'il a renseigné son entreprise et son métier
    Quand il active les modules "Devis", "Clients" et "Interventions"
    Alors son menu n'affiche que les modules activés
    Et il est invité à créer son premier devis
