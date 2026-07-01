# language: fr
@bloc:Terrain @modules:interventions,calendrier,techniciens,clients
Fonctionnalité: Planification et calendrier terrain

  @edge
  Scénario: L'artisan replanifie une intervention en conflit et notifie le technicien
    Étant donné que l'artisan a affecté deux interventions au même technicien le mardi à 9h
    Quand il ouvre son calendrier
    Alors les deux interventions sont signalées comme étant en conflit d'horaire
    Quand il déplace la seconde intervention au mardi 14h
    Alors le conflit disparaît du calendrier
    Et le technicien affecté est notifié du nouvel horaire
    Et le client concerné est notifié du nouvel horaire
