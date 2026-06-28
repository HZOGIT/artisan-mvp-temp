-- Custom migration — RLS isolation multi-tenant (générée par scripts/rls/generate-tenant-rls.mjs).
-- Régénérer après ajout/retrait d'une table tenant = NOUVELLE migration custom (append).
-- NE PAS éditer une migration déjà appliquée. Idempotente (DROP POLICY IF EXISTS + CREATE).

-- Isolation multi-tenant (RLS) — généré par scripts/rls/generate-tenant-rls.mjs.
-- Idempotent. FORCE ROW LEVEL SECURITY : même le propriétaire est soumis aux policies.
-- Le rôle applicatif du nouveau stack DOIT être NON-superuser (les superusers/BYPASSRLS
-- ignorent RLS). Le legacy (rôle superuser) bypass → non impacté.

alter table "activites" enable row level security;
alter table "activites" force row level security;
drop policy if exists tenant_isolation on "activites";
create policy tenant_isolation on "activites" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "ai_threads" enable row level security;
alter table "ai_threads" force row level security;
drop policy if exists tenant_isolation on "ai_threads";
create policy tenant_isolation on "ai_threads" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "analyses_photos_chantier" enable row level security;
alter table "analyses_photos_chantier" force row level security;
drop policy if exists tenant_isolation on "analyses_photos_chantier";
create policy tenant_isolation on "analyses_photos_chantier" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "articles_artisan" enable row level security;
alter table "articles_artisan" force row level security;
drop policy if exists tenant_isolation on "articles_artisan";
create policy tenant_isolation on "articles_artisan" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "artisan_modules" enable row level security;
alter table "artisan_modules" force row level security;
drop policy if exists tenant_isolation on "artisan_modules";
create policy tenant_isolation on "artisan_modules" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "avis_clients" enable row level security;
alter table "avis_clients" force row level security;
drop policy if exists tenant_isolation on "avis_clients";
create policy tenant_isolation on "avis_clients" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "badges" enable row level security;
alter table "badges" force row level security;
drop policy if exists tenant_isolation on "badges";
create policy tenant_isolation on "badges" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "billing_invoices" enable row level security;
alter table "billing_invoices" force row level security;
drop policy if exists tenant_isolation on "billing_invoices";
create policy tenant_isolation on "billing_invoices" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "billing_payment_methods" enable row level security;
alter table "billing_payment_methods" force row level security;
drop policy if exists tenant_isolation on "billing_payment_methods";
create policy tenant_isolation on "billing_payment_methods" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "budgets_categories" enable row level security;
alter table "budgets_categories" force row level security;
drop policy if exists tenant_isolation on "budgets_categories";
create policy tenant_isolation on "budgets_categories" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "categories_depenses" enable row level security;
alter table "categories_depenses" force row level security;
drop policy if exists tenant_isolation on "categories_depenses";
create policy tenant_isolation on "categories_depenses" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "chantiers" enable row level security;
alter table "chantiers" force row level security;
drop policy if exists tenant_isolation on "chantiers";
create policy tenant_isolation on "chantiers" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "classement_techniciens" enable row level security;
alter table "classement_techniciens" force row level security;
drop policy if exists tenant_isolation on "classement_techniciens";
create policy tenant_isolation on "classement_techniciens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "client_portal_access" enable row level security;
alter table "client_portal_access" force row level security;
drop policy if exists tenant_isolation on "client_portal_access";
create policy tenant_isolation on "client_portal_access" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "clients" enable row level security;
alter table "clients" force row level security;
drop policy if exists tenant_isolation on "clients";
create policy tenant_isolation on "clients" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "commandes_fournisseurs" enable row level security;
alter table "commandes_fournisseurs" force row level security;
drop policy if exists tenant_isolation on "commandes_fournisseurs";
create policy tenant_isolation on "commandes_fournisseurs" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "config_alertes_previsions" enable row level security;
alter table "config_alertes_previsions" force row level security;
drop policy if exists tenant_isolation on "config_alertes_previsions";
create policy tenant_isolation on "config_alertes_previsions" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "config_relances_auto" enable row level security;
alter table "config_relances_auto" force row level security;
drop policy if exists tenant_isolation on "config_relances_auto";
create policy tenant_isolation on "config_relances_auto" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "configurations_comptables" enable row level security;
alter table "configurations_comptables" force row level security;
drop policy if exists tenant_isolation on "configurations_comptables";
create policy tenant_isolation on "configurations_comptables" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "conges" enable row level security;
alter table "conges" force row level security;
drop policy if exists tenant_isolation on "conges";
create policy tenant_isolation on "conges" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "contrats_maintenance" enable row level security;
alter table "contrats_maintenance" force row level security;
drop policy if exists tenant_isolation on "contrats_maintenance";
create policy tenant_isolation on "contrats_maintenance" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "conversations" enable row level security;
alter table "conversations" force row level security;
drop policy if exists tenant_isolation on "conversations";
create policy tenant_isolation on "conversations" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "couleurs_interventions" enable row level security;
alter table "couleurs_interventions" force row level security;
drop policy if exists tenant_isolation on "couleurs_interventions";
create policy tenant_isolation on "couleurs_interventions" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "demandes_avis" enable row level security;
alter table "demandes_avis" force row level security;
drop policy if exists tenant_isolation on "demandes_avis";
create policy tenant_isolation on "demandes_avis" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "demandes_contact" enable row level security;
alter table "demandes_contact" force row level security;
drop policy if exists tenant_isolation on "demandes_contact";
create policy tenant_isolation on "demandes_contact" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "depenses" enable row level security;
alter table "depenses" force row level security;
drop policy if exists tenant_isolation on "depenses";
create policy tenant_isolation on "depenses" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "devis" enable row level security;
alter table "devis" force row level security;
drop policy if exists tenant_isolation on "devis";
create policy tenant_isolation on "devis" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "ecritures_comptables" enable row level security;
alter table "ecritures_comptables" force row level security;
drop policy if exists tenant_isolation on "ecritures_comptables";
create policy tenant_isolation on "ecritures_comptables" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "emails_log" enable row level security;
alter table "emails_log" force row level security;
drop policy if exists tenant_isolation on "emails_log";
create policy tenant_isolation on "emails_log" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "executions_rapports" enable row level security;
alter table "executions_rapports" force row level security;
drop policy if exists tenant_isolation on "executions_rapports";
create policy tenant_isolation on "executions_rapports" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "exports_comptables" enable row level security;
alter table "exports_comptables" force row level security;
drop policy if exists tenant_isolation on "exports_comptables";
create policy tenant_isolation on "exports_comptables" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "factures" enable row level security;
alter table "factures" force row level security;
drop policy if exists tenant_isolation on "factures";
create policy tenant_isolation on "factures" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "factures_cycle_vie_events" enable row level security;
alter table "factures_cycle_vie_events" force row level security;
drop policy if exists tenant_isolation on "factures_cycle_vie_events";
create policy tenant_isolation on "factures_cycle_vie_events" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "factures_entrantes" enable row level security;
alter table "factures_entrantes" force row level security;
drop policy if exists tenant_isolation on "factures_entrantes";
create policy tenant_isolation on "factures_entrantes" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "files" enable row level security;
alter table "files" force row level security;
drop policy if exists tenant_isolation on "files";
create policy tenant_isolation on "files" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "fournisseurs" enable row level security;
alter table "fournisseurs" force row level security;
drop policy if exists tenant_isolation on "fournisseurs";
create policy tenant_isolation on "fournisseurs" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "habilitations_techniciens" enable row level security;
alter table "habilitations_techniciens" force row level security;
drop policy if exists tenant_isolation on "habilitations_techniciens";
create policy tenant_isolation on "habilitations_techniciens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "historique_alertes_previsions" enable row level security;
alter table "historique_alertes_previsions" force row level security;
drop policy if exists tenant_isolation on "historique_alertes_previsions";
create policy tenant_isolation on "historique_alertes_previsions" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "historique_ca" enable row level security;
alter table "historique_ca" force row level security;
drop policy if exists tenant_isolation on "historique_ca";
create policy tenant_isolation on "historique_ca" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "interventions" enable row level security;
alter table "interventions" force row level security;
drop policy if exists tenant_isolation on "interventions";
create policy tenant_isolation on "interventions" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "interventions_contrat" enable row level security;
alter table "interventions_contrat" force row level security;
drop policy if exists tenant_isolation on "interventions_contrat";
create policy tenant_isolation on "interventions_contrat" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "interventions_mobile" enable row level security;
alter table "interventions_mobile" force row level security;
drop policy if exists tenant_isolation on "interventions_mobile";
create policy tenant_isolation on "interventions_mobile" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "interventions_techniciens" enable row level security;
alter table "interventions_techniciens" force row level security;
drop policy if exists tenant_isolation on "interventions_techniciens";
create policy tenant_isolation on "interventions_techniciens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "llm_usage" enable row level security;
alter table "llm_usage" force row level security;
drop policy if exists tenant_isolation on "llm_usage";
create policy tenant_isolation on "llm_usage" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "message_files" enable row level security;
alter table "message_files" force row level security;
drop policy if exists tenant_isolation on "message_files";
create policy tenant_isolation on "message_files" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "modeles_devis" enable row level security;
alter table "modeles_devis" force row level security;
drop policy if exists tenant_isolation on "modeles_devis";
create policy tenant_isolation on "modeles_devis" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "modeles_email" enable row level security;
alter table "modeles_email" force row level security;
drop policy if exists tenant_isolation on "modeles_email";
create policy tenant_isolation on "modeles_email" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "notes_de_frais" enable row level security;
alter table "notes_de_frais" force row level security;
drop policy if exists tenant_isolation on "notes_de_frais";
create policy tenant_isolation on "notes_de_frais" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "notifications" enable row level security;
alter table "notifications" force row level security;
drop policy if exists tenant_isolation on "notifications";
create policy tenant_isolation on "notifications" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "objectifs_techniciens" enable row level security;
alter table "objectifs_techniciens" force row level security;
drop policy if exists tenant_isolation on "objectifs_techniciens";
create policy tenant_isolation on "objectifs_techniciens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "pa_entites" enable row level security;
alter table "pa_entites" force row level security;
drop policy if exists tenant_isolation on "pa_entites";
create policy tenant_isolation on "pa_entites" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "pa_outbox" enable row level security;
alter table "pa_outbox" force row level security;
drop policy if exists tenant_isolation on "pa_outbox";
create policy tenant_isolation on "pa_outbox" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "paiements_stripe" enable row level security;
alter table "paiements_stripe" force row level security;
drop policy if exists tenant_isolation on "paiements_stripe";
create policy tenant_isolation on "paiements_stripe" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "parametres_artisan" enable row level security;
alter table "parametres_artisan" force row level security;
drop policy if exists tenant_isolation on "parametres_artisan";
create policy tenant_isolation on "parametres_artisan" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "plan_comptable" enable row level security;
alter table "plan_comptable" force row level security;
drop policy if exists tenant_isolation on "plan_comptable";
create policy tenant_isolation on "plan_comptable" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "pointages_chantier" enable row level security;
alter table "pointages_chantier" force row level security;
drop policy if exists tenant_isolation on "pointages_chantier";
create policy tenant_isolation on "pointages_chantier" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "preferences_couleurs_calendrier" enable row level security;
alter table "preferences_couleurs_calendrier" force row level security;
drop policy if exists tenant_isolation on "preferences_couleurs_calendrier";
create policy tenant_isolation on "preferences_couleurs_calendrier" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "previsions_ca" enable row level security;
alter table "previsions_ca" force row level security;
drop policy if exists tenant_isolation on "previsions_ca";
create policy tenant_isolation on "previsions_ca" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "rapports_personnalises" enable row level security;
alter table "rapports_personnalises" force row level security;
drop policy if exists tenant_isolation on "rapports_personnalises";
create policy tenant_isolation on "rapports_personnalises" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "rdv_en_ligne" enable row level security;
alter table "rdv_en_ligne" force row level security;
drop policy if exists tenant_isolation on "rdv_en_ligne";
create policy tenant_isolation on "rdv_en_ligne" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "regles_categorisation" enable row level security;
alter table "regles_categorisation" force row level security;
drop policy if exists tenant_isolation on "regles_categorisation";
create policy tenant_isolation on "regles_categorisation" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "relances_devis" enable row level security;
alter table "relances_devis" force row level security;
drop policy if exists tenant_isolation on "relances_devis";
create policy tenant_isolation on "relances_devis" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "releves_bancaires" enable row level security;
alter table "releves_bancaires" force row level security;
drop policy if exists tenant_isolation on "releves_bancaires";
create policy tenant_isolation on "releves_bancaires" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "soldes_conges" enable row level security;
alter table "soldes_conges" force row level security;
drop policy if exists tenant_isolation on "soldes_conges";
create policy tenant_isolation on "soldes_conges" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "stocks" enable row level security;
alter table "stocks" force row level security;
drop policy if exists tenant_isolation on "stocks";
create policy tenant_isolation on "stocks" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "techniciens" enable row level security;
alter table "techniciens" force row level security;
drop policy if exists tenant_isolation on "techniciens";
create policy tenant_isolation on "techniciens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "transactions_bancaires" enable row level security;
alter table "transactions_bancaires" force row level security;
drop policy if exists tenant_isolation on "transactions_bancaires";
create policy tenant_isolation on "transactions_bancaires" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);

alter table "vehicules" enable row level security;
alter table "vehicules" force row level security;
drop policy if exists tenant_isolation on "vehicules";
create policy tenant_isolation on "vehicules" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

drop policy if exists tenant_isolation on "active_sessions";
alter table "active_sessions" no force row level security;
alter table "active_sessions" disable row level security;

drop policy if exists tenant_isolation on "billing_subscriptions";
alter table "billing_subscriptions" no force row level security;
alter table "billing_subscriptions" disable row level security;

drop policy if exists tenant_isolation on "devices";
alter table "devices" no force row level security;
alter table "devices" disable row level security;

drop policy if exists tenant_isolation on "event_outbox";
alter table "event_outbox" no force row level security;
alter table "event_outbox" disable row level security;

drop policy if exists tenant_isolation on "events";
alter table "events" no force row level security;
alter table "events" disable row level security;

drop policy if exists tenant_isolation on "subscriptions";
alter table "subscriptions" no force row level security;
alter table "subscriptions" disable row level security;

drop policy if exists tenant_isolation on "users";
alter table "users" no force row level security;
alter table "users" disable row level security;
