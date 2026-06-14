# Audit — Point d'entrée public de signature (`getDevisForSignature`) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `signature.getDevisForSignature` (`routers.ts:2575`, publicProcedure)
> + génération du token de signature (`createSignatureLink`, `:2501`). Mécanique
> OTP/SMS couverte par OPE-14/15/18/22/23.

---

## Conclusion : entrée de signature saine. Pas de BLOCKER/HIGH nouveau.

### Token de signature — fort, non énumérable

```typescript
// routers.ts:2501 createSignatureLink
const token = crypto.randomUUID().replace(/-/g, '')
  + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
```

→ **deux UUID v4 concaténés (~256 bits aléatoires)** → impossible à deviner /
énumérer. Pas de fuite cross-devis/PII par brute-force du token (contraste avec un
risque qui aurait existé si le token était court/Math.random).

### Expiration appliquée

`getDevisForSignature` rejette si `now > signature.expiresAt` **et** statut encore
`en_attente` (`:2583`) → un lien périmé non signé n'ouvre rien. Un devis déjà
signé reste consultable (normal).

### Données renvoyées — légitimes pour le signataire

Le porteur du token est le **client signataire** (lien envoyé par email/portail).
La réponse `{ devis, artisan, client, lignes, signature }` contient :
- **son propre** devis + ses lignes + son enregistrement `client` (sa PII) ;
- l'`artisan` (dont **`iban`/`siret`/`numeroTVA`**) — informations **destinées à
  être communiquées** au client pour le paiement (déjà présentes sur le PDF de
  devis/facture). Pas une fuite.

---

## Réserve (mineure, cleanliness) — objets DB bruts renvoyés

`getDevisForSignature` renvoie les **lignes DB complètes** (`getArtisanById` /
`getClientById` / `signature`) sans projection → exposition de quelques champs
internes inutiles (ex. `artisan.userId`, FK internes, `signature.token`/statut).
**Sans valeur exploitable** (pas de secret), mais bonne pratique : ne renvoyer que
les champs nécessaires à la page de signature (comme le fait `clientPortal.
verifyAccess`). Pas d'issue.

## Déjà tracé

- OTP `Math.floor(100000 + Math.random()*900000)` (`:2631`) → **OPE-18**.
- `devCode` renvoyé en clair si Twilio absent (`:2662`) → **OPE-15**.
- `requestSmsCode`/`verifySmsCode` rate limit / brute-force → **OPE-22/23**.
- `smsVerified` non vérifié serveur → **OPE-14**.

---

## Verdict

Point d'entrée public de signature **sain** : token 256 bits (non énumérable),
expiration appliquée, données limitées à ce à quoi le signataire a droit. Réserve
purement cosmétique (projeter les champs). Toute la mécanique OTP est déjà tracée
(OPE-14/15/18/22/23). **Pas de nouvelle issue Linear.**
