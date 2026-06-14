# Audit — Upload de fichiers / Analyse photos IA

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : upload logo, et le module « analyse photos de chantier » par IA
> (`devisIARouter`). Stockage, validation, ownership, coûts IA.

---

## Ce qui fonctionne correctement

- **Upload logo** (`server/_core/index.ts:226`) : auth requise, taille limitée à
  2 Mo (multer), allowlist MIME (PNG/JPG/WebP/SVG). Le logo est rendu **partout
  via `<img src>`** (DashboardLayout, PortailClient, Vitrine) — un SVG chargé en
  `<img>` n'exécute pas de script → pas de XSS exploitable. Le générateur PDF
  exclut explicitement le SVG (`pdfGenerator.ts:148`, regex `png|jpe?g|webp`).
- `devisIA.list` (`routers.ts:6696`) et `createAnalyse` (`:6722`) sont
  correctement scopés sur `artisan.id`.

> Note hardening (non bloquant) : le `mimetype` du logo vient du header client
> (non vérifié sur les magic bytes), et le SVG n'est pas sanitizé. À durcir
> (refuser le SVG ou le passer à DOMPurify) mais non exploitable en l'état.

---

## 🔴 BLOCKER — IDOR multi-tenant sur tout le module analyse photos (`devisIARouter`)

Trois routes du module d'analyse photo IA n'effectuent **aucune vérification
d'appartenance** de l'`analyseId` à l'artisan appelant. Les helpers DB ne scopent
que par id (`getPhotosByAnalyse(analyseId)`, `updateAnalysePhoto(id)`,
`getAnalysePhotoById(id)` — aucun `artisanId`).

### 1. Lecture cross-tenant — `devisIA.getById` (`routers.ts:6702`)

```typescript
getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input }) => {                 // ← pas de ctx, pas d'ownership
    const analyse = await db.getAnalysePhotoById(input.id);
    const photos = await db.getPhotosByAnalyse(input.id);
    const resultats = await db.getResultatsAnalyse(input.id);
    const devisGenere = await db.getDevisGenereByAnalyse(input.id);
    return { ...analyse, photos, resultats..., devisGenere };
  }),
```

N'importe quel utilisateur authentifié peut lire, pour **n'importe quel
`analyseId` de la plateforme** : les **photos de chantier** (URLs / base64), les
résultats d'analyse IA, et le **devis généré** (données client, prix). Fuite de
données concurrentes/clients.

### 2. Écriture cross-tenant — `devisIA.addPhoto` (`routers.ts:6733`)

```typescript
addPhoto: protectedProcedure
  .input(z.object({ analyseId: z.number(), url: z.string(), ... }))
  .mutation(async ({ input }) => {              // ← pas de ctx, pas d'ownership
    return await db.addPhotoToAnalyse(input);
  }),
```

Ajout d'une photo (avec `url` arbitraire) à l'analyse de n'importe quel artisan.

### 3. Action payante cross-tenant — `devisIA.analyserPhotos` (`routers.ts:6744`)

```typescript
analyserPhotos: protectedProcedure
  .input(z.object({ analyseId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);   // vérifie SON artisan
    if (!artisan) throw ...;
    await db.updateAnalysePhoto(input.analyseId, { statut: 'en_cours' }); // ← analyseId non vérifié
    const photos = await db.getPhotosByAnalyse(input.analyseId);          // ← d'un autre tenant
    // ... appel Gemini multimodal facturé ...
    await db.updateAnalysePhoto(input.analyseId, { ... });                // ← écrit chez l'autre
```

L'existence de l'artisan appelant est vérifiée, mais **jamais** que `analyseId`
lui appartient. Permet de : (a) déclencher une **analyse Gemini facturée** sur
les photos d'un autre artisan, (b) écraser le statut/résultats de son analyse.

### Exploitation

Itérer `analyseId = 1..N` sur `getById` → dump des chantiers + devis générés de
toute la plateforme. `analyserPhotos` sur des ids arbitraires → burn de quota
Gemini (clé partagée dev/staging) imputé à la plateforme.

### Lien avec les autres issues

Distinct d'OPE-9/OPE-10 (lignes de devis) et d'OPE-17 (guards de **rôle**) :
ajouter une permission de rôle ne corrige PAS l'IDOR — il faut une vérification
**d'appartenance** (ownership) de l'`analyseId` à l'artisan.

### Fix proposé

Scoper chaque route sur l'artisan courant. Helper :

```typescript
async function assertAnalyseOwnership(analyseId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
  const analyse = await db.getAnalysePhotoById(analyseId);
  if (!analyse || analyse.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Analyse introuvable" });
  }
  return { artisan, analyse };
}
```

À appeler en tête de `getById`, `addPhoto` et `analyserPhotos` (toutes passées
avec `ctx`).

### Estimation

~1 h — helper d'ownership + branchement sur les 3 routes + test cross-tenant.

---

## 🟠 HIGH — `analyserPhotos` sans limite de nombre de photos ni rate limit : burn Gemini

`analyserPhotos` (`routers.ts:6775`) construit `imageBlocks` à partir de **toutes**
les photos de l'analyse, **sans `.max()`** ni rate limit. Combiné au body parser
50 Mo global (cf. OPE-24), un artisan peut empiler de nombreuses images base64 et
lancer des analyses multimodales coûteuses en boucle (clé `GEMINI_API_KEY`
partagée dev/staging).

### Fix proposé

- Limiter le nombre de photos par analyse (ex. `max 10`) et la taille cumulée.
- Appliquer un rate limit par artisan (réutiliser `checkRateLimit`) sur
  `analyserPhotos`.

### Estimation

~30 min.

---

## Estimation totale

- BLOCKER (IDOR module analyse photos) : ~1 h
- HIGH (burn Gemini analyserPhotos) : ~30 min
