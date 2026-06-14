# Audit — Import ERP (clients / devis / factures) — sécurité OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `importRouter` (`routers.ts:7829-8020`) — `importClients`, `importDevis`,
> `importFactures` ; helper `pickField` (`:7816`).

---

## Conclusion : import cloisonné tenant, pas d'IDOR ni d'injection. Pas de BLOCKER/HIGH **nouveau**.

### Isolation multi-tenant correcte (aucun IDOR)

- `importClients` → `createClient(artisan.id, …)`, dédoublonnage sur
  `getClientsByArtisanId(artisan.id)` (`:7839`). Scoped.
- `importDevis` / `importFactures` → le client est résolu **par nom** via
  `findClientByName` qui n'itère **que** `existingClients = getClientsByArtisanId(artisan.id)`
  (`:7897`, `:7964`) → **impossible de rattacher un devis/facture au client d'un autre
  tenant**. Puis `createDevis(artisan.id, …)` / `createFacture(artisan.id, …)` scoped.
- `artisan` toujours dérivé de `getArtisanByUserId(ctx.user.id)` — jamais de l'input.

### Pas de mass-assignment ni d'injection

- Les champs sont **extraits un par un** via `pickField` (pas de spread de la `row` brute
  dans `createClient/Devis/Facture`) → un attaquant ne peut pas injecter `artisanId`,
  `id`, `statut` arbitraire hors des clés mappées explicitement.
- `pickField` fait `String(v).trim()` → pas d'injection d'objet/prototype ; le SQL en aval
  est paramétré (Drizzle/`?`).
- Entrée bornée : `rows: z.array(...).max(5000)`, `mapping` typé `record<string,string>`.

### Paywall / auth

- `protectedProcedure` sur `/api/trpc`, **non whitelisté** par `subscriptionGuard` → un
  tenant expiré est bloqué (402). OK.

---

## Écarts = de l'intégrité comptable, **déjà tracés** (anti-doublon → pas de nouvelle issue)

1. `importDevis`/`importFactures` n'importent **que `totalTTC`** (ni HT, ni TVA, ni
   lignes) → `TTC ≠ HT+TVA`, TVA=0 → **déjà filé** (« Import factures/devis : seul
   totalTTC est importé »).
2. `createDevis`/`createFacture` **régénèrent un `numero`** (l'import ne passe pas le
   numéro d'origine, `:7937`/`:8002`) → re-numérotation de l'historique → **déjà filé**
   (« Import factures : numéro d'origine non préservé »).
3. `importFactures` accepte `statut='payee'` + `datePaiement` mais **ne génère pas
   d'écritures comptables** ni de `paiement` → facture « payée » absente de
   Balance/Journal → relève de **« écritures comptables jamais générées »** (déjà filé).
4. Pas de rate-limit dédié sur ces imports (jusqu'à 5000 INSERT/appel) → classe de
   **« importFromExcel DoS / body 50MB »** (déjà filé, rate-limiting).

---

## Réserve mineure (non bloquante)

- `statut` et les dates (`new Date(str)`) ne sont **pas validés** (`as any`) : une valeur
  d'enum invalide / `Invalid Date` est rattrapée **par ligne** (`errors++`,
  `errorDetails`) → robustesse correcte, pas de crash global, pas de sécurité.

---

## Verdict

Import ERP : **scopé `artisan.id`** (clients/devis/factures), résolution client
**intra-tenant par nom**, **pas de mass-assignment** (extraction champ par champ),
entrées bornées, gardé par le paywall. Les seuls écarts sont d'**intégrité comptable** et
**tous déjà filés**. **Pas de nouvelle issue Linear.**
