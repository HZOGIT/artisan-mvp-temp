# Audit — `clientId` non validé à la création → fuite PII cross-tenant (systémique) — relève d'OPE-25

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Relève d'**OPE-25** (`contrats.create` clientId non vérifié). Cet audit **précise
> un vecteur d'exfiltration plus direct** et **généralise** le constat. Étendu par
> commentaire, pas de nouvelle issue.

---

## Vecteur d'exfiltration PII plus direct que celui décrit dans OPE-25

OPE-25 décrit la fuite via `generateFacture`. En réalité **`contrats.getById`
suffit** et renvoie **plus** que la facture :

```typescript
// routers.ts:4251 getById — vérifie que le CONTRAT appartient à l'appelant (OK)…
if (!artisan || contrat.artisanId !== artisan.id) throw FORBIDDEN;
// …puis enrichit avec le client SANS scope :
const client = await db.getClientById(contrat.clientId);   // ← getClientById = ligne COMPLÈTE
return { ...contrat, client, facturesRecurrentes };
```

`getClientById(id)` (`db.ts`) renvoie **toute la ligne `clients`** (nom, prénom,
email, téléphone, adresse, CP, ville…). Comme `contrats.create` accepte un
`clientId` arbitraire, l'exploit est :

1. `contrats.create({ clientId: N, ... })` — N = id d'un client d'un **autre**
   tenant (énumérable) ; le contrat est créé sous l'`artisanId` de l'attaquant.
2. `contrats.getById(contratId)` → `{ client: <ligne complète du client N> }`.
3. Itérer N = 1..∞ → **dump de la base clients (PII) de tous les tenants**.

→ Violation de confidentialité multi-tenant / **RGPD** (Art. 32/33). Plus grave
et plus simple que le chemin `generateFacture` cité dans OPE-25.

## Constat systémique (au-delà des contrats)

Le **même schéma** (FK `clientId` non validée à la création) existe ailleurs :

- **`chantiers.create`** (`routers.ts:6299`) : `clientId` inséré sans
  `getClientByIdSecure` (moins de fuite directe — `chantiers.getById` ne renvoie
  pas le client — mais incohérence + vecteur potentiel via d'autres lectures).
- **`devisIA.genererDevis` → `creerDevisDepuisAnalyseIA`** : `clientId` non validé
  (déjà noté dans l'extension d'**OPE-30**) ; un devis créé avec un `clientId`
  étranger fuiterait via `devis.getById`/`generatePDF` (qui font
  `getClientById(devis.clientId)` non scopé).

**Amplificateur** : ~40 lectures `getClientById(X.clientId)` **non scopées** dans
`routers.ts` (PDF, getById, emails). Elles sont sûres tant que `X.clientId` a été
validé à la création — mais **toute** création acceptant un `clientId` non vérifié
les transforme en read-back PII.

## Fix recommandé (à ajouter à OPE-25)

1. **Valider `clientId` sur TOUTES les créations** liées à un client
   (`getClientByIdSecure(clientId, artisan.id)`) : `contrats.create`,
   `chantiers.create`, `creerDevisDepuisAnalyseIA`, et toute future création.
2. **Défense en profondeur** : remplacer les enrichissements
   `getClientById(X.clientId)` par `getClientByIdSecure(X.clientId, artisan.id)`
   (renvoie null si incohérent) → neutralise le read-back même si une création
   laisse passer un `clientId` étranger.

---

## Conclusion

La faille de fond est **OPE-25** ; cet audit ajoute (a) le vecteur d'exfil direct
`contrats.getById` (dump PII complet par énumération), et (b) le caractère
**systémique** (autres créations + lectures `getClientById` non scopées).
→ **OPE-25 étendu par commentaire**, pas de nouvelle issue.
