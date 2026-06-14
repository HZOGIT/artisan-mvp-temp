# Audit — Permissions : bypass plus LARGE qu'OPE-17 (stock, dépenses, fournisseurs, commandes) + catalogue incomplet

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH** (sur-accès collaborateur, modules financiers/opérationnels)
**Domaine audité** : gestion des rôles / permissions (comptes multi-utilisateurs). Rattaché à **OPE-17** (BLOCKER).

---

## Le système de permissions est sain… mais sa COUVERTURE est incomplète

`requirePermission` (`server/_core/trpc.ts:68`) + chargement DB des perms
(`auth-simple.ts:117-130`, défaut **moindre privilège** `technicien`) sont **corrects**. Le
problème est la **non-application** + un **catalogue incomplet**.

### 1. OPE-17 toujours LIVE (re-vérifié sur le code courant)

`clientsRouter` (`:280`), `contratsRouter` (`:4605`), `interventionsRouter` (`:2023`) :
`create`/`update`/`delete` utilisent **toujours `protectedProcedure`** (authentifié = autorisé),
**pas** les procédures `*GererProcedure`. → la situation décrite par OPE-17 n'a **pas** changé.

### 2. 🆕 Le bypass est PLUS LARGE que les 4 routers d'OPE-17

Mêmes `protectedProcedure` non gardés sur des modules **financiers/opérationnels** absents de
la liste OPE-17 :

| Router | create/update/delete | Permission de gestion |
| -- | -- | -- |
| `stocksRouter` (`:3072`) | `protectedProcedure` | **inexistante** (seul `articles.voir`) |
| `depensesRouter` (`:9028`) | `protectedProcedure` | **inexistante** |
| `fournisseursRouter` (`:3279`) | `protectedProcedure` | **inexistante** |
| `commandesFournisseursRouter` (`:3553`) | `protectedProcedure` | **inexistante** |

→ Un **`technicien`** (template : interventions/calendrier/chantiers) peut **créer/supprimer des
fournisseurs**, **muter le stock** (entrées/sorties/ajustements), et **créer/modifier/supprimer
des dépenses** (impact **financier** ; l'auto-approbation est en plus couverte par OPE-63).

### 3. 🆕 Le CATALOGUE de permissions est incomplet (prérequis du fix)

`shared/permissions.ts` ne définit **aucune** clé de **gestion** pour ces modules : il y a
`articles.voir` (lecture stock) mais **pas** `stock.gerer`, ni `depenses.voir`/`depenses.gerer`,
ni `fournisseurs.*`, ni `commandes.*`. Conséquence : **même après le fix OPE-17** (remplacer
`protectedProcedure` par une procédure guard), ces modules **resteraient non-restreignables**
faute de clé. Le fix doit donc **d'abord étendre le catalogue** (`PermissionCode` +
`PERMISSION_GROUPS` + templates de rôles), puis créer les `*Procedure` et les appliquer.

## Impact

Sur-accès collaborateur sur des données **financières** (dépenses) et **opérationnelles**
(stock, achats/fournisseurs). Même classe BLOCKER qu'OPE-17, périmètre élargi. N'affecte que les
**comptes multi-utilisateurs** (un artisan solo = `admin`, bypass total, sans impact).

## Fix proposé (extension d'OPE-17)

1. **Catalogue** : ajouter `stock.gerer`, `depenses.voir`/`depenses.gerer`,
   `fournisseurs.voir`/`fournisseurs.gerer`, `commandes.voir`/`commandes.gerer` à
   `PermissionCode`/`PERMISSION_GROUPS` + les distribuer dans les templates de rôles.
2. **Procédures** : `stockGererProcedure`, `depensesGererProcedure`, etc. (`trpc.ts`).
3. **Application** : remplacer `protectedProcedure` sur les routes CRUD de ces 4 routers (en plus
   des 4 d'OPE-17 + les 6 routes devis).

## Linear / anti-doublon

**Pas de nouvelle issue** — **enrichi sur OPE-17** (BLOCKER permissions) : confirmation « still
live » + extension du périmètre (stock/dépenses/fournisseurs/commandes) + prérequis catalogue.
Distinct d'OPE-63 (séparation des tâches **dépenses** : auto-approbation), qui reste un volet
spécifique.

---

## Verdict

Le bypass de permissions d'**OPE-17** est **toujours actif** et **plus large** que documenté :
4 routers supplémentaires (stock, dépenses, fournisseurs, commandes) sont non gardés **et**
non-gateables (catalogue sans clé). **HIGH**. Enrichi sur OPE-17.
