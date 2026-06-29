-- Migration additive : inventaire physique stock (OPE-129)
-- Tables : inventaires (campagne de comptage) + inventaires_lignes (article par article)
-- RLS tenant sur inventaires (artisanId). inventaires_lignes scopée via parent (pas d'artisanId).

create type inventaire_statut as enum ('brouillon', 'valide');

create table "inventaires" (
  "id"          serial primary key,
  "artisanId"   integer not null,
  "date"        date not null default current_date,
  "statut"      inventaire_statut not null default 'brouillon',
  "note"        text,
  "valeurEcart" numeric(12, 2),
  "createdAt"   timestamp not null default now(),
  "updatedAt"   timestamp not null default now(),
  constraint "inventaires_artisan_fk" foreign key ("artisanId") references "artisans"("id") on delete cascade
);

create index "inventaires_artisan_idx" on "inventaires" ("artisanId");
create index "inventaires_statut_idx" on "inventaires" ("artisanId", "statut");

create table "inventaires_lignes" (
  "id"                serial primary key,
  "inventaireId"      integer not null,
  "stockId"           integer not null,
  "quantiteTheorique" numeric(10, 2) not null,
  "quantiteReelle"    numeric(10, 2),
  "ecart"             numeric(10, 2),
  constraint "inventaires_lignes_inventaire_fk" foreign key ("inventaireId") references "inventaires"("id") on delete cascade,
  constraint "inventaires_lignes_stock_fk"      foreign key ("stockId")      references "stocks"("id")     on delete restrict
);

create index "inventaires_lignes_inventaire_idx" on "inventaires_lignes" ("inventaireId");
create index "inventaires_lignes_stock_idx"      on "inventaires_lignes" ("stockId");

/* RLS tenant sur inventaires (artisanId direct).
   inventaires_lignes : pas de artisanId, accès scopé via inventaires (pattern mouvements_stock). */
alter table "inventaires" enable row level security;
alter table "inventaires" force row level security;
drop policy if exists tenant_isolation on "inventaires";
create policy tenant_isolation on "inventaires"
  using  ("artisanId" = nullif(current_setting('app.tenant', true), '')::int)
  with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);