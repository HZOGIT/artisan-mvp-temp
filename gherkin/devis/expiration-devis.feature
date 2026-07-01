# language: fr
@bloc:commercial @module:devis
Fonctionnalité: Expiration d'un devis

  Parcours commercial : un devis envoyé mais resté sans réponse expire une
  fois sa date de validité dépassée ; un devis déjà signé, lui, n'expire pas.

  @edge
  Scénario: Un devis envoyé non signé expire à échéance de validité
    Étant donné qu'un devis au statut "Envoyé" a une date de validité dépassée
    Et que le client ne l'a pas signé
    Quand la date de validité est dépassée
    Alors le devis passe au statut "Expiré"
    Et il ne peut plus être signé par le client

  @erreur
  Scénario: Un devis déjà signé ne peut pas expirer
    Étant donné qu'un devis a été accepté et signé par le client
    Quand une expiration est tentée sur ce devis
    Alors l'expiration est refusée car le devis est déjà signé
