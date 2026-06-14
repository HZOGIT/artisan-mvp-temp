# Audit — Mass-assignment & mutations exemptées du paywall — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : (a) les deux mutations **whitelistées par `subscriptionGuard`**
> (`parametres.update`, `artisan.updateProfile`) — accessibles **même abonnement
> expiré** ; (b) sweep mass-assignment sur tous les inputs « ouverts »
> (`z.record`/`z.any`/`.passthrough`) du `routers.ts`.

---

## Conclusion : pas de mass-assignment exploitable nouveau. Pas de BLOCKER/HIGH.

### 1) Mutations exemptées du paywall — schémas Zod **fermés**, scope propre

- **`artisan.updateProfile`** (`:82-139`) : input `z.object({ siret, nomEntreprise,
  adresse, …, iban, logo, slug, metier })` — **liste blanche fermée**, **aucun** champ
  billing/abonnement (`plan`, `status`, `maxUsers`, `stripeCustomerId`) ni
  `id`/`artisanId`/`userId`. tRPC strippe les clés hors-schéma → `{...input}` ne peut pas
  smuggler une colonne sensible. Écrit via `updateArtisan(artisan.id, …)` (**scope
  propre**). Le plan/abonnement vit sur une **table séparée** (`getSubscription`), non
  touchée ici → **pas d'escalade d'abonnement** via cet endpoint pourtant payant-exempt.
- **`parametres.update`** (`:3004-3033`) : input fermé (préfixes, mentions, vitrine*,
  couleurs…), écrit sur `parametres_artisan` scope `artisan.id`. Bénin.

### 2) Sweep des inputs ouverts (`z.record`/`z.any`)

| Ligne | Input | Usage | Risque |
| -- | -- | -- | -- |
| `3258` | `variables: z.record(string,string)` | preview modèle email — **`.query()`** string-replace, **0 écriture DB** | ❌ aucun |
| `5672/5692/5721` | `filtres/parametres: z.record(unknown)` | filtres rapports — lus pour construire la requête (IDOR rapports **déjà filé**) | ❌ pas mass-assign |
| `2047` | `couleurs: z.record(string,string)` | couleurs calendrier (clé composite tenant — **déjà -ok**) | ❌ aucun |
| `7832/7890/7957` | `rows: z.array(z.record(any))` | imports — champs extraits 1-à-1 via `pickField` (**déjà -ok**) | ❌ aucun |
| `8556` | `createCategorie({...input, artisanId})` | input **fermé** + `artisanId` posé **en dernier** (écrase toute injection) | ❌ aucun |

### 3) Spreads `{...input}` revus

`106` (`artisan.updateProfile`) et `3027` (`parametres.update`) : couverts ci-dessus
(schémas fermés). `8556` : `artisanId` forcé après le spread.

---

## Le seul vrai mass-assignment = `depenses.update`, **déjà audité/filé**

`depensesRouter.update` (`:8466`) prend `data: z.record(z.any())` → `updateDepense(id,
artisan.id, data)`. Tenant-scopé, **mais** la whitelist de `updateDepense` inclut
`statut`/`rembourse`/`dateRemboursement` → **auto-remboursement hors workflow**. **Déjà
documenté** (`2026-06-09-depenses-update-mass-assignment.md`) et **rattaché à OPE-63**
(notes de frais — self-approbation), par un chemin distinct. → **Pas de doublon, pas de
nouvelle issue.**

---

## Verdict

Les mutations **exemptées du paywall** n'exposent **aucun** champ sensible
(billing/`artisanId`) — schémas fermés, scope propre → pas d'escalade. Les inputs
`z.record` ouverts sont **read-only** (preview/filtres) ou neutralisés (`artisanId` forcé).
Le seul mass-assignment réel (`depenses.update` → champs d'état) est **déjà filé**
(OPE-63 étendu). **Pas de nouvelle issue Linear.**
