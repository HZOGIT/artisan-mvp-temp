# Audit — Injection HTML emails : le sweep est incomplet + fix à centraliser

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : tous les `sendEmail({ body })` du `routers.ts` interpolant un input
> utilisateur **non échappé**. Complète OPE-12 / OPE-36 / OPE-59.

---

## Constat : ~12 points d'interpolation non échappés ; les issues filées n'en couvrent qu'une partie.

`sendEmail` envoie `body` en **HTML brut**. Sweep des interpolations user non échappées :

| Ligne | Champ | Source | Couvert ? |
| -- | -- | -- | -- |
| 876 | `input.customMessage` | artisan | **OPE-12** |
| 1558 | `input.customMessage` | artisan | **OPE-12** |
| 1044 | `messageRelance` (relance devis) | artisan | rattaché OPE-12 (2026-06-11) |
| 2771 | `signataireName/Email` | signataire | **OPE-59** |
| 2829 | `motifRefus` | client | **OPE-59** |
| 3913 | `input.message` (demanderModification) | client | **OPE-59** |
| 4029 | `input.description` | client | **OPE-59** (à confirmer) |
| 7535 | `nom/email/message/telephone` (vitrine) | public | **OPE-36** |
| **1122** | `messageRelance` (relance facture) | artisan | ❌ **non couvert** |
| **7401** | `input.motif` (refus RDV → client) | artisan | ❌ **non couvert** |
| **4726** | `input.contenu` (chat sendMessage → client) | artisan | ❌ **non couvert** |
| **7613** | `input.email` (formulaire contact) | user | ❌ **non couvert** |

→ **≥ 4 points** échappent aux issues filées (1122, 7401, 4726, 7613). Le **sweep OPE-59
était incomplet**.

### Le problème de fond : fix per-endpoint error-prone

Échapper **point par point** (approche OPE-12/59) a **déjà laissé passer** plusieurs
endpoints. La **racine** : `sendEmail` accepte du HTML brut et chaque appelant doit penser
à échapper. → **fix à centraliser**.

---

## Reco (fix centralisé)

1. **Échapper à la source** : helper unique `safeHtml(userText)` (`escapeHtml` + `\n→<br>`)
   appliqué à **tout** champ user dans les bodies ; ou
2. Construire les bodies via un **template builder** qui échappe par défaut les
   interpolations (comme `baseTemplate` des emails abonnement qui, lui, `escapeHtml` déjà).
3. Auditer une fois la liste complète ci-dessus (12 points) plutôt que par découverte
   incrémentale.

---

## Distinction (anti-doublon)

- **OPE-12** (customMessage devis/facture), **OPE-36** (vitrine), **OPE-59** (4 points
  client/signataire) = même classe mais **périmètres partiels**. Les **4 points restants**
  (1122/7401/4726/7613) y sont **rattachés** (commentaire OPE-59) avec reco de **fix
  centralisé**. **Pas de nouvelle issue** (éviter une 4ᵉ issue de la même classe).

---

## Verdict

L'injection HTML emails est **systémique** (~12 points), **plus large** que les issues
filées : au moins **1122, 7401, 4726, 7613** ne sont couverts par aucune. Le fix
**per-endpoint** est insuffisant → **centraliser l'échappement**. Liste complète + reco
**rattachées à OPE-59**. **Pas de nouvelle issue Linear.**
