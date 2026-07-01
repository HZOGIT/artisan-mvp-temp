# language: fr
@bloc:clients @module:clients
Fonctionnalité: Fusion de fiches client en doublon

  Parcours client : l'artisan fusionne deux fiches d'un même client ; la fiche
  conservée est complétée par les informations manquantes de l'autre, qui est
  ensuite archivée.

  @nominal
  Scénario: L'artisan fusionne deux fiches d'un même client
    Étant donné que l'artisan a deux fiches en doublon pour un même client
    Quand il fusionne le doublon dans la fiche à conserver
    Alors la fiche conservée est complétée par les informations manquantes du doublon
    Et le doublon est archivé et n'apparaît plus dans la liste des clients

  @erreur
  Scénario: Fusionner une fiche avec elle-même est refusé
    Étant donné que l'artisan a sélectionné une seule fiche client
    Quand il tente de la fusionner avec elle-même
    Alors la fusion est refusée
