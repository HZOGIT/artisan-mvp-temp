# language: fr
@bloc:clients @module:rdv-en-ligne @module:clients @module:interventions @module:avis @public
Fonctionnalité: Du rendez-vous en ligne à l'avis client

  Parcours client : une prise de RDV en ligne crée automatiquement le client
  et l'intervention ; l'intervention terminée déclenche une demande d'avis.

  @nominal
  Scénario: Une prise de RDV en ligne crée le client et l'intervention
    Étant donné que l'artisan a publié sa page de prise de RDV en ligne
    Quand un prospect réserve un créneau "Diagnostic fuite" le mardi à 9h
    Alors une fiche client est créée pour ce prospect
    Et une intervention "Diagnostic fuite" est planifiée le mardi à 9h

  @nominal
  Scénario: Une intervention terminée déclenche une demande d'avis
    Étant donné qu'une intervention est planifiée pour un client
    Quand l'artisan marque l'intervention comme terminée
    Alors une demande d'avis est envoyée au client
