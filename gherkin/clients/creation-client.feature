# language: fr
@bloc:clients @module:clients
Fonctionnalité: Création d'un client

  Parcours client : l'artisan enregistre un nouveau client dans son carnet,
  particulier ou professionnel.

  @nominal
  Scénario: L'artisan crée un client professionnel
    Étant donné que l'artisan ouvre le module "Clients"
    Quand il enregistre un client professionnel "Boulangerie Martin" avec l'email "contact@boulangerie-martin.fr"
    Alors le client apparaît dans son carnet de clients

  @erreur
  Scénario: La création d'un client sans nom est refusée
    Étant donné que l'artisan ouvre le formulaire de création de client
    Quand il tente d'enregistrer un client sans renseigner de nom
    Alors la création est refusée car le nom est requis
