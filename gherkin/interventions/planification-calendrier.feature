# language: fr
@bloc:Terrain @modules:interventions,calendrier,clients
Fonctionnalité: Planification et calendrier terrain

  @edge
  Scénario: Marc replanifie une intervention en conflit dans son calendrier
    Étant donné que Marc a deux interventions le même mardi à 9h
    Quand il ouvre son calendrier
    Alors les deux interventions sont signalées comme étant en conflit d'horaire
    Quand il déplace la seconde intervention au mardi 14h
    Alors le conflit disparaît du calendrier
    Et le client concerné est notifié du nouvel horaire
