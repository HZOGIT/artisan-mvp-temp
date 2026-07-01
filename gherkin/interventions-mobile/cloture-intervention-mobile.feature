# language: fr
@bloc:terrain @module:interventions-mobile @module:interventions @module:geolocalisation
Fonctionnalité: Suivi d'une intervention sur mobile

  Parcours terrain : depuis son mobile, le technicien démarre son intervention
  à l'arrivée puis la clôture une fois le travail terminé, avec la signature
  du client.

  @nominal
  Scénario: Le technicien démarre une intervention à son arrivée
    Étant donné qu'une intervention "Planifiée" est affectée au technicien
    Quand le technicien démarre l'intervention à son arrivée sur le chantier
    Alors l'intervention passe au statut "En cours"
    Et l'heure d'arrivée et la position sont enregistrées

  @nominal
  Scénario: Le technicien clôture une intervention avec la signature du client
    Étant donné qu'une intervention est "En cours"
    Quand le technicien clôture l'intervention avec la signature du client
    Alors l'intervention passe au statut "Terminée"
    Et la signature et les notes de fin sont enregistrées
