# language: fr
@bloc:commercial @module:factures
Fonctionnalité: Facture en retard de paiement

  Parcours d'encaissement : une facture envoyée dont l'échéance est dépassée
  et qui n'a pas été réglée passe « en retard », tout en restant payable.

  @nominal
  Scénario: Une facture envoyée non réglée passe en retard à l'échéance
    Étant donné qu'une facture au statut "Envoyée" a une échéance de paiement dépassée
    Et que le client ne l'a pas encore réglée
    Quand l'échéance de paiement est dépassée
    Alors la facture passe au statut "En retard"
    Et elle reste réglable en ligne par le client
