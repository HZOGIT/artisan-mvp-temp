# Benchmark/vérif — Envoi devis/facture par email (PDF joint + lien) vs Odoo : parité MVP

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification : l'envoi d'un devis/facture au client par email joint-il le **PDF** et le
> **lien de paiement** ? ↔ Odoo `account.move`/`sale.order` *Send by email* (rapport PDF en
> pièce jointe + portail).

---

## Conclusion : l'envoi par email est **au niveau MVP** (PDF joint optionnel + lien). Aucun ticket.

### ✅ PDF joint à l'email (optionnel, au choix de l'artisan)

- **Devis** (`server/routers.ts:1015-1028`) : si `input.attachPdf` → `generateDevisPDF`
  → `attachmentContent` (base64), `attachmentName = Devis_{numero}.pdf`.
- **Facture** (`:1706-1719`) : idem via `generateFacturePDF` → `Facture_{numero}.pdf`.
- Le flag `attachPdf` laisse l'artisan **choisir** de joindre le PDF ou non (souple, comme
  l'option d'Odoo *Send by email*).

### ✅ Lien de paiement / portail

- Le **lien de paiement** est présent dans l'email de facture (cf. audit
  `lien-paiement-absent-email-facture-ok`), et le **portail client** expose les
  devis/factures + signature + paiement (cf. `benchmark-portail-client-ok`).

### Compléments d'email = **déjà filés** (anti-doublon)

- **Identité expéditeur / Reply-To artisan** (le client répond à l'artisan, pas au support) :
  **OPE-157**.
- **Journal des envois / délivrabilité / reprise** : **OPE-114/115/148**.
- **Désinscription** (List-Unsubscribe) sur les emails marketing/lifecycle : **OPE-138**.
- **Échappement HTML** des champs user : corrigé (OPE-12/36/59).

---

## Verdict

L'**envoi par email** d'un devis/facture est **au niveau MVP** d'Odoo : **PDF joint
optionnel** (`attachPdf`), **lien de paiement** + **portail**. Les axes d'amélioration
(Reply-To artisan, journal/reprise d'envoi, désinscription) sont **déjà tracés**
(OPE-157/114/115/148/138). **Aucun nouveau ticket benchmark.**
