# Audit — fix-duplicates : DELETE des conversations/messages de l'artisan id=1 à chaque boot (→ OPE-49)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Complète **OPE-49** (🔴 BLOCKER, seeding démo hardcodé sur id=1). Nouvelle
> instance **non listée** et **pire** : une **suppression de données** (pas un
> simple overwrite de flags).

---

## Constat — perte de données : la messagerie de l'artisan #1 effacée à chaque démarrage

```typescript
// fix-duplicates.ts:341-353 — INCONDITIONNEL, à chaque boot
SELECT id, ... FROM conversations WHERE artisanId = 1
// "Delete ALL existing conversations for artisan 1 and re-insert cleanly"
const idsToDelete = allConvs.map(c => c.id);
for (const id of idsToDelete) {
  await pool.execute(`DELETE FROM messages WHERE conversationId = ?`, [id]);
  await pool.execute(`DELETE FROM conversations WHERE id = ?`, [id]);
}
// ... ré-insertion de conversations DÉMO
```

- S'exécute **à chaque démarrage**, **sans garde** `NODE_ENV`, **hardcodé** sur
  `artisanId = 1`.
- En **prod**, `id=1` = **le premier artisan réel** (exactement le point d'OPE-49).
- Contrairement aux blocs déjà listés dans OPE-49 (qui **écrasent** des flags :
  plan/onboarding/notifications/vitrine), celui-ci **SUPPRIME** : **toutes les
  conversations et tous les messages** du 1er artisan réel → **perte définitive de
  l'historique de messagerie avec ses clients à chaque déploiement/restart**, puis
  ré-insertion de **conversations démo** à la place.

### Impact

**Perte de données client réelles** (messagerie artisan↔client) à chaque boot —
plus grave que les overwrites déjà décrits. Aggrave le BLOCKER OPE-49.

### Fix

Même que OPE-49 : **garde `NODE_ENV !== 'production'`** (ou retrait du démarrage
prod) sur **tout** le bloc démo, et **jamais** de `WHERE artisanId = 1` / DELETE
hardcodé. Identifier un éventuel compte démo par un critère stable (email
`dev@operioz.com`), pas par `id`.

---

→ **OPE-49 étendu par commentaire** (instance data-loss à ajouter à la liste des
blocs id=1). Pas de nouvelle issue.
