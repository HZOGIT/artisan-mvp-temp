# Audit — Imports massifs + mass-assignment des mutations `update` : sécurisés. Aucun BLOCKER.

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin
**Domaine audité** : endpoints d'import en masse + risque de mass-assignment sur les `update`.

---

## Conclusion : surface **bien sécurisée**. Aucune issue. (Résiduel financier = OPE-63, déjà filé.)

### ✅ Imports en masse — bornés + scopés tenant (anti-DoS / anti-cross-tenant)

| Endpoint | Borne | Tenant |
| -- | -- | -- |
| `importClients` (`server/routers.ts:8318`) | `rows.max(5000)` | `getArtisanByUserId` |
| `importDevis` (`:8376`) | `rows.max(5000)` | idem |
| `importFactures` (`:8443`) | `rows.max(5000)` | idem |
| `importFromExcel` (`:334`) | `.max(5000)` + champs bornés (`nom.max(200)`…) | `getOrCreateArtisan` |
| `importReleve` (`:9228`) | `contenuCsv.max(5 Mo)` + cap 5000 lignes | `getArtisanByUserId` |

→ Pas d'array non bornée (la classe DoS mémoire d'OPE-24 est couverte au-delà du seul `importFromExcel`). Le body global est par ailleurs capé (OPE-24).

### ✅ `factures.update` — verrou fiscal + machine à états (très robuste)

`facturesCreerProcedure` (`routers.ts:1443`) : schéma Zod **explicite** (pas de `numero`/`artisanId`/`totalTTC`), tenant via `getFactureByIdSecure(id, artisan.id)`, **verrou** (aucune modif de contenu si `statut != brouillon` → « émettez un avoir »), et **transitions de statut** restreintes (`brouillon→envoyee→payee/en_retard→payee`). `updateData` construit **champ par champ** (pas de spread brut).

### ✅ Mass-assignment — neutralisé par allowlist ou schéma explicite

- **Entrée permissive** `depenses.update` (`:8957`, `data: z.record(z.any())`) → `updateDepense` (`db.ts:6210`) n'applique **que** les clés présentes dans **`DEPENSE_FIELD_MAP`** (allowlist) et force `WHERE id = ? AND artisan_id = ?`. `artisanId`/`userId` **absents** de la map → **non modifiables** ; pas de cross-tenant.
- **Spread brut `{...data}`** côté DB (`updateTechnicien` `db.ts:1923`, `updateContrat` `:3090`, `updateConversation` `:3196`) → borné par le **schéma Zod explicite du routeur** (ex. techniciens `:5094` = nom/prenom/email/telephone/specialite/couleur/statut/notes, **sans** `artisanId`) + vérif d'appartenance `technicien.artisanId === artisan.id`. Donc le spread ne peut écrire que des champs autorisés.
- `z.record` restants = stockage JSON de config (couleurs calendrier, filtres/paramètres de rapports) — pas du mass-assignment de colonnes.

### Résiduel (déjà filé, non bloquant ici)

- Via `depenses.update`, un collaborateur peut positionner `remboursable`/`rembourse`/`statut` sur **sa propre** dépense → **séparation des tâches** = **OPE-63** (déjà filé, classe financière, hors « safe auto-fix »). L'allowlist empêche le pire (cross-tenant / colonnes arbitraires) ; il reste le contrôle métier d'OPE-63.

---

## Verdict

Les **imports massifs** sont bornés et tenant-scopés ; les **`update`** sont protégés soit par
un **schéma Zod explicite**, soit par une **allowlist DB** (`DEPENSE_FIELD_MAP`) + `WHERE
artisan_id`. La facture ajoute **verrou fiscal + machine à états**. **Aucun BLOCKER/HIGH** sur
cette surface. Le seul résiduel (auto-approbation de note de frais) est **OPE-63**. Pas de
nouvelle issue. Stripe Connect (OPE-6) non ré-audité.
