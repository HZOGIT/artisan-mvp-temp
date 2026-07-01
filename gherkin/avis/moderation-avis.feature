# language: fr
@bloc:clients @module:avis
Fonctionnalité: Dépôt et modération d'un avis client

  Parcours client : à la suite d'une demande d'avis, le client dépose une note
  et un commentaire ; l'avis reste en attente de modération jusqu'à ce que
  l'artisan décide de le publier.

  @nominal
  Scénario: Le client dépose un avis suite à une demande
    Étant donné que l'artisan a envoyé une demande d'avis au client
    Quand le client attribue une note de 5 sur 5 et laisse un commentaire
    Alors l'avis est enregistré au statut "En attente"
    Et il n'est pas encore visible publiquement

  @nominal
  Scénario: L'artisan publie un avis en attente de modération
    Étant donné qu'un avis client est au statut "En attente"
    Quand l'artisan publie cet avis
    Alors l'avis passe au statut "Publié"
    Et il devient visible sur la fiche de l'artisan
