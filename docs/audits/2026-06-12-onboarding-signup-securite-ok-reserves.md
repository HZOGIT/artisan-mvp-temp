# Audit — Onboarding / Signup (création de compte artisan) ✅ OK (aucun BLOCKER ; 2 réserves non bloquantes)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Domaine** : Auth / onboarding (création de compte)

> Audit du flux d'inscription : `auth.signup` (`server/routers.ts:10436`),
> `createUserWithPassword` (`server/_core/auth.ts:24`), `bootstrapArtisanAccount`,
> rate-limit auth (`server/_core/index.ts:231+`). Recherche d'abus (création de masse,
> squat de compte, escalade, énumération, injection).

---

## ✅ Sain — pas de BLOCKER

| Contrôle | Constat | Réf. |
| -- | -- | -- |
| **Rate-limit** | `auth.signup` ET `auth.signin` : **5 tentatives / 15 min / IP** (429 au-delà). IP via `cf-connecting-ip` (anti-spoof XFF). → création de masse / brute-force bornées | `index.ts:231-265` |
| **Mot de passe haché** | `hashPassword` (cf. `2026-06-08-auth-hashing-jwt-ok.md`), jamais stocké en clair | `auth.ts` |
| **Anti-doublon email** | `createUserWithPassword` rejette (`throw "User already exists"`) si l'email existe déjà → pas de comptes en double | `auth.ts:32-40` |
| **Pas d'escalade / injection tenant** | Input = `{ email, password(min 6), name }` **uniquement** — aucun `role`/`artisanId` accepté. `bootstrapArtisanAccount` crée un **nouvel** artisan + permissions **propriétaire** ; impossible de se greffer sur un tenant existant ou d'injecter un rôle | `routers.ts:10436-10449` |
| **Échappement email de bienvenue** | `name` interpolé via `safeHtml(input.name)` dans le corps HTML | `routers.ts:10468` |
| **Provisioning correct** | `bootstrapArtisanAccount` (OPE-7) → artisan + essai + permissions, évite les `FORBIDDEN` post-inscription | `routers.ts:10449` |

→ Pas de création de masse (rate-limit), pas de doublon, pas d'escalade de privilège, pas d'injection HTML. **Énumération** de comptes (message « User already exists ») bornée par le rate-limit — déjà couverte par `2026-06-10-enumeration-comptes-forgot-signin-signup-ok.md`. **Trial stacking** (ré-inscription pour ré-octroyer un essai) = **OPE-66** (filé). Stripe Connect non audité (OPE-6).

## 🟡 Réserve MEDIUM — pas de vérification d'email à l'inscription

`signup` crée le compte **et auto-connecte** (`setAuthCookie`) **sans confirmer la possession de l'email** (pas de lien de vérification). Conséquences :
- **Squat de compte** : on peut s'inscrire avec `victime@x.com`. **Atténué** : la victime reçoit l'email de bienvenue et peut **reprendre le compte** via « mot de passe oublié » (le lien va à *son* email) → auto-correcteur.
- **Délivrabilité** : envoyer des transactionnels à des emails non vérifiés peut dégrader la réputation d'expédition (Resend).
- En partie une **décision produit** (friction d'onboarding). **Non bloquant 30 juin** (atténué + reset auto-correcteur). À considérer post-lancement (double opt-in).

## 🟢 Réserve LOW — politique de mot de passe faible

`password: z.string().min(6)` — **6 caractères** est en-dessous des recommandations (≥ 8-12, ANSSI/NIST). Aucune exigence de complexité. **Décision produit** ; relever `min` à 8-10 serait un durcissement trivial et behavior-preserving pour les nouveaux comptes.

## Verdict

Le flux d'**inscription** est **correctement protégé** (rate-limit, hachage, anti-doublon, pas d'escalade ni d'injection). **Aucun BLOCKER/HIGH** → **pas d'issue Linear**. Deux réserves **non bloquantes** : absence de **vérification d'email** (MEDIUM, atténuée + décision produit) et **mot de passe min 6** (LOW, décision produit). Trial stacking déjà filé (OPE-66).
