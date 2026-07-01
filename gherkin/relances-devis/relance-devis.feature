# language: fr
@bloc:commercial @module:relances-devis @module:devis
Fonctionnalité: Relance d'un devis non signé

  Parcours de suivi commercial : l'artisan relance un devis déjà envoyé
  mais pas encore signé, pour inciter le client à répondre.

  @nominal
  Scénario: L'artisan relance un devis envoyé non signé
    Étant donné qu'un devis au statut "Envoyé" n'a pas encore été signé par le client
    Quand l'artisan envoie une relance pour ce devis
    Alors le client reçoit un email de relance
    Et cet email contient le lien pour consulter et signer le devis

  @erreur
  Scénario: Un devis déjà signé ne peut pas être relancé
    Étant donné qu'un devis a été signé par le client
    Quand l'artisan tente d'envoyer une relance pour ce devis
    Alors la relance est refusée car seul un devis envoyé peut être relancé
