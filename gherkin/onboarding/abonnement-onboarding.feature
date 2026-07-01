# language: fr
@bloc:onboarding @module:billing @module:subscription @critique @paiement
Fonctionnalité: Démarrage de l'abonnement à l'onboarding

  Parcours d'activation : pendant l'onboarding, l'artisan enregistre sa carte
  et démarre son abonnement, qui commence par une période d'essai de 15 jours
  sans prélèvement.

  @nominal
  Scénario: L'artisan démarre son abonnement avec une carte valide
    Étant donné que l'artisan a choisi un plan pendant l'onboarding
    Quand il enregistre sa carte de test "4242 4242 4242 4242" pour démarrer son abonnement
    Alors son abonnement démarre en période d'essai de 15 jours
    Et aucun prélèvement n'est effectué avant la fin de l'essai
