# language: fr
@bloc:Commercial @modules:clients,devis,signature,factures @critique @paiement
Fonctionnalité: Du devis signé à la facture

  @nominal
  Scénario: Marc transforme un devis signé en facture pour un nouveau client
    Étant donné que Marc est connecté avec le module "Devis" actif
    Quand il crée le client "Mme Durand" à la volée depuis un nouveau devis
    Et qu'il ajoute une ligne "Remplacement chaudière" à 2 500 € HT (TVA 20%)
    Et qu'il envoie le devis par email à Mme Durand
    Et que Mme Durand ouvre le lien public et signe le devis
    Alors le devis passe au statut "Signé"
    Et Marc peut convertir le devis signé en facture en un clic
    Et la facture reprend les mêmes lignes et le même total TTC
