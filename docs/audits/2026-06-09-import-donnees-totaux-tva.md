# Audit — Import de données en masse (clients/devis/factures) → OPE-78

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `importClients` (`routers.ts:7821`), `importDevis` (`:7879`),
> `importFactures` (`:7946`), helper `pickField` (`:7809`), `db.createFacture`
> (`db.ts:615`). Vecteurs recherchés : IDOR cross-tenant, DoS, intégrité financière.

---

## Ce qui est correct

- **Pas d'IDOR cross-tenant** : la résolution du client est **scopée tenant** —
  `existingClients = getClientsByArtisanId(artisan.id)` puis `findClientByName` ne
  cherche que dans les clients de l'artisan (`:7888-7896`, `:7955-7963`).
  `createDevis(artisan.id, …)` / `createFacture(artisan.id, …)` forcent l'`artisanId`.
  Un client introuvable dans le tenant → ligne en erreur (pas de création silencieuse
  cross-tenant).
- **Lignes bornées** : `rows: z.array(...).max(5000)` (`:7881/7948`) → borne partielle
  (cf. OPE-24 pour le DoS résiduel).

## 🟠 HIGH trouvé → **OPE-78** (issue créée)

`importFactures` / `importDevis` ne mappent **que `totalTTC`** ; aucun `totalHT`,
`totalTVA`, `tauxTVA`, ni ligne. `createFacture` (`db.ts:615`) faisant un simple
`insert({ ...data })`, les factures importées sont stockées avec
**`totalTTC=X`, `totalHT=0`, `totalTVA=0`, sans ligne** → **document incohérent**
(TTC ≠ HT+TVA, TVA=0).

Conséquences : TVA sous-déclarée sur l'historique importé ; écritures/**FEC
déséquilibrés** (débit TTC vs crédit 0+0) ; PDF incohérent ; le tout **silencieux**
(`imported: N` en succès).

**Non subsumé par OPE-52** : même après le fix d'OPE-52 (« générer les écritures depuis
les factures »), les factures importées ont HT/TVA=0 → écritures toujours fausses. Le
défaut est **en amont** (donnée importée). Distinct aussi d'**OPE-44** (numéro, même
endpoint, autre défaut).

Fix (cf. OPE-78) : mapper/dériver HT+TVA (invariant TTC=HT+TVA), créer ≥1 ligne
récapitulative, rejeter les lignes non reconstituables, idem `importDevis`.

---

## Anti-doublon

- **OPE-44** = `importFactures` numéro non préservé (défaut distinct, même endpoint).
- **OPE-52** = écritures jamais générées (général, non subsumant — cf. ci-dessus).
- **OPE-58/53/21** = TVA/CA sur factures **créées** dans l'app, pas l'import.
→ Aucune issue ne couvre la ventilation HT/TVA + lignes à l'import → **OPE-78 créée**.

---

## Verdict

Import : **isolation tenant correcte** (pas d'IDOR), lignes bornées. Défaut bloquant :
les factures/devis importés n'ont **que le TTC** (HT/TVA/lignes absents) → documents
incohérents corrompant TVA/écritures/FEC/PDF → **OPE-78 (HIGH)**.
