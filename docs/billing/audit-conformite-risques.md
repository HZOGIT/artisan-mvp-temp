# OPE-302 — Conformité & risques d'un billing maison (SCA/3DS, PCI, mandats, TVA)

> Audit. Question centrale : **que nous épargne Stripe Subscriptions aujourd'hui**, et
> **qu'aurait-on à réinternaliser** si on pilotait les prélèvements nous-mêmes (off-session) ?
> Distinguer ce qui reste **délégable à Stripe Payments** (sans Subscriptions) de ce qui
> devient **notre responsabilité**. Repères de code : `audit-existant.md` (OPE-300).

## 0. Synthèse — qui porte quoi selon l'option

| Obligation | Stripe Subscriptions (auj.) | Hybride (Stripe Payments + cycles maison) | Build complet |
|---|---|---|---|
| Tokenisation CB / PAN jamais touché (PCI **SAQ-A**) | Stripe | **Stripe** (Elements/SetupIntent) | Stripe (obligé) |
| SCA/3DS initial (collecte) | Stripe | **Stripe** (SetupIntent on-session) | Stripe |
| Exemption MIT / off-session | Stripe | **Stripe** (flags `off_session`+`MIT`) ; **nous** gérons `authentication_required` | idem |
| Preuve de mandat / consentement récurrent | Stripe | **Nous** (stocker preuve) | Nous |
| Calcul des cycles / proration | Stripe | **Nous** | Nous |
| Dunning (retries) | Stripe Smart Retries | **Nous** (cf. OPE-305) | Nous |
| Émission de facture SaaS | Stripe (hosted, non PA) | **Nous** (PA-conforme, réutilise `factures`) | Nous |
| TVA / mentions légales | Stripe Tax (si activé) sinon nous | **Nous** | Nous |
| Remboursements / avoirs | Stripe (manuel) | **Nous** (`typeDocument='avoir'`) | Nous |
| Litiges / chargebacks | Stripe (preuve, frais) | **Stripe** (reste PSP) | Stripe |
| Réversibilité | faible (verrou Subscriptions) | **bonne** (Stripe = PSP banalisé) | bonne |

**Lecture** : l'hybride **ne touche pas** au noyau réglementaire risqué (PCI, tokenisation,
SCA initial, chargebacks) — il reste chez Stripe en tant que PSP. Ce qu'on réinternalise est
**métier** (cycles, proration, dunning, facture, avoirs, mandat) — du logiciel maîtrisable,
pas de l'exposition PAN.

---

## 1. SCA / 3DS (DSP2)

- **Collecte** : le SetupIntent se confirme **on-session** (client présent) → SCA faite par
  Stripe, 3DS porté par leur SDK. Aucune réinternalisation.
- **Prélèvements récurrents** = **MIT** (Merchant Initiated Transaction) : marqués
  `off_session: true` + `confirm: true`. Stripe applique l'**exemption MIT** ⇒ pas de 3DS
  à chaque prélèvement, **à condition** que le 1er paiement ait établi le mandat (SetupIntent
  `usage: off_session`). C'est exactement le motif que le PoC OPE-303 doit valider.
- **Risque résiduel** : la banque peut quand même exiger `authentication_required` sur un
  prélèvement off-session (rare mais réel). → **Notre** responsabilité : détecter cet échec,
  notifier l'artisan, et rejouer **on-session** (3DS) via un nouveau parcours. C'est un cas
  de dunning (OPE-305), pas un trou de conformité.
- **Verdict** : faisable, risque **faible-moyen**, entièrement absorbé par Stripe Payments +
  une branche d'échec côté dunning.

## 2. Mandats (consentement récurrent)

- Aujourd'hui : Stripe Subscriptions gère le mandat implicitement.
- En hybride : **nous** devons conserver une **preuve de consentement** (qui, quand, montant
  prévu/variable, fréquence, CGU acceptées) au moment du SetupIntent. → table `payment_mandates`
  (cf. OPE-304 §3) : `artisanId`, `stripeCustomerId`, `stripePaymentMethodId`, `consentAt`,
  `consentIp`, `cguVersion`, `status` (`active|revoked`), `revokedAt`.
- **Révocation** : l'artisan doit pouvoir retirer son mandat (suppression PaymentMethod côté
  Stripe + `status=revoked`). Obligation légale de réversibilité.
- **Verdict** : risque **faible** (data simple), mais **obligatoire** — c'est une dette
  juridique si oubliée.

## 3. PCI DSS — rester en SAQ-A

- **Invariant non négociable** : ne JAMAIS faire transiter le PAN par nos serveurs. Aujourd'hui
  c'est garanti par Checkout/Elements (le PAN ne touche pas `src/`).
- En hybride : la collecte passe par **Stripe Elements + SetupIntent** (le PAN reste côté
  Stripe, on ne reçoit qu'un `pm_xxx` tokenisé). Le prélèvement off-session se fait **sur le
  token** (`payment_method: pm_xxx`), jamais sur un numéro de carte.
- **Verdict** : **SAQ-A préservé** tant qu'on n'introduit pas de champ carte maison. Risque
  **faible** — *à condition* de verrouiller ça en revue (aucune route ne doit accepter de PAN).

## 4. Échecs & dunning conformes

Voir OPE-305 pour la conception. Côté conformité, les parcours par type d'échec doivent exister :
- `card_declined` / `insufficient_funds` → retry planifié (MIT).
- `expired_card` → demande de mise à jour (nouveau SetupIntent), pas de retry aveugle.
- `authentication_required` → relance **on-session** (3DS) — ne PAS reprélever off-session en boucle.
- **Verdict** : risque **moyen** — c'est la partie la plus subtile (cf. delta churn OPE-305).

## 5. TVA / facturation (articulation projet PA)

- Aujourd'hui : la facture du SaaS à l'artisan **est la facture Stripe** (hosted invoice),
  **non conforme** facturation électronique française (pas de Factur-X, pas de transmission PPF/PDP).
  La page Stripe ([factur-x-format-france](https://stripe.com/fr/resources/more/factur-x-format-france))
  confirme : Stripe **ne génère pas Factur-X nativement** — il renvoie vers « votre logiciel de
  facturation » ou un connecteur PDP partenaire (Billit). La conformité reste **notre** charge
  (ou celle d'un tiers), pas une capacité Stripe native.
- En hybride : **nous** émettons la facture SaaS → mentions légales, TVA (Operioz facture un
  client B2B français : TVA 20 %), numérotation séquentielle, archivage. **Réutilisable** : le
  module `factures` modélise déjà `typeDocument` (`facture|avoir`), `factureOrigineId`, et la
  réforme e-invoicing est déjà au programme côté PA (EPIC OPE-227). On **réutilise le moteur**,
  on ne le réinvente pas.
- **Verdict** : risque **moyen** mais **forte synergie** — c'est précisément la valeur n°1 du
  build (cf. OPE-301 §8). Sans reprise de main, on ne peut PAS émettre une facture SaaS conforme.

## 6. Remboursements / litiges / chargebacks

- **Remboursements/avoirs** : aujourd'hui inexistants en code (cf. OPE-300 §7). En hybride :
  `refund` via Stripe Payments + **avoir** maison (`typeDocument='avoir'`, `factureOrigineId`).
  Risque **faible** (Stripe fait le refund, nous traçons l'avoir).
- **Chargebacks/litiges** : restent **chez Stripe** (gestion de preuve, frais de litige). On ne
  réinternalise rien. Risque **faible** (inchangé vs aujourd'hui).

## 7. Réversibilité & dépendance

- **Risque à éviter** : troquer la dépendance Stripe Subscriptions contre un moteur maison
  **non maîtrisé** (proration/dunning bâclés = pertes de revenu silencieuses).
- **Mitigations** : (a) garder Stripe comme PSP (réversibilité bonne, Stripe = commodité) ;
  (b) **réconciliation systématique** Stripe↔maison (OPE-313) ; (c) exactitude monétaire en
  **centimes entiers** (pas de float — aujourd'hui `parseFloat`/`numeric`, cf. OPE-300 §1, à
  corriger dans le moteur) ; (d) idempotence stricte des prélèvements (cf. OPE-303).
- **Verdict** : la dépendance se **déplace** de « Subscriptions » (verrou produit) vers
  « Payments » (commodité interchangeable) — **amélioration nette** de réversibilité.

---

## 8. Conclusion (entrée OPE-307)

- **Ce qui reste délégué à Stripe (risque faible, ne pas réinternaliser)** : PCI/tokenisation,
  SCA initial, exemption MIT, chargebacks/litiges, exécution des refunds.
- **Ce qu'on réinternalise (logiciel métier, maîtrisable)** : mandat (preuve), cycles/proration,
  dunning, facture SaaS conforme + TVA, avoirs/crédits, réconciliation.
- **Aucun obstacle de conformité bloquant** à l'hybride. Les deux vrais risques à piloter sont
  **(1) dunning** (churn involontaire si mal fait — OPE-305) et **(2) exactitude monétaire /
  réconciliation** (OPE-313). Le risque PCI/SCA est **neutralisé** par le maintien de Stripe
  comme PSP. → **L'hybride est conforme et réversible** ; c'est l'option recommandée (OPE-307).
