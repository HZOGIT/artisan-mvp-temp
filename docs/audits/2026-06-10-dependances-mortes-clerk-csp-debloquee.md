# Audit — Dépendances mortes (Clerk/Lucia/bcrypt natif) → la CSP peut être réactivée (débloque OPE-48)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : dépendances `package.json` non importées ; commentaire de désactivation CSP
> (`index.ts:135-143`).

---

## Conclusion : dépendances mortes (LOW hygiène) + insight actionnable pour OPE-48.

### Dépendances jamais importées (mortes)

| Package | Statut | Preuve |
| -- | -- | -- |
| `@clerk/backend`, `@clerk/clerk-react` | **mort** | `grep @clerk\|Clerk\|ClerkProvider` (client+server) = **0** (hors commentaire CSP) |
| `lucia`, `@lucia-auth/adapter-mysql` | **mort** | `grep lucia\|Lucia` = **0** ; l'auth est un JWT custom (`auth-simple.ts`) |
| `bcrypt` (natif) | **mort** | seul **`bcryptjs`** est importé (`auth.ts:1`, `fix-duplicates.ts:7`) |

→ Hygiène : install/bundle inutiles + surface supply-chain (plus de deps = plus
d'exposition CVE, cf. OPE-88). **LOW** en soi.

### 🔑 Insight : Clerk était la raison de désactiver la CSP → réactivation **débloquée**

```typescript
// index.ts:135-143
// TODO: Re-enable CSP with proper Clerk directives
// Temporarily disabled to allow Clerk to load
// app.use((req,res,next)=>{ res.setHeader('Content-Security-Policy', …) })
```

La **CSP est désactivée** explicitement **« pour charger Clerk »**. Or **Clerk est mort**
(0 import). → La justification est **obsolète** : la CSP peut être **réactivée** sans la
contrainte Clerk.

**Pourquoi c'est important** : la CSP désactivée est l'**amplificateur** cité par
**OPE-48** (XSS assistant), **OPE-87** (XSS impression chantiers) et **OPE-88** (xlsx
prototype-pollution→XSS). Réactiver la CSP = **filet de défense en profondeur** sur ces
trois vecteurs. Le « blocker » perçu (Clerk) **n'existe plus** → action déblocable
immédiatement.

---

## Distinction (anti-doublon)

- La **CSP désactivée** est déjà le cœur d'**OPE-48**. Cet audit n'ouvre pas de doublon :
  il **lève le blocage** (Clerk mort) et l'ajoute en **commentaire** d'OPE-48.
- Les **dépendances mortes** = hygiène LOW, pas d'issue dédiée.

---

## Reco

1. **Réactiver la CSP** (OPE-48) — la contrainte Clerk a disparu. Définir une politique
   stricte (`default-src 'self'`, `script-src 'self'`, etc.) ; tester l'app (Stripe.js,
   Google Fonts, Gemini fetch).
2. **Désinstaller** `@clerk/*`, `lucia`, `@lucia-auth/adapter-mysql`, `bcrypt` (natif) —
   réduit le bundle et la surface CVE. (Vérifier que la table `sessions` Lucia, inutilisée
   par l'auth JWT, peut être retirée du schéma.)

---

## Verdict

Clerk/Lucia/`bcrypt`(natif) sont des **dépendances mortes** (LOW hygiène). Surtout :
**Clerk** — seule raison documentée de la **CSP désactivée** — est **mort**, donc la **CSP
peut être réactivée**, débloquant le filet de défense d'**OPE-48/87/88**. **Pas de nouvelle
issue** ; commentaire actionnable ajouté à **OPE-48**.
