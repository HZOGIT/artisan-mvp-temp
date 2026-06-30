/*
 * Déduplication préventive : invalide les doublons en_attente (garde le plus récent par factureId+artisanId).
 * Nécessaire pour que CREATE UNIQUE INDEX ne crashe pas si des doublons existent déjà en production.
 */
UPDATE paiements_stripe
SET statut = 'echoue'
WHERE statut = 'en_attente'
  AND id NOT IN (
    SELECT max(id)
    FROM paiements_stripe
    WHERE statut = 'en_attente'
    GROUP BY "factureId", "artisanId"
  );

/*
 * Index UNIQUE partiel — garantit l'atomicité au niveau DB : une seule ligne en_attente par facture/artisan.
 * Remplace le check applicatif non-atomique de createInvoiceCheckout.
 */
CREATE UNIQUE INDEX idx_paiements_stripe_facture_en_attente
  ON paiements_stripe ("factureId", "artisanId")
  WHERE statut = 'en_attente';
