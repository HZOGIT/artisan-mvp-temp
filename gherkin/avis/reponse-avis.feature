# language: fr
@bloc:clients @module:avis
Fonctionnalité: Réponse de l'artisan à un avis

  Parcours de e-réputation : l'artisan répond publiquement aux avis de ses
  clients pour montrer son suivi.

  @nominal
  Scénario: L'artisan répond à un avis client
    Étant donné qu'un avis client est publié
    Quand l'artisan y publie une réponse
    Alors la réponse de l'artisan apparaît sous l'avis

  @erreur
  Scénario: Une réponse vide est refusée
    Étant donné qu'un avis client est publié
    Quand l'artisan tente d'enregistrer une réponse vide
    Alors la réponse est refusée car son contenu est requis
