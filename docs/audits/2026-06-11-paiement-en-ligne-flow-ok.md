# Audit — Paiement en ligne (hors Connect) : flow scopé/server-derived, pas de bypass

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `generatePaymentLink` (`routers.ts:1632`), `getPayments` (`:1690`),
> `POST /api/paiement/create-checkout-session` (`index.ts:855`),
> `GET /api/paiement/status/:factureId` (`index.ts:937`), `createCheckoutSession`
> (`stripeService.ts:54`). **Hors périmètre : Stripe Connect (OPE-6).**

---

## Conclusion : montants server-derived, endpoints token-gated/scopés, confirmation par webhook. Aucun NOUVEAU BLOCKER/HIGH.

### ✅ Pas de falsification de montant

Le montant de la session Stripe vient **toujours** de la facture côté serveur, **jamais**
d'un input client :
- `generatePaymentLink` : `montantTTC: Number(facture.totalTTC)` (`:1665`).
- endpoint public : `montantTTC: parseFloat(facture.totalTTC…)` (`index.ts:895`).

→ un client ne peut pas payer un montant arbitraire (ex. 0,01 €).

### ✅ Cloisonnement / token-gating

- `generatePaymentLink` / `getPayments` (`protectedProcedure`) : `facture.artisanId !==
  artisan.id` → `FORBIDDEN`. Pas d'IDOR.
- `POST /api/paiement/create-checkout-session` (**public**) : `getClientPortalAccessByToken(token)`
  → 403 ; **scopé** `facture.clientId !== access.clientId` → 404 ; garde `statut === 'payee'`
  → 400 (pas de re-paiement). Montant server-derived.
- `GET /api/paiement/status` (**public**) : token-gated + scopé, **lecture seule** (renvoie
  `facture.statut`/`montantPaye`/…). **Ne marque rien comme payé.**

### ✅ Pas de bypass de paiement par la redirection « succès »

Le `success_url` = `${origin}/portail/${portalToken}?paiement=succes&factureId=…`
(`stripeService.ts:102`) n'est qu'un **retour UI** : le paramètre `?paiement=succes` est
contrôlable par le client mais **aucun** endpoint ne marque la facture payée sur cette base.
La facture passe à `payee` uniquement via le **webhook Stripe** (`checkout.session.completed`,
événement signé). L'endpoint `/status` ne fait que **lire** l'état mis à jour par le webhook.
→ naviguer manuellement vers `?paiement=succes` ne paie pas la facture.

Token de paiement : `crypto.randomUUID()` / `nanoid(32)` (non devinable).

### 🟡 Gaps connus — déjà filés (anti-doublon)

| Constat | Issue |
| -- | -- |
| Facture **brouillon/annulée** reste payable (pas de garde de statut « émise ») | **OPE-67** |
| `markAsPaid` marque toujours **intégralement** payé (pas de partiel) | **OPE-60** |
| Webhook : vérification de signature **fail-open** (`secret \|\| ''`) | **OPE-79** |
| Webhook : pas d'**idempotence** (re-livraison duplique) | **OPE-29** |
| Paiements arrivent sur le compte plateforme (Connect) | **OPE-6** (hors périmètre) |
| `success_url`/`cancel_url` dérivés de `req.get('host')`/`origin` (Host/Origin header) | **OPE-76** (note connexe : portail/avis/paiement) |

### 🟢 Observation LOW (sous le seuil, pas d'issue)

**Fuite de détail d'erreur** dans l'endpoint public (`index.ts:932`) : renvoie
`detail: error?.message` au client. Les cas connus sont mappés vers des messages conviviaux
(clé Stripe absente/invalide), mais le **fallback** `error?.message` peut exposer un message
Stripe/interne brut à un porteur de token portail (semi-public). **LOW** (même classe que la
fuite `/api/upload-logo` corrigée en `6984f58`). Reco (candidat auto-fix safe) : logger le
détail côté serveur, renvoyer un message générique.

---

## Verdict

Le flow de paiement en ligne (hors Connect) est **solide** : montants **server-derived**,
endpoints **token-gated et scopés**, confirmation par **webhook signé** (pas de bypass via la
redirection succès). Les vrais défauts (statut payable OPE-67, partiel OPE-60, robustesse
webhook OPE-79/29, Connect OPE-6, Host-header OPE-76) sont **déjà filés**. Une observation
**LOW** (fuite de détail d'erreur, comme upload-logo). **Pas de nouvelle issue Linear.**
