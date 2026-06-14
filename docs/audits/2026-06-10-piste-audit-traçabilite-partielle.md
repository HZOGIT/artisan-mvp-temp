# Audit — Piste d'audit / traçabilité des opérations financières (partielle)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> Périmètre : table `audit_log` (`schema.ts:1636`), `createAuditLog` / `getAuditLogsByEntity`
> (`db.ts:713-718`), sites d'appel (`routers.ts`).

---

## Constat : audit trail présent sur les factures, mais lacunaire ailleurs

### Ce qui est bien

- **L'entité la plus sensible (facture) est tracée** : les **7** appels `createAuditLog`
  portent tous `entityType: "facture"` (création, paiement/markAsPaid, envoi… —
  `routers.ts:1293/1367/1396/1483/1597/1798/1810`), avec `userId`, `artisanId`, `action`,
  `details`, `createdAt`.
- **Append-only au niveau applicatif** : `grep update(auditLog)|delete(auditLog)` =
  **0** → le code n'altère ni ne supprime jamais une entrée. `getAuditLogsByEntity`
  permet de relire l'historique d'une facture.

### Lacunes (traçabilité incomplète)

- **Seules les factures** sont journalisées. **Aucune** entrée pour : **devis**
  (création/modif/suppression/conversion), **clients** (création/**suppression** — qui
  « casse » des factures, cf. issue déjà filée), **paiements**, **avoirs**, **contrats**,
  interventions. → impossible de reconstituer « qui a fait quoi » sur ces entités
  (forensics, litiges, détection de fraude interne).
- **Pas d'inaltérabilité au niveau DB** : `audit_log` est une table ordinaire (pas de
  chaînage de hash, pas d'append-only forcé) → un bug/accès admin pourrait l'altérer sans
  trace.

### Cadrage légal (pour éviter la sur-sévérité)

L'exigence stricte d'**inaltérabilité certifiée (NF525)** de la loi anti-fraude TVA vise
les **logiciels/systèmes de caisse** (encaissement B2C), **pas** un logiciel de
**facturation** général. Operioz émet devis/factures (pas une caisse) → la **« piste
d'audit fiable » (PAF)** organisationnelle suffit. Donc **pas de blocage légal dur** ;
c'est une **bonne pratique de traçabilité** à compléter. → **MEDIUM**, sous le seuil
BLOCKER/HIGH.

---

## Distinction (anti-doublon)

- **OPE-13 (observabilité)** = erreurs/monitoring, pas la **traçabilité métier**.
  Complémentaire.
- Les issues d'**immutabilité** (devis modifiable post-signature, lifecycle facture) =
  empêcher la **modification**, pas **journaliser** les actions. Complémentaire.
- Aucune issue ne couvre la **complétude de l'audit trail**. → à rattacher (pas de
  doublon).

---

## Reco

- Étendre `createAuditLog` aux mutations **devis**, **client (surtout suppression)**,
  **paiement**, **avoir**, **contrat** (create/update/delete + transitions de statut).
- Optionnel (durcissement PAF) : champ `hashPrecedent` (chaînage) ou export signé
  périodique pour rendre l'altération détectable.
- Brancher la lecture sur une vue « Historique » par entité (le getter existe déjà).

---

## Verdict

L'**audit trail existe sur les factures** (entité critique) et est **append-only
applicatif**, mais **ne couvre pas** devis/clients/paiements/avoirs et n'est pas
inaltérable au niveau DB. Pour un logiciel de **facturation** (≠ caisse), c'est une
**lacune de traçabilité MEDIUM** (PAF à compléter), **pas un blocage légal dur**. **Pas de
nouvelle issue Linear** ; à compléter avant/peu après lancement.
