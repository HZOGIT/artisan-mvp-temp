# Audit — RGPD / Données personnelles

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : droits des personnes (effacement, portabilité), cohérence entre
> la politique de confidentialité publiée et le comportement réel du code,
> bandeau cookies. **Stripe Connect (OPE-6) hors périmètre.**

---

## Ce qui fonctionne correctement

- Bandeau cookies (`CookieBanner.tsx`) : annonce « uniquement cookies
  strictement nécessaires, aucun tracking ». Vérifié : **aucun script
  analytics chargé** (grep `analytics|gtag|plausible|matomo` → 0 dans le
  bundle client). La claim est donc honnête → consentement allégé acceptable.
- Politique de confidentialité, CGU, CGV présentes et détaillées
  (`pages/legal/*`), avec durées de conservation et référence CNIL.
- Audit log applicatif conservé (cohérent avec l'annonce « logs 12 mois »).
- Suppression de compte demande une confirmation explicite (« SUPPRIMER »).

---

## 🔴 BLOCKER — Droit à l'effacement (Art. 17) non honoré + promesse fausse dans la politique publiée

### Problème

`auth.deleteAccount` (`server/routers.ts:9030`) ne fait qu'un **soft-delete** :

```typescript
// routers.ts:9040 — seul changement effectué
await db.updateUser(ctx.user.id, {
  actif: false,
  email: `deleted_${ctx.user.id}_${Date.now()}@operioz.com`,
} as any);
```

Conséquences :
- Toutes les **données personnelles des clients de l'artisan** (nom, email,
  téléphone, adresse postale — table `clients`) restent en base indéfiniment.
- Les devis, factures, signatures, RDV, contrats, messages restent intacts.
- La PII de l'artisan lui-même (nom, SIRET, coordonnées) reste, seul l'email
  du `users` est brouillé.
- **Aucun job de purge** : le scheduler horaire (`server/_core/index.ts:1313`)
  nettoie les sessions, expire les trials et envoie des emails, mais ne
  supprime **jamais** aucune donnée personnelle. `grep purge|anonymi|delete.*30`
  → aucun mécanisme de suppression différée.

### Le code contredit la politique de confidentialité publiée

`client/src/pages/legal/Confidentialite.tsx` affiche aux utilisateurs :
- ligne 51 : « **Après résiliation : 30 jours pour permettre l'export, puis
  suppression définitive.** »
- ligne 84 : « **Suppression (« droit à l'oubli ») : supprimer votre compte et
  vos données**, hors obligations légales. »

Ces deux promesses sont **fausses** : il n'existe ni suppression définitive à
30 jours, ni effacement des données au moment de la suppression de compte.

### Impact

- Manquement à l'**Art. 17 RGPD** (droit à l'effacement) opposable dès qu'un
  client d'un artisan, ou un artisan, demande la suppression de ses données.
- **Information trompeuse** : publier une durée de conservation et une
  suppression que l'on n'applique pas est un manquement distinct (Art. 13/14 +
  principe de loyauté), directement actionnable par la CNIL sur plainte.
- La rétention « comptabilité 10 ans » est un motif **légitime mais partiel** :
  elle couvre les factures émises, pas l'intégralité du carnet clients ni les
  données non comptables (RDV, messages, signatures, prospects sans facture).

### Fix proposé

1. **Au `deleteAccount`** : déclencher une suppression/anonymisation des données
   **non soumises à obligation légale** (clients sans facture, prospects, RDV,
   messages, signatures non liées à une facture émise), et marquer le compte
   `pendingDeletion` avec `deletionScheduledAt = now + 30j`.
2. **Anonymiser** (plutôt que conserver en clair) les données rattachées aux
   factures à conserver 10 ans : remplacer nom/email/téléphone/adresse par des
   valeurs pseudonymisées tout en gardant les montants et numéros légaux.
3. **Job de purge** dans le scheduler : chaque jour, purger définitivement les
   comptes dont `deletionScheduledAt < now`.
4. **Aligner ou corriger la politique** : si on conserve certaines données,
   l'expliciter exactement (ce qui est anonymisé vs supprimé vs conservé 10 ans).

### Estimation

~1,5 j — schéma (`deletionScheduledAt`/`pendingDeletion`), logique d'effacement
sélectif + anonymisation, job de purge, tests.

---

## 🟠 HIGH — Droit à la portabilité (Art. 20) non implémenté : bouton mort + aucun endpoint

### Problème

La politique de confidentialité promet (Confidentialite.tsx:85) :
> « **Portabilité** : récupérer vos données dans un format structuré
> (Excel, CSV, PDF). »

Or :
- Le seul bouton « Exporter mes données » (`ExpiredBlocker.tsx:75`) ne s'affiche
  que si la prop `onExportData` est fournie. Le composant est rendu **sans aucune
  prop** : `DashboardLayout.tsx:1215` → `<ExpiredBlocker />`. Le bouton n'apparaît
  donc **jamais** ; c'est du code mort.
- **Aucun endpoint serveur** d'export du compte : `grep exportMesDonnees|
  exportAccount|exportRgpd` → 0 résultat. Les seuls exports existants
  (`/api/comptabilite/export-csv`, `exportFecAchats`, FEC) sont **comptables**
  (factures), pas une portabilité du compte (clients, devis, RDV, paramètres…).

### Impact

Une demande de portabilité (Art. 20) ne peut être satisfaite que manuellement
en base — non scalable et hors délai légal (1 mois) dès le premier volume.
Combiné au BLOCKER ci-dessus, la mention « 30 jours pour permettre l'export »
n'a aucun support technique.

### Fix proposé

- Endpoint `auth.exportMesDonnees` (protégé) qui agrège, pour l'artisan courant,
  ses données et celles de ses clients dans un ZIP (JSON + CSV) structuré.
- Brancher réellement le bouton : passer `onExportData` à `<ExpiredBlocker />`
  et l'exposer aussi dans Paramètres/Profil (hors écran de blocage).

### Estimation

~1 j — endpoint d'agrégation + génération ZIP + branchement UI.

---

## Estimation totale

- BLOCKER (effacement + politique mensongère) : ~1,5 j
- HIGH (portabilité) : ~1 j
