# Audit — Vitrine publique : `getBySlug` + `submitContact` + persistance des leads (OPE-172) — ✅ OK (réserves LOW)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Domaine** : Vitrine publique / endpoints non authentifiés
**Verdict** : surface publique **saine** pour le lancement — exposition **intentionnelle et opt-in**, contact **borné + rate-limité + échappé**, leads **scopés tenant**. **Aucun BLOCKER/HIGH → pas d'issue Linear.** 3 réserves LOW notées.

---

## Périmètre

`vitrineRouter` (`server/routers.ts:8276+`) : `getBySlug` (`:8277`, public), `submitContact` (`:8322`, public), et la persistance des leads **OPE-172** (`createDemandeContact` + `getDemandesContact`/`updateDemandeContactStatut`/`convertirDemandeEnClient`). ↔ « page entreprise » publique (type Google Business). Ré-évalue/complète `2026-06-08-vitrine-publique-getbyslug-ok.md` + `2026-06-06-vitrine-publique-submitcontact.md` (ajout du volet leads OPE-172).

## ✅ `getBySlug` (public) — exposition intentionnelle, opt-in

- **Gate opt-in** : `parametres.vitrineActive` requis (`:8284`) → si l'artisan n'a pas activé sa vitrine, NOT_FOUND. Rien n'est exposé sans action explicite de l'artisan.
- **Champs renvoyés** (`:8306-8311`) : `nomEntreprise, specialite, telephone, email, ville, codePostal, adresse, siret, logo` → ce sont les **informations professionnelles publiques** que l'artisan choisit d'afficher (carte de visite en ligne). Le **SIRET** est d'ailleurs une **mention légale obligatoire** sur un site pro. Pas de fuite de données internes (pas de `userId`, `iban`, `stripe*`, métriques privées).
- **Avis** : `getPublishedAvisByArtisanId` (modérés/publiés uniquement) → mappés sur un sous-ensemble safe (`note, commentaire, reponseArtisan, clientNom`). Pas d'email/téléphone client exposé.
- Pas d'IDOR : tout est résolu par **slug public** → `artisan.id` dérivé, jamais un id d'input.

## ✅ `submitContact` (public) — anti-abus correct

- **Bornes d'input** alignées (`:8323-8328`) : slug≤200, nom≤200, email (format + ≤320), telephone≤30, message 10..5000. Pas d'entrée non bornée.
- **Tenant dérivé du slug** (`getArtisanBySlug`, `:8331`) → un appelant public ne peut pas injecter un `artisanId` arbitraire ; il ne peut contacter qu'un artisan **par sa page publique**.
- **Rate-limit** `checkPublicContactRate` (5 msg / 15 min / IP, `:8342`) via **`cf-connecting-ip`** (non spoofable derrière Cloudflare, cohérent OPE-80) → borne l'inondation de la boîte artisan + les coûts Resend.
- **Anti-injection HTML** : `safeHtml(...)` sur nom/email/téléphone/message dans le corps de l'email (`:8351-8355`).
- **Persistance lead (OPE-172)** : `createDemandeContact({ artisanId: artisan.id, … })` en **best-effort** (try/catch, n'altère pas l'envoi) — `artisanId` **dérivé** (pas d'input), `source='vitrine'`.

## ✅ Gestion des leads (protégée)

`getDemandesContact` / `updateDemandeContactStatut` / `convertirDemandeEnClient` sont en **`protectedProcedure`** et scopés `artisan.id` (`getDemandeContactById(id, artisan.id)` → pas d'IDOR cross-tenant sur les leads).

## 🟢 Réserves LOW (non bloquantes 30 juin — pas d'issue)

1. ~~**`submitContact` ne vérifie pas `vitrineActive`** (contrairement à `getBySlug`)~~ → **✅ CORRIGÉ (commit 9e87126)** : `submitContact` exige désormais `parametres.vitrineActive` (NOT_FOUND sinon), comme `getBySlug`. Plus de formulaire de contact actif pour une vitrine désactivée.
2. **`getBySlug` expose l'`adresse` complète** (rue) : voulu pour un local commercial, mais un artisan à domicile publie de fait son adresse perso. C'est **son choix** (opt-in) ; on pourrait n'exposer que ville/CP par défaut et rendre la rue optionnelle.
3. **N+1 sur les avis** (`Promise.all` + `getClientById` par avis, `:8287-8294`) sur un endpoint public non rate-limité : borné en pratique (avis publiés = faible volume réel), mais une jointure unique serait plus robuste à l'échelle.

## Conclusion

La surface vitrine publique (affichage + contact + leads OPE-172) est **sûre pour le lancement** : exposition opt-in et conforme (carte pro + SIRET), contact borné/rate-limité/échappé, leads scopés tenant et best-effort. **Aucun BLOCKER ni HIGH** → **pas d'issue Linear**. Les 3 points LOW sont des durcissements optionnels.
