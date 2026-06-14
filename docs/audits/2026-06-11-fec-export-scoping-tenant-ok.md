# Audit — Export FEC : cloisonnement tenant — OK (format = déjà filé)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `/api/comptabilite/fec` (`index.ts:546-590`) — génération du Fichier des
> Écritures Comptables.

---

## Conclusion : FEC scopé au tenant authentifié. Pas de fuite cross-tenant. Pas de BLOCKER/HIGH.

Enjeu critique : le FEC est l'**export comptable complet** (toutes les écritures de
vente). Une fuite cross-tenant = divulgation du CA + clients d'un autre artisan = BLOCKER.

### Scoping correct

```typescript
const artisan = await authFromCookie(req, res);             // tenant authentifié
const allFactures = await getFacturesByArtisanId(artisan.id); // SES factures uniquement
const factures = allFactures.filter(… date range, statut …);
for (const facture of factures) {
  const client = await getClientById(facture.clientId);     // client d'une facture déjà scopée
  …génère les lignes 411000/701000/445710…
}
```

→ Seules les factures de **`artisan.id`** alimentent le FEC. Le `clientId` provient d'une
facture **déjà scopée** au tenant → le `getClientById` (non scopé) ne lit qu'un client
**appartenant** à l'artisan. **Aucune** fuite cross-tenant.

(Endpoint sous `authFromCookie` — paywall hors-tRPC = **OPE-81 déjà filé** ; ici on vérifie
le **cloisonnement**, qui est correct.)

---

## Défauts = format/conformité, déjà filés (anti-doublon)

- **FEC généré depuis `factures`** (pas depuis `ecritures_comptables`) → cohérent en soi,
  mais la **déclaration TVA** lit `ecritures_comptables` (non générées) → incohérence =
  **OPE-52** (déjà filé).
- **`ValidDate` vide** (`validDate` calculé `:577` mais **non inséré** dans la ligne) +
  placement colonnes / `EUR` → **FEC non conforme** = **déjà filé**.

→ Hors périmètre de ce contrôle (qui porte sur le **cloisonnement**).

---

## Verdict

L'export FEC ne contient que les écritures du **tenant authentifié**
(`getFacturesByArtisanId(artisan.id)`, client dérivé d'une facture scopée) → **pas de fuite
cross-tenant**. Les non-conformités de **format** (ValidDate, colonnes) et de **source**
(factures vs écritures) sont **déjà filées**. **Pas de nouvelle issue Linear.**
