# Fix (MODE A) — Bornes `.max()` manquantes : `chat.sendMessage` (artisan) et `avis.repondre`

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (validation/robustesse)

> Classe « bornes de longueur » (OPE-24). Deux entrées `protectedProcedure` écrivant dans des
> colonnes `text` sans `.max()`.

---

## Constat : asymétrie de bornage

- `chat.sendMessage` (`server/routers.ts:5121`) : `contenu: z.string().min(1)` **sans max**, écrit
  dans `messages.contenu` (**text**). Or son jumeau **portail** `sendClientMessage`
  (`:4478`) est déjà borné `.max(5000)` sur **la même colonne**. → asymétrie : le client est
  borné, l'artisan ne l'est pas.
- `avis.repondre` (`:5561`) : `reponse: z.string().min(1)` **sans max**, écrit dans
  `avis.reponseArtisan` (**text**).

→ une entrée > 65 535 octets (appel API hors UI) provoque **ER_DATA_TOO_LONG (500)** en mode
strict au lieu d'un 400 de validation.

## Fix appliqué

`contenu.max(5000)` (aligné sur le jumeau portail) et `reponse.max(5000)`.

- **Behavior-preserving** : un message de chat / une réponse d'avis légitime est court → inchangé.
  Seules les entrées aberrantes sont rejetées proprement en 400. Blast radius : 2 inputs.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging à vérifier.

## Linear / anti-doublon

Classe « bornes de longueur » → **rattachée à OPE-24**. **Pas de nouvelle issue** ; documenté ici.
