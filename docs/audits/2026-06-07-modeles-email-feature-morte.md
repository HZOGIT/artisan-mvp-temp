# Audit — Modèles d'emails personnalisés (feature non branchée)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `modelesEmailRouter` (`routers.ts:3144`), tables `modeles_email`,
> et le chemin d'envoi des emails (devis/facture/relance).

---

## Ce qui fonctionne correctement

- **CRUD modèles bien scopé** : `getById`/`update`/`delete` vérifient
  `modele.artisanId !== artisan.id` (FORBIDDEN). Pas d'IDOR. ✓
- L'**envoi d'emails de base fonctionne** : les flux utilisent des gabarits
  HTML **codés en dur** et corrects (`generateFactureEmailContent`,
  `generateDevisEmailContent`, `generateRappelFactureContent`, etc.). ✓

---

## 🟠 HIGH — Les modèles d'emails personnalisés ne sont JAMAIS appliqués (feature morte)

### Problème

L'artisan peut créer/éditer des modèles d'emails (sujet + `contenu` avec
variables) via `modelesEmailRouter` et les pages `ModelesEmail.tsx` /
`ModelesEmailTransactionnels.tsx` (avec un système de variables type
`{{client_nom}}`, `{{lien_paiement}}`…). Mais **aucun chemin d'envoi ne consomme
ces modèles** :

- `grep getDefaultModeleEmail | modele.contenu | "\.contenu"` dans les chemins
  d'envoi → **0 résultat**.
- `grep "{{"` côté serveur → **0 résultat** : **aucune substitution de variables**
  n'existe nulle part.
- `factures.sendByEmail` (`routers.ts:1512`) et `devis.sendByEmail` n'acceptent
  que `{ id, customMessage, attachPdf }` et construisent l'email via les gabarits
  **codés en dur** (`generateFactureEmailContent` / `generateDevisEmailContent`).
  Le `modele` n'est ni chargé ni appliqué.
- Côté client, `FactureDetail.tsx` / `DevisDetail.tsx` n'invoquent jamais
  `modelesEmail` / `getDefault` — ils n'envoient qu'un `customMessage`.
- Idem dans les outils de l'assistant (`sendDevisEmailHelper` /
  `sendFactureEmailHelper` utilisent les gabarits codés en dur).

→ Les modèles personnalisés sont **stockés mais ignorés** : peu importe ce que
l'artisan configure, tous les emails partent avec le gabarit codé en dur.

### Impact

- **Feature vendue mais non fonctionnelle** : « Modèles d'emails personnalisables »
  est exposé dans Paramètres, possède sa propre page de modèles transactionnels et
  un système de variables, et est cité comme opérationnel dans Support /
  Documentation. L'artisan personnalise → **sa configuration est silencieusement
  jetée**.
- Perte de confiance + tickets support à l'usage. La personnalisation du branding
  email (un argument produit) ne marche pas.

> Note : ce n'est **pas** un problème de sécurité (les emails de base partent bien
> avec des gabarits corrects). C'est un **trou de complétude fonctionnelle**.

### Fix proposé

Brancher réellement les modèles dans le chemin d'envoi :
1. À l'envoi (`sendByEmail`, relances, assistant), **charger le modèle par défaut**
   du `type` correspondant (`getDefaultModeleEmail(artisan.id, type)`) ; si présent,
   l'utiliser à la place du gabarit codé en dur.
2. Implémenter une **substitution de variables sûre** : remplacer `{{client_nom}}`,
   `{{numero}}`, `{{montant}}`, `{{lien_paiement}}`… en **échappant** les valeurs
   (cf. OPE-12/48 : ne pas réintroduire d'injection HTML).
3. Sinon, **retirer la feature de l'UI** pour le lancement plutôt que d'exposer une
   fonctionnalité morte.

### Estimation

~1 j — chargement modèle + moteur de substitution échappé + branchement des 3-4
chemins d'envoi + tests ; OU ~1 h pour masquer la feature au lancement.

---

## Estimation totale

- HIGH (modèles d'emails non branchés) : ~1 j (ou ~1 h pour masquer)
