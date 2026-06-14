# Audit — Avis clients / notation (flux public token + vitrine) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `avisRouter` (`routers.ts:4974-5240`) — `demanderAvis`, `repondre`,
> `moderer`, `submitAvis` (public), `getDemandeInfo` (public) — affichage vitrine
> (`vitrine.getBySlug` `:7473-7483`), schéma `avis_clients`/`demandes_avis`
> (`schema.ts:753-785`), fns DB `getPublishedAvis*` (`db.ts:1711-1730`).

---

## Conclusion : flux sain. Pas de BLOCKER/HIGH.

### Sécurité du flux public

- **`submitAvis`** (`:5165`, public) est **token-gated** (`getDemandeAvisByToken`),
  **usage unique** (refuse `statut==='completee'`, `:5177`), **expiration** 14 j
  (`:5181`), **note bornée** `z.number().min(1).max(5)` (`:5168`). Un tiers sans token
  ne peut pas soumettre ; le client ne peut pas voter deux fois.
- **`getDemandeInfo`** (`:5217`, public) ne renvoie que le strict nécessaire
  (`artisan.nomEntreprise`, `client.nom`, titre intervention) au **détenteur du token**
  (le client lui-même).

### Pas d'IDOR côté artisan

`repondre` (`:5122`) et `moderer` (`:5145`) vérifient tous deux
`avis.artisanId === artisan.id` avant écriture (`:5134`/`:5157`) → un artisan ne peut
pas répondre/masquer l'avis d'un autre tenant.

### Affichage public correctement filtré

- `getPublishedAvisByArtisanId` **et** `getPublishedAvisStats` (`db.ts:1711/1718`)
  filtrent `statut = 'publie'` **et** scopent `artisanId` → les avis `masque` /
  `en_attente` ne fuient **jamais** sur la vitrine, et la **moyenne** ne compte que le
  publié.
- Le `commentaire` (texte libre client) est rendu en **nœud texte React**
  (`{a.commentaire}`, `Vitrine.tsx:517`) → échappement automatique → **pas de XSS**
  (aucun `dangerouslySetInnerHTML` sur ce chemin).

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **`commentaire` sans longueur max** (`z.string().optional()`, `:5169`) — un client
   pourrait soumettre un commentaire très volumineux (stocké + affiché). Abus
   stockage/affichage marginal. Reco : `.max(2000)`.
2. **Publication automatique** : `submitAvis` crée l'avis en `statut:'publie'`
   directement (`:5193`) — **pas de modération a priori**. L'enum prévoit pourtant
   `en_attente` (défaut schéma). Modèle **post-modération** : un avis négatif est
   public immédiatement, l'artisan ne peut que le **masquer** ensuite (`moderer`).
   Choix produit acceptable (authenticité des avis) mais à confirmer côté produit
   (certains préféreront une validation avant publication, surtout pour le légal/
   diffamation). Documenté, **pas un blocker**.
3. **Lien d'avis bâti depuis `headers.origin`** (`:5046/:5102`) — même pattern que
   OPE-76, mais déclenché par un artisan **authentifié** (origin = son navigateur,
   non attaquant-contrôlé) et impact faible (lien d'avis) → déjà noté en réserve de
   robustesse dans **OPE-76**, pas de re-filing.

---

## Anti-doublon

Aucune issue existante sur le module avis. Les seuls problèmes trouvés sont mineurs
(longueur de commentaire, modèle de modération) → **pas d'issue Linear**.

---

## Verdict

Avis clients : flux public **token-gated, usage unique, note bornée**, endpoints
artisan **ownership-checked**, affichage vitrine **filtré `publie` + scopé tenant**,
commentaire **échappé par React** (pas de XSS). Réserves mineures : cap de longueur du
commentaire + publication auto (post-modération) — non bloquantes. **Pas d'issue Linear.**
