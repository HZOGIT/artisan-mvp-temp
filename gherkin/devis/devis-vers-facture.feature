# language: fr
@bloc:commercial @module:clients @module:devis @module:signature @module:factures @critique @paiement
Fonctionnalité: Du devis signé à la facture

  Parcours commercial : un devis envoyé est signé par le client,
  puis transformé en facture sans ressaisie des lignes.

  @nominal
  Scénario: Le client signe le devis depuis le lien public
    Étant donné que l'artisan a envoyé un devis à un client
    Quand le client signe le devis depuis le lien public
    Alors le devis passe au statut "Signé"

  @nominal
  Scénario: L'artisan convertit un devis signé en facture
    Étant donné qu'un devis au statut "Signé" comporte une ligne "Remplacement chaudière" à 2 500 € HT
    Quand l'artisan convertit ce devis en facture
    Alors une facture est créée avec les mêmes lignes et le même total TTC
