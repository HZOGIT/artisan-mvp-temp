# Audit — `devisIA.analyserPhotos` : appel IA vision sans rate-limit (cost-DoS)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> Périmètre : couverture de `checkRateLimit` sur les endpoints IA `generateContent` du
> `routers.ts` ; `devisIA.analyserPhotos` (`:6753`).

---

## Constat : le seul endpoint IA **vision** n'a PAS de rate-limit, contrairement à tous ses pairs

Croisement des call sites :

```
generateContent : 305 482 547 3372 3974 6835 7011 7034 7073 7109 7135 8516
checkRateLimit  : 298 458 528 3309 3936  ⟶ [GAP] ⟵ 7005 7025 7058 7096 7124 8504
```

Chaque `generateContent` est précédé d'un `checkRateLimit`… **sauf `6835`** : il tombe dans
le **trou entre 3936 et 7005**. Ce `generateContent` est dans **`devisIA.analyserPhotos`**
(`:6753`, `protectedProcedure`), qui envoie à Gemini un appel **multimodal vision** avec
**plusieurs images par requête** :

```typescript
// routers.ts:6784-6790 — toutes les photos de l'analyse en UN appel vision
const imageBlocks = photos.map(p => ({ inlineData: { mimeType, data } } | { fileData }));
// :6835 — generateContent(... imageBlocks ...)   ← AUCUN checkRateLimit en amont
```

### Impact (MEDIUM)

- **L'appel IA le plus cher** (vision multimodale, N images/appel) est le **seul** sans
  borne. Un tenant authentifié peut **boucler** `analyserPhotos` → **burn du budget Gemini
  vision** (coût). Per-tenant (pas anonyme), pas de fuite/altération de données → **coût**.
- Oversight manifeste : **tous les autres** endpoints IA (conseils, prévisions, OCR
  justificatif `:8504`, etc.) ont `checkRateLimit(artisan.id)` (30 req/h). Seul
  `analyserPhotos` l'a oublié.

---

## Distinction (anti-doublon)

- **OPE-24** (« Rate limiting manquant : **voice/token** (burn Gemini), **importFromExcel**,
  **body 50 Mo** ») = même **classe** (rate-limit IA/coût manquant) mais **liste
  d'endpoints différente** — `devisIA.analyserPhotos` **n'y figure pas**. → **à rattacher
  à OPE-24** (étendre son périmètre), pas un doublon mais pas non plus une issue séparée.
- `analyse-photos-ia-upload-images-only-ok` = validation **images-only** de l'upload (pas
  le coût). `devisia-generer-devis-idor` = IDOR (pas le coût). → différents.

---

## Reco (fix d'une ligne)

Ajouter en tête de `analyserPhotos` (comme ses pairs) :

```typescript
if (!checkRateLimit(artisan.id)) {
  throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte" });
}
```

(Idéalement, compter l'appel vision **plus lourd** dans le quota, vu N images/appel.)

---

## Verdict

`devisIA.analyserPhotos` (`:6753`) lance l'appel **Gemini vision** le plus coûteux **sans
`checkRateLimit`**, alors que **tous** les autres endpoints IA en ont un → **cost-DoS**
per-tenant. **MEDIUM** (coût, authentifié), **même classe qu'OPE-24** → **à rattacher à
OPE-24** (ajouter ce endpoint). **Pas de nouvelle issue Linear** (éviter le doublon de
OPE-24) — fix trivial.
