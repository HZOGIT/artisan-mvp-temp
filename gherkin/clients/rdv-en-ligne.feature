# language: fr
@bloc:Clients @modules:rdv-en-ligne,clients,interventions,avis @public
Fonctionnalité: Du RDV en ligne à l'avis client

  @nominal
  Scénario: Un prospect prend RDV en ligne, devient client et laisse un avis
    Étant donné que Marc a publié sa page de prise de RDV en ligne
    Quand un prospect réserve un créneau "Diagnostic fuite" pour mardi 9h
    Alors une fiche client est créée automatiquement pour ce prospect
    Et une intervention "Diagnostic fuite" est planifiée pour mardi 9h
    Quand Marc marque l'intervention comme "Terminée"
    Alors une demande d'avis est envoyée au client
    Et l'avis publié apparaît sur la fiche du client
