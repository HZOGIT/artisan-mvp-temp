-- Custom migration — Initialisation du plan comptable PCG (OPE-817).
-- Ajoute une contrainte UNIQUE (artisanId, numeroCompte) et initialise les comptes
-- PCG de base pour tous les artisans existants (idempotente via ON CONFLICT DO NOTHING).
-- artisan_user = superuser → bypass RLS ; pas besoin de set_config.

ALTER TABLE "plan_comptable"
  ADD CONSTRAINT "uq_plan_comptable_artisan_compte" UNIQUE ("artisanId", "numeroCompte");

DO $$
DECLARE
  a_id integer;
BEGIN
  FOR a_id IN SELECT id FROM artisans ORDER BY id LOOP
    INSERT INTO plan_comptable ("artisanId", "numeroCompte", "libelle", "classe", "type")
    VALUES
      (a_id, '401000', 'Fournisseurs',               4, 'passif'),
      (a_id, '411000', 'Clients',                     4, 'actif'),
      (a_id, '425000', 'Personnel — notes de frais',  4, 'passif'),
      (a_id, '445660', 'TVA déductible',              4, 'actif'),
      (a_id, '445710', 'TVA collectée',               4, 'passif'),
      (a_id, '445711', 'TVA collectée 20 %',          4, 'passif'),
      (a_id, '445712', 'TVA collectée 10 %',          4, 'passif'),
      (a_id, '445713', 'TVA collectée 5,5 %',         4, 'passif'),
      (a_id, '445714', 'TVA collectée 2,1 %',         4, 'passif'),
      (a_id, '512000', 'Banque',                      5, 'actif'),
      (a_id, '530000', 'Caisse',                      5, 'actif'),
      (a_id, '607000', 'Achats de marchandises',      6, 'charge'),
      (a_id, '706000', 'Prestations de services',     7, 'produit')
    ON CONFLICT ("artisanId", "numeroCompte") DO NOTHING;
  END LOOP;
END $$;
