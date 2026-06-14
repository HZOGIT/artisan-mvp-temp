# Benchmark/QA — Signature électronique des devis : correctness du flux ✅ (cœur sain ; tous les écarts DÉJÀ filés)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe correctness/sécurité d'un flux légal) · **Domaine** : Signature électronique devis (`signatures_devis` + `sms_verifications` ↔ Odoo `sign`)

> Vérification du flux de **signature électronique** (un devis signé = contrat opposable). Vecteurs : sécurité du token, vérification OTP SMS, anti-rejeu/immutabilité, horodatage + IP probants, expiration. **Anti-doublon effectué** : le domaine est **déjà couvert exhaustivement** par des tickets existants ; cette note documente la vérification, **aucun nouveau ticket**.

---

## ✅ Cœur du flux « signature simple » — correct

`signature.signDevis` (`routers.ts:3217`) + `db.signDevis` (`db.ts`) :
- **Token-gated** : `getSignatureByToken(token)` ; token inconnu → 404 (`:3228`).
- **Anti-rejeu / immutabilité d'état** : `existing.statut !== 'en_attente'` → **400 « déjà traité »** (`:3231`) → pas de double-signature.
- **Expiration** : `new Date() > existing.expiresAt` → 400 (`:3234`).
- **Horodatage + IP probants (OPE-80)** : `signedAt` posé serveur ; `ipAddress` priorise **`cf-connecting-ip`** (posé par Cloudflare, non falsifiable) sur `x-forwarded-for[0]` (usurpable) (`:3242`) ; `userAgent` capturé. IP tronquée à une seule valeur (évite dépassement `varchar(45)`).
- **Bornes** : `signatureData` ≤ 500 Ko, `signataireName` ≤ 200, `signataireEmail` `.email()` ≤ 320.
- **Échappement** : l'email de notification à l'artisan échappe `signataireName`/`Email` (`safeHtml`, OPE-59).

→ Pour une signature **« simple »** (eIDAS niveau 1 : token email + tracé manuscrit + identité déclarée + IP/UA/horodatage + anti-rejeu), le flux est **cohérent et robuste**.

## ✅ OTP SMS — endpoints **durcis** dans le code (cartes en retard)

Les endpoints OTP existent et sont **déjà sécurisés** (les correctifs sont en place, indépendamment de l'état des cartes) :
- `requestSmsCode` (`:3107`) : **rate-limit** `checkSmsSendRate` (**OPE-23**), validation téléphone, **OTP crypto** `randomInt(100000,1000000)` (**OPE-18**), expiration 10 min.
- `verifySmsCode` (`:3174`) : **throttle anti brute-force** `checkSmsVerifyRate` (10/15 min, **OPE-22**).

→ **OPE-18 / OPE-22 / OPE-23 apparaissent REMÉDIÉS en code** (throttle + rate-limit + RNG crypto présents). À vérifier humainement pour **clôture éventuelle** des cartes (actuellement Backlog/In Review).

## 🔴 Écarts connus — TOUS déjà filés (pas de doublon)

| Écart vérifié | Statut code | Ticket |
|---|---|---|
| `signDevis` ne vérifie **pas** `smsVerified` côté serveur (2FA contournable) ; input booléen client **inutilisé** ; flux SMS **non câblé** au front (`SignatureDevis.tsx` n'appelle aucun endpoint SMS) | **non corrigé** | <issue href="https://linear.app/operioz/issue/OPE-14">OPE-14</issue> (BLOCKER, Lancement 30 juin) |
| `requestSmsCode` renvoie `devCode` en clair si Twilio absent (`:3168`) → bypass OTP | **non corrigé** (Twilio absent des envs) | <issue href="https://linear.app/operioz/issue/OPE-15">OPE-15</issue> (BLOCKER) |
| Pas de **hash du document signé** ni d'identité vérifiée → valeur probante faible | non corrigé | <issue href="https://linear.app/operioz/issue/OPE-55">OPE-55</issue> (HIGH) |
| Devis **signé reste modifiable/supprimable** (immutabilité non garantie) | non corrigé | <issue href="https://linear.app/operioz/issue/OPE-50">OPE-50</issue> (HIGH) |
| **Date de validité jamais appliquée** → devis expiré reste signable | non corrigé | <issue href="https://linear.app/operioz/issue/OPE-61">OPE-61</issue> (HIGH) |

## Odoo 19

Le module `sign` d'Odoo gère des signataires avec **vérification SMS/email**, un **hash du document** scellé, un journal d'audit (IP/horodatage/identité) et l'**immutabilité** du document signé. Operioz couvre le **socle** (token + tracé + IP/UA/horodatage + anti-rejeu) ; l'**élévation** (OTP réellement enforced — OPE-14 ; hash document — OPE-55 ; immutabilité — OPE-50) est déjà **tracée**, pas encore livrée.

---

## Verdict

Le **cœur** du flux de signature « simple » est **correct** (token-gated, **anti-rejeu** par statut, expiration, **IP/UA/horodatage probants OPE-80**, bornes, échappement email). Les endpoints OTP sont **durcis en code** (OPE-18/22/23 ⇒ candidats à clôture). Les écarts restants (2FA non enforced, devCode en clair, hash document, immutabilité, validité) sont **tous déjà filés** (OPE-14/15/55/50/61, majoritairement en « Lancement 30 juin »). **Aucun nouveau ticket** (anti-doublon). Note actionnable : **vérifier/clôturer OPE-18/22/23** dont les correctifs semblent déjà déployés.
