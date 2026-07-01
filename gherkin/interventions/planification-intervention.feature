# language: fr
@bloc:terrain @module:interventions @module:techniciens @module:conges
Fonctionnalité: Planification d'une intervention et affectation d'un technicien

  Parcours terrain : l'artisan planifie une intervention puis y affecte un
  technicien ; l'affectation signale les conflits éventuels (autres
  interventions ou congés du technicien).

  @nominal
  Scénario: L'artisan planifie une intervention
    Étant donné que l'artisan a un client avec une demande d'intervention
    Quand il planifie une intervention "Réparation fuite" le jeudi à 10h
    Alors l'intervention est enregistrée au statut "Planifiée"

  @edge
  Scénario: L'affectation signale un conflit avec un congé du technicien
    Étant donné qu'une intervention est planifiée le jeudi à 10h
    Et que le technicien est en congé ce jeudi
    Quand l'artisan affecte ce technicien à l'intervention
    Alors le technicien est affecté à l'intervention
    Et un conflit avec son congé est signalé à l'artisan
