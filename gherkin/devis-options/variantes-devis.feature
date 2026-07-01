# language: fr
@bloc:commercial @module:devis-options @module:devis
Fonctionnalité: Variantes de devis

  Parcours commercial : l'artisan propose plusieurs variantes chiffrées d'un
  même devis ; la variante retenue est convertie en devis à envoyer au client.

  @nominal
  Scénario: L'artisan ajoute une variante à un devis
    Étant donné que l'artisan a un devis pour un client
    Quand il ajoute une variante "Gamme supérieure" avec ses propres lignes
    Alors la variante est enregistrée sous le devis

  @nominal
  Scénario: La variante retenue est convertie en devis
    Étant donné qu'un devis comporte plusieurs variantes chiffrées
    Quand l'artisan retient une variante et la convertit en devis
    Alors un devis reprenant les lignes de la variante retenue est créé
