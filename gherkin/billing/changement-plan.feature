# language: fr
@bloc:parametres @module:billing @module:feature-modules
Fonctionnalité: Changement de plan d'abonnement

  Parcours abonnement : l'artisan change de plan ; un passage à un plan
  supérieur est facturé au prorata du temps restant, et les modules du
  nouveau plan sont activés.

  @nominal
  Scénario: L'artisan passe à un plan supérieur au prorata
    Étant donné que l'artisan a un abonnement actif en cours de période
    Quand il passe à un plan supérieur
    Alors le montant au prorata du temps restant lui est présenté avant confirmation
    Et les modules du nouveau plan sont activés

  @edge
  Scénario: Changer pour le plan déjà en cours est sans effet
    Étant donné que l'artisan a un abonnement actif sur un plan
    Quand il choisit de passer sur ce même plan
    Alors aucun changement n'est appliqué à son abonnement
