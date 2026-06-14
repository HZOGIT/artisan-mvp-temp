# Audit — Interventions mobile (terrain technicien) — OK (signature rattachée à OPE-55)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `interventionsMobileRouter` (`routers.ts:4515-4668`) — `getTodayInterventions`,
> `startIntervention`, `endIntervention`, `addPhoto`, `getPhotos`. Schéma
> `interventions_mobile` (`schema.ts:636-653`).

---

## Conclusion : module sain (pas d'IDOR). Pas de BLOCKER/HIGH nouveau.

### Multi-tenant correct (aucun IDOR)

Tous les endpoints prenant un `interventionId` chargent `getInterventionById` puis
vérifient `intervention.artisanId === artisan.id` (FORBIDDEN sinon) :
`startIntervention` (`:4553`), `endIntervention` (`:4594`), `addPhoto` (`:4629`),
`getPhotos` (`:4659`). `getTodayInterventions` scope `artisan.id`. → cohérent avec le
constat systémique d'OPE-47, ce module est **du bon côté** (pas de route `async ({
input })` sans `ctx`).

---

## Point rattaché à **OPE-55** (pas de doublon)

`endIntervention` (`:4582`) capture une **signature client de réception des travaux**
(`interventions_mobile.signatureClient` + `signatureDate`) — un **bon d'intervention
signé**. C'est une **2ᵉ surface de signature**, **strictement plus faible** que celle
des devis visée par OPE-55 : aucune identité signataire, aucun IP/userAgent, aucun hash
du rapport (`notesIntervention`/photos), et capture directe sur le terminal du
**technicien** (aucune vérification indépendante que c'est le client).

→ Même classe « valeur probante faible » qu'OPE-55, artefact distinct non mentionné →
**OPE-55 étendu par commentaire** (appliquer le même socle : `signataireName` +
métadonnées + hash SHA-256 du rapport + consentement horodaté). Pas de nouvelle issue.

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **`signatureClient: z.string().optional()`** (`:4586`) non validé comme image
   (accepte n'importe quelle chaîne). Marginal.
2. **Transitions de statut non gardées** : `startIntervention` force `en_cours` et
   `endIntervention` force `terminee` **sans vérifier le statut courant** → on peut
   « terminer » une intervention jamais démarrée / déjà terminée. Robustesse de la
   machine à états, pas un blocker.
3. Les photos (`url`) stockées en string/data-URI, ownership-checked → cohérent avec
   l'audit upload/médias (`2026-06-09-upload-fichiers-medias-ok.md`).

---

## Verdict

Interventions mobile : **multi-tenant correct** (tous les endpoints vérifient
`intervention.artisanId === artisan.id`). Unique point : la **signature client de fin
d'intervention** est encore plus faible que celle des devis (ni identité, ni hash, ni
métadonnée) → **même classe qu'OPE-55**, rattachée par commentaire. Réserves mineures
(validation image, garde de statut). **Pas de nouvelle issue Linear.**
