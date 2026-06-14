# Audit — Relances clients (devis/factures) & scheduler : pas d'automatisation, relance facture morte — MEDIUM (OK)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `runScheduler` (`server/_core/index.ts:1508-1512`), `devis.envoyerRelance`
> (`routers.ts:1014`), `devis.envoyerRelancesAutomatiques` (`routers.ts:1078`),
> `generateRappelFactureContent` (`emailService.ts:256`), config `rappelFactureJours`
> /`rappelDevisJours` (`routers.ts:3002-3003`). Question : « quand j'envoie une
> facture / un devis, le client est-il relancé automatiquement ? »

---

## Constat

### 1. Le scheduler ne relance AUCUN client

`runScheduler` (lancé `setInterval(..., 1h)` **uniquement en prod**, `index.ts:1512`)
n'envoie **que** des emails **SaaS internes à l'artisan** : essai J-3 / J-1 /
discovery (`buildTrialEndingJ3Email`/`J1Email`, `index.ts:1316-1414` → **OPE-37**).
`grep getDevisNonSignes|getFacturesEnRetard|relance` sur `index.ts` → **0**.
→ **aucune relance client (devis ou facture) n'est déclenchée automatiquement.**

### 2. Relance DEVIS = manuelle uniquement (fonctionne)

- `envoyerRelance` (`:1014`) — relance **un** devis : ownership OK, email inline au
  client, `createRelanceDevis` + notification. **OK**.
- `envoyerRelancesAutomatiques` (`:1078`) — malgré son nom, c'est une
  `protectedProcedure` **déclenchée manuellement** par un bouton
  (`client/src/pages/RelancesDevis.tsx:88`), **jamais** par le scheduler. Elle
  boucle sur `getDevisNonSignes`, filtre par ancienneté, envoie l'email devis,
  `createRelanceDevis`. **OK** mais **manuelle** (« automatique » = trompeur).

### 3. Relance FACTURE au client = INEXISTANTE (scaffolding mort)

- **`generateRappelFactureContent`** (`emailService.ts:256`) — template d'email de
  rappel de facture impayée : **importé** (`routers.ts:12`) mais **jamais appelé**
  (`grep` call sites hors import/définition → **0**). → **code mort**.
- **`rappelFactureJours`** (`routers.ts:3003`) — champ accepté par `parametres.update`
  (zod) mais : **(a)** aucun champ d'UI ne l'écrit (`grep client/src` → **0** ;
  le `rappelDevisJours` de l'UI est en fait réaffecté à `delaiValiditeDevis`,
  `Parametres.tsx:68/97`), **(b)** aucun code serveur ne le **lit**
  (`grep server` → seulement la ligne zod). → **config morte de bout en bout**.
- Côté factures impayées, le seul mécanisme existant est `generateOverdueReminders`
  (`notificationsRouter`) qui crée des **notifications in-app pour l'artisan**
  (manuel) — **pas** un email au **client**.

→ **Il n'existe aucun moyen — manuel ou auto — d'envoyer au client un email de
rappel de facture impayée.** L'artisan doit re-`sendByEmail` la facture à la main.

## Sévérité — MEDIUM (pas BLOCKER/HIGH)

- **Pas de promesse UI cassée** : contrairement aux « feature morte » HIGH
  (**OPE-74** push « Vous serez alerté », **OPE-51** modèles d'emails),
  `rappelFactureJours` **n'est exposé nulle part** dans l'app → aucun artisan n'est
  induit en erreur en croyant l'avoir activé. C'est du scaffolding interne mort, pas
  une feature visible non tenue.
- **Pas de sécurité / légal / perte de données.**
- Impact = **complétude produit / cash-flow** : pas de chasse automatique aux impayés
  ni aux devis dormants. Acceptable pour un MVP de lancement.

## Liens / recoupements

- **OPE-61** couvre déjà le volet statut : « factures jamais `en_retard` auto » (le
  scheduler ne fait aucune transition de statut). Une relance facture automatique
  supposerait d'abord ce passage `en_retard` → **dépend d'OPE-61**.
- Même **classe** que la « feature morte » (OPE-74/OPE-51) mais **sans surface UI**
  → ne mérite pas une issue HIGH propre.
- Brancher un email de rappel facture est aussi **en aval d'OPE-67** (statut payable)
  et **OPE-6** (lien de paiement réel), cf. `lien-paiement-absent-email-facture-ok.md`.

## Recommandation (post-lancement, après OPE-61/67/6)

1. Câbler `runScheduler` pour : (a) appeler le batch devis (`envoyerRelancesAutomatiques`)
   selon `rappelDevisJours`, (b) envoyer `generateRappelFactureContent` aux clients
   des factures `en_retard` selon `rappelFactureJours`, en réutilisant
   `createRelanceDevis`/un équivalent facture pour la traçabilité + l'anti-spam
   (`getLastRelanceDate`).
2. Exposer `rappelFactureJours` dans `/parametres` (sinon retirer la config + le
   template morts).
3. Renommer/clarifier `envoyerRelancesAutomatiques` (manuel ≠ automatique).

---

## Verdict

Aucune relance client automatique (scheduler = emails SaaS internes seulement).
Relance **devis** OK mais **manuelle** ; relance **facture** client **inexistante**
(template `generateRappelFactureContent` + config `rappelFactureJours` morts, non
exposés). → **MEDIUM** : scaffolding interne mort sans promesse UI cassée, en aval
d'OPE-61/67/6. **Pas d'issue Linear** (documenté pour la suite produit).
