# Audit — Rate limiting & protection brute-force

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## Ce qui fonctionne correctement

- `auth.signin` / `auth.signup` : rate limit IP en mémoire, 5 tentatives / 15 min ✓
  (`server/_core/index.ts:192-219`)
- AI endpoints (MonAssistant) : 30 req/h par artisan via `checkRateLimit` ✓
- Upload logo : limite fichier 2 MB via multer ✓
- Headers de sécurité HTTP : X-Frame-Options, HSTS, nosniff ✓

---

## 🔴 BLOCKER 1 — `verifySmsCode` sans limite d'essais : OTP 6 chiffres énumérable en < 10 min

### Problème

`signature.verifySmsCode` (`server/routers.ts:2667`) est une `publicProcedure` accessible avec
uniquement le token de signature (lien envoyé au client). La fonction DB `verifySmsCode`
(`server/db.ts:1280`) ne compte jamais les tentatives échouées.

Un code OTP à 6 chiffres a 900 000 valeurs possibles. Avec une fenêtre de 10 minutes et aucune
limite d'essais, un attaquant peut soumettre ~900 000 requêtes et trouver le bon code.

```typescript
// db.ts:1280 — aucun comptage d'essais, aucun verrouillage
export async function verifySmsCode(signatureId: number, code: string): Promise<boolean> {
  const verification = await getSmsVerificationBySignature(signatureId);
  if (!verification) return false;
  if (verification.code !== code) return false;  // retourne false, c'est tout
  if (new Date() > verification.expiresAt) return false;
  await db.update(smsVerifications).set({ verified: true })...
  return true;
}
```

Scénario d'exploitation :
1. Intercepter un lien de signature (accès à l'email du client — man-in-the-middle, forward email…)
2. Appeler `requestSmsCode` pour générer un code
3. Boucler sur `verifySmsCode` avec codes 100000–999999
4. À ~1 000 req/s → max 15 min pour tout couvrir, bien dans la fenêtre de 10 min

Note : ce BLOCKER est distinct de OPE-14 (bypass total du 2FA). OPE-14 permet de signer sans OTP.
Ce BLOCKER signifie que même si OPE-14 est fixé, le 2FA reste triviallement bypassable.

### Fix

Ajouter un champ `attemptCount` à la table `sms_verifications` et verrouiller après 5 essais :

```sql
-- Migration
ALTER TABLE sms_verifications ADD COLUMN attemptCount INT NOT NULL DEFAULT 0;
```

```typescript
// db.ts — verifySmsCode renforcé
export async function verifySmsCode(signatureId: number, code: string): Promise<boolean> {
  const verification = await getSmsVerificationBySignature(signatureId);
  if (!verification) return false;
  if (new Date() > verification.expiresAt) return false;
  if (verification.verified) return false;
  if (verification.attemptCount >= 5) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Code verrouillé. Demandez un nouveau code.' });
  }
  if (verification.code !== code) {
    await db.update(smsVerifications)
      .set({ attemptCount: verification.attemptCount + 1 })
      .where(eq(smsVerifications.id, verification.id));
    return false;
  }
  await db.update(smsVerifications).set({ verified: true }).where(eq(smsVerifications.id, verification.id));
  return true;
}
```

### Estimation

~1h — migration + logique DB + test

---

## 🔴 BLOCKER 2 — `requestSmsCode` sans rate limit : SMS bombing illimité + coûts Twilio non bornés

### Problème

`signature.requestSmsCode` (`routers.ts:2605`) est une `publicProcedure` sans aucune limitation.
Accessible avec uniquement le token de signature (public dans le lien email).

Un attaquant (ou même un client malveillant) peut appeler cet endpoint en boucle :
1. **SMS bombing** : Twilio envoie un SMS à chaque appel → harcèlement du destinataire
2. **Coûts Twilio incontrôlés** : ~0,05€/SMS en France. 10 000 appels = 500€ en quelques secondes
3. **Chaque appel crée une nouvelle entrée `sms_verifications`** et écrase la précédente
   → permet à l'attaquant de régénérer le code à volonté pour contourner la fenêtre d'expiration

```typescript
// routers.ts:2605 — publicProcedure, aucune limite
requestSmsCode: publicProcedure
  .input(z.object({ token: z.string(), telephone: z.string() }))
  .mutation(async ({ input }) => {
    // Aucune vérification de fréquence d'appel
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await db.createSmsVerification({ signatureId: signature.id, telephone, code, expiresAt });
    const smsResult = await sendVerificationCode(input.telephone, code); // SMS envoyé
    ...
  })
```

### Fix

Rate limit par couple `(signatureId, IP)` avec cooldown de 60 secondes :

```typescript
// server/routers.ts — avant requestSmsCode
const smsRequestMap = new Map<string, number>(); // key: `${signatureId}-${ip}`

requestSmsCode: publicProcedure
  .input(z.object({ token: z.string(), telephone: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const signature = await db.getSignatureByToken(input.token);
    // ... validations existantes ...

    // Rate limit : 1 SMS / 60s par signature
    const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || ctx.req.socket.remoteAddress || 'unknown';
    const key = `${signature.id}-${ip}`;
    const lastRequest = smsRequestMap.get(key);
    const now = Date.now();
    if (lastRequest && now - lastRequest < 60_000) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS',
        message: 'Veuillez attendre 60 secondes avant de demander un nouveau code.' });
    }
    smsRequestMap.set(key, now);

    // Max 5 SMS totaux par signature (protection coûts)
    const existingVerifs = await db.countSmsVerifications(signature.id);
    if (existingVerifs >= 5) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS',
        message: 'Trop de demandes de code pour ce lien de signature.' });
    }
    // ... reste de la logique
  })
```

### Estimation

~1h — rate limit in-memory + compteur en DB

---

## 🟠 HIGH — `/api/voice/token` sans rate limit : burn API Gemini sans plafond

### Problème

L'endpoint `POST /api/voice/token` (`server/_core/index.ts:1099`) est protégé par auth cookie mais
**n'a aucune limite de fréquence**. Chaque appel :
1. Génère un token Gemini Live éphémère
2. Ouvre potentiellement une session Live (~coût non négligeable par session)

Un artisan ou un script scripté peut ouvrir des centaines de sessions Gemini par minute,
épuisant le quota GEMINI_API_KEY (partagé entre dev et staging d'après `.env.staging`).

### Fix

Appliquer le `checkRateLimit(artisan.id)` existant (ou un rate limit dédié plus strict) :

```typescript
// server/_core/index.ts — dans /api/voice/token
app.post('/api/voice/token', async (req, res) => {
  const artisan = await getArtisanByUserId(user.id);
  // Rate limit : max 10 sessions vocales / heure par artisan
  const voiceKey = `voice-${artisan.id}`;
  // Réutiliser checkRateLimit avec un seuil spécifique
  if (!checkVoiceRateLimit(artisan.id)) {
    return res.status(429).json({ error: 'Limite de sessions vocales atteinte (10/h)' });
  }
  ...
```

### Estimation

~30 min

---

## 🟠 HIGH — `importFromExcel` sans limite de taille d'array : DoS via boucle DB

### Problème

`clients.importFromExcel` (`routers.ts:220`) accepte `z.array(z.object({...}))` sans `.max()`.
La limite `express.json({ limit: "50mb" })` permet d'envoyer ~50 000 clients en un seul appel.

Le handler boucle sur chaque entrée avec `await dbSecure.createClientSecure(...)` — un INSERT DB
synchrone par itération, sans batching ni limite.

```typescript
// routers.ts:239
for (const clientData of input.clients) {
  await dbSecure.createClientSecure(artisan.id, clientData); // N INSERTs séquentiels
}
```

50 000 INSERTs séquentiels bloqueraient le pool de connexions MySQL pendant plusieurs minutes,
rendant l'app inopérante pour tous les artisans.

### Fix

```typescript
// Limiter à 500 clients par import
clients: z.array(z.object({...})).max(500),
```

Et idéalement passer à un INSERT batch :
```typescript
await db.insert(clients).values(input.clients.map(c => ({ artisanId: artisan.id, ...c })));
```

### Estimation

~30 min

---

## 🟠 HIGH — `express.json({ limit: "50mb" })` global : DoS par corps de requête massif

### Problème

Le body parser global (`server/_core/index.ts:158`) accepte des corps JSON jusqu'à 50MB sur
**toutes les routes**, y compris les endpoints publics (`publicProcedure` tRPC).

Exemples de routes publiques qui héritent de cette limite :
- `signature.requestSmsCode`
- `signature.verifySmsCode`
- `articles.getBibliotheque`
- `auth.signup` / `auth.signin`

La lecture d'un body 50MB sur chaque requête peut saturer la mémoire Node.js (Railway hobby,
mémoire limitée). Un attaquant peut ouvrir N connexions simultanées et envoyer des corps 50MB
pour provoquer un OOM kill.

### Fix

Réduire la limite globale à 1MB et ajouter une limite spécifique pour les routes qui en ont besoin :

```typescript
// Limite globale raisonnable
app.use(express.json({ limit: "1mb" }));

// Routes spécifiques avec limite élevée
app.use('/api/upload-logo', express.json({ limit: "10mb" }));    // logos en base64
// importFromExcel passé via tRPC JSON — limiter via Zod .max(500) sur le tableau
```

### Estimation

~30 min

---

## Estimation totale

- BLOCKER 1 (OTP brute-force) : ~1h
- BLOCKER 2 (SMS bombing) : ~1h
- HIGH (voice rate limit) : ~30 min
- HIGH (importFromExcel) : ~30 min
- HIGH (body parser 50mb) : ~30 min
