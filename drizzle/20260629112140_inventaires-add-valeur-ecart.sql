/* Correction additive OPE-129 — colonne manquante + index manquants.
   La migration précédente (20260629105935) a été enregistrée mais n'a rien appliqué
   car les tables inventaires/inventaires_lignes existaient déjà (migration 20260628231149).
   Toutes les opérations sont idempotentes. */

alter table "inventaires" add column if not exists "valeurEcart" numeric(12, 2);

/* Index composite statut — absent de la migration d'origine. */
create index if not exists "inventaires_statut_idx" on "inventaires" ("artisanId", "statut");

/* FK manquantes sur inventaires_lignes — ADD CONSTRAINT IF NOT EXISTS n'existe pas en PG ;
   on utilise un bloc DO pour garder l'idempotence. */
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventaires_lignes_inventaire_fk'
  ) then
    alter table "inventaires_lignes"
      add constraint "inventaires_lignes_inventaire_fk"
      foreign key ("inventaireId") references "inventaires"("id") on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventaires_lignes_stock_fk'
  ) then
    alter table "inventaires_lignes"
      add constraint "inventaires_lignes_stock_fk"
      foreign key ("stockId") references "stocks"("id") on delete restrict;
  end if;
end $$;