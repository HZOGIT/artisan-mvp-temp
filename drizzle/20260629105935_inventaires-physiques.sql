/* Migration additive : inventaire physique stock (OPE-129)
   Tables inventaires (campagne de comptage) + inventaires_lignes (article par article).
   RLS tenant sur inventaires (artisanId direct). inventaires_lignes scopée via parent.
   Entièrement idempotente (if not exists, DO blocks pour enum et FK). */

do $$ begin
  if not exists (select 1 from pg_type where typname = 'inventaire_statut') then
    create type inventaire_statut as enum ('brouillon', 'valide');
  end if;
end $$;

create table if not exists "inventaires" (
  "id"          serial primary key,
  "artisanId"   integer not null,
  "date"        date not null default current_date,
  "statut"      inventaire_statut not null default 'brouillon',
  "note"        text,
  "valeurEcart" numeric(12, 2),
  "createdAt"   timestamp not null default now(),
  "updatedAt"   timestamp not null default now()
);

create index if not exists "inventaires_artisan_idx" on "inventaires" ("artisanId");
create index if not exists "inventaires_statut_idx"  on "inventaires" ("artisanId", "statut");

create table if not exists "inventaires_lignes" (
  "id"                serial primary key,
  "inventaireId"      integer not null,
  "stockId"           integer not null,
  "reference"         varchar(50) not null,
  "designation"       varchar(500) not null,
  "unite"             varchar(20) not null default 'unité',
  "quantiteTheorique" numeric(10, 2) not null,
  "quantiteReelle"    numeric(10, 2),
  "ecart"             numeric(10, 2)
);

create index if not exists "inventaires_lignes_inventaire_idx" on "inventaires_lignes" ("inventaireId");
create index if not exists "inventaires_lignes_stock_idx"      on "inventaires_lignes" ("stockId");

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventaires_lignes_inventaire_fk') then
    alter table "inventaires_lignes"
      add constraint "inventaires_lignes_inventaire_fk"
      foreign key ("inventaireId") references "inventaires"("id") on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventaires_lignes_stock_fk') then
    alter table "inventaires_lignes"
      add constraint "inventaires_lignes_stock_fk"
      foreign key ("stockId") references "stocks"("id") on delete restrict;
  end if;
end $$;

alter table "inventaires" enable row level security;
alter table "inventaires" force row level security;
drop policy if exists tenant_isolation on "inventaires";
create policy tenant_isolation on "inventaires"
  using  ("artisanId" = nullif(current_setting('app.tenant', true), '')::int)
  with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);
