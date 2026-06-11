# Audit — Endpoints d'export / téléchargement PDF : cloisonnement OK (1 réserve LOW)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : tous les `app.get` de téléchargement dans `server/_core/index.ts` —
> PDF mono-document (devis/facture portail, contrat, bon de commande, Factur-X) +
> exports compta en lot (FEC, CSV, PDF-lot, Factur-X-lot).

---

## Conclusion : **toute** la surface d'export est correctement authentifiée et scopée par tenant/client. Aucun IDOR, aucune fuite cross-tenant. Aucun BLOCKER/HIGH. 1 réserve **LOW** (re-check `actif`).

### ✅ PDF mono-document authentifiés — ownership `artisanId` vérifiée

| Endpoint | Garde |
| -- | -- |
| `/api/contrats/:id/pdf` (`:506`) | JWT → `contrat.artisanId !== artisan.id` ⇒ **403** |
| `/api/commandes-fournisseurs/:id/pdf` (`:539`) | JWT → `commande.artisanId !== artisan.id` ⇒ **403** |
| `/api/comptabilite/facturx/:factureId` (`:678`) | `authFromCookie` → `facture.artisanId !== artisan.id` ⇒ **404** |
| `/api/comptabilite/facturx-xml/:factureId` (`:706`) | idem ⇒ **404** |

→ un id d'un autre tenant renvoie 403/404 ; **pas d'IDOR**.

### ✅ PDF du portail client — scoping par `access.clientId`

`/api/portail/:token/devis/:id/pdf` (`:453`) et `/factures/:id/pdf` (`:479`) :
résolvent l'`access` via `getClientPortalAccessByToken` (**token + `isActive` + `expiresAt`
forcés en DB**, cf. audit portail) puis vérifient **`devis.clientId !== access.clientId`** /
**`facture.clientId !== access.clientId`** ⇒ **404**. Un porteur de token **ne peut pas**
télécharger le PDF d'un autre client en changeant `:id`. **Pas d'IDOR.**

### ✅ Exports compta en lot — scope `artisan.id`

`/api/comptabilite/fec` (`:605`, generateur `genererFEC`), `/export-csv` (`:638`),
`/export-pdf-lot` (`:780`), `/export-facturx-lot` (`:734`) : tous font
`authFromCookie(req,res)` puis `getFacturesByArtisanId(artisan.id)` → **uniquement** les
documents du tenant connecté. **Pas de fuite cross-tenant.**

---

## 🟡 Réserve LOW — `actif` non revérifié sur les endpoints à JWT manuel

`/api/contrats/:id/pdf` (`:506`) et `/api/commandes-fournisseurs/:id/pdf` (`:539`)
décodent le JWT **à la main** (`jwtVerify` → `payload.userId` → `getArtisanByUserId`)
**sans** repasser par `getUserFromRequest`/`authFromCookie` (qui, eux, bloquent un user
`actif === false`). → un utilisateur **désactivé** dont le JWT n'a pas expiré pourrait
encore télécharger les PDF **de son propre artisan**. **Pas de cross-tenant**, blast radius
limité aux 2 endpoints PDF, et c'est la **même classe qu'OPE-32** (JWT non révocable). →
**LOW**, sous le seuil. Reco (durcissement) : router ces 2 endpoints via `authFromCookie`
comme les endpoints compta (recheck `actif` + permissions).

---

## Verdict

La **surface d'export/téléchargement** (PDF mono-doc, PDF portail, exports compta en lot)
est **entièrement cloisonnée** : ownership `artisanId` sur les docs authentifiés, scope
`access.clientId` sur le portail, scope `artisan.id` sur les exports en lot. **Aucun IDOR,
aucune fuite cross-tenant, aucun endpoint sans auth.** Seule réserve **LOW** : 2 endpoints PDF
à JWT manuel ne revérifient pas `actif` (classe **OPE-32**). **Pas de nouvelle issue Linear.**
