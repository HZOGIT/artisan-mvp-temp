# Phase C2 — Inventaire go/no-go de la surface legacy encore atteinte

> ✅ **EXTINCTION RÉALISÉE (mise à jour 2026-06-15) — ce document est HISTORIQUE.** Le verdict
> « NO-GO immédiat » ci-dessous correspondait à l'état de la phase C2 ; depuis, les **9 blockers ont
> été portés**, `server/` (legacy Express) a été **supprimé**, `mysql2`/MySQL retirés, le dispatcher
> edge est **mono-stack** et le **stack est unique : Fastify + tRPC 11 + Drizzle pg + RLS** (plus de
> backend legacy). Source de vérité courante : `refonte-clean-archi-journal.md` (phases C5a→C5c). Le
> contenu ci-dessous est conservé comme trace de l'analyse go/no-go ayant fondé l'extinction.

> Établi pour décider de la **suppression de `server/`** (extinction du legacy, fil OPE-240).
> Méthode : diff **routeur tRPC legacy** (`server/routers.ts`) + **routes REST legacy**
> (`server/_core/index.ts`) vs **surface new-stack** (`MIGRATED` / `DEFAULT_ENABLED` du dispatcher
> + `MIGRATED_ROUTES`), croisé avec l'**usage réel côté client** (`grep trpc.<domaine>` et fetch REST).
> Régénérable : voir les commandes en bas.

## Verdict

**NO-GO immédiat** sur la suppression de `server/`. Le legacy sert encore **9 domaines tRPC
réellement appelés par le client** + **1 route REST de télémétrie**. Tout le reste est soit
déjà new-stack, soit mort (droppable avec `server/`).

---

## 1. Surface REST HORS-tRPC

25 routes REST legacy recensées (`server/_core/index.ts`). **23 déjà servies par le new-stack**
(présentes dans `MIGRATED_ROUTES`, parité verrouillée par `edge-dispatch.test`).

### Restantes (NON migrées)

| Route | Verbe | Usage client | Statut | Décision |
|---|---|---|---|---|
| `/api/articles/categories` | GET | **0** | mort (catégories de la bibliothèque, plus appelé) | droppable avec `server/` |
| `/api/voice/debug` | POST | 2 (`ErrorBoundary`, `voiceDebug.ts`) | télémétrie d'erreur fire-and-forget (`sendBeacon`) | **C3** : porter une route Fastify minimale OU retirer le client |

> `/api/trpc`, `/assets`, fallback SPA `/` : infrastructure (montage tRPC + statique), pas des
> handlers métier — gérés par le dispatcher/edge, hors périmètre « route à porter ».

---

## 2. Domaines tRPC

- **Legacy** (`server/routers.ts`) : **51** domaines top-level.
- **New-stack** (`MIGRATED`) : **49** domaines. **`DEFAULT_ENABLED` : 41** servis par défaut en staging.

### 2a. Migrés mais flag OFF (`MIGRATED` \ `DEFAULT_ENABLED`) — **NON bloquant**

`budgetsCategories`, `categoriesDepenses`, `configRelances`, `demandesContact`, `ecritures`,
`modelesDevis`, `notesDeFrais`, `reglesCategorisation` (8).

→ Ce sont des **domaines internes new-stack** (sous-ressources découpées : écritures/notes de frais
sous compta, modèles de devis, règles/budgets de catégorisation…). **Usage client top-level = 0**
pour chacun (le client les atteint via `comptabilite.*`, `depenses.*`, `parametres.*`…). Les laisser
OFF est sans effet sur le trafic. _Option cosmétique : les activer pour aligner `DEFAULT_ENABLED`
sur `MIGRATED`, mais non requis pour l'extinction._

### 2b. Legacy-only RÉELLEMENT appelés par le client — **BLOQUANTS** (à porter en C3+)

| Domaine tRPC | Appels client | Nature | Sensibilité |
|---|---|---|---|
| `clientPortal` | 20 | espace client (portail) — lecture/échanges devis/factures côté client | tokens publics |
| `integrationsComptables` | 15 | intégrations/exports comptables externes | compta |
| `devisIA` | 13 | génération de devis assistée IA | LLM |
| `vitrine` | 5 | site vitrine public de l'artisan | public |
| `alertesPrevisions` | 4 | alertes du prévisionnel de trésorerie | — |
| `interventionsMobile` | 3 | app mobile technicien (signature/heures terrain) | terrain |
| `importErp` | 3 | import de données depuis un ERP | import |
| `devices` | 3 | appareils/sessions (push, device tokens) | sessions |
| `support` | 1 | tickets/support | — |

→ **9 domaines** non portés et appelés : tant qu'ils ne sont pas dans `MIGRATED`, le dispatcher les
aiguille en legacy. **Ils interdisent la suppression de `server/`.** Aucun n'est sur le chemin
financier critique (FEC/TVA) sauf `integrationsComptables` (exports — à porter avec soin, parité compta).

### 2c. Legacy-only NON appelés par le client — morts (droppables avec `server/`)

| Domaine tRPC | Appels client | Note |
|---|---|---|
| `portail` | 0 | superseded par `clientPortal` (tRPC) + routes REST publiques portail déjà migrées |
| `notificationsPush` | 0 | push non câblé côté client (service worker/REST si réactivé) |
| `ai` | 0 réel | uniquement dans un **commentaire de démo** (`AIChatBox`, `ComponentShowcase`) — pas un vrai domaine |

---

## 3. Plan de bascule restant (C3 → C5)

1. **C3** — porter les blockers par valeur/risque croissant : `support`, `devices`, `alertesPrevisions`,
   `importErp`, `interventionsMobile`, `vitrine` (public), `clientPortal` (tokens publics),
   `integrationsComptables` (compta), `devisIA` (LLM, en dernier avec l'IA). + route `voice/debug`
   (ou retrait client). Recette 9 étapes du journal ; flag ON + smoke à chaque domaine name-matché.
2. **C4** — quand `comm -23 legacy MIGRATED` = ∅ pour les domaines appelés ET `MIGRATED_ROUTES`
   couvre toutes les routes REST vivantes : **dispatcher mono-stack** (tout en new-stack, plus de
   décision legacy) ; retirer les domaines morts.
3. **C5** — supprimer `server/` (`routers.ts`, `db.ts`/`db-secure.ts`, `_core/*` hors assets repris),
   retirer `mysql2`, MAJ docs. Servir les polices/statique entièrement par le new-stack (fait : C1).

---

## Régénération

```bash
# domaines tRPC legacy
grep -oE "^\s*[a-zA-Z]+:\s*(router\(|[a-zA-Z]+Router)" server/routers.ts | sed -E 's/^\s*([a-zA-Z]+):.*/\1/' | sort -u
# MIGRATED / DEFAULT_ENABLED du dispatcher
node -e "import('./functions/_lib/dispatch.mjs').then(m=>{console.log('MIGRATED',m.MIGRATED.length);console.log('ENABLED',m.DEFAULT_ENABLED.length)})"
# usage client d'un domaine
grep -rhoE "trpc\.<domaine>\b" client/src | wc -l
# routes REST legacy
grep -oE "app\.(get|post|put|delete|patch)\(['\"][^'\"]+" server/_core/index.ts | sort -u
```
