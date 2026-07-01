# language: fr
@bloc:commercial @module:signature @module:devis @module:notifications @public
Fonctionnalité: Refus d'un devis par le client

  Parcours commercial : depuis le lien public, le client refuse un devis
  qui lui a été envoyé, en indiquant éventuellement un motif ; l'artisan
  en est aussitôt informé.

  @nominal
  Scénario: Le client refuse un devis depuis le lien public
    Étant donné qu'un devis envoyé attend une réponse du client
    Quand le client refuse le devis en indiquant le motif "Budget trop élevé"
    Alors le devis passe au statut "Refusé"
    Et l'artisan est notifié du refus avec le motif indiqué
