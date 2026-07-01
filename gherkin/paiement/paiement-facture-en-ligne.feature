# language: fr
@bloc:commercial @module:paiement @module:factures @module:client-portal @critique @paiement
Fonctionnalité: Paiement d'une facture en ligne

  Parcours d'encaissement : le client règle une facture par carte via le lien
  public, une fois que l'artisan a activé le paiement en ligne (Stripe Connect).

  @nominal
  Scénario: Le client paie une facture en ligne par carte
    Étant donné que l'artisan a activé le paiement en ligne sur son compte
    Et qu'une facture au statut "Envoyée" a été transmise au client
    Quand le client règle la facture avec la carte de test "4242 4242 4242 4242"
    Alors la facture passe au statut "Payée"
    Et le client voit une confirmation de paiement

  @erreur
  Scénario: Le paiement échoue si la carte est refusée
    Étant donné qu'une facture au statut "Envoyée" est réglable en ligne
    Quand le client tente de régler avec la carte de test "4000 0000 0000 9995"
    Alors le paiement échoue pour fonds insuffisants
    Et la facture reste au statut "Envoyée"
    Et le client peut réessayer le paiement

  @edge
  Scénario: Le paiement aboutit après une authentification 3D Secure
    Étant donné qu'une facture au statut "Envoyée" est réglable en ligne
    Quand le client règle avec la carte de test "4000 0025 0000 3155" et valide l'authentification 3D Secure
    Alors la facture passe au statut "Payée"
    Et le client voit une confirmation de paiement

  @edge
  Scénario: Relancer le paiement réutilise la session en cours sans en créer une seconde
    Étant donné qu'une session de paiement est déjà ouverte pour une facture "Envoyée"
    Quand le client relance le paiement de cette facture
    Alors il est redirigé vers la session de paiement déjà en cours
    Et aucune seconde session de paiement n'est créée
