# Audit — Configuration (paramètres / profil), catalogue articles public & import ERP — OK

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre balayé ce run : `importRouter` (`importErp` — importClients/Devis/
> Factures, `routers.ts:7820`), `articlesRouter` (endpoints **publics**
> `getBibliotheque`/`list`/`search`, `:258-284`), `parametresRouter` (`:2988`),
> `artisan.updateProfile` (`:82`). Objectif : escalade de privilège / fuite
> cross-tenant / injection.

---

## Conclusion : aucun BLOCKER/HIGH nouveau. Surface saine.

### Catalogue articles public (`articlesRouter`) — données de référence, pas de fuite

- `getBibliotheque`/`list`/`search` (publics) lisent **`bibliothequeArticles`**
  (`db.ts` `getBibliothequeArticles`/`searchArticles`) — une **bibliothèque de
  référence partagée** (articles métier + prix marché), **pas** la table
  `articles` propre à un artisan. Aucune donnée tenant exposée.
- Requêtes **paramétrées** (Drizzle `eq`/`like`), `search` borné `.limit(50)`.
  Public + sans rate limit mais **lecture seule de données de référence** →
  risque limité au scraping d'un catalogue déjà générique. Pas un blocker.
- `suggererArticlesIA` (IA) est `protectedProcedure` **+ rate-limité**
  (`checkRateLimit`, `:298`). Pas d'abus coût.

### `parametresRouter.update` — scopé + allow-list

- Scope `artisan.id` (`getArtisanByUserId` → `updateParametresArtisan(artisan.id,
  …)`). Input = **liste blanche** de champs cosmétiques/légaux (préfixes,
  mentions, vitrine, couleurs, délais de rappel). **Aucun** champ `plan`,
  `subscription`, `role`, `maxUsers` → pas d'escalade via les paramètres (même si
  l'endpoint est whitelisté dans `subscriptionGuard`).

### `artisan.updateProfile` — allow-list, pas d'escalade

- Input strictement limité : `siret`, `nomEntreprise`, adresse, `tauxTVA`,
  `numeroTVA`, `iban`, `codeAPE`, `logo`, `slug`, `metier`. **Pas de** `plan` /
  `role` / `subscription` → aucun levier de privilège/facturation (distinct
  d'OPE-43 qui vise `artisans.plan` via `completeOnboarding`).
- `slug` **assaini** (NFD + `[^a-z0-9]`→`-`, longueur bornée) et **unicité
  vérifiée** (`isSlugAvailable`). `metier` persisté en **SQL paramétré** (`?`).
- `email` modifié ici = email **entreprise** (`artisans.email`), pas l'email de
  **connexion** (`users.email`) → aucun impact auth.

### Import ERP (`importRouter`) — borné, scopé ; limites déjà tracées

- `importClients`/`importDevis`/`importFactures` : scope `artisan.id`, taille
  bornée `z.array(...).max(5000)`, dédup email (clients), rattachement client par
  nom (devis/factures). Pas d'IDOR (tout passe par `artisan.id`).
- **Déjà audité / tracé** :
  - préservation du **numéro de facture** + ventilation TVA non importée →
    `2026-06-07-import-factures-numerotation.md` (HIGH) + OPE-34 (numérotation).
  - pattern d'INSERT séquentiel massif / DoS import → **OPE-24** (problème 2,
    `importFromExcel`). Le cap `.max(5000)` borne `importErp`.
  - import bancaire → `2026-06-07-import-bancaire-conversion-depense.md`.

---

## Verdict

Configuration (paramètres + profil), catalogue public et import ERP **vérifiés
sains** : scoping `artisanId` systématique, allow-lists sans champ sensible, slug
assaini, SQL paramétré, catalogue public = données de référence partagées. Les
seules limites de l'import sont **déjà documentées** (numérotation/TVA, DoS).
**Pas d'issue Linear créée.**
