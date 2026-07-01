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
