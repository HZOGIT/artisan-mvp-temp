# language: fr
@bloc:clients @module:rdv-en-ligne
Fonctionnalité: Gestion d'un rendez-vous en ligne

  Parcours client : l'artisan gère les demandes de RDV en ligne — il peut
  annuler un rendez-vous ou proposer un autre créneau au client.

  @nominal
  Scénario: L'artisan annule un rendez-vous confirmé
    Étant donné qu'un rendez-vous est au statut "Confirmé"
    Quand l'artisan annule ce rendez-vous
    Alors le rendez-vous passe au statut "Annulé"

  @nominal
  Scénario: L'artisan propose un autre créneau au client
    Étant donné qu'un rendez-vous est en attente à un créneau qui ne convient pas
    Quand l'artisan propose un autre créneau dans le futur
    Alors la demande initiale est refusée
    Et un nouveau créneau est proposé au client

  @erreur
  Scénario: Un créneau proposé dans le passé est refusé
    Étant donné qu'un rendez-vous est en attente
    Quand l'artisan propose un créneau situé dans le passé
    Alors la proposition est refusée car le créneau ne peut pas être dans le passé
