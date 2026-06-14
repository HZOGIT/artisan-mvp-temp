# Audit — Sécurité du token de session JWT : solide — OK (1 réserve LOW)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin

> Périmètre : `createToken`/vérif JWT (`server/_core/auth-simple.ts`), config secret
> (`env.ts`), et les vérifs à la main dans `index.ts`. Risques visés : secret faible/codé
> en dur, `alg:none` / confusion d'algorithme, expiration.

---

## Conclusion : JWT **correctement configuré** (secret fort obligatoire, jose, HMAC-only, expiration). Aucun BLOCKER/HIGH. 1 réserve **LOW** (algorithme non épinglé).

### ✅ Secret robuste, **obligatoire**, sans fallback

- `env.ts:12` : `JWT_SECRET: z.string().min(32, …)` → **requis, ≥ 32 caractères**, validé au
  boot. **Aucune valeur par défaut/codée en dur.**
- `auth-simple.ts:8-10` **et** `index.ts:15-17` : **throw au démarrage** si `JWT_SECRET`
  absent → l'app **refuse de démarrer** sans secret (pas de mode dégradé silencieux).

### ✅ Signature/vérification saines (jose, HMAC-only)

- Lib **`jose`** (`SignJWT`/`jwtVerify`) — moderne, sûre.
- Signature : `.setProtectedHeader({ alg: "HS256" })` (`:24`).
- Vérification : `jwtVerify(token, SECRET_KEY)` avec une **clé symétrique**
  (`new TextEncoder().encode(JWT_SECRET)`). → jose **n'accepte que les algorithmes HMAC**
  (HS256/384/512) pour une clé symétrique : **`alg:none` rejeté**, **confusion RS256↔HS256
  impossible** (le type de clé ne correspond pas). Un attaquant **ne peut pas forger** sans
  le secret.
- Tous les points de vérif (`auth-simple.ts:38`, `index.ts:549/581/613`) utilisent la **même
  clé symétrique** → cohérent.

### ✅ Expiration

- `.setExpirationTime("7d")` (`:25`) ; `jwtVerify` valide `exp` par défaut → **token expiré
  rejeté**. 7 jours = raisonnable pour un cookie de session.

---

## 🟡 Réserve LOW — algorithme non épinglé explicitement

`jwtVerify(token, secret)` n'indique pas `{ algorithms: ['HS256'] }`. **Risque réel
quasi-nul** (jose restreint déjà aux HMAC pour une clé symétrique, et le secret est requis
pour signer), mais un **épinglage explicite** `algorithms: ['HS256']` serait un durcissement
*defense-in-depth* **behavior-preserving** (les tokens HS256 légitimes restent valides).
**LOW** — candidat auto-fix safe possible.

> Rappel hors périmètre : **non-révocation** des JWT (logout/reset n'invalident pas les
> tokens existants) = **OPE-32** (déjà filé), classe distincte (nécessiterait `tokenVersion`).

---

## Verdict

Le **token de session JWT** est **correctement sécurisé** : secret **fort obligatoire**
(≥ 32 c., boot-fail sinon, pas de fallback), **jose** en **HMAC-only** (pas de `none`, pas de
confusion d'algorithme), **expiration 7 j** validée. **Aucun BLOCKER/HIGH.** Seule réserve
**LOW** : épingler explicitement `algorithms: ['HS256']` (durcissement). La non-révocation
est **OPE-32** (filé). **Pas de nouvelle issue Linear.**
