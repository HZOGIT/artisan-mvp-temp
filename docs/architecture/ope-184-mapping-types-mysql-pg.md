# OPE-184 / P0.1 — Mapping des types MySQL → PostgreSQL (18)

> Deliverable du spike OPE-187. Établi par inspection de `drizzle/schema.ts` (84 tables) le 2026-06-13.
> Cible : convertir le schéma Drizzle `mysqlTable` → `pgTable` (PostgreSQL 18) sans changer les types exposés aux conscommateurs.

## Inventaire réel des types de colonnes

| Type Drizzle (mysql) | Occurrences | Type cible (pg) | Notes / pièges |
|---|---|---|---|
| `int` | 313 | `integer` | Voir autoincrement ci-dessous pour les PK |
| `int().autoincrement()` (PK) | 88 | `integer().generatedAlwaysAsIdentity()` (ou `serial`) | **Recaler les séquences** sur `max(id)` après copie des données (P0.8) |
| `bigint` | 1 | `bigint` | RAS |
| `varchar(n)` | 202 | `varchar(n)` | Identique |
| `text` | 93 | `text` | Identique |
| `mediumtext` | 1 | `text` | PG `text` est illimité → pas de distinction medium/long |
| `timestamp` | 174 | `timestamp` (→ envisager `timestamptz`) | Voir defaults & `onUpdateNow` ci-dessous |
| `date` | 25 | `date` | Identique |
| `decimal(p,s)` | 110 | `numeric(p,s)` | **Montants** : mysql2 ET node-postgres renvoient `string` → pas de régression d'arrondi |
| `boolean` | 45 | `boolean` | MySQL stocke en `tinyint(1)` ; côté Drizzle c'est déjà `boolean` → mapping direct |
| `mysqlEnum(...)` | 71 | `pgEnum(...)` | **Le plus gros chantier** : chaque enum se déclare comme un type PG à part, puis référencé par la colonne |
| `json` | 8 | `jsonb` | Upgrade (indexable, opérateurs) |

## Modificateurs

| Modificateur | Occurrences | Conversion |
|---|---|---|
| `.notNull()` | 399 | identique |
| `.default(...)` | 232 | identique (vérifier les littéraux date/bool) |
| `.defaultNow()` | 132 | `default now()` — identique |
| `.onUpdateNow()` | **32** | ⚠️ **Aucun équivalent natif PG.** Deux options (voir ci-dessous) |
| `.primaryKey()` | 89 | identique |
| `.references(...)` | **1** | ⚠️ FK quasi inexistantes au niveau schéma (voir ci-dessous) |

## Les 3 pièges réels (le reste est mécanique)

### 1. `onUpdateNow()` — 32 colonnes `updatedAt`
MySQL : `ON UPDATE CURRENT_TIMESTAMP`. Postgres ne l'a pas nativement. Options :
- **(Recommandé en cible)** gérer `updatedAt = new Date()` dans la **couche repository** (un seul endroit, explicite, testable). C'est l'approche clean archi.
- **(Pendant la coexistence)** pour l'ancien stack qui écrit encore, ajouter un **trigger PG** `BEFORE UPDATE` générique. À retirer à l'extinction de l'ancien serveur.

### 2. Les FK sont **applicatives**, pas en base (1 seule `references()`)
Conséquence double :
- **Bon** : pas de conversion de contraintes FK, pas d'ordre d'insertion imposé par la base lors de la copie (P0.8) — quoiqu'on le respectera quand même par prudence.
- **Mauvais (déjà connu)** : l'intégrité référentielle et le cloisonnement ne tiennent qu'au **code**. → C'est exactement pourquoi **RLS** (P0.12) + le **scoping repository** sont structurants. À envisager : profiter de la migration pour **ajouter les vraies FK** sur les relations critiques (devis↔lignes, factures↔lignes…) — à décider hors périmètre P0.1.

### 3. Les 71 `mysqlEnum` → `pgEnum`
Mécanique mais volumineux. Chaque enum :
```ts
// mysql
statut: mysqlEnum('statut', ['brouillon','envoye','signe'])
// pg
export const statutDevis = pgEnum('statut_devis', ['brouillon','envoye','signe']);
// ... colonne :
statut: statutDevis('statut')
```
Décision : `pgEnum` (type-safety) plutôt que `text`+`CHECK`. Réparti sur les 3 batchs de conversion (P0.3/4/5).

## Fonctions SQL MySQL → PG (rappel, pour P0.7)
`CURDATE()`→`CURRENT_DATE` · `DATE_FORMAT`→`to_char` · `DATE_ADD/SUB`→`+/- interval` · `IFNULL`→`COALESCE` · `NOW()`/`CONCAT()` inchangés · `ON DUPLICATE KEY`→`onConflictDoUpdate` (16 occurrences).

## Verdict
Conversion **mécanique à ~95 %** (int/varchar/text/decimal/date/json/boolean). Effort concentré sur : **71 enums** (volume) + **32 `onUpdateNow`** (comportement) + **16 `onConflict`** (P0.7). Aucune contrainte FK à convertir. **Pas de blocage** identifié.
