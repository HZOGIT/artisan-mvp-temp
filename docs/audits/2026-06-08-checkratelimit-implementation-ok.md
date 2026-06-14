# Audit — Implémentation du rate limiter IA (`checkRateLimit`) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `checkRateLimit` (`routers.ts:42`) — limiteur des endpoints IA
> (Gemini, coût). 12 appelants (`assistant.chat`, `generateDevis`,
> `suggererArticlesIA`, `analyserPhotos`, `soumettreDemandeIA`, `genererDepuisDevisIA`…).

---

## Conclusion : le limiteur **fonctionne**. Pas de BLOCKER/HIGH.

```typescript
// routers.ts:41-52
const rateLimitMap = new Map<number, { count: number; resetTime: number }>();
function checkRateLimit(artisanId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(artisanId);
  if (!entry || now > entry.resetTime) {            // 1ère fois / fenêtre expirée → reset
    rateLimitMap.set(artisanId, { count: 1, resetTime: now + 3600000 }); return true;
  }
  if (entry.count >= 30) return false;              // 30 req / heure / artisan
  entry.count++; return true;
}
```

- **Clé = `artisanId`**, **30 requêtes / heure** glissante par tenant. Cohérent
  (un tenant + ses collaborateurs partagent un budget tenant — `getArtisanByUserId`
  résout les collaborateurs vers le même `artisanId`).
- **Reset correct** : la fenêtre repart à `now + 1h` une fois expirée.
- **Appliqué** sur les endpoints IA coûteux (les manquants sont **OPE-24/23/36**).

---

## Réserves (mineures, acceptables au lancement)

1. **En mémoire (non persistant)** : un **redémarrage** du process remet tous les
   compteurs à zéro (un artisan au plafond retrouve 30 req). Idem, **inopérant en
   multi-instance** (chaque instance a sa map). Acceptable sur l'instance unique
   Railway actuelle ; à migrer vers un store partagé (Redis) si scale-out.
2. **Map non bornée** : une entrée par `artisanId` ayant déjà appelé, **jamais
   purgée** (les entrées expirées ne sont pas nettoyées) → fuite mémoire **lente**
   et négligeable (~quelques dizaines d'octets/artisan). Optionnel : purge
   périodique des entrées `resetTime < now`.
3. **Granularité par appel, pas par coût** : `analyserPhotos` compte **1** quel que
   soit le **nombre de photos** envoyées (pas de cap sur N photos) → un appel peut
   être N× plus coûteux. Relève d'**OPE-30** (analyserPhotos sans limite de photos).

---

## Verdict

Rate limiter IA **fonctionnel** (30/h/tenant, reset correct, appliqué). Réserves
purement opérationnelles (persistance/multi-instance/purge) non bloquantes au
lancement mono-instance. Les **endpoints non protégés** restent **OPE-24/23/36** ;
le **coût par appel non borné** (photos) reste **OPE-30**. **Pas d'issue Linear.**
