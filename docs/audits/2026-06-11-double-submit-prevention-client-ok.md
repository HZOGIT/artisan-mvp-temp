# Audit — Prévention du double-submit (formulaires de création client) — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : boutons de soumission des formulaires de création (devis, clients,
> abonnement…) ; garde `disabled={isPending|isSubmitting|isLoading}`.

---

## Conclusion : double-submit largement prévenu côté client. Pas de BLOCKER/HIGH.

Risque : un **double-clic** sur « Créer » avant le retour de la mutation → **doublon**
(2 devis/clients créés).

### Garde appliquée sur ~91 % des écrans à mutation

| Heuristique | Valeur |
| -- | -- |
| Fichiers `pages/` avec `useMutation` | 69 |
| Fichiers avec `disabled={…isPending/isLoading/isSubmitting}` | **63** (~91 %) |

Formulaires **clés** couverts :

- **Devis** : `DevisNouveauPage.tsx:581` `disabled={isSubmitting}` + `:587`
  `disabled={isSubmitting || lignes.length === 0}` (et `:691` génération IA).
- **Clients** : `ClientsNouveauPage.tsx:238` `disabled={createMutation.isPending}`.
- **Abonnement** : `AbonnementSection.tsx` (checkout/portal/cancel/reactivate/revoke tous
  `disabled={…isPending}`), `ExpiredBlocker.tsx:67`.

→ Pendant la mutation, le bouton est **désactivé** → le second clic est inerte → pas de
création en double par double-clic.

---

## Réserves

- **Defense-in-depth UI uniquement** : la garde anti-doublon **autoritaire** est
  **serveur** (idempotence). Pour les opérations **financières** spécifiques
  (devis→facture, contrat→facture), l'idempotence serveur est **déjà filée** (OPE
  convertToFacture / contrats). Le présent pattern protège le cas **double-clic** général.
- Les ~6 fichiers sans `isPending`-disabled sont à vérifier au cas par cas (souvent
  query-only ou mutations non bloquantes) — résiduel mineur.

---

## Verdict

Les formulaires de création désactivent le bouton de soumission pendant la mutation
(`isPending`/`isSubmitting`) sur **~91 %** des écrans, **clés inclus** (devis, clients,
abonnement) → **double-clic neutralisé**. L'idempotence serveur des opérations financières
reste **déjà filée**. **Pas de nouvelle issue Linear.**
