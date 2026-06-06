# Audit — Gestion des rôles / permissions_utilisateur

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## 🔴 BLOCKER 1 — Système de permissions implémenté mais non appliqué sur la majorité des routes

### Problème

Le fichier `shared/permissions.ts` définit un système de permissions granulaires (26 codes) et des templates par rôle (`admin`, `artisan`, `secretaire`, `technicien`). `server/_core/trpc.ts` expose des procédures guards (`devisVoirProcedure`, `devisCreerProcedure`, `contratsGererProcedure`, etc.). Mais **la majorité des routers critiques n'utilisent pas ces guards** et se contentent de `protectedProcedure` (authentifié = autorisé).

### Routers entièrement non protégés par le système de permissions

| Router | Lignes | Routes concernées | Permission manquante |
|--------|--------|-------------------|----------------------|
| `contratsRouter` | 4238–4513 | list, getById, create, update, **delete**, generateFacture | `contrats.voir`, `contrats.gerer` |
| `clientsRouter` | 144–255 | list, getById, create, update, **delete**, search, importFromExcel | `clients.voir`, `clients.gerer` |
| `interventionsRouter` | 1835–2055 | list, getById, create, update, **delete**, assignerTechnicien | `interventions.voir`, `interventions.gerer` |
| `rdvRouter` | 7311–7461 | list, confirm, refuse, proposeAutreCreneau | `rdv.gerer` |

### Routes sensibles de `devisRouter` non protégées

| Route | Ligne | Procédure actuelle | Procédure attendue |
|-------|-------|--------------------|--------------------|
| `addLigne` | 6695 (relatif 242) | `protectedProcedure` | `devisCreerProcedure` |
| `updateLigne` | 6695 (relatif 287) | `protectedProcedure` | `devisCreerProcedure` |
| `deleteLigne` | 782 | `protectedProcedure` | `devisCreerProcedure` |
| `sendByEmail` | ~844 | `protectedProcedure` | `devisCreerProcedure` |
| `convertToFacture` | ~848 | `protectedProcedure` | `facturesCreerProcedure` |
| `duplicate` | ~855 | `protectedProcedure` | `devisCreerProcedure` |
| `generatePDF` | ~852 | `protectedProcedure` | `devisVoirProcedure` |

### Impact concret

Un `technicien` invité (ROLE_TEMPLATES : uniquement interventions, calendrier, chantiers, géolocalisation) peut, avec son JWT valide :

1. **Lister et modifier tous les clients** de l'artisan (clientsRouter sans check)
2. **Créer/modifier/supprimer des contrats** (contratsRouter sans check)
3. **Ajouter/modifier/supprimer des lignes de devis** (addLigne, updateLigne, deleteLigne)
4. **Envoyer un devis par email** au nom de l'artisan (sendByEmail)
5. **Convertir un devis en facture** (convertToFacture)
6. **Confirmer ou refuser des RDV** (rdvRouter)

Une `secrétaire` (ROLE_TEMPLATES : devis/factures/clients mais pas interventions) peut :
- Créer/modifier/supprimer des interventions (interventionsRouter)

### Fix

Remplacer `protectedProcedure` par la procédure guard appropriée sur chaque route :

```typescript
// contratsRouter — avant :
list: protectedProcedure.query(...)
create: protectedProcedure.mutation(...)
delete: protectedProcedure.mutation(...)

// contratsRouter — après :
// Ajouter dans trpc.ts :
export const contratsVoirProcedure = protectedProcedure.use(requirePermission("contrats.voir"));
export const contratsGererProcedure = protectedProcedure.use(requirePermission("contrats.gerer"));

list: contratsVoirProcedure.query(...)
create: contratsGererProcedure.mutation(...)
delete: contratsGererProcedure.mutation(...)
```

Idem pour `clientsRouter`, `interventionsRouter`, `rdvRouter`, et les routes `devis.*` non protégées.

### Estimation

~2h — mécanique répétitive, pas de logique à inventer. Préparer un script de grep pour ne rien oublier.

---

## 🟠 HIGH — OTP SMS et mot de passe temporaire générés avec `Math.random()` (non crypto-sûr)

### Problème

Deux usages de `Math.random()` pour des valeurs de sécurité :

1. **OTP SMS** (`server/routers.ts:2630`) :
   ```typescript
   const code = Math.floor(100000 + Math.random() * 900000).toString();
   ```

2. **Mot de passe temporaire collaborateur** (`server/routers.ts:7581`) :
   ```typescript
   const tempPassword = Math.random().toString(36).slice(-10);
   ```

`Math.random()` utilise XorShift128+ (algorithme déterministe non sécurisé pour la crypto). Un attaquant qui observe plusieurs valeurs générées peut prédire les suivantes.

### Fix

```typescript
import { randomInt, randomBytes } from "crypto";

// OTP 6 chiffres
const code = randomInt(100000, 1000000).toString();

// Mot de passe temporaire
const tempPassword = randomBytes(8).toString("hex"); // 16 chars hex
```

---

## Ce qui fonctionne correctement

- `devisRouter.list/getById` → `devisVoirProcedure` ✓
- `devisRouter.create/update` → `devisCreerProcedure` ✓
- `devisRouter.delete` → `devisSupprimerProcedure` ✓
- `facturesRouter.list/getById` → `facturesVoirProcedure` ✓
- `facturesRouter.delete` → `facturesSupprimerProcedure` ✓
- `comptabiliteRouter.*` → `comptaVoirProcedure` ✓
- `utilisateursRouter.*` → `utilisateursGererProcedure` ✓
- `updateRole` n'accepte pas `admin` dans le z.enum ✓ (pas d'escalade de privilège vers admin)
- `requirePermission` admin bypass correct ✓
- Permissions chargées à chaque requête depuis DB ✓

---

## Estimation totale

- BLOCKER (guards manquants) : ~2h
- HIGH (crypto) : ~15 min
