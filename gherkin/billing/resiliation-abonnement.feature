# language: fr
@bloc:parametres @module:billing @module:subscription
Fonctionnalité: Résiliation et réactivation de l'abonnement

  Parcours abonnement : l'artisan résilie son abonnement pour la fin de la
  période en cours, tout en gardant l'accès jusque-là, et peut revenir sur
  sa décision tant que l'échéance n'est pas atteinte.

  @nominal
  Scénario: L'artisan résilie son abonnement pour la fin de période
    Étant donné que l'artisan a un abonnement actif en cours de période
    Quand il demande la résiliation de son abonnement
    Alors la résiliation est programmée pour la fin de la période en cours
    Et il conserve l'accès jusqu'à cette échéance

  @nominal
  Scénario: L'artisan réactive un abonnement résilié avant l'échéance
    Étant donné qu'un abonnement a une résiliation programmée pour la fin de période
    Quand l'artisan réactive son abonnement avant l'échéance
    Alors la résiliation programmée est annulée
    Et l'abonnement se poursuit normalement
