# Audit — Valeur probante de la signature électronique

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : ce qui est **capturé comme preuve** lors de la signature d'un devis
> (`signaturesDevis`, `signature.signDevis`). Distinct d'OPE-14/15/22/23
> (mécanisme OTP) et d'OPE-50 (devis signé modifiable) — mais **se cumule** avec
> OPE-50.

---

## Ce qui est capturé (correct)

`signatures_devis` + `signDevis` enregistrent : `signatureData` (image base64 de
la signature manuscrite), `signataireName`, `signataireEmail`, `ipAddress`,
`userAgent`, `signedAt` (horodatage). C'est un socle raisonnable pour une
**signature électronique simple**. ✓

---

## 🟠 HIGH — Aucune preuve du document signé ni vérification d'identité : valeur probante faible

### 1. Pas de hash ni de copie du document signé

Le schéma `signatures_devis` ne contient **aucun champ** pour un **hash
cryptographique** (ni une copie figée) du **devis tel qu'il était au moment de la
signature**. On enregistre l'image de la signature, mais **pas ce sur quoi elle
porte**.

Conséquence : impossible de prouver **quel contenu** (lignes, montants) le client
a réellement accepté. Et combiné à **OPE-50** (le devis signé reste modifiable),
le contenu peut **changer après coup sans aucune trace** — la signature ne
« scelle » rien.

### 2. Identité du signataire auto-déclarée

`signataireName` / `signataireEmail` proviennent de l'**input** (le signataire les
saisit). La seule vérification possible (OTP SMS) **n'est pas appliquée**
(cf. OPE-14 : `smsVerified` non vérifié côté serveur). L'identité du signataire
n'est donc **pas vérifiée** — n'importe qui avec le lien peut signer en saisissant
un nom/email arbitraires.

### 3. Pas de trace de consentement explicite

Aucun champ n'enregistre le **consentement explicite** (case « j'accepte le devis
n° X de Y € », texte exact présenté, version des CGV acceptées).

### Impact

La fonctionnalité « signature électronique » est vendue comme un engagement
contractuel, mais l'ensemble probatoire est faible : en cas de litige, l'artisan
ne peut prouver ni **ce qui** a été signé (pas de hash, doc mutable) ni **qui** a
signé (identité non vérifiée). Le devis « signé » a une valeur juridique fragile.

### Fix proposé

1. **Sceller le document** : à la signature, calculer et stocker le **SHA-256 du
   PDF/contenu** signé (et idéalement archiver le PDF figé). Toute régénération
   doit pouvoir être comparée au hash.
2. **Verrouiller le devis** après signature (cf. OPE-50) pour que le hash reste
   valable.
3. **Vérifier l'identité** : rendre l'OTP SMS obligatoire (cf. OPE-14) avant de
   valider la signature ; lier le numéro vérifié au signataire.
4. **Enregistrer le consentement** : texte exact présenté + horodatage + version
   CGV.

### Estimation

~1 j — champ `documentHash` + capture à la signature + verrouillage (OPE-50) +
consentement + test (régénération == hash, OTP requis).

---

## Estimation totale

- HIGH (valeur probante signature : hash + identité + consentement) : ~1 j
