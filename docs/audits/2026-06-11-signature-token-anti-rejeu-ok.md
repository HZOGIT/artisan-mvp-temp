# Audit — Signature devis : force du token + anti-rejeu — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `signature.createSignatureLink` (`routers.ts:2490`, génération token),
> `signature.signDevis` (`routers.ts:2715`, mutation publique de signature).

---

## Conclusion : token fort + signature à usage unique. Pas de BLOCKER/HIGH **nouveau**.

La signature engage le client (acceptation du devis) → enjeux : token devinable
(signature forgée), **rejeu** (signer 2×), lien expiré.

### Token de signature : fort

```typescript
// routers.ts:2510
const token = crypto.randomUUID().replace(/-/g, '')
            + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
```

→ **2 UUID v4 concaténés** (~64 hex, **~256 bits**) → **non énumérable**.

### `signDevis` : validation + anti-rejeu + expiration

```typescript
const existing = await db.getSignatureByToken(input.token);
if (!existing)                       → NOT_FOUND   // token invalide
if (existing.statut !== 'en_attente') → BAD_REQUEST "déjà traité"   // ANTI-REJEU
if (new Date() > existing.expiresAt)  → BAD_REQUEST "expiré"        // EXPIRATION
```

→ Une signature **déjà traitée** ne peut **pas** être re-signée (usage unique). Lien
**expiré** rejeté. IP + User-Agent **capturés** (`:2736-2737`) dans l'enregistrement de
signature (élément de preuve).

---

## Gaps connus = déjà filés (anti-doublon)

- **`smsVerified` non vérifié serveur** (présent en input `:2721` mais **jamais testé** dans
  le handler) → 2FA contournable → **déjà filé** (signature OTP/2FA).
- **Pas de hash du document signé** (valeur probante) → **OPE-55**.
- **Devis signé reste modifiable/supprimable** → **OPE-50**.
- IP via `x-forwarded-for[0]` (spoofable) — ici pour la **preuve** (pas la sécurité du
  rate-limiter, OPE-80) ; la valeur probante de l'IP capturée relève d'OPE-55.

---

## Verdict

Le lien de signature a un **token ~256 bits** non devinable et `signDevis` est **à usage
unique** (`statut !== 'en_attente'`) + **expirant**. Pas de rejeu, pas de token faible. Les
gaps de **valeur probante / 2FA / immutabilité** sont **déjà filés** (OPE-55/50 + signature
2FA). **Pas de nouvelle issue Linear.**
