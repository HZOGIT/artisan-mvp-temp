# Audit TVA — Modules A (Compatibles) — Clôture

**Date** : 2026-06-29  
**Statut** : ✅ Clos  
**Contexte** : Suite à l'audit automatique (cron 10 min) catégorisant tous les usages de `tauxTVA` dans la codebase, ce rapport consolide les modules **compatibles (A)** — ceux qui lisent `tauxTVA` comme valeur numérique depuis la base de données sans nécessiter de modification.

---

## Modules A — Compatibles (pas de modif requise)

| Module | Fichier | Raison de compatibilité |
|--------|---------|--------------------------|
| **Écritures** | `apps/api/modules/ecritures/generation-use-cases.ts`<br/>`apps/api/modules/comptabilite/facture-reader-drizzle.ts` | Lit `tauxTVA` comme numeric depuis DB pour ventilation comptable et génération du FEC — comportement correct, aucune modif |
| **Comptabilité / FEC** | `apps/api/modules/comptabilite/fec.ts`<br/>`apps/api/modules/comptabilite/comptabilite-reader-drizzle.ts` | Lit `tauxTVA` et dérive le compte 4457x selon régime — compatible car colonne toujours remplie et numeric |
| **Signature (Portail)** | `apps/web/src/modules/signature/signature-public-reader.ts`<br/>`apps/web/src/modules/signature/signature.ts` | Affichage et calcul PDF portail — lit `tauxTVA` comme numeric, comportement correct |
| **Client Portal** | `apps/web/src/modules/client-portal/portal-docs-reader.ts` | Lecture seule pour affichage des documents — compatible |
| **Calculs de montants** | `apps/api/modules/devis/montants.ts`<br/>`apps/api/modules/factures/montants.ts` | Fonctions de calcul internes recevant `tauxTVA` en string — pas de changement requis (conversion interne cohérente) |
| **Modèles de devis** | `apps/api/modules/devis/modele-devis.ts` | Lignes de modèle stockent `tauxTVA` comme numeric — compatible, lignes addLigneToModele hors scope (OPE-540) |
| **Commandes fournisseurs** | `apps/api/modules/commandes-fournisseurs/commande-form.ts`<br/>`apps/api/modules/commandes-fournisseurs/generer-depuis-devis-ia.ts` | TVA déductible (achats) — scope différent des catégories de TVA collectée, compatible |

---

## Features TVA Livrées

Pendant l'audit TVA, les features suivantes ont été implémentées et validées :

1. **Autoliquidation TVA (OPE-141)**
   - Intra-communautaire, services numériques, etc.
   - Logique d'exigibilité intégrée

2. **Exigibilité TVA**
   - Règles d'exigibilité encaissement vs débits selon régime

3. **Déductibilité partielle (OPE-153)**
   - Taux de déductibilité appliqué aux achats/frais

4. **Attestation TVA (OPE-154)**
   - Génération attestation déductibilité pour collaborateurs

5. **Inaltérabilité des données (OPE-118)**
   - Immuabilité factures/devis émis, piste d'audit complète

---

## Conclusion

L'audit des usages de `tauxTVA` dans la codebase est **clos**.

- ✅ Tous les modules **A** (compatibles) ont été vérifiés et documentés.
- ✅ Les features TVA requises ont été implémentées et validées.
- ✅ Aucune correction supplémentaire n'est nécessaire pour la clôture.

Les évolutions futures liées à la TVA (ex. nouvelles règles, nouveaux régimes) continueront à passer par le projet TVA Catégories — Migration (suite OPE-540).

---

**Référence** : OPE-548  
**Projet** : TVA Catégories — Migration des modules (suite OPE-540)
