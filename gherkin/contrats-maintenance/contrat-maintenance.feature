# language: fr
@bloc:commercial @module:contrats-maintenance @module:interventions
Fonctionnalité: Contrat de maintenance récurrent

  Parcours commercial : l'artisan met en place un contrat de maintenance pour
  un client ; le contrat génère automatiquement les interventions récurrentes
  prévues.

  @nominal
  Scénario: L'artisan crée un contrat de maintenance
    Étant donné que l'artisan a un client à mettre sous contrat
    Quand il crée un contrat de maintenance annuel avec deux visites par an
    Alors le contrat est enregistré au statut "Actif"

  @nominal
  Scénario: Le contrat génère automatiquement ses interventions récurrentes
    Étant donné qu'un contrat de maintenance actif prévoit des visites planifiées
    Quand les interventions du contrat sont générées automatiquement
    Alors les interventions correspondantes sont créées au statut "Planifiée"
