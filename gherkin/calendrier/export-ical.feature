# language: fr
@bloc:terrain @module:calendrier @module:interventions
Fonctionnalité: Abonnement iCal au calendrier

  Parcours terrain : l'artisan synchronise ses interventions avec son agenda
  externe grâce à un lien d'abonnement iCal stable.

  @nominal
  Scénario: L'artisan récupère le lien d'abonnement iCal de son calendrier
    Étant donné que l'artisan a des interventions planifiées
    Quand il demande le lien d'abonnement iCal de son calendrier
    Alors un lien iCal lui est fourni pour synchroniser ses interventions

  @edge
  Scénario: Le lien iCal reste stable entre deux consultations
    Étant donné que l'artisan a déjà généré son lien d'abonnement iCal
    Quand il redemande le lien d'abonnement iCal
    Alors le même lien lui est retourné
