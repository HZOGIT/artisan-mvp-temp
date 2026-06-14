# Audit — Transitions de statut : devis `expire` & facture `en_retard` jamais appliqués

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : transitions automatiques de statut (devis → `expire`, facture →
> `en_retard`) et application de la **date de validité** d'un devis à la
> signature. Distinct d'OPE-50 (devis signé modifiable) et OPE-14 (mécanisme OTP).

---

## 🟠 HIGH — La date de validité d'un devis n'est jamais appliquée : un devis expiré reste signable

### Problème

1. Le statut **`expire`** (enum devis `brouillon|envoye|accepte|refuse|expire`)
   n'est **défini nulle part** : `grep "'expire'"` sur le set de statut devis →
   **0 résultat**. Aucune transition automatique quand `dateValidite` passe (le
   scheduler ne traite ni `en_retard` ni `expire`).

2. **`signature.signDevis` ne vérifie pas `devis.dateValidite`** : il contrôle
   uniquement l'expiry du **token de signature** (`existing.expiresAt`, 90 j) et
   si le devis est « déjà traité » :
   ```typescript
   // routers.ts (signDevis) — checks signature token + statut, PAS dateValidite
   if (new Date() > existing.expiresAt) throw "Ce lien de signature a expiré";
   if (existing.statut === 'accepte'/'refuse') throw "déjà traité";
   // ... aucun contrôle de devis.dateValidite
   ```

### Impact

La **validité commerciale** d'un devis (typiquement 30 j — champ `dateValidite`
posé à la création) **n'est pas opposable** : un client peut **signer/accepter un
devis longtemps après son expiration** (tant que le token de signature de 90 j est
valide). Or les prix matériaux fluctuent — l'artisan se retrouve **engagé sur un
tarif périmé**. La mention « Validité du devis : 30 jours » affichée sur le PDF
n'a aucun effet réel.

### Fix proposé

1. Dans `signDevis` : refuser si `now > devis.dateValidite` →
   `BAD_REQUEST("Ce devis a expiré le …, demandez-en un nouveau")`.
2. **Job de bascule** dans le scheduler : `UPDATE devis SET statut='expire'
   WHERE statut IN ('envoye') AND dateValidite < NOW()` (pour alimenter le statut
   `expire` mort + l'affichage).

### Estimation

~0,5 j — check `dateValidite` à la signature + job de bascule + test.

---

## 🟡 MEDIUM (documenté) — Les factures ne passent jamais en `en_retard` automatiquement

Le statut **`en_retard`** existe (enum + transition manuelle `envoyee→en_retard`,
`routers.ts:1341`) mais **n'est jamais positionné automatiquement** quand
`dateEcheance` passe (le scheduler ne le fait pas ; seul un `update` manuel le
permet).

Atténuation : le total « factures impayées » du dashboard compte
`statut NOT IN ('payee','annulee','brouillon')`, donc une facture `envoyee`
échue **est comptée comme impayée** ; et `generateOverdueReminders` calcule le
retard depuis `dateEcheance` directement. Mais :
- Toute vue/filtre/badge reposant sur `statut='en_retard'` reste **vide**.
- Le déclenchement de **pénalités de retard** (légalement liées au dépassement
  d'échéance) ne peut pas s'appuyer sur ce statut.

**Fix** : job scheduler `UPDATE factures SET statut='en_retard' WHERE statut IN
('envoyee','validee') AND dateEcheance < NOW()`.

---

## Estimation totale

- HIGH (validité devis non appliquée + statut `expire` mort) : ~0,5 j
- MEDIUM (facture `en_retard` non auto) : ~2 h
