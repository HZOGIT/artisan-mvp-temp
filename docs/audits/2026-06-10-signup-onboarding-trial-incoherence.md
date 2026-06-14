# Audit — Signup / onboarding : sécurité OK, mais incohérence de durée d'essai (14 vs 30 j)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `auth.signup` (`routers.ts:8920`), `createUserWithPassword`
> (`auth.ts:24`), `getUserByEmail` (`db.ts`), `bootstrapArtisanAccount` (`db.ts:3385`),
> scheduler J-3/J-1 (`index.ts:1360-1415`), templates emails essai
> (`emailService.ts`).

---

## Partie sécurité : OK

### Unicité email — pas de doublon de compte (malgré l'absence de normalisation explicite)

`createUserWithPassword` et `getUserByEmail` comparent `eq(users.email, email)` **sans
`.toLowerCase()/.trim()`**. Mais :

- la colonne `email` (`schema.ts:11`, `varchar(320).unique()`) hérite de la **collation
  utf8mb4 par défaut `_ci`** (insensible à la casse) — aucune migration ne la bascule en
  `_bin`/`_cs` → l'**index UNIQUE** rejette `Foo@x.com` vs `foo@x.com`, et le login
  matche quelle que soit la casse ;
- `z.string().email()` rejette les espaces de tête → pas de doublon par padding.

→ Pas de bug de doublon en pratique. *Réserve LOW : dépendre de la collation est
implicite ; normaliser (`.trim().toLowerCase()`) à l'inscription serait plus robuste.*

### Reste

- Hash mot de passe OK (déjà -ok auth-hashing). Provisioning complet via
  `bootstrapArtisanAccount` (OPE-7). `User already exists` → `CONFLICT` propre.
- `${input.name}` interpolé non-échappé dans l'email de bienvenue (`:8952`) = self-XSS
  (sa propre adresse, clients mail sans JS) → **LOW**, même classe que les injections-HTML
  emails déjà filées.
- Politique mdp `z.string().min(6)` — faible mais acceptable (LOW).

---

## 🟡 MEDIUM — durée d'essai **incohérente** entre 4 surfaces (user-facing)

L'essai gratuit réel est de **14 jours**, mais le produit annonce 14 **et** 30 jours selon
l'endroit :

| Surface | Valeur | Preuve |
| -- | -- | -- |
| Essai réel (enforced par `subscriptionGuard`) | **14 j** | `bootstrapArtisanAccount` : `trialEndsAt = now + 14*24h` (`db.ts:3390`) |
| Email de bienvenue (signup) | **14 j** | « 14 jours d'essai gratuit » (`routers.ts:8954`) ✅ cohérent |
| Email **découverte J+3** | **« encore 27 jours »** | `buildDiscoveryJ3Email` footer (`emailService.ts:467`) → logique **30 j** (30−3) |
| Commentaire SaaS / Stripe checkout | **30 j** | « Essai 30j sur tous » + `trial_period_days: 30` |

**Le défaut concret** : l'email **découverte J+3** (envoyé à tout nouveau compte,
`index.ts:1438`) affirme « Vous avez encore **27 jours** d'essai gratuit » alors que
l'utilisateur, à J+3 d'un essai de 14 j, n'a plus que **11 jours**. Promesse fausse de
~16 jours.

- **Le scheduler J-3/J-1 est, lui, correct** : il calcule depuis `trial_ends_at`
  (`DATE(trial_ends_at)=DATE(NOW()+3 DAY)`), donc les emails « plus que 3 jours » tombent
  bien au bon moment relatif à l'essai 14 j — **pas de mistiming**. Le seul mensonge est
  le « 27 jours » codé en dur de la découverte.
- **Impact = MEDIUM** : pas de faille données/sécurité/dispo ; mais **confusion +
  promesse non tenue**, et — produit ayant des clients **B2C** (cf. mentions médiateur
  déjà filées) — une **durée d'essai mal annoncée** frôle la pratique commerciale
  trompeuse (L121-2 code conso). Fix = aligner **une seule** durée (14 **ou** 30) sur les
  4 surfaces ; corriger le « 27 jours » codé en dur. *(Connexe au « trial stacking »
  Stripe 30 j déjà filé.)*

→ Sous le seuil BLOCKER/HIGH du cron (copy/config) → **pas d'issue Linear** ; à
réconcilier avant lancement.

---

## Verdict

Signup/onboarding **sain côté sécurité** (unicité email garantie par collation `_ci` +
UNIQUE, hashing OK, provisioning complet). Le seul écart est une **incohérence de durée
d'essai** (essai réel 14 j vs « 27 jours restants » annoncés en J+3, + « 30 j » côté
Stripe/marketing) → **MEDIUM** user-facing/conso, à aligner. **Pas de nouvelle issue
Linear.**
