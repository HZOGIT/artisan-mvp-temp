# Audit — Modèles d'emails (CRUD) : isolation tenant / IDOR — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `modelesEmailRouter` (`routers.ts:3154-3262`) — `list`, `listByType`,
> `getById`, `listTransactionnels`, `getDefault`, `create`, `update`, `delete`,
> `preview`.

---

## Conclusion : CRUD entièrement cloisonné tenant. Pas de BLOCKER/HIGH.

La feature « modèles personnalisés » est **morte** (jamais appliquée aux envois réels —
**déjà filé OPE-51**), mais ses endpoints CRUD existent et sont appelables → vérification
de l'**IDOR** (lire/modifier/supprimer le modèle d'un autre artisan).

### Ownership vérifié sur **chaque** opération basée sur un `id`

| Procédure | Garde | Réf |
| -- | -- | -- |
| `getById` | `modele.artisanId !== artisan.id → FORBIDDEN` | `:3176` |
| `update` | charge le modèle → même check | `:3233` |
| `delete` | charge le modèle → même check | `:3247` |
| `create` | `artisanId: artisan.id` (forcé) | `:3211` |
| `list` / `listByType` / `listTransactionnels` / `getDefault` | scoped via `getArtisanByUserId(ctx.user.id)` | `:3155…` |
| `preview` | pur `String.replace` des `{{variables}}`, **aucune DB** | `:3255` |

→ Un `id` de modèle étranger est rejeté **avant** lecture/écriture. Pas d'IDOR, pas de
fuite ni d'altération cross-tenant.

---

## Écart connu = déjà filé

- **Feature morte** : les modèles ne sont **jamais consommés** par les envois (tous les
  emails utilisent le gabarit codé en dur) → **OPE-51**. C'est un problème de **complétude**,
  pas de **sécurité** ; orthogonal à cet audit CRUD. Pas de doublon.

---

## Verdict

Le CRUD des modèles d'emails est **systématiquement scopé** (`modele.artisanId ===
artisan.id` sur get/update/delete, `artisanId` forcé sur create, `preview` sans DB). Pas
d'IDOR. La nature « feature morte » est **déjà filée** (OPE-51). **Pas de nouvelle issue
Linear.**
