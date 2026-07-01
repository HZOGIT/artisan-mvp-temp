# language: fr
@bloc:terrain @module:interventions @module:calendrier @module:techniciens @module:clients
Fonctionnalité: Planification et calendrier terrain

  Parcours terrain : l'artisan détecte un conflit d'horaire dans son
  calendrier et le résout en replanifiant une intervention.

  @edge
  Scénario: L'artisan résout un conflit d'horaire en replanifiant
    Étant donné que deux interventions sont affectées au même technicien le mardi à 9h
    Et que le calendrier signale ces deux interventions en conflit
    Quand l'artisan déplace la seconde intervention au mardi à 14h
    Alors le conflit disparaît du calendrier
    Et le technicien et le client concernés sont notifiés du nouvel horaire
