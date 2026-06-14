# Audit — Paywall : subscriptionGuard ne couvre que /api/trpc (endpoints Express premium contournent l'abonnement)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `subscriptionGuard` (`server/_core/subscriptionGuard.ts`), son montage
> (`index.ts:1293`), endpoints Express premium hors tRPC.

---

## Le garde lui-même est sain

- **Exemptions serrées** (`ALLOWED_PROCEDURE_PREFIXES`) : `auth.`, `subscription.`,
  `devices.`, `parametres.`, `artisan.getProfile/updateProfile`, `system.`, `modules.list`.
- **Anti-smuggling batch** : `isFullyAllowed` n'exempte un batch que si **toutes** ses
  procédures sont whitelistées (`procs.every(isAllowed)`) → impossible de glisser une
  procédure payante dans un batch exempté.
- Blocage `expired`/`canceled`/`trialing`-expiré → 402. (Non blocage de `past_due`/
  `unpaid` = OPE-64.)
- Fail-open volontaire sur erreur DB (« REGLE D'OR : defaut PASS ») — footgun mineur.

## 🟠 HIGH — le garde n'est monté que sur `/api/trpc` → endpoints Express premium non gardés

```typescript
// index.ts:1293
app.use("/api/trpc", subscriptionGuard());
```

Les features payantes servies **hors tRPC** ne vérifient **que l'auth** (`grep -c
getSubscription index.ts` → **0**) :

| Endpoint | Ligne | Feature |
| -- | -- | -- |
| `/api/assistant/stream` | 921 | Assistant IA texte (Gemini) |
| `/api/voice/token`, `/api/voice/tool` | 1120… | Assistant vocal (Gemini Live) |
| `/api/comptabilite/fec` | 546 | Export FEC |
| `/api/comptabilite/export-csv` | 605 | Export comptable |
| `/api/comptabilite/facturx*`, `export-*-lot` | 645/673/701/747 | Factur-X / exports |

→ Un tenant **expiré/essai terminé** (JWT valide 7 j, compte actif) garde l'accès
**gratuit** à l'assistant IA (burn Gemini, cf. OPE-24), au vocal et aux exports compta.
**Fuite de revenu + fuite de coût.**

**Distinct d'OPE-64** (le garde existe mais ne bloque pas past_due/unpaid) : ici le garde
**ne s'exécute pas du tout** sur ces routes.

**Fix** : appeler `assertActiveSubscription(artisanId)` en tête des handlers premium
(assistant/voice/comptabilite), ou monter le middleware sur ces préfixes ; garder
`/api/paiement/*` ouvert pour re-payer.

---

## Verdict

Garde `/api/trpc` **sain** (exemptions tight, anti-smuggling), mais **périmètre trop
étroit** : les endpoints Express premium (assistant IA, voice, exports compta)
contournent le paywall → **HIGH** (revenu + coût). → **OPE-81 créée**.
