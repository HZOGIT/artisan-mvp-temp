# language: fr
@bloc:onboarding @module:artisan
Fonctionnalité: Profil de l'entreprise

  Parcours de configuration : l'artisan complète les informations de son
  entreprise (SIRET, adresse, coordonnées, IBAN) utilisées sur ses documents.

  @nominal
  Scénario: L'artisan complète le profil de son entreprise
    Étant donné que l'artisan ouvre les paramètres de son entreprise
    Quand il renseigne son SIRET, son adresse et son téléphone
    Alors les informations de l'entreprise sont enregistrées sur son profil

  @erreur
  Scénario: Un IBAN invalide est refusé
    Étant donné que l'artisan modifie le profil de son entreprise
    Quand il enregistre un IBAN au format ou à la clé de contrôle invalides
    Alors la modification est refusée car l'IBAN est invalide
