-- Custom migration — RLS isolation multi-tenant sur les tables enfants sans artisanId direct.
-- Ces tables n'ont pas de colonne artisanId : la policy délègue au parent (EXISTS subquery).
-- Idempotente (DROP POLICY IF EXISTS + CREATE). FORCE RLS : même le propriétaire est soumis.
-- Pas de lockout : aucune de ces tables n'est lue avant le contexte tenant (toutes via withTenant).

-- factures_recurrentes → contrats_maintenance.artisanId
alter table "factures_recurrentes" enable row level security;
alter table "factures_recurrentes" force row level security;
drop policy if exists tenant_isolation on "factures_recurrentes";
create policy tenant_isolation on "factures_recurrentes"
  using (exists (select 1 from "contrats_maintenance" p where p."id" = "contratId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "contrats_maintenance" p where p."id" = "contratId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- mouvements_stock → stocks.artisanId
alter table "mouvements_stock" enable row level security;
alter table "mouvements_stock" force row level security;
drop policy if exists tenant_isolation on "mouvements_stock";
create policy tenant_isolation on "mouvements_stock"
  using (exists (select 1 from "stocks" p where p."id" = "stockId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "stocks" p where p."id" = "stockId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- inventaires_lignes → inventaires.artisanId
alter table "inventaires_lignes" enable row level security;
alter table "inventaires_lignes" force row level security;
drop policy if exists tenant_isolation on "inventaires_lignes";
create policy tenant_isolation on "inventaires_lignes"
  using (exists (select 1 from "inventaires" p where p."id" = "inventaireId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "inventaires" p where p."id" = "inventaireId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- lignes_commandes_fournisseurs → commandes_fournisseurs.artisanId
alter table "lignes_commandes_fournisseurs" enable row level security;
alter table "lignes_commandes_fournisseurs" force row level security;
drop policy if exists tenant_isolation on "lignes_commandes_fournisseurs";
create policy tenant_isolation on "lignes_commandes_fournisseurs"
  using (exists (select 1 from "commandes_fournisseurs" p where p."id" = "commandeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "commandes_fournisseurs" p where p."id" = "commandeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- modeles_devis_lignes → modeles_devis.artisanId
alter table "modeles_devis_lignes" enable row level security;
alter table "modeles_devis_lignes" force row level security;
drop policy if exists tenant_isolation on "modeles_devis_lignes";
create policy tenant_isolation on "modeles_devis_lignes"
  using (exists (select 1 from "modeles_devis" p where p."id" = "modeleId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "modeles_devis" p where p."id" = "modeleId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- notes_frais_depenses → notes_de_frais.artisan_id
alter table "notes_frais_depenses" enable row level security;
alter table "notes_frais_depenses" force row level security;
drop policy if exists tenant_isolation on "notes_frais_depenses";
create policy tenant_isolation on "notes_frais_depenses"
  using (exists (select 1 from "notes_de_frais" p where p."id" = "note_id" and p."artisan_id" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "notes_de_frais" p where p."id" = "note_id" and p."artisan_id" = nullif(current_setting('app.tenant', true), '')::int));

-- documents_chantier → chantiers.artisanId
alter table "documents_chantier" enable row level security;
alter table "documents_chantier" force row level security;
drop policy if exists tenant_isolation on "documents_chantier";
create policy tenant_isolation on "documents_chantier"
  using (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- phases_chantier → chantiers.artisanId
alter table "phases_chantier" enable row level security;
alter table "phases_chantier" force row level security;
drop policy if exists tenant_isolation on "phases_chantier";
create policy tenant_isolation on "phases_chantier"
  using (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- suivi_chantier → chantiers.artisanId
alter table "suivi_chantier" enable row level security;
alter table "suivi_chantier" force row level security;
drop policy if exists tenant_isolation on "suivi_chantier";
create policy tenant_isolation on "suivi_chantier"
  using (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- interventions_chantier → chantiers.artisanId (parent principal)
alter table "interventions_chantier" enable row level security;
alter table "interventions_chantier" force row level security;
drop policy if exists tenant_isolation on "interventions_chantier";
create policy tenant_isolation on "interventions_chantier"
  using (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "chantiers" p where p."id" = "chantierId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- photos_interventions → interventions_mobile.artisanId
alter table "photos_interventions" enable row level security;
alter table "photos_interventions" force row level security;
drop policy if exists tenant_isolation on "photos_interventions";
create policy tenant_isolation on "photos_interventions"
  using (exists (select 1 from "interventions_mobile" p where p."id" = "interventionMobileId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "interventions_mobile" p where p."id" = "interventionMobileId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- assurances_vehicules → vehicules.artisanId
alter table "assurances_vehicules" enable row level security;
alter table "assurances_vehicules" force row level security;
drop policy if exists tenant_isolation on "assurances_vehicules";
create policy tenant_isolation on "assurances_vehicules"
  using (exists (select 1 from "vehicules" p where p."id" = "vehiculeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "vehicules" p where p."id" = "vehiculeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));

-- entretiens_vehicules → vehicules.artisanId
alter table "entretiens_vehicules" enable row level security;
alter table "entretiens_vehicules" force row level security;
drop policy if exists tenant_isolation on "entretiens_vehicules";
create policy tenant_isolation on "entretiens_vehicules"
  using (exists (select 1 from "vehicules" p where p."id" = "vehiculeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int))
  with check (exists (select 1 from "vehicules" p where p."id" = "vehiculeId" and p."artisanId" = nullif(current_setting('app.tenant', true), '')::int));
