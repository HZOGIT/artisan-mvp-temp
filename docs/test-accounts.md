# Comptes de test — staging.operioz.com

> Tous les emails sont de la forme `dev+<role>@operioz.com` et arrivent dans l'inbox **dev@operioz.com**.
> À référencer dans les procédures de test ("Fais ce test avec l'email …").
> Environnement : **https://staging.operioz.com** uniquement.

## Comptes provisionnés

| Email | Rôle | Tenant | Mot de passe | Création |
|-------|------|--------|--------------|----------|
| `dev+artisan@operioz.com` | **artisan** (propriétaire) | A (principal) | `Operioz-Test-2026` | signup → bootstrap complet (artisan + essai 14 j + permissions propriétaire) |
| `dev+artisan2@operioz.com` | **artisan** (propriétaire) | B (isolation multi-tenant) | `Operioz-Test-2026` | signup → bootstrap complet |
| `dev+secretaire@operioz.com` | **secrétaire** (collaborateur) | A (sous `dev+artisan@`) | mot de passe **temporaire** envoyé par email d'invitation (inbox dev@operioz.com) → à changer à la 1ʳᵉ connexion | invite par l'artisan A |
| `dev+technicien@operioz.com` | **technicien** (collaborateur) | A (sous `dev+artisan@`) | mot de passe **temporaire** envoyé par email d'invitation (inbox dev@operioz.com) → à changer à la 1ʳᵉ connexion | invite par l'artisan A |

## Rôles de l'application

`users.role` ∈ `{ admin, artisan, secretaire, technicien }`.
- **artisan** : propriétaire du compte (tenant), tous droits sur ses données.
- **secretaire** : collaborateur administratif (devis/factures/clients selon permissions, pas la gestion d'équipe).
- **technicien** : collaborateur terrain (interventions/planning ; accès restreint au reste).
- **admin** : superadmin Operioz (interne) — catalogue global, etc. *(pas de compte de test provisionné — voir note ci-dessous)*.

## Portail client (pas un rôle `users`)

L'accès client se fait par **token** (pas de compte/role) : côté artisan, ouvrir une fiche client → générer le lien « Portail client ». Pour les tests de portail, créer un client chez `dev+artisan@operioz.com` et générer son lien.

## Scénarios d'usage

- **Parcours artisan** : `dev+artisan@operioz.com`.
- **Isolation multi-tenant** : `dev+artisan@` (tenant A) vs `dev+artisan2@` (tenant B) — vérifier qu'aucun ne voit les données de l'autre.
- **Permissions collaborateur** : `dev+secretaire@` / `dev+technicien@` (tous deux sous le tenant A) — vérifier les restrictions d'accès par rôle.

## Notes

- Les comptes **artisan** ont un mot de passe **fixe** (`Operioz-Test-2026`) car créés via signup.
- Les comptes **collaborateur** reçoivent un mot de passe **temporaire aléatoire** par email (flux d'invitation réel) — le récupérer dans l'inbox `dev@operioz.com` (sujet « Invitation à rejoindre … »).
- Aucun compte **admin** n'est provisionné : il n'existe aucun chemin HTTP pour attribuer `role=admin` (signup force `artisan`, `updateRole` n'autorise pas `admin`). Le créer nécessiterait un accès en écriture à la base staging.
