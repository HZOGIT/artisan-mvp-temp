# Audit — `/api/voice/tool` : exécution d'outils IA (envoi d'emails + création de documents) SANS rate-limit

**Date** : 2026-06-12 · **Sévérité** : 🟠 **HIGH** · **Projet** : Lancement 30 juin
**Domaine audité** : Assistant vocal / endpoints Voice (`server/_core/index.ts`)

---

## Résumé

L'endpoint **`POST /api/voice/tool`** (`server/_core/index.ts:1368`) exécute n'importe quel
outil de l'assistant IA (`executeTool`) pour le compte de l'artisan authentifié — y compris des
outils qui **envoient des emails** et **créent des documents** — **sans aucune limite de
fréquence**. Un utilisateur authentifié (ou un client bogué en boucle de retry, ou une session
détournée) peut appeler cet endpoint **en boucle directe** et déclencher un **envoi d'emails
non borné** + de la création de documents, court-circuitant le rythme conversationnel de Gemini.

## Preuve dans le code

`/api/voice/tool` — **pas de `checkRateLimit`** :

```
server/_core/index.ts:1368  app.post('/api/voice/tool', async (req, res) => {
  :1371   const user = await getUserFromRequest(req);        // ✅ auth
  :1375   const artisan = await getArtisanByUserId(user.id); // ✅ tenant dérivé de la session
  :1378   const { name, args } = req.body || {};
  :1382   const result = await executeTool(name, args || {}, { artisanId: artisan.id });
```

Asymétrie : les **deux seuls** `checkRateLimit` du fichier protègent l'assistant **texte** et le
**token vocal**, **pas** `/api/voice/tool` :

```
server/_core/index.ts:1002   if (!checkRateLimit(artisan.id)) { ... }   // assistant texte (SSE)
server/_core/index.ts:1228   if (!checkRateLimit(artisan.id)) { ... }   // POST /api/voice/token
```

Les outils exposés incluent des actions à **effet de bord externe coûteux**, qui appellent
`sendEmail(...)` **sans garde interne** (ni rate-limit, ni idempotence) :

- `envoyer_facture` (`assistantTools.ts:1059` → `sendEmail` `:1029`)
- `envoyer_devis` (`:876` → `sendEmail` `:848`)
- `creer_et_envoyer_devis` (`:893`)
- `envoyer_relance` (`:1076` → `sendEmail` `:1118`)
- `envoyer_commande_fournisseur` (`:1348` → `sendEmail` `:1402`)
- + créations : `creer_devis`, `creer_facture`, `creer_intervention`, `creer_client`,
  `creer_commande_fournisseur` (numérotation, notifications…).

## Impact

- **Spam d'emails / coût Resend non borné** : une boucle sur `envoyer_facture`/`envoyer_relance`
  envoie des emails en masse aux clients de l'artisan → **réputation d'expéditeur dégradée**
  (bounce/complaint → tous les emails transactionnels de la plateforme en pâtissent), coût.
- **Création de documents en masse** (devis/factures/clients) → pollution des données,
  consommation de numéros, notifications en rafale.
- **Charge serveur/DB** non bornée sur un endpoint authentifié.

Le tenant est correctement dérivé de la session (`artisanId` **non** pris du body) → **pas
d'IDOR cross-tenant** ici ; le défaut est strictement l'**absence de borne**.

## Sévérité : HIGH (pas BLOCKER)

Nécessite un **compte artisan authentifié** (pas anonyme), donc pas un BLOCKER d'ouverture.
Mais l'**email sortant non borné** depuis un seul endpoint est un risque **coût + délivrabilité
+ réputation** réel et facile à déclencher (y compris accidentellement par un retry client) —
**à corriger avant le 30 juin**.

## Fix proposé

Aligner `/api/voice/tool` sur les autres points d'entrée IA — **bucket de rate-limit
par tenant**, behavior-preserving (un usage vocal normal est très en deçà) :

```ts
// après résolution de l'artisan, avant executeTool :
if (!checkRateLimit(artisan.id)) {
  res.status(429).json({ result: { ok: false, error: 'Trop de requêtes. Réessayez dans un instant.' } });
  return;
}
```

`checkRateLimit` est déjà importé dans `index.ts` (`:9`) et partagé avec voice/token + assistant
texte → correctif minimal, additif, faible blast radius (candidat **auto-fix safe**).

> **Renforcement complémentaire (séparé)** : les outils d'envoi (`envoyer_*`) gagneraient une
> **garde d'idempotence** (ne pas ré-envoyer le même devis/facture deux fois en quelques
> secondes). À traiter à part — le rate-limit ci-dessus suffit à fermer l'abus principal.

## Anti-doublon

- **OPE-24** (rate-limiting manquant) cible `voice/**token**`, `importFromExcel`, `body 50 Mo` —
  **pas** `/api/voice/tool`. Endpoint distinct.
- **OPE-81** (paywall : `subscriptionGuard` ne couvre que `/api/trpc`, donc IA/voice gratuits hors
  abonnement) = problème **d'abonnement**, orthogonal au **rate-limit** ; un abonné légitime peut
  toujours abuser de l'endpoint. Complémentaire, non doublon.
- **OPE-23** = `requestSmsCode` (SMS bombing Twilio), autre endpoint.
